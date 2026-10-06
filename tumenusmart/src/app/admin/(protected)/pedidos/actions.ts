"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prismaDelLocal, upsertClienteFiscal } from "@/lib/prisma-local";
import { prisma as prismaCliente } from "@/lib/prisma";
import { idLocalActual } from "@/lib/local-actual";
import { FORMAS_PAGO_POS, etiquetaFormaPagoPos } from "@/lib/turno-pos";
import { normalizarCobro } from "@/lib/rendicion";
import { estacionActual } from "@/lib/estacion-actual";
import { anularComprobantes, type PuntoParaComprobante } from "@/lib/comprobante";
import { SELECT_PEDIDO_PARA_EMISION, emitirFacturaDePedidoEnTransaccion } from "@/lib/emision-pedido";
import { devolverConsumo, registrarConsumoVenta, revertirMovimientosVenta } from "@/lib/movimientos-stock";
import { armarPedido, type LineaPedida } from "@/lib/precio-pedido";
import { cargarCatalogoParaPedido } from "@/lib/catalogo-pedido";
import { textoPorcentaje } from "@/lib/descuento-venta";
import {
  consumoParaGuardar,
  descuentoDePedido,
  motivoPedidoCerrado,
  totalesDePedido,
  type TotalesDePedido,
} from "@/lib/pedido-abierto";
import { leerConsumoGuardado, type ConsumoGuardado } from "@/lib/comedor";
import { repartirConsumo } from "@/lib/division-cuenta";
import { metodosPagoHabilitados } from "@/lib/metodos-pago";
import { puedeFacturarDesdeEstaEstacion, textoSinFactura } from "@/lib/factura-estacion";
import { validarDatosFiscales } from "@/lib/datos-fiscales";
import { registrarBitacora } from "@/lib/bitacora";
import { formatearCantidad, formatearGuarani, formatearNumero } from "@/lib/format";
import { turnoAbierto } from "../pos/turno-actual";

const ESTADOS_VALIDOS = [
  "pendiente",
  "confirmado",
  "en_preparacion",
  "en_despacho",
  "entregado",
  "cancelado",
];

/** Lo que se le dice a la caja cuando intenta despachar o entregar un pedido que todavía no se cobró. */
const TEXTO_SIN_COBRAR =
  "Este pedido todavía no se cobró. Cobralo primero con el botón “Cobrar pedido”: así entra a la caja del turno.";

export type ResultadoPedidoAccion =
  | { ok: true; aviso?: string; areasImpresion?: string[] }
  /** `sinTurno`: cobrar el pedido exige el turno de caja abierto; la pantalla manda directo a abrirlo (src/lib/turno-requerido.ts). */
  | { ok: false; error: string; sinTurno?: true };

/**
 * Devuelve un resultado en vez de lanzar los errores de validación: Next.js
 * oculta en producción el mensaje de cualquier `throw` que salga de una
 * Server Action, así que el motivo real solo llega si viaja en el retorno.
 *
 * El dinero NO se mueve acá: un pedido se cobra al final, con el botón "Cobrar pedido" (`cobrarPedido`). Pasar de
 * estado es el recorrido de la entrega (preparar, despachar, entregar) y nada más. Despachar (delivery) o entregar un pedido
 * sin cobrar se frena: esa plata no entró a ninguna caja.
 */
