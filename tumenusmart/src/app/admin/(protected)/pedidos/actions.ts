"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { prismaDelLocal } from "@/lib/prisma-local";
import { prisma as prismaCliente } from "@/lib/prisma";
import { idLocalActual } from "@/lib/local-actual";
import { FORMAS_PAGO_POS, etiquetaFormaPagoPos } from "@/lib/turno-pos";
import { normalizarCobro } from "@/lib/rendicion";
import { estacionActual } from "@/lib/estacion-actual";
import { anularComprobantes, type PuntoParaComprobante } from "@/lib/comprobante";
import { SELECT_PEDIDO_PARA_EMISION, emitirFacturaDePedidoEnTransaccion } from "@/lib/emision-pedido";
import { revertirMovimientosVenta } from "@/lib/movimientos-stock";
import { registrarBitacora } from "@/lib/bitacora";
import { formatearGuarani, formatearNumero } from "@/lib/format";
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
  "Este pedido todavía no se cobró. Cobralo primero con el botón “Cobrar” del cuadro Cobro: así entra a la caja del turno.";

export type ResultadoPedidoAccion =
  | { ok: true; aviso?: string; areasImpresion?: string[] }
  /** `sinTurno`: cobrar el pedido exige el turno de caja abierto; la pantalla manda directo a abrirlo (src/lib/turno-requerido.ts). */
  | { ok: false; error: string; sinTurno?: true };

/**
 * Devuelve un resultado en vez de lanzar los errores de validación: Next.js
 * oculta en producción el mensaje de cualquier `throw` que salga de una
 * Server Action, así que el motivo real solo llega si viaja en el retorno.
 *
 * El dinero NO se mueve acá: un pedido se cobra al cargarlo (Pedidos → Nuevo pedido) o con "Cobrar" (`cobrarPedido`). Pasar de
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
    // El repartidor sale con el pedido ya cobrado (y facturado): lo que lleva en la mano es la ruta, no el cobro.
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
      // Un pedido sin cobrar no se entrega: esa plata no entró a ninguna caja (los pedidos que cargaste a mano ya nacen cobrados;
      // esto cubre uno viejo o uno que quedó sin cobrar).
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
// Cobrar un pedido que todavía no está cobrado.

/** Un motivo para frenar el cobro que la persona puede entender (se muestra tal cual). */
class ErrorDeCobro extends Error {}

/**
 * Cobra un pedido que quedó sin cobrar (uno viejo, de antes de que todo pedido se cobrara al cargarlo): entra a la caja del turno
 * abierto de ESTA computadora con la forma de pago que se elija y, si el pedido es con factura y todavía no tiene número, se emite
 * en el mismo momento. Todo en una transacción: o quedan las dos cosas o ninguna. Un pedido cobrado no se cobra dos veces.
 *
 * Es la misma venta que cuando se carga a mano: lo cobrado queda en `formaPagoPos` y `turnoPosId` (el cierre de turno y los reportes
 * lo leen de ahí). Sin turno de caja abierto no se cobra: se devuelve `sinTurno` y la pantalla manda directo a abrirlo.
 */
export async function cobrarPedido(orderId: string, forma: string): Promise<ResultadoPedidoAccion> {
  const sesion = await exigirPermiso("pedidos.cambiarEstado");
  const storeId = await idLocalActual();
  const prisma = prismaDelLocal(storeId);
  const id = String(orderId);

  const formaPago = String(forma ?? "").trim();
  if (!FORMAS_PAGO_POS.some((f) => f.valor === formaPago)) {
    return { ok: false, error: "Elegí con qué se cobra: efectivo, tarjeta de débito, tarjeta de crédito o transferencia." };
  }

  const estacion = await estacionActual(prisma);
  if (!estacion) {
    return {
      ok: false,
      error: "Esta computadora no está vinculada a una caja. Vinculala en Estaciones (punto de venta) para poder cobrar el pedido.",
    };
  }
  const turno = await turnoAbierto(prisma, estacion.id);
  if (!turno) {
    return { ok: false, error: "No hay un turno de caja abierto en esta computadora. Abrilo y volvé a cobrar el pedido.", sinTurno: true };
  }

  const pedido = await prisma.order.findUnique({
    where: { id },
    select: { numero: true, estado: true, total: true, turnoPosId: true, ...SELECT_PEDIDO_PARA_EMISION },
  });
  if (!pedido) return { ok: false, error: "No encontré ese pedido." };
  if (pedido.estado === "cancelado") return { ok: false, error: "Ese pedido está cancelado: no se cobra." };
  if (pedido.turnoPosId) return { ok: false, error: "Ese pedido ya está cobrado." };

  // Un pedido con factura que todavía no la tiene se factura al cobrarlo: hace falta el punto de expedición de esta computadora.
  let punto: (PuntoParaComprobante & { activo: boolean }) | null = null;
  if (pedido.comprobanteTipo === "factura" && !pedido.facturaNumero) {
    const conPunto = await prisma.estacion.findUnique({ where: { id: estacion.id }, select: { puntoExpedicion: true } });
    punto = conPunto?.puntoExpedicion ?? null;
    if (!punto || !punto.activo || punto.timbradoHasta < new Date()) {
      return {
        ok: false,
        error:
          "Este pedido es con factura y esta computadora no tiene un punto de expedición vigente: no se puede facturar. Asignalo en Puntos de expedición.",
      };
    }
  }

  const identidad = sesion.nombre?.trim() || sesion.email;
  const puntoDeFactura = punto;
  let numeroFactura: string | null = null;
  try {
    numeroFactura = await prismaCliente.$transaction(
      async (tx) => {
        // Se toma el pedido con la condición en el WHERE: dos cobros a la vez, o un pedido cancelado en el mismo instante, no
        // cobran dos veces ni queman un número.
        const tomado = await tx.order.updateMany({
          where: { id, storeId, turnoPosId: null, estado: { not: "cancelado" } },
          data: { formaPagoPos: formaPago, turnoPosId: turno.id, cobradoEn: new Date() },
        });
        if (tomado.count !== 1) {
          throw new ErrorDeCobro("Ese pedido ya se cobró o se canceló mientras lo cobrabas. Actualizá la pantalla.");
        }
        if (!puntoDeFactura) return null;
        return emitirFacturaDePedidoEnTransaccion(tx, { storeId, orderId: id, pedido, punto: puntoDeFactura, emitidoPor: identidad });
      },
      { timeout: 15_000, maxWait: 10_000 }
    );
  } catch (e) {
    if (e instanceof ErrorDeCobro) return { ok: false, error: e.message };
    console.error("[pedidos] cobrarPedido falló", e);
    return { ok: false, error: "No se pudo cobrar el pedido. No se registró nada: probá de nuevo." };
  }

  await registrarBitacora(storeId, sesion, {
    modulo: "pedidos",
    accion: "pedido_cobrado",
    descripcion: `Cobró el pedido ${formatearNumero(pedido.numero)} (${formatearGuarani(Number(pedido.total))}) con ${etiquetaFormaPagoPos(formaPago)}${
      numeroFactura ? ` y emitió la factura N° ${numeroFactura}` : ""
    }.`,
    entidad: "Order",
    entidadId: id,
    detalle: { pedido: pedido.numero, total: Number(pedido.total), forma: formaPago, turno: turno.id, factura: numeroFactura },
  });
  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${id}`);
  revalidatePath("/admin/pos");
  revalidatePath("/admin/pos/turnos");
  revalidatePath("/admin/facturas");
  return { ok: true };
}