export async function cambiarEstadoPedido(
  orderId: string,
  estado: string,
  motivo?: string
): Promise<ResultadoPedidoAccion> {
  const sesion = await exigirPermiso("pedidos.cambiarEstado");
  const storeId = await idLocalActual();
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(storeId);

  if (!ESTADOS_VALIDOS.includes(estado)) {
    return { ok: false, error: "Estado inválido" };
  }

  let datosFactura: Record<string, unknown> = {};
  // Si cancelar el pedido anula además una factura vigente: quién, cuándo y por qué.
  let anulacionDeFactura: { por: string; en: Date; motivo: string } | null = null;
  // Áreas de Impresión presentes en este pedido — para la impresión
  // automática de comanda por área al pasar a "en preparación" (ver
  // src/lib/impresion-comprobantes.ts). Ítems sin producto (combo mitad y
  // mitad) o sin área asignada quedan afuera a propósito.
  let areasImpresion: string[] | undefined;

  // Mismo criterio que cancelarVenta del POS: motivo obligatorio, queda
  // quién y cuándo — para cualquier pedido, tenga factura o no. Si ya tenía
  // un facturaNumero asignado, ese número queda consumido para siempre (no
  // se revierte el contador del punto de expedición, igual que un
  // talonario de papel al que se le anula una hoja).
  //
  // Igual que cancelarVenta: una vez que este pedido ya quedó adentro de un
  // cierre firmado — el turno de caja en que se cobró o la rendición del
  // repartidor (delivery) — no se puede cancelar. Esos montos ya se
  // declararon en el corte ciego/la rendición; permitir cancelar después
  // abriría la puerta a "cobrar, cerrar caja, y después borrar el pedido
  // para que no quede registro".
  if (estado === "cancelado") {
    if (!motivo?.trim()) {
      return { ok: false, error: "Decí por qué se cancela — queda en el historial." };
    }
    const pedidoActual = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        rendicionId: true,
        turnoPos: { select: { estado: true } },
        facturaNumero: true,
        facturaAnulada: true,
      },
    });
    if (pedidoActual?.rendicionId) {
      return {
        ok: false,
        error: "Este pedido ya está en una rendición cerrada. Una vez rendido, no se puede cancelar.",
      };
    }
    if (pedidoActual?.turnoPos && pedidoActual.turnoPos.estado !== "abierto") {
      return {
        ok: false,
        error: "El turno de este pedido ya está cerrado. Una vez cerrado el turno, no se puede cancelar.",
      };
    }
    const identidad = sesion.nombre?.trim() || sesion.email;
    const ahora = new Date();
    if (pedidoActual?.facturaNumero && !pedidoActual.facturaAnulada) {
      anulacionDeFactura = { por: identidad, en: ahora, motivo: motivo.trim() };
    }
    datosFactura = {
      canceladaPor: identidad,
      canceladaEn: ahora,
      motivoCancelacion: motivo.trim(),
      // Cancelar el pedido entero anula la factura de yapa: no puede quedar
      // un número de timbrado vigente sobre un pedido que ya no existe.
      ...(pedidoActual?.facturaNumero && !pedidoActual.facturaAnulada
        ? {
            facturaAnulada: true,
            facturaAnuladaPor: identidad,
            facturaAnuladaEn: ahora,
            facturaMotivoAnulacion: motivo.trim(),
          }
        : {}),
    };
  }

  if (estado === "en_preparacion") {
    const pedido = await prisma.order.findUnique({
      where: { id: orderId },
      select: { items: { select: { product: { select: { areaImpresionId: true } } } } },
    });
    areasImpresion = [
      ...new Set(
        (pedido?.items ?? []).map((i) => i.product?.areaImpresionId).filter((a): a is string => !!a)
      ),
    ];
  }

  if (estado === "en_despacho") {
    const pedido = await prisma.order.findUnique({
      where: { id: orderId },
      select: { repartidorId: true, tipoEntrega: true, turnoPosId: true },
    });
    if (pedido?.tipoEntrega === "delivery" && !pedido.repartidorId) {
      return {
        ok: false,
        error: 'Asigná un repartidor antes de pasar el pedido a "En despacho".',
      };
    }
    // El repartidor sale con el pedido ya cobrado (y facturado): lo que lleva en la mano es la ruta, no el cobro. Por eso el pedido
    // se corrige y se cobra ANTES de despacharlo.
    if (pedido?.tipoEntrega === "delivery" && !pedido.turnoPosId) {
      return { ok: false, error: TEXTO_SIN_COBRAR };
    }
  }

  // Entregar un pedido de delivery deja el rastro para el control del efectivo del repartidor (ver Rendición): `cobroMetodo` es
  // CÓMO se cobró en la caja (lo que ya quedó al cobrarlo) y `entregadoEn` cuándo llegó. Lo normal es que lo marque el repartidor
  // desde su pantalla (marcarPedidoEntregado, src/app/repartidor/[id]/actions.ts); si lo marca la caja, el rastro es el mismo.
  let datosExtra: { cobroMetodo: string; entregadoEn: Date } | Record<string, never> = {};
  if (estado === "entregado") {
    const pedido = await prisma.order.findUnique({
      where: { id: orderId },
      select: { estado: true, tipoEntrega: true, turnoPosId: true, formaPagoPos: true, repartidorId: true },
    });
    if (pedido && pedido.estado !== "entregado") {
      // Un pedido sin cobrar no se entrega: esa plata no entró a ninguna caja (se cobra al final con "Cobrar pedido").
      if (!pedido.turnoPosId) return { ok: false, error: TEXTO_SIN_COBRAR };
      if (pedido.tipoEntrega === "delivery") {
        // Un delivery entregado sin repartidor no entraría en la rendición de nadie y trabaría el cierre de turno para siempre.
        if (!pedido.repartidorId) {
          return { ok: false, error: "Asigná un repartidor antes de marcar el delivery como entregado: es el que rinde su efectivo." };
        }
        datosExtra = { cobroMetodo: normalizarCobro(pedido.formaPagoPos), entregadoEn: new Date() };
      }
    }
  }

  if (estado === "cancelado") {
    // En transacción: cancelar el pedido y devolverle el stock a sus
    // insumos quedan como una sola cosa, nunca a medias. Usa el cliente
    // crudo (no el filtrado por local) porque $transaction necesita el
    // mismo `tx` para las dos escrituras — por eso el `where` completa
    // storeId a mano.
    const anulacion = anulacionDeFactura;
    await prismaCliente.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId, storeId },
        data: { estado, ...datosExtra, ...datosFactura },
      });
      // Si tenía una factura vigente, su comprobante también queda anulado.
      if (anulacion) {
        await anularComprobantes(tx, { storeId, origen: { orderId }, ...anulacion });
      }
      await revertirMovimientosVenta(tx, storeId, { orderId }, sesion.nombre?.trim() || sesion.email);
    });
    revalidatePath("/admin/stock/insumos");
  } else {
    await prisma.order.update({
      where: { id: orderId },
      data: { estado, ...datosExtra },
    });
  }
  // Cancelar un pedido queda en la bitácora (quién, cuándo y por qué).
  if (estado === "cancelado") {
    const cancelado = await prisma.order.findUnique({
      where: { id: orderId },
      select: { numero: true, total: true, facturaNumero: true },
    });
    await registrarBitacora(storeId, sesion, {
      modulo: "pedidos",
      accion: "pedido_cancelado",
      descripcion: `Canceló el pedido #${String(cancelado?.numero ?? "").padStart(4, "0")}${
        cancelado ? ` (${formatearGuarani(Number(cancelado.total))})` : ""
      }. Motivo: ${motivo?.trim() || "sin motivo"}.`,
      entidad: "Order",
      entidadId: orderId,
      detalle: { pedido: cancelado?.numero ?? null, total: cancelado ? Number(cancelado.total) : null, factura: cancelado?.facturaNumero ?? null, motivo: motivo?.trim() ?? null },
    });
  }
  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
  if (estado === "cancelado") {
    // Un pedido cobrado que se cancela deja de contar en la caja del turno abierto.
    revalidatePath("/admin/pos");
    revalidatePath("/admin/pos/turnos");
  }
  if ("cobroMetodo" in datosExtra) {
    revalidatePath("/admin/cierre");
  }
  return { ok: true, areasImpresion };
}

export async function asignarRepartidor(
  orderId: string,
  repartidorId: string
): Promise<ResultadoPedidoAccion> {
  await exigirPermiso("pedidos.asignarRepartidor");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  await prisma.order.update({
    where: { id: orderId },
    data: { repartidorId: repartidorId || null },
  });
  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------------
// El pedido ABIERTO: cargarle más productos, cancelar uno, darle un descuento y, al final, cobrarlo.
//
// Un pedido cargado a mano se corrige igual que la cuenta de una mesa del Servicio comedor: mientras no se cobra, la caja le puede
// agregar productos, cancelar uno (con motivo, y el stock vuelve) o darle un descuento. Cada cambio recalcula lo que vale el pedido
// (subtotal, descuento y total) y toma un candado por pedido, para que dos cambios a la vez no se pisen. Una vez cobrado, el pedido
// queda cerrado a cambios: lo único que se puede es cancelarlo.

/** Desde Vercel hasta la base cada consulta tarda: las transacciones largas necesitan más que los 5 s de fábrica. */
const OPCIONES_TX = { timeout: 15_000, maxWait: 10_000 } as const;

const MENSAJE_MOTIVO = "Escribí el motivo (al menos 3 letras).";

/** El motivo escrito por la persona, sin caracteres raros y con tope; null si es muy corto. */
function limpiarMotivo(texto: unknown): string | null {
  const limpio = String(texto ?? "")
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  return limpio.length >= 3 ? limpio : null;
}

/** Un motivo para frenar una acción que la persona puede entender (se muestra tal cual). Se lanza dentro de una transacción. */
class ErrorDePedido extends Error {}

function quienEs(sesion: { nombre?: string | null; email: string }): string {
  return sesion.nombre?.trim() || sesion.email;
}

/**
 * Toma el pedido para cambiarlo: un candado por pedido (dos cambios a la vez, o un cobro mientras se cancela algo, esperan su turno) y
 * lo devuelve con sus productos. Si ya se cobró, se canceló o se entregó, lanza el motivo. Va dentro de la transacción de quien llama.
 */
async function tomarPedidoAbierto(tx: Prisma.TransactionClient, storeId: string, orderId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${orderId}))`;
  const pedido = await tx.order.findFirst({
    where: { id: orderId, storeId },
    select: {
      id: true,
      numero: true,
      estado: true,
      turnoPosId: true,
      costoEnvio: true,
      descuentoTipo: true,
      descuentoValor: true,
      items: {
        select: { id: true, cantidad: true, nombreProducto: true, opcionesTexto: true, precioUnitario: true, consumo: true },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!pedido) throw new ErrorDePedido("No encontré ese pedido.");
  const cerrado = motivoPedidoCerrado(pedido);
  if (cerrado) throw new ErrorDePedido(cerrado);
  return pedido;
}

/**
 * Deja guardado lo que vale el pedido con los productos que le quedan (subtotal, descuento y total). Si un descuento en monto fijo ya
 * no cabe en lo que queda, no se guarda nada: se explica y la persona lo cambia o lo quita primero.
 */
async function guardarTotales(
  tx: Prisma.TransactionClient,
  storeId: string,
  pedido: { id: string; costoEnvio: unknown; descuentoTipo: string | null; descuentoValor: unknown },
  lineas: { precioUnitario: number; cantidad: number }[]
): Promise<TotalesDePedido> {
  const totales = totalesDePedido(lineas, Number(pedido.costoEnvio), descuentoDePedido(pedido));
  if (totales.descuentoInvalido) {
    throw new ErrorDePedido(
      `El descuento ya no corresponde a lo que queda del pedido (${totales.descuentoInvalido}) Cambialo o quitalo primero y volvé a intentar.`
    );
  }
  await tx.order.update({
    where: { id: pedido.id, storeId },
    data: { subtotal: totales.subtotal, descuento: totales.descuento, total: totales.total },
  });
  return totales;
}

function refrescarPedido(orderId: string) {
  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
}

// ----------------------------------------------------------------------------------------------- agregar productos

export type ResultadoAgregarProductos =
  | { ok: true; areas: string[]; aviso?: string }
  | { ok: false; error: string };

/**
 * Le suma productos a un pedido abierto. Igual que al cargar el pedido: el navegador solo dice qué y cuántos, el servidor recalcula
 * el precio, descuenta el stock de la receta y actualiza lo que vale el pedido (con su descuento, si tiene).
 */
export async function agregarProductosAPedido(orderId: string, items: LineaPedida[]): Promise<ResultadoAgregarProductos> {
  const sesion = await exigirPermiso("pedidos.crear");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);
  const id = String(orderId);

  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    return { ok: false, error: "No cargaste ningún producto." };
  }
  if (items.some((i) => !i || typeof i !== "object")) {
    return { ok: false, error: "Hay un producto mal cargado. Volvé a armarlo." };
  }

  const previo = await db.order.findUnique({ where: { id }, select: { estado: true, turnoPosId: true } });
  if (!previo) return { ok: false, error: "No encontré ese pedido." };
  const cerrado = motivoPedidoCerrado(previo);
  if (cerrado) return { ok: false, error: cerrado };

  // La carta REAL del local: lo que mandó el navegador solo dice qué productos y cuántos.
  const catalogo = await cargarCatalogoParaPedido(db, storeId, items);
  const armado = armarPedido(catalogo, items);
  if (!armado.ok) return { ok: false, error: armado.motivo };
  if (armado.subtotal <= 0) return { ok: false, error: "El total tiene que ser mayor a cero." };

  const quien = quienEs(sesion);
  let resultado: { numero: number; total: number; estado: string };
  try {
    resultado = await prismaCliente.$transaction(async (tx) => {
      const pedido = await tomarPedidoAbierto(tx, storeId, id);
      await tx.orderItem.createMany({
        data: armado.lineas.map((l) => ({
          storeId,
          orderId: id,
          productId: l.productId ?? null,
          nombreProducto: l.nombreProducto,
          cantidad: l.cantidad,
          precioUnitario: l.precioUnitario,
          iva: l.iva,
          opcionesTexto: l.opcionesTexto ?? null,
          ingredientesQuitadosTexto: l.ingredientesQuitadosTexto ?? null,
          costoAgregados: l.costoAgregados,
          costoProducto: l.costoProducto,
          precioAgregados: l.precioAgregados,
          consumo: consumoParaGuardar(l),
        })),
      });
      await registrarConsumoVenta(tx, storeId, armado.lineas, { orderId: id }, quien);
      const lineas = [
        ...pedido.items.map((i) => ({ precioUnitario: Number(i.precioUnitario), cantidad: i.cantidad })),
        ...armado.lineas.map((l) => ({ precioUnitario: l.precioUnitario, cantidad: l.cantidad })),
      ];
      const totales = await guardarTotales(tx, storeId, pedido, lineas);
      return { numero: pedido.numero, total: totales.total, estado: pedido.estado };
    }, OPCIONES_TX);
  } catch (e) {
    if (e instanceof ErrorDePedido) return { ok: false, error: e.message };
    console.error("[pedidos] agregarProductosAPedido falló", e);
    return { ok: false, error: "No se pudieron agregar los productos. No se registró nada: probá de nuevo." };
  }

  await registrarBitacora(storeId, sesion, {
    modulo: "pedidos",
    accion: "pedido_productos_agregados",
    descripcion: `Le agregó ${armado.lineas.map((l) => `${l.cantidad} × ${l.nombreProducto}`).join(", ")} al pedido ${formatearNumero(resultado.numero)}; ahora vale ${formatearGuarani(resultado.total)}.`,
    entidad: "Order",
    entidadId: id,
    detalle: { pedido: resultado.numero, agregados: armado.lineas.length, total: resultado.total },
  });
  refrescarPedido(id);
  revalidatePath("/admin/stock/insumos");

  // Si la comanda ya salió a cocina, lo que se suma ahora no está en ese papel.
  const aviso =
    resultado.estado === "en_preparacion" || resultado.estado === "en_despacho"
      ? "El pedido ya estaba en preparación: lo que agregaste no salió en la comanda anterior. Volvé a imprimir la “Comanda de cocina”."
      : undefined;
  return { ok: true, areas: [], aviso };
}

// ---------------------------------------------------------------------------------------------- cancelar un producto

/**
 * Cancela un producto de un pedido abierto, con motivo: todo, o solo ALGUNAS de sus unidades si se pasa `cantidad` (5 empanadas
 * cargadas de más: se cancela 1 y quedan 4). Le devuelve al stock lo que había descontado y recalcula el pedido. El último producto
 * que le queda no se cancela por acá: para anular todo está "Cancelar pedido".
 */
export async function anularProductoDePedido(
  orderId: string,
  itemId: string,
  motivo: string,
  cantidad?: number
): Promise<ResultadoPedidoAccion> {
  const sesion = await exigirPermiso("pedidos.cambiarEstado");
  const storeId = await idLocalActual();
  const id = String(orderId);
  const razon = limpiarMotivo(motivo);
  if (!razon) return { ok: false, error: MENSAJE_MOTIVO };
  if (cantidad !== undefined && (typeof cantidad !== "number" || !Number.isInteger(cantidad) || cantidad <= 0)) {
    return { ok: false, error: "La cantidad a cancelar tiene que ser un número entero mayor a cero." };
  }
  const quien = quienEs(sesion);

  let hecho: { descripcion: string; numero: number; avisos: string[] };
  try {
    hecho = await prismaCliente.$transaction(async (tx) => {
      const pedido = await tomarPedidoAbierto(tx, storeId, id);
      const item = pedido.items.find((i) => i.id === String(itemId));
      if (!item) throw new ErrorDePedido("No encontré ese producto. Actualizá la pantalla.");

      const pedida = cantidad ?? item.cantidad;
      if (pedida > item.cantidad) {
        throw new ErrorDePedido(`Solo hay ${formatearCantidad(item.cantidad)} de ese producto en el pedido.`);
      }
      const cancelaTodo = pedida === item.cantidad;
      if (cancelaTodo && pedido.items.length === 1) {
        throw new ErrorDePedido("Es el único producto del pedido. Para anularlo todo usá “Cancelar pedido”.");
      }

      // Lo que ese producto descontó del stock; null en un pedido anterior a esta función (no guardaba el detalle).
      const consumo = item.consumo == null ? null : leerConsumoGuardado(item.consumo);
      let consumoQueda: ConsumoGuardado[] | null = null;
      let consumoSale: ConsumoGuardado[] = [];
      if (consumo) {
        if (cancelaTodo) {
          consumoSale = consumo;
        } else {
          [consumoQueda, consumoSale] = repartirConsumo(consumo, [(item.cantidad - pedida) / item.cantidad, pedida / item.cantidad]);
        }
      }

      if (cancelaTodo) {
        const borrado = await tx.orderItem.deleteMany({ where: { id: item.id, orderId: id, storeId } });
        if (borrado.count !== 1) throw new ErrorDePedido("Ese producto ya estaba cancelado. Actualizá la pantalla.");
      } else {
        // La cantidad que se leyó va en la condición: si otra caja la cambió en el mismo instante, acá no encuentra nada.
        const reducido = await tx.orderItem.updateMany({
          where: { id: item.id, orderId: id, storeId, cantidad: item.cantidad },
          data: {
            cantidad: item.cantidad - pedida,
            ...(consumoQueda ? { consumo: consumoQueda as unknown as Prisma.InputJsonValue } : {}),
          },
        });
        if (reducido.count !== 1) throw new ErrorDePedido("Ese producto cambió mientras lo cancelabas. Actualizá la pantalla.");
      }

      await devolverConsumo(
        tx,
        storeId,
        consumoSale,
        { orderId: id },
        `Cancelado: ${formatearCantidad(pedida)} × ${item.nombreProducto} (${razon})`,
        quien
      );

      const lineas = pedido.items
        .filter((i) => i.id !== item.id)
        .map((i) => ({ precioUnitario: Number(i.precioUnitario), cantidad: i.cantidad }));
      if (!cancelaTodo) lineas.push({ precioUnitario: Number(item.precioUnitario), cantidad: item.cantidad - pedida });
      await guardarTotales(tx, storeId, pedido, lineas);

      const avisos: string[] = [];
      if (!consumo) {
        avisos.push("Ese producto es de un pedido anterior a esta función: el stock no se devolvió solo. Ajustalo en Insumos si hace falta.");
      }
      if (pedido.estado === "en_preparacion" || pedido.estado === "en_despacho") {
        avisos.push("El pedido ya estaba en preparación: avisale a cocina que no prepare lo cancelado.");
      }
      return {
        descripcion: cancelaTodo
          ? `${formatearCantidad(item.cantidad)} × ${item.nombreProducto}`
          : `${pedida} de ${item.cantidad} × ${item.nombreProducto} (quedan ${item.cantidad - pedida})`,
        numero: pedido.numero,
        avisos,
      };
    }, OPCIONES_TX);
  } catch (e) {
    if (e instanceof ErrorDePedido) return { ok: false, error: e.message };
    console.error("[pedidos] anularProductoDePedido falló", e);
    return { ok: false, error: "No se pudo cancelar el producto. No se registró nada: probá de nuevo." };
  }

  await registrarBitacora(storeId, sesion, {
    modulo: "pedidos",
    accion: "pedido_producto_cancelado",
    descripcion: `Canceló ${hecho.descripcion} del pedido ${formatearNumero(hecho.numero)}. Motivo: ${razon}.`,
    entidad: "Order",
    entidadId: id,
    detalle: { pedido: hecho.numero, producto: hecho.descripcion, motivo: razon },
  });
  refrescarPedido(id);
  revalidatePath("/admin/stock/insumos");
  return { ok: true, aviso: hecho.avisos.length > 0 ? hecho.avisos.join(" ") : undefined };
}

// ----------------------------------------------------------------------------------------------------- el descuento

export type DatosDescuentoPedido = { tipo: "porcentaje" | "monto"; valor: number };

/**
 * Pone (o, con `null` o un valor 0, quita) el descuento general del pedido abierto. Va con motivo. El monto en guaraníes se calcula
 * sobre los productos del pedido (el envío no se descuenta); si después se cancela un producto, un descuento por porcentaje se ajusta solo.
 */
export async function aplicarDescuentoAPedido(
  orderId: string,
  descuento: DatosDescuentoPedido | null,
  motivo: string
): Promise<ResultadoPedidoAccion> {
  const sesion = await exigirPermiso("pedidos.cambiarEstado");
  const storeId = await idLocalActual();
  const id = String(orderId);
  const quien = quienEs(sesion);

  // Un descuento de 0 es "sin descuento": reemplaza al que tenía y deja el pedido en su monto original. No pide motivo.
  const sinDescuento = !descuento || Number(descuento.valor) === 0;
  const razon = sinDescuento ? null : limpiarMotivo(motivo);
  if (descuento && !sinDescuento) {
    if (descuento.tipo !== "porcentaje" && descuento.tipo !== "monto") return { ok: false, error: "El descuento no es válido." };
    if (!razon) return { ok: false, error: MENSAJE_MOTIVO };
  }

  let descripcion: string;
  let numero: number;
  try {
    const hecho = await prismaCliente.$transaction(async (tx) => {
      const pedido = await tomarPedidoAbierto(tx, storeId, id);
      const lineas = pedido.items.map((i) => ({ precioUnitario: Number(i.precioUnitario), cantidad: i.cantidad }));
      const envio = Number(pedido.costoEnvio);

      if (!descuento || sinDescuento) {
        const t = totalesDePedido(lineas, envio, null);
        await tx.order.update({
          where: { id, storeId },
          data: {
            descuento: 0,
            descuentoTipo: null,
            descuentoValor: null,
            descuentoMotivo: null,
            descuentoPor: null,
            subtotal: t.subtotal,
            total: t.total,
          },
        });
        return { numero: pedido.numero, texto: `Quitó el descuento del pedido ${formatearNumero(pedido.numero)}: vuelve a su monto original.` };
      }

      const valor = Number(descuento.valor);
      const t = totalesDePedido(lineas, envio, { tipo: descuento.tipo, valor });
      if (t.descuentoInvalido) throw new ErrorDePedido(t.descuentoInvalido);
      if (t.descuento <= 0) throw new ErrorDePedido("Escribí un descuento mayor a cero.");

      await tx.order.update({
        where: { id, storeId },
        data: {
          descuento: t.descuento,
          descuentoTipo: descuento.tipo,
          descuentoValor: valor,
          descuentoMotivo: razon,
          descuentoPor: quien,
          subtotal: t.subtotal,
          total: t.total,
        },
      });
      const cuanto = t.porcentaje != null ? `${textoPorcentaje(t.porcentaje)}% (${formatearGuarani(t.descuento)})` : formatearGuarani(t.descuento);
      return { numero: pedido.numero, texto: `Dio un descuento de ${cuanto} al pedido ${formatearNumero(pedido.numero)}. Motivo: ${razon}.` };
    }, OPCIONES_TX);
    descripcion = hecho.texto;
    numero = hecho.numero;
  } catch (e) {
    if (e instanceof ErrorDePedido) return { ok: false, error: e.message };
    console.error("[pedidos] aplicarDescuentoAPedido falló", e);
    return { ok: false, error: "No se pudo guardar el descuento. No se registró nada: probá de nuevo." };
  }

  await registrarBitacora(storeId, sesion, {
    modulo: "pedidos",
    accion: sinDescuento ? "pedido_descuento_quitado" : "pedido_descuento_aplicado",
    descripcion,
    entidad: "Order",
    entidadId: id,
    detalle: descuento && !sinDescuento ? { pedido: numero, tipo: descuento.tipo, valor: descuento.valor, motivo: razon } : { pedido: numero },
  });
  refrescarPedido(id);
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------- el cobro

export type DatosCobroPedido = {
  /** Con qué se cobra: una de las cuatro formas que entran a la caja (efectivo, transferencia, tarjeta de débito o de crédito). */
  forma: string;
  comprobante: "ticket" | "factura";
  /** Solo con factura: "con" registro fiscal (RUC, cédula…) o "sin" (Consumidor Final, Sin Nombre). */
  registroFiscal?: "con" | "sin";
  facturaTipoIdentificacion?: string;
  facturaRuc?: string;
  facturaRazonSocial?: string;
  facturaEmail?: string;
  /** Lo que la pantalla mostraba como total: si el pedido cambió mientras se cobraba, el servidor avisa en vez de cobrar otra cosa. */
  totalMostrado?: number;
};

/** `sinTurno`: cobrar exige el turno de caja abierto de esta computadora; la pantalla manda directo a abrirlo (src/lib/turno-requerido.ts). */
export type ResultadoCobroPedido =
  | { ok: true; total: number; facturaNumero: string | null }
  | { ok: false; error: string; sinTurno?: true };

/**
 * Cobra el pedido: el último paso. Entra a la caja del turno abierto de ESTA computadora con la forma de pago que elija la caja y, si
 * el comprobante es factura, se emite en el mismo momento (con el descuento del pedido repartido en sus líneas). Todo en una
 * transacción: o quedan las dos cosas o ninguna. Un pedido cobrado no se cobra dos veces ni se modifica después.
 *
 * Lo cobrado queda en `formaPagoPos` y `turnoPosId` (el cierre de turno y los reportes lo leen de ahí). Sin turno de caja abierto no se
 * cobra: se devuelve `sinTurno` y la pantalla manda directo a abrirlo.
 */
export async function cobrarPedido(orderId: string, datos: DatosCobroPedido): Promise<ResultadoCobroPedido> {
  const sesion = await exigirPermiso("pedidos.cambiarEstado");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);
  const id = String(orderId);

  const formaPago = String(datos?.forma ?? "").trim();
  if (!FORMAS_PAGO_POS.some((f) => f.valor === formaPago)) {
    return { ok: false, error: "Elegí con qué se cobra: efectivo, tarjeta de débito, tarjeta de crédito o transferencia." };
  }
  if (datos.comprobante !== "ticket" && datos.comprobante !== "factura") {
    return { ok: false, error: "Elegí el comprobante: ticket o factura." };
  }

  const estacion = await estacionActual(db);
  if (!estacion) {
    return {
      ok: false,
      error: "Esta computadora no está vinculada a una caja. Vinculala en Estaciones (punto de venta) para poder cobrar el pedido.",
    };
  }
  const turno = await turnoAbierto(db, estacion.id);
  if (!turno) {
    return { ok: false, error: "No hay un turno de caja abierto en esta computadora. Abrilo y volvé a cobrar el pedido.", sinTurno: true };
  }

  // Store no pertenece a ningún local (no está en MODELOS_POR_LOCAL): se lee con el cliente global.
  const local = await prismaCliente.store.findUnique({
    where: { id: storeId },
    select: { facturaObligatoria: true, aceptaEfectivo: true, aceptaTransferencia: true, aceptaTarjetaDebito: true, aceptaTarjetaCredito: true },
  });
  // El local pudo destildar una forma de pago en Configuración: se vuelve a comprobar acá, no solo en la pantalla.
  if (!metodosPagoHabilitados(local).some((m) => m.value === formaPago)) {
    return { ok: false, error: "Esa forma de pago no está habilitada en este local. Elegí otra." };
  }

  const pedido = await db.order.findUnique({
    where: { id },
    select: {
      numero: true,
      estado: true,
      total: true,
      turnoPosId: true,
      costoEnvio: true,
      descuentoTipo: true,
      descuentoValor: true,
      facturaNumero: true,
      facturaAnulada: true,
      items: { select: { precioUnitario: true, cantidad: true } },
    },
  });
  if (!pedido) return { ok: false, error: "No encontré ese pedido." };
  if (pedido.estado === "cancelado") return { ok: false, error: "Ese pedido está cancelado: no se cobra." };
  if (pedido.turnoPosId) return { ok: false, error: "Ese pedido ya está cobrado." };
  if (pedido.facturaNumero && !pedido.facturaAnulada) {
    return { ok: false, error: "Ese pedido ya tiene una factura emitida. Revisalo en Facturas antes de cobrarlo." };
  }

  // Lo que se cobra sale de los productos que quedan y su descuento; tiene que coincidir con lo guardado y con lo que se veía.
  const totales = totalesDePedido(
    pedido.items.map((i) => ({ precioUnitario: Number(i.precioUnitario), cantidad: i.cantidad })),
    Number(pedido.costoEnvio),
    descuentoDePedido(pedido)
  );
  if (totales.descuentoInvalido) {
    return { ok: false, error: `El descuento ya no corresponde a este pedido (${totales.descuentoInvalido}) Cambialo o quitalo para poder cobrar.` };
  }
  if (totales.total <= 0) return { ok: false, error: "El total tiene que ser mayor a cero." };
  if (datos.totalMostrado !== undefined && Math.round(Number(datos.totalMostrado)) !== totales.total) {
    return {
      ok: false,
      error: `El pedido cambió mientras lo cobrabas: ahora son ${formatearGuarani(totales.total)}. Revisalo y volvé a cobrar.`,
    };
  }

  // ------------------------------------------------------------- comprobante
  // Las mismas reglas que el cobro del Punto de Venta (registrarVenta). La pantalla ya las respeta, pero esto es lo que de verdad
  // vale: una acción del servidor se puede llamar sin pasar por ella.
  const quiereFactura = datos.comprobante === "factura";
  const sinNombre = quiereFactura && datos.registroFiscal === "sin";
  const facturaObligatoria = local?.facturaObligatoria ?? false;
  const facturacion = await puedeFacturarDesdeEstaEstacion(db);

  // Si el local exige facturar toda venta (timbrado Autoimpresor, RG 90/2021): sin un punto de expedición vigente en esta
  // computadora no hay forma legal de cobrar, y con punto vigente no se puede colar un "ticket".
  if (facturaObligatoria) {
    if (!facturacion.puedeFacturar) {
      return {
        ok: false,
        error:
          "Este local exige facturar todas las ventas y esta computadora no tiene un punto de expedición vigente asignado. Pedile al dueño que lo asigne en Puntos de expedición.",
      };
    }
    if (!quiereFactura) return { ok: false, error: "Este local exige facturar todas las ventas — no se puede cobrar con ticket." };
  }

  // Los datos del comprador que tipeó la caja, revisados con la validación mínima (el RUC con su dígito, razón social de al menos 4
  // letras, correo con forma de correo). Lo que se guarda es el texto ya limpio.
  let comprador: { tipoIdentificacion: string; numeroIdentificacion: string; razonSocial: string | null; email: string | null } | null = null;
  if (quiereFactura) {
    const revisado = validarDatosFiscales(
      sinNombre
        ? { modo: "sin_nombre" }
        : {
            modo: "con_registro",
            tipoIdentificacion: datos.facturaTipoIdentificacion,
            numeroIdentificacion: datos.facturaRuc,
            razonSocial: datos.facturaRazonSocial,
            email: datos.facturaEmail,
          }
    );
    if (!revisado.ok) return { ok: false, error: revisado.error };
    comprador = revisado.datos;
    if (!facturacion.puedeFacturar && facturacion.motivo) {
      return { ok: false, error: `${textoSinFactura(facturacion.motivo)} Cobralo con ticket.` };
    }
  }

  // El punto de expedición de esta computadora, para emitir la factura en el acto (con el número consumido dentro de la transacción).
  let punto: (PuntoParaComprobante & { activo: boolean }) | null = null;
  if (quiereFactura) {
    const conPunto = await db.estacion.findUnique({ where: { id: estacion.id }, select: { puntoExpedicion: true } });
    punto = conPunto?.puntoExpedicion ?? null;
    if (!punto || !punto.activo || punto.timbradoHasta < new Date()) {
      return {
        ok: false,
        error: "Esta computadora no tiene un punto de expedición vigente: no se puede emitir la factura. Cobralo con ticket o asignalo en Puntos de expedición.",
      };
    }
  }

  const identidad = quienEs(sesion);
  const puntoDeFactura = punto;
  const compradorFinal = comprador;
  let numeroFactura: string | null = null;
  try {
    numeroFactura = await prismaCliente.$transaction(async (tx) => {
      // Un candado por pedido: un cambio que justo se estaba guardando (un producto, un descuento) termina antes de cobrar.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
      // Se toma el pedido con las condiciones en el WHERE: dos cobros a la vez, un pedido cancelado en el mismo instante o uno cuyo
      // total cambió desde que se miró, no cobran dos veces, no queman un número ni cobran otra cosa.
      const tomado = await tx.order.updateMany({
        where: { id, storeId, turnoPosId: null, estado: { not: "cancelado" }, total: totales.total },
        data: {
          formaPagoPos: formaPago,
          turnoPosId: turno.id,
          cobradoEn: new Date(),
          // Lo que se anotó al cargar era solo una referencia: desde ahora queda cómo se cobró de verdad.
          metodoPagoReferencia: formaPago,
          comprobanteTipo: quiereFactura ? "factura" : "ticket",
          ...(compradorFinal
            ? {
                facturaTipoIdentificacion: compradorFinal.tipoIdentificacion,
                facturaRuc: compradorFinal.numeroIdentificacion,
                facturaRazonSocial: sinNombre ? null : compradorFinal.razonSocial,
                facturaEmail: sinNombre ? null : compradorFinal.email,
              }
            : {}),
        },
      });
      if (tomado.count !== 1) {
        throw new ErrorDePedido("El pedido cambió, se canceló o ya se cobró mientras lo cobrabas. Actualizá la pantalla.");
      }
      // El cliente con datos fiscales queda guardado (o se le actualiza el nombre y el correo) para la próxima vez.
      if (compradorFinal && !sinNombre && compradorFinal.razonSocial) {
        await upsertClienteFiscal(tx, storeId, {
          tipoIdentificacion: compradorFinal.tipoIdentificacion,
          numeroIdentificacion: compradorFinal.numeroIdentificacion,
          razonSocial: compradorFinal.razonSocial,
          email: compradorFinal.email ?? "",
        });
      }
      if (!puntoDeFactura) return null;
      const paraEmitir = await tx.order.findUniqueOrThrow({ where: { id }, select: SELECT_PEDIDO_PARA_EMISION });
      return emitirFacturaDePedidoEnTransaccion(tx, {
        storeId,
        orderId: id,
        pedido: paraEmitir,
        punto: puntoDeFactura,
        emitidoPor: identidad,
      });
    }, OPCIONES_TX);
  } catch (e) {
    if (e instanceof ErrorDePedido) return { ok: false, error: e.message };
    console.error("[pedidos] cobrarPedido falló", e);
    return { ok: false, error: "No se pudo cobrar el pedido. No se registró nada: probá de nuevo." };
  }

  await registrarBitacora(storeId, sesion, {
    modulo: "pedidos",
    accion: "pedido_cobrado",
    descripcion: `Cobró el pedido ${formatearNumero(pedido.numero)} (${formatearGuarani(totales.total)}) con ${etiquetaFormaPagoPos(formaPago)}${
      numeroFactura ? ` y emitió la factura N° ${numeroFactura}` : quiereFactura ? "" : " con ticket"
    }${totales.descuento > 0 ? `, con un descuento de ${formatearGuarani(totales.descuento)}` : ""}.`,
    entidad: "Order",
    entidadId: id,
    detalle: {
      pedido: pedido.numero,
      total: totales.total,
      descuento: totales.descuento,
      forma: formaPago,
      comprobante: quiereFactura ? "factura" : "ticket",
      conRegistroFiscal: quiereFactura ? !sinNombre : null,
      turno: turno.id,
      factura: numeroFactura,
    },
  });
  refrescarPedido(id);
  revalidatePath("/admin/pos");
  revalidatePath("/admin/pos/turnos");
  revalidatePath("/admin/facturas");
  return { ok: true, total: totales.total, facturaNumero: numeroFactura };
}
