"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import type { ItemCuentaMesa, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal, siguienteNumeroVentaPos, upsertClienteFiscal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { exigirPermiso } from "@/lib/auth";
import { estacionActual } from "@/lib/estacion-actual";
import { registrarBitacora } from "@/lib/bitacora";
import { devolverConsumo } from "@/lib/movimientos-stock";
import { validarPagosDeVenta } from "@/lib/pago-venta";
import { FORMA_PAGO_A_CREDITO } from "@/lib/turno-pos";
import { desglosarIva, formatearNumeroFactura } from "@/lib/factura-pos";
import { crearComprobante, descripcionDeItem } from "@/lib/comprobante";
import { SIN_REGISTRO_FISCAL } from "@/lib/tipo-cliente";
import { calcularDescuento, textoPorcentaje } from "@/lib/descuento-venta";
import { resolverDescuentoConTipos } from "@/lib/tipos-descuento";
import { cargarTiposDescuento } from "@/lib/tipos-descuento-servidor";
import { claveDiaAsuncion } from "@/lib/timezone";
import { formatearCantidad, formatearGuarani, formatearNumero } from "@/lib/format";
import { repartirConsumo } from "@/lib/division-cuenta";
import { cortesiasSobrantes } from "@/lib/promociones";
import { cargarPromocionesEnTransaccion } from "@/lib/promociones-servidor";
import {
  ESTADOS_CUENTA_ABIERTA,
  contenidoParaGuardar,
  descuentoDeCuenta,
  leerConsumoGuardado,
  lineasDeCobro,
  normalizarMesa,
  textoAnulacion,
  totalDeLineas,
  totalesDeCuenta,
} from "@/lib/comedor";
import {
  ErrorDeUsuario,
  encolarCuenta,
  guardarRonda,
  horaDeAhora,
  pistaDelError,
  type LineaDeRonda,
} from "@/lib/comedor-servidor";
import { turnoAbierto } from "../pos/turno-actual";
import { etiquetaFormaPropina, validarPropina, type DatosPropina, type PropinaValida } from "@/lib/propinas";

/**
 * Lo que la CAJA hace con la cuenta de una mesa desde el panel (Servicio comedor): cargar productos, cancelar uno o toda la
 * cuenta (con motivo), dar un descuento, imprimir la cuenta (queda "por cobrar": el mozo ya no puede cargarle más), reabrirla
 * y pagarla. El mozo no hace nada de esto, salvo imprimir SU cuenta si el dueño activó esa regla (ver la acción del mozo).
 *
 * Cada acción exige su permiso al empezar y busca la cuenta SOLO dentro del local de la sesión. Todas devuelven un resultado
 * en vez de lanzar, para que la pantalla pueda decir por qué no se pudo (Next.js oculta en producción el mensaje de una
 * excepción de una acción del servidor).
 */

type Resultado = { ok: true } | { ok: false; error: string };

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

function nombreDe(sesion: { nombre?: string | null; email: string }): string {
  return sesion.nombre?.trim() || sesion.email;
}

function textoNoEditable(estado: string): string {
  if (estado === "por_cobrar") return "La cuenta ya está impresa. Reabrila para hacer cambios.";
  return "Esa cuenta ya está cerrada.";
}

function refrescar() {
  revalidatePath("/admin/comedor");
}

// ---------------------------------------------------------------------------------------------------------------------
//  Cancelar productos o la cuenta
// ---------------------------------------------------------------------------------------------------------------------

type ItemParaAnular = {
  id: string;
  cantidad: number;
  nombreProducto: string;
  opcionesTexto: string | null;
  areaImpresionId: string | null;
  consumo: Prisma.JsonValue;
};

/**
 * Cancela productos de una cuenta, dentro de la transacción de quien llama: los marca (con quién y por qué), devuelve al stock
 * lo que habían descontado y le avisa a su área (Cocina, Barra…) con un papel de "ANULADO" para que no lo preparen.
 */
async function anularItems(
  tx: Prisma.TransactionClient,
  storeId: string,
  cuenta: { id: string; mesa: string },
  items: ItemParaAnular[],
  razon: string,
  quien: string
): Promise<void> {
  const ahora = new Date();
  const hora = horaDeAhora();
  const idsDeAreas = [...new Set(items.map((i) => i.areaImpresionId).filter((a): a is string => !!a))];
  const areas = idsDeAreas.length
    ? await tx.areaImpresion.findMany({ where: { id: { in: idsDeAreas }, storeId }, select: { id: true, nombre: true } })
    : [];
  const nombreDeArea = new Map(areas.map((a) => [a.id, a.nombre]));

  for (const item of items) {
    // La condición va en el update: si otra caja lo canceló en el mismo instante, acá no encuentra nada que marcar.
    const marcado = await tx.itemCuentaMesa.updateMany({
      where: { id: item.id, storeId, cuentaId: cuenta.id, estado: "activo" },
      data: { estado: "anulado", anuladoPor: quien, anuladoEn: ahora, motivoAnulacion: razon },
    });
    if (marcado.count !== 1) throw new ErrorDeUsuario("Ese producto ya estaba cancelado. Actualizá la pantalla.");

    await devolverConsumo(
      tx,
      storeId,
      leerConsumoGuardado(item.consumo),
      { cuentaMesaId: cuenta.id },
      `Cancelado: ${item.cantidad} × ${item.nombreProducto} (${razon})`,
      quien
    );

    if (item.areaImpresionId) {
      const area = nombreDeArea.get(item.areaImpresionId) ?? "Comanda";
      await tx.trabajoImpresion.create({
        data: {
          storeId,
          tipo: "anulacion",
          titulo: `Mesa ${cuenta.mesa} · ${area} · anulado`,
          areaImpresionId: item.areaImpresionId,
          contenido: contenidoParaGuardar(
            textoAnulacion({
              mesa: cuenta.mesa,
              area,
              hora,
              quien,
              cantidad: item.cantidad,
              nombre: item.nombreProducto,
              opciones: item.opcionesTexto,
              motivo: razon,
            })
          ),
          cuentaMesaId: cuenta.id,
        },
      });
    }
  }
}

/**
 * Cancela ALGUNAS unidades de un producto: el mozo comandó 5 empanadas y eran 4. La línea se queda con las que siguen (4: su
 * cantidad y lo que descontó del stock bajan en proporción) y las canceladas pasan a una fila propia, marcada como cancelada
 * (con quién y por qué), de modo que el rastro de la cuenta muestra las dos cosas. Se devuelve al stock solo lo de las unidades
 * canceladas y se le avisa a la cocina o la barra de que no preparen esas. Va dentro de la transacción de quien llama.
 */
async function anularParteDeItem(
  tx: Prisma.TransactionClient,
  storeId: string,
  cuenta: { id: string; mesa: string },
  item: ItemCuentaMesa,
  cantidad: number,
  razon: string,
  quien: string
): Promise<void> {
  const ahora = new Date();
  const quedan = item.cantidad - cantidad;
  const [consumoQueda, consumoAnulado] = repartirConsumo(leerConsumoGuardado(item.consumo), [
    quedan / item.cantidad,
    cantidad / item.cantidad,
  ]);

  // La cantidad que se leyó va en la condición: si otra caja la cambió (o la canceló) en el mismo instante, acá no encuentra nada.
  const reducida = await tx.itemCuentaMesa.updateMany({
    where: { id: item.id, storeId, cuentaId: cuenta.id, estado: "activo", cantidad: item.cantidad },
    data: { cantidad: quedan, consumo: consumoQueda as unknown as Prisma.InputJsonValue },
  });
  if (reducida.count !== 1) throw new ErrorDeUsuario("Ese producto cambió mientras lo cancelabas. Actualizá la pantalla.");

  await tx.itemCuentaMesa.create({
    data: {
      storeId,
      cuentaId: cuenta.id,
      ronda: item.ronda,
      // Una fila nueva necesita su propio par envío/línea (es único): este "envío" es la cancelación.
      envioId: `anulacion-${randomUUID()}`,
      linea: item.linea,
      mozoId: item.mozoId,
      cargadoPor: item.cargadoPor,
      productId: item.productId,
      nombreProducto: item.nombreProducto,
      cantidad,
      precioUnitario: item.precioUnitario,
      iva: item.iva,
      opcionesTexto: item.opcionesTexto,
      ingredientesQuitadosTexto: item.ingredientesQuitadosTexto,
      nota: item.nota,
      costoProducto: item.costoProducto,
      costoAgregados: item.costoAgregados,
      precioAgregados: item.precioAgregados,
      areaImpresionId: item.areaImpresionId,
      consumo: consumoAnulado as unknown as Prisma.InputJsonValue,
      // Conserva la promoción y si era la parte regalada: la fila cancelada es el rastro de lo que había.
      promocionId: item.promocionId,
      cortesia: item.cortesia,
      precioAntesPromo: item.precioAntesPromo,
      estado: "anulado",
      anuladoPor: quien,
      anuladoEn: ahora,
      motivoAnulacion: razon,
      enviadoEn: item.enviadoEn,
    },
  });

  await devolverConsumo(
    tx,
    storeId,
    consumoAnulado,
    { cuentaMesaId: cuenta.id },
    `Cancelado: ${formatearCantidad(cantidad)} de ${formatearCantidad(item.cantidad)} × ${item.nombreProducto} (${razon})`,
    quien
  );

  if (item.areaImpresionId) {
    const area = await tx.areaImpresion.findFirst({ where: { id: item.areaImpresionId, storeId }, select: { nombre: true } });
    const nombreDeArea = area?.nombre ?? "Comanda";
    await tx.trabajoImpresion.create({
      data: {
        storeId,
        tipo: "anulacion",
        titulo: `Mesa ${cuenta.mesa} · ${nombreDeArea} · anulado`,
        areaImpresionId: item.areaImpresionId,
        contenido: contenidoParaGuardar(
          textoAnulacion({
            mesa: cuenta.mesa,
            area: nombreDeArea,
            hora: horaDeAhora(),
            quien,
            cantidad,
            nombre: item.nombreProducto,
            opciones: item.opcionesTexto,
            motivo: razon,
          })
        ),
        cuentaMesaId: cuenta.id,
      },
    });
  }
}

/**
 * Después de cancelar productos: si la cuenta tenía cortesías de una promoción por volumen ("por cada 2, regalar 1") que ya no
 * corresponden (se cancelaron las que se pagaban), las cancela también, empezando por las últimas cargadas, con el mismo motivo.
 * Va dentro de la transacción de quien llama. Devuelve cuántas unidades de cortesía recortó.
 */
async function recortarCortesias(
  tx: Prisma.TransactionClient,
  storeId: string,
  cuenta: { id: string; mesa: string },
  razon: string,
  quien: string
): Promise<number> {
  const activos = await tx.itemCuentaMesa.findMany({
    where: { cuentaId: cuenta.id, storeId, estado: "activo", promocionId: { not: null } },
    orderBy: [{ ronda: "asc" }, { linea: "asc" }],
  });
  if (activos.length === 0) return 0;
  const promos = await cargarPromocionesEnTransaccion(tx, storeId);
  const sobrantes = cortesiasSobrantes(
    activos.map((i) => ({ id: i.id, productId: i.productId, cantidad: i.cantidad, promocionId: i.promocionId, cortesia: i.cortesia })),
    promos
  );
  let recortadas = 0;
  const motivo = `La promoción ya no corresponde (${razon})`;
  for (const s of sobrantes) {
    const item = activos.find((a) => a.id === s.itemId);
    // Una cuenta dividida puede dejar fracciones (0,5): esas no se tocan.
    if (!item || !Number.isInteger(item.cantidad) || !Number.isInteger(s.cantidad)) continue;
    if (s.cantidad >= item.cantidad) await anularItems(tx, storeId, cuenta, [item], motivo, quien);
    else await anularParteDeItem(tx, storeId, cuenta, item, s.cantidad, motivo, quien);
    recortadas += s.cantidad;
  }
  return recortadas;
}

/**
 * Cancela un producto de una cuenta abierta, con motivo: todo, o solo ALGUNAS de sus unidades si se pasa `cantidad` (5
 * empanadas comandadas de más: se cancela 1 y quedan 4). Sin `cantidad` se cancela todo, como siempre. Solo se cancelan
 * unidades enteras; un producto que quedó con una fracción (0,5, por haber dividido la cuenta en partes iguales) se cancela entero.
 */
export async function anularProducto(cuentaId: string, itemId: string, motivo: string, cantidad?: number): Promise<Resultado> {
  // El permiso se pide acá también (aunque `anularProductos` lo vuelve a pedir): cada acción del servidor se protege a sí misma.
  await exigirPermiso("comedor.gestionar");
  return anularProductos(cuentaId, [{ itemId, cantidad }], motivo);
}

/**
 * Cancela de una sola vez varias partes de la cuenta, con UN motivo: lo que pasa cuando el mismo producto se cargó en varios
 * pedidos y la pantalla lo muestra en una sola fila (3 parrilladas = 1 del pedido 1 + 2 del pedido 2). Cada parte es un producto
 * de la cuenta y cuántas unidades se cancelan de él (sin `cantidad`, todo). Todo ocurre en una transacción: si una parte falla,
 * no se cancela ninguna. Mismas reglas que `anularProducto`: solo unidades enteras, salvo un producto con fracción (se cancela entero).
 */
export async function anularProductos(
  cuentaId: string,
  partes: { itemId: string; cantidad?: number }[],
  motivo: string
): Promise<Resultado> {
  const sesion = await exigirPermiso("comedor.gestionar");
  const storeId = await idLocalActual();
  const razon = limpiarMotivo(motivo);
  if (!razon) return { ok: false, error: MENSAJE_MOTIVO };
  const quien = nombreDe(sesion);

  // Lo que llega del navegador se comprueba antes de tocar nada.
  if (!Array.isArray(partes) || partes.length === 0 || partes.length > 100) {
    return { ok: false, error: "No hay nada para cancelar. Actualizá la pantalla." };
  }
  const vistos = new Set<string>();
  for (const p of partes) {
    if (!p || typeof p.itemId !== "string" || vistos.has(p.itemId)) {
      return { ok: false, error: "El producto elegido no es válido. Actualizá la pantalla." };
    }
    vistos.add(p.itemId);
    if (p.cantidad !== undefined && (typeof p.cantidad !== "number" || !Number.isFinite(p.cantidad) || p.cantidad <= 0)) {
      return { ok: false, error: "La cantidad a cancelar tiene que ser mayor a cero." };
    }
  }

  let resumen = "";
  let canceladas = 0;
  try {
    resumen = await prisma.$transaction(async (tx) => {
      const cuenta = await tx.cuentaMesa.findFirst({
        where: { id: String(cuentaId), storeId },
        select: { id: true, mesa: true, estado: true },
      });
      if (!cuenta) throw new ErrorDeUsuario("No encontré esa cuenta.");
      if (cuenta.estado !== "abierta") throw new ErrorDeUsuario(textoNoEditable(cuenta.estado));

      const detalles: string[] = [];
      for (const p of partes) {
        const item = await tx.itemCuentaMesa.findFirst({ where: { id: p.itemId, cuentaId: cuenta.id, storeId } });
        if (!item) throw new ErrorDeUsuario("No encontré ese producto. Actualizá la pantalla.");
        if (item.estado !== "activo") throw new ErrorDeUsuario("Ese producto ya estaba cancelado. Actualizá la pantalla.");

        const pedida = p.cantidad ?? item.cantidad;
        if (pedida > item.cantidad + 1e-9) {
          throw new ErrorDeUsuario(`Solo hay ${formatearCantidad(item.cantidad)} de ese producto en la cuenta.`);
        }
        // Todo el producto: se marca cancelado tal cual, como siempre.
        if (Math.abs(pedida - item.cantidad) < 1e-9) {
          canceladas += item.cantidad;
          await anularItems(tx, storeId, cuenta, [item], razon, quien);
          detalles.push(`${formatearCantidad(item.cantidad)} × ${item.nombreProducto}`);
          continue;
        }
        // Solo algunas unidades: tienen que ser enteras, de un producto de unidades enteras.
        if (!Number.isInteger(item.cantidad) || !Number.isInteger(pedida)) {
          throw new ErrorDeUsuario("Ese producto se cancela entero: ya se había dividido la cuenta y quedó con una fracción.");
        }
        canceladas += pedida;
        await anularParteDeItem(tx, storeId, cuenta, item, pedida, razon, quien);
        detalles.push(`${pedida} de ${item.cantidad} × ${item.nombreProducto} (quedan ${item.cantidad - pedida})`);
      }
      // Si había cortesías de una promoción por volumen que ya no corresponden, se cancelan también.
      const recortadas = await recortarCortesias(tx, storeId, cuenta, razon, quien);
      if (recortadas > 0) detalles.push(`${recortadas} de cortesía de promoción`);
      return `${detalles.join(" y ")} de la mesa ${cuenta.mesa}`;
    }, OPCIONES_TX);
  } catch (e) {
    if (e instanceof ErrorDeUsuario) return { ok: false, error: e.message };
    console.error("[comedor] anularProductos falló", e);
    return { ok: false, error: `No se pudo cancelar el producto. (Detalle: ${pistaDelError(e)})` };
  }

  await registrarBitacora(storeId, sesion, {
    modulo: "comedor",
    accion: "producto_cancelado",
    descripcion: `Canceló ${resumen}. Motivo: ${razon}.`,
    entidad: "CuentaMesa",
    entidadId: String(cuentaId),
    detalle: { producto: resumen, motivo: razon, canceladas },
  });
  refrescar();
  return { ok: true };
}

/**
 * Cierra una cuenta que quedó SIN productos activos (se cancelaron todos, o se abrió por error) para liberar la mesa.
 *
 * Una cuenta con productos NO se cancela mientras se atiende: si ya se imprimió o se cobró, cancelarla en pleno servicio es
 * justo la forma de que una cuenta desaparezca sin dejar plata en la caja. Se cobra, y si hace falta se cancela la venta
 * desde el Historial de cuentas (que devuelve el stock y deja el rastro). Esto se exige acá, en el servidor: que la pantalla
 * no muestre el botón no alcanza. Los productos de la cuenta se cancelan de a uno (con motivo) con `anularProducto`.
 */
export async function cancelarCuenta(cuentaId: string, motivo: string): Promise<Resultado> {
  const sesion = await exigirPermiso("comedor.gestionar");
  const storeId = await idLocalActual();
  const razon = limpiarMotivo(motivo);
  if (!razon) return { ok: false, error: MENSAJE_MOTIVO };
  const quien = nombreDe(sesion);

  let resumen = "";
  try {
    resumen = await prisma.$transaction(async (tx) => {
      const cuenta = await tx.cuentaMesa.findFirst({
        where: { id: String(cuentaId), storeId, estado: { in: [...ESTADOS_CUENTA_ABIERTA] } },
        select: { id: true, numero: true, mesa: true, impresaEn: true },
      });
      if (!cuenta) throw new ErrorDeUsuario("Esa cuenta ya está cerrada.");
      const productos = await tx.itemCuentaMesa.findMany({
        where: { cuentaId: cuenta.id, storeId },
        select: { cantidad: true, precioUnitario: true, estado: true },
      });
      if (productos.some((p) => p.estado === "activo")) {
        throw new ErrorDeUsuario(
          "Una cuenta con productos no se cancela mientras se atiende. Cobrala y, si hace falta, cancelá la venta desde el Historial de cuentas."
        );
      }
      // Lo que se había cargado queda en el rastro: si alguien cancela de a uno todos los productos y cierra la cuenta, la
      // Bitácora y el Historial muestran de cuánta plata se trataba.
      const cargado = totalDeLineas(productos.map((p) => ({ precioUnitario: Number(p.precioUnitario), cantidad: p.cantidad })));
      // Las comandas que todavía no salieron (la impresora estaba apagada) ya no tienen sentido: no se imprimen después.
      // Quedan a la vista en la lista, con ese motivo, y se pueden reimprimir a mano si hiciera falta.
      await tx.trabajoImpresion.updateMany({
        where: { storeId, cuentaMesaId: cuenta.id, tipo: "comanda", estado: "pendiente" },
        data: { estado: "error", error: "La cuenta se canceló antes de imprimirse." },
      });
      // El estado va en la condición: si la pagaron en el mismo instante, no se pisa.
      const cerrada = await tx.cuentaMesa.updateMany({
        where: { id: cuenta.id, storeId, estado: { in: [...ESTADOS_CUENTA_ABIERTA] } },
        data: { estado: "anulada", mesaAbierta: null, cerradaEn: new Date(), cerradaPor: quien, motivoCierre: razon },
      });
      if (cerrada.count !== 1) throw new ErrorDeUsuario("Esa cuenta ya está cerrada.");
      return (
        `la cuenta vacía ${formatearNumero(cuenta.numero)} de la mesa ${cuenta.mesa} ` +
        `(se habían cargado ${formatearGuarani(cargado)}, todo cancelado producto por producto` +
        `${cuenta.impresaEn ? "; la cuenta había llegado a imprimirse" : ""})`
      );
    }, OPCIONES_TX);
  } catch (e) {
    if (e instanceof ErrorDeUsuario) return { ok: false, error: e.message };
    console.error("[comedor] cancelarCuenta falló", e);
    return { ok: false, error: `No se pudo cerrar la cuenta. (Detalle: ${pistaDelError(e)})` };
  }

  await registrarBitacora(storeId, sesion, {
    modulo: "comedor",
    accion: "cuenta_cancelada",
    descripcion: `Cerró ${resumen}. Motivo: ${razon}.`,
    entidad: "CuentaMesa",
    entidadId: String(cuentaId),
    detalle: { cuenta: resumen, motivo: razon },
  });
  refrescar();
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------------
//  Descuento
// ---------------------------------------------------------------------------------------------------------------------

/** `tipoDescuentoId`: el tipo de descuento de Ajustes que se eligió (Cortesía, Tarjeta…): el porcentaje sale de él y no de `valor`. */
export type DatosDescuentoCuenta = { tipo: "porcentaje" | "monto"; valor: number; tipoDescuentoId?: string };

/**
 * Pone (o, con `null`, quita) el descuento general de la cuenta. Va con motivo. El monto en guaraníes se calcula acá, sobre lo
 * que vale la cuenta en este momento; si después se cancelan productos, un descuento por porcentaje se ajusta solo.
 */
export async function aplicarDescuento(
  cuentaId: string,
  descuento: DatosDescuentoCuenta | null,
  motivo: string
): Promise<Resultado> {
  const sesion = await exigirPermiso("comedor.gestionar");
  const storeId = await idLocalActual();
  const quien = nombreDe(sesion);

  // Un descuento de 0 es "sin descuento": reemplaza al que la cuenta tenía y la deja en su monto original (sirve para
  // corregir uno mal puesto: se escribe 0 y se guarda). No pide motivo, igual que quitarlo.
  const sinDescuento = !descuento || (Number(descuento.valor) === 0 && !descuento.tipoDescuentoId);
  const razon = sinDescuento ? null : limpiarMotivo(motivo);
  // Lo que se calcula de verdad: con un tipo de descuento elegido, SU porcentaje (el 100 % de una cortesía solo sale de un tipo).
  let efectivo: { tipo: "porcentaje" | "monto"; valor: number } | null = null;
  if (descuento && !sinDescuento) {
    if (descuento.tipo !== "porcentaje" && descuento.tipo !== "monto") {
      return { ok: false, error: "El descuento no es válido." };
    }
    if (!razon) return { ok: false, error: MENSAJE_MOTIVO };
    const resuelto = resolverDescuentoConTipos(
      { tipo: descuento.tipo, valor: Number(descuento.valor), tipoDescuentoId: descuento.tipoDescuentoId },
      await cargarTiposDescuento(prismaDelLocal(storeId))
    );
    if (!resuelto.ok) return { ok: false, error: resuelto.error };
    efectivo = resuelto.descuento ? { tipo: resuelto.descuento.tipo, valor: resuelto.descuento.valor } : null;
  }

  let descripcion = "";
  try {
    descripcion = await prisma.$transaction(async (tx) => {
      const cuenta = await tx.cuentaMesa.findFirst({
        where: { id: String(cuentaId), storeId },
        select: { id: true, numero: true, mesa: true, estado: true },
      });
      if (!cuenta) throw new ErrorDeUsuario("No encontré esa cuenta.");
      if (cuenta.estado !== "abierta") throw new ErrorDeUsuario(textoNoEditable(cuenta.estado));

      if (!efectivo) {
        await tx.cuentaMesa.update({
          where: { id: cuenta.id },
          data: { descuentoTipo: null, descuentoValor: null, descuentoMotivo: null, descuentoPor: null },
        });
        return `Quitó el descuento de la mesa ${cuenta.mesa}: la cuenta vuelve a su monto original.`;
      }

      const activos = await tx.itemCuentaMesa.findMany({
        where: { cuentaId: cuenta.id, storeId, estado: "activo" },
        select: { cantidad: true, precioUnitario: true },
      });
      const subtotal = totalDeLineas(activos.map((i) => ({ precioUnitario: Number(i.precioUnitario), cantidad: i.cantidad })));
      const calculado = calcularDescuento(subtotal, { tipo: efectivo.tipo, valor: efectivo.valor });
      if (!calculado.ok) throw new ErrorDeUsuario(calculado.error);
      if (calculado.monto <= 0) throw new ErrorDeUsuario("Escribí un descuento mayor a cero.");

      await tx.cuentaMesa.update({
        where: { id: cuenta.id },
        data: {
          descuentoTipo: efectivo.tipo,
          descuentoValor: efectivo.valor,
          descuentoMotivo: razon,
          descuentoPor: quien,
        },
      });
      const cuanto =
        calculado.porcentaje != null
          ? `${textoPorcentaje(calculado.porcentaje)}% (${formatearGuarani(calculado.monto)})`
          : formatearGuarani(calculado.monto);
      return `Dio un descuento de ${cuanto} a la mesa ${cuenta.mesa}. Motivo: ${razon}.`;
    }, OPCIONES_TX);
  } catch (e) {
    if (e instanceof ErrorDeUsuario) return { ok: false, error: e.message };
    console.error("[comedor] aplicarDescuento falló", e);
    return { ok: false, error: `No se pudo guardar el descuento. (Detalle: ${pistaDelError(e)})` };
  }

  await registrarBitacora(storeId, sesion, {
    modulo: "comedor",
    accion: sinDescuento ? "descuento_quitado" : "descuento_aplicado",
    descripcion: descripcion,
    entidad: "CuentaMesa",
    entidadId: String(cuentaId),
    detalle: efectivo ? { tipo: efectivo.tipo, valor: efectivo.valor, motivo: razon, conTipo: !!descuento?.tipoDescuentoId } : {},
  });
  refrescar();
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------------
//  Imprimir la cuenta y reabrirla
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Imprime la cuenta para el cliente (no es una factura) en la impresora del ticket de ESTA estación, y la deja "por cobrar":
 * desde ese momento el mozo ya no puede cargarle productos hasta que la caja la reabra. Se puede volver a imprimir.
 */
export async function imprimirCuenta(cuentaId: string): Promise<Resultado> {
  const sesion = await exigirPermiso("comedor.gestionar");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);
  const quien = nombreDe(sesion);

  // La cuenta sale en la impresora del ticket de la estación de esta computadora; sin eso nadie la podría imprimir.
  const estacion = await estacionActual(db);
  if (!estacion) {
    return { ok: false, error: "Esta computadora no está vinculada a una estación. Vinculala en Estaciones para imprimir la cuenta." };
  }
  const datosEstacion = await db.estacion.findUnique({
    where: { id: estacion.id },
    select: { areaTicketId: true, impresoras: { select: { areaImpresionId: true } } },
  });
  const areaTicketId = datosEstacion?.areaTicketId ?? null;
  if (!areaTicketId || !datosEstacion?.impresoras.some((i) => i.areaImpresionId === areaTicketId)) {
    return {
      ok: false,
      error:
        "Esta estación no tiene impresora para el ticket. En Estaciones elegí el “Área del ticket/factura” y asignale una impresora.",
    };
  }

  const local = await prisma.store.findUnique({ where: { id: storeId }, select: { nombre: true } });

  let titulo = "";
  try {
    titulo = await prisma.$transaction(
      (tx) =>
        encolarCuenta(tx, {
          storeId,
          cuentaId: String(cuentaId),
          areaTicketId,
          quien,
          local: local?.nombre ?? "Cuenta",
          queHacerConElDescuento: "Cambialo o quitalo.",
        }),
      OPCIONES_TX
    );
  } catch (e) {
    if (e instanceof ErrorDeUsuario) return { ok: false, error: e.message };
    console.error("[comedor] imprimirCuenta falló", e);
    return { ok: false, error: `No se pudo imprimir la cuenta. (Detalle: ${pistaDelError(e)})` };
  }

  await registrarBitacora(storeId, sesion, {
    modulo: "comedor",
    accion: "cuenta_impresa",
    descripcion: `Imprimió la cuenta: ${titulo}.`,
    entidad: "CuentaMesa",
    entidadId: String(cuentaId),
    detalle: { cuenta: titulo },
  });
  refrescar();
  return { ok: true };
}

/** Vuelve a abrir una cuenta que ya se había impreso, para que el mozo (o la caja) pueda cargarle más productos. */
export async function reabrirCuenta(cuentaId: string): Promise<Resultado> {
  const sesion = await exigirPermiso("comedor.gestionar");
  const storeId = await idLocalActual();

  const cuenta = await prisma.cuentaMesa.findFirst({
    where: { id: String(cuentaId), storeId },
    select: { id: true, mesa: true, estado: true },
  });
  if (!cuenta) return { ok: false, error: "No encontré esa cuenta." };
  if (cuenta.estado !== "por_cobrar") {
    return { ok: false, error: cuenta.estado === "abierta" ? "Esa cuenta ya está abierta." : "Esa cuenta ya está cerrada." };
  }

  // El estado va en la condición: si justo la pagaron, no se reabre.
  const reabierta = await prisma.cuentaMesa.updateMany({
    where: { id: cuenta.id, storeId, estado: "por_cobrar" },
    data: { estado: "abierta", impresaEn: null, impresaPor: null },
  });
  if (reabierta.count !== 1) return { ok: false, error: "Esa cuenta ya no está impresa. Actualizá la pantalla." };

  await registrarBitacora(storeId, sesion, {
    modulo: "comedor",
    accion: "cuenta_reabierta",
    descripcion: `Reabrió la cuenta de la mesa ${cuenta.mesa} para cargarle más productos.`,
    entidad: "CuentaMesa",
    entidadId: cuenta.id,
    detalle: { mesa: cuenta.mesa },
  });
  refrescar();
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------------
//  Cargar productos desde la caja
// ---------------------------------------------------------------------------------------------------------------------

export type ResultadoCargaCaja =
  | { ok: true; ronda: number; totalEnvio: number; areas: string[]; yaEnviado: boolean }
  | { ok: false; error: string };

/**
 * La caja le carga productos a una cuenta abierta desde el panel (cuando el mozo no está, o el cliente pide algo en la
 * caja). Hace lo mismo que cuando envía el mozo: precio recalculado en el servidor, stock descontado y comanda en la cola.
 */
export async function cargarProductosCaja(
  cuentaId: string,
  datos: { envioId: string; items: LineaDeRonda[] }
): Promise<ResultadoCargaCaja> {
  const sesion = await exigirPermiso("comedor.gestionar");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);
  const quien = nombreDe(sesion);

  const cuenta = await db.cuentaMesa.findFirst({
    where: { id: String(cuentaId) },
    select: { id: true, mesa: true, mozoId: true, estado: true },
  });
  if (!cuenta) return { ok: false, error: "No encontré esa cuenta." };
  if (cuenta.estado !== "abierta") return { ok: false, error: textoNoEditable(cuenta.estado) };

  const r = await guardarRonda({
    storeId,
    mesa: cuenta.mesa,
    comensales: null,
    envioId: String(datos?.envioId ?? ""),
    items: Array.isArray(datos?.items) ? datos.items : [],
    mozoId: cuenta.mozoId,
    quien: `Caja - ${quien}`,
    cargadoPor: quien,
    detalleTecnico: true,
    cuentaId: cuenta.id,
  });
  if (!r.ok) return r;

  if (!r.yaEnviado) {
    await registrarBitacora(storeId, sesion, {
      modulo: "comedor",
      accion: "productos_cargados_en_caja",
      descripcion: `Cargó el pedido ${r.ronda} en la mesa ${r.mesa} desde la caja (${formatearGuarani(r.totalEnvio)}).`,
      entidad: "CuentaMesa",
      entidadId: r.cuentaId,
      detalle: { cuenta: r.cuentaNumero, mesa: r.mesa, ronda: r.ronda, total: r.totalEnvio },
    });
  }
  refrescar();
  return { ok: true, ronda: r.ronda, totalEnvio: r.totalEnvio, areas: r.areas, yaEnviado: r.yaEnviado };
}

// ---------------------------------------------------------------------------------------------------------------------
//  Abrir una cuenta desde la caja
// ---------------------------------------------------------------------------------------------------------------------

export type ResultadoAbrirCuenta =
  | { ok: true; cuentaId: string; cuentaNumero: number; mesa: string; areas: string[]; totalEnvio: number; yaEnviado: boolean }
  | { ok: false; error: string };

/**
 * La caja abre la cuenta de una mesa desde el panel (cuando el mozo no está o el cliente pide en la caja): elige la mesa y el
 * mozo a cargo —que es simbólico: es quien figura en la cuenta y en los reportes— y le carga el primer pedido. Igual que
 * cuando abre el mozo, la cuenta nace al enviar el primer pedido (no existen cuentas vacías) y hace lo mismo: precio
 * recalculado en el servidor, stock descontado y comanda en la cola de impresión. Lo cargado queda marcado como "cargado por
 * la caja" con el nombre de quien lo hizo.
 *
 * Mismas reglas que el mozo: si el local cargó sus mesas hay que elegir una de la lista, y una mesa que ya tiene cuenta
 * abierta NO se abre otra vez (se le agrega el pedido a la que tiene).
 */
export async function abrirCuentaEnCaja(datos: {
  mesa: string;
  mozoId: string;
  comensales?: number;
  envioId: string;
  items: LineaDeRonda[];
  /**
   * La caja escribió la mesa a mano ("mesa auxiliar": una que no está en el mapa, o el nombre de un cliente que pide en la
   * barra). Solo la caja puede: el mozo, aunque el local tenga mesas cargadas, sigue limitado a las de la lista.
   */
  mesaManual?: boolean;
}): Promise<ResultadoAbrirCuenta> {
  const sesion = await exigirPermiso("comedor.gestionar");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);
  const quien = nombreDe(sesion);

  const mesa = normalizarMesa(datos?.mesa);
  if (!mesa) return { ok: false, error: "Elegí la mesa (hasta 20 letras)." };

  // El mozo se busca dentro de ESTE local y tiene que estar activo: un id de otro negocio no aparece.
  const mozo = await db.mozo.findFirst({
    where: { id: String(datos?.mozoId ?? ""), activo: true },
    select: { id: true, nombre: true, apellido: true },
  });
  if (!mozo) return { ok: false, error: "Elegí el mozo a cargo de la cuenta." };

  const comensales =
    Number.isInteger(datos?.comensales) && datos.comensales! >= 1 && datos.comensales! <= 99 ? datos.comensales! : null;
  const manual = datos?.mesaManual === true;
  const mesasCargadas = await db.mesaComedor.findMany({ select: { clave: true, activa: true } });

  const r = await guardarRonda({
    storeId,
    mesa,
    comensales,
    envioId: String(datos?.envioId ?? ""),
    items: Array.isArray(datos?.items) ? datos.items : [],
    mozoId: mozo.id,
    quien: `Caja - ${quien}`,
    cargadoPor: quien,
    detalleTecnico: true,
    // Con la mesa escrita a mano no se exige que esté en la lista (la caja puede); si no, rige la lista del local.
    mesasPermitidas:
      !manual && mesasCargadas.length > 0 ? mesasCargadas.filter((m) => m.activa).map((m) => m.clave) : undefined,
    soloAbrirNueva: true,
  });
  if (!r.ok) return r;

  if (!r.yaEnviado) {
    const aCargoDe = [mozo.nombre, mozo.apellido].filter(Boolean).join(" ");
    await registrarBitacora(storeId, sesion, {
      modulo: "comedor",
      accion: "cuenta_abierta_en_caja",
      descripcion: `Abrió desde la caja la cuenta ${formatearNumero(r.cuentaNumero)} de la mesa ${r.mesa}${manual ? " (mesa escrita a mano)" : ""}, a cargo de ${aCargoDe}, y cargó el pedido 1 (${formatearGuarani(r.totalEnvio)}).`,
      entidad: "CuentaMesa",
      entidadId: r.cuentaId,
      detalle: { cuenta: r.cuentaNumero, mesa: r.mesa, mozo: aCargoDe, total: r.totalEnvio, mesaManual: manual },
    });
  }
  refrescar();
  return {
    ok: true,
    cuentaId: r.cuentaId,
    cuentaNumero: r.cuentaNumero,
    mesa: r.mesa,
    areas: r.areas,
    totalEnvio: r.totalEnvio,
    yaEnviado: r.yaEnviado,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
//  Pagar la cuenta
// ---------------------------------------------------------------------------------------------------------------------

export type DatosCobroCuenta = {
  /** Cómo paga el cliente: una forma, o varias si divide el pago (ver validarPagosDeVenta). */
  pagos: { forma: string; monto: number }[];
  /** "ticket" | "factura": factura solo si la estación tiene un punto de expedición vigente. */
  comprobanteTipo: string;
  facturaTipoIdentificacion?: string;
  facturaNumeroIdentificacion?: string;
  facturaRazonSocial?: string;
  facturaEmail?: string;
  /** Solo si se paga "a_credito": a quién se le cobra después (nombre y teléfono; con factura con registro fiscal alcanza su RUC). */
  clienteNombre?: string;
  clienteTelefono?: string;
  /** Solo si se paga "a_credito": en cuántos días vence lo que debe el cliente (0 a 365; por defecto 30). */
  creditoDias?: number;
  /**
   * El total que la persona tenía en pantalla al cobrar. No se usa para cobrar (el total sale de la cuenta): sirve para
   * avisar si la cuenta cambió mientras se cobraba (el mozo agregó algo) en vez de cobrar un monto distinto del que se vio.
   */
  totalMostrado?: number;
  /**
   * La propina que el cliente dejó con tarjeta o transferencia (la de efectivo no se carga). NO es parte de la venta ni de su
   * total: se anota aparte, a nombre del mozo que corresponda, y el negocio se la paga después desde la caja (ver Propinas).
   */
  propina?: DatosPropina;
};

export type ResultadoPagoCuenta =
  | { ok: true; ventaId: string; total: number }
  /** `sinTurno`: no hay turno de caja abierto; la pantalla manda directo a abrirlo (ver src/lib/turno-requerido.ts). */
  | { ok: false; error: string; sinTurno?: true };

/**
 * Cobra la cuenta y la cierra: genera una venta del Punto de Venta (entra en el turno de caja de ESTA estación, en el cierre
 * y en todos los reportes) con la misma regla de factura o ticket que el mostrador, según el punto de expedición de la
 * estación. El stock NO se vuelve a descontar: ya bajó cuando se envió cada pedido. Los precios son los que quedaron en la
 * cuenta (los recalculó el servidor al enviarse); lo único que llega del navegador es cómo se paga y los datos de la factura.
 */
export async function pagarCuenta(cuentaId: string, datos: DatosCobroCuenta): Promise<ResultadoPagoCuenta> {
  await exigirPermiso("comedor.gestionar");
  const sesion = await exigirPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);
  const registradoPor = nombreDe(sesion);

  // La estación de esta computadora y su turno de caja abierto: la venta entra ahí.
  const estacion = await estacionActual(db);
  if (!estacion) {
    return { ok: false, error: "Esta computadora no está vinculada a una estación. Vinculala en Estaciones para poder cobrar." };
  }
  const turno = await turnoAbierto(db, estacion.id);
  if (!turno) {
    return { ok: false, error: "No hay un turno de caja abierto en esta estación. Abrilo y volvé a cobrar.", sinTurno: true };
  }
  const puntoExpedicion = (
    await db.estacion.findUnique({ where: { id: estacion.id }, select: { puntoExpedicion: true } })
  )?.puntoExpedicion ?? null;
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { facturaObligatoria: true, ventasACredito: true },
  });

  // ------------------------------------------------------------ factura o ticket (mismas reglas que el mostrador)
  const esFactura = datos?.comprobanteTipo === "factura";
  const esSinRegistroFiscal = datos?.facturaTipoIdentificacion === SIN_REGISTRO_FISCAL.tipo;
  const facturaObligatoria = store?.facturaObligatoria ?? false;
  const puntoVigente = !!puntoExpedicion && puntoExpedicion.activo && puntoExpedicion.timbradoHasta > new Date();

  if (facturaObligatoria) {
    if (!puntoVigente) {
      return {
        ok: false,
        error:
          "Este local exige facturar todas las ventas y esta estación no tiene un punto de expedición vigente asignado. Pedile al dueño que lo asigne en Puntos de expedición.",
      };
    }
    if (!esFactura) return { ok: false, error: "Este local exige facturar todas las ventas — no se puede cobrar como ticket." };
  }
  if (esFactura) {
    if (!datos.facturaTipoIdentificacion) return { ok: false, error: "Elegí con o sin registro fiscal." };
    if (!esSinRegistroFiscal && (!datos.facturaNumeroIdentificacion?.trim() || !datos.facturaRazonSocial?.trim())) {
      return { ok: false, error: "Para factura con registro fiscal hacen falta el número y la razón social." };
    }
    if (!esSinRegistroFiscal && datos.facturaEmail?.trim() && !datos.facturaEmail.includes("@")) {
      return { ok: false, error: "El correo electrónico no es válido." };
    }
    if (!puntoExpedicion) {
      return {
        ok: false,
        error:
          "Esta estación no tiene un punto de expedición asignado. Cobrá como ticket, o pedile al dueño que lo asigne en Estaciones.",
      };
    }
    if (!puntoExpedicion.activo || puntoExpedicion.timbradoHasta < new Date()) {
      return { ok: false, error: "El timbrado de este punto de expedición está vencido. No se puede emitir factura." };
    }
  }

  // ------------------------------------------------------------------------- la cuenta y lo que vale
  const cuenta = await db.cuentaMesa.findFirst({
    where: { id: String(cuentaId), estado: { in: [...ESTADOS_CUENTA_ABIERTA] } },
    include: { items: { where: { estado: "activo" }, orderBy: [{ ronda: "asc" }, { linea: "asc" }] } },
  });
  if (!cuenta) return { ok: false, error: "Esa cuenta ya está cerrada." };
  // Una cuenta se cobra DESPUÉS de imprimirse (queda "por cobrar"): el cliente tiene que haber recibido su cuenta, y la
  // impresión deja constancia de lo que se cobra. Se exige acá, en el servidor: que el botón esté apagado no alcanza.
  if (cuenta.estado !== "por_cobrar") {
    return { ok: false, error: "Primero imprimí la cuenta: se cobra después de imprimirla." };
  }
  if (cuenta.items.length === 0) return { ok: false, error: "La cuenta no tiene productos para cobrar." };

  // Lo que se cobra y se factura: el mismo producto cargado en varios pedidos va en UNA línea con la cantidad sumada (la nota
  // de cocina no cuenta: no sale en la venta ni en la factura). El total no cambia: es la suma de los totales de cada línea.
  const filas = lineasDeCobro(
    cuenta.items.map((i) => ({
      productId: i.productId,
      nombreProducto: i.nombreProducto,
      cantidad: i.cantidad,
      precioUnitario: Number(i.precioUnitario),
      iva: i.iva,
      opcionesTexto: i.opcionesTexto,
      costoProducto: i.costoProducto == null ? null : Number(i.costoProducto),
      costoAgregados: i.costoAgregados == null ? null : Number(i.costoAgregados),
      precioAgregados: Number(i.precioAgregados),
      // La promoción de la línea: pasa a la venta, para el reporte de Promociones.
      promocionId: i.promocionId,
      cortesia: i.cortesia,
      precioAntesPromo: i.precioAntesPromo == null ? null : Number(i.precioAntesPromo),
    }))
  );
  const totales = totalesDeCuenta(filas, descuentoDeCuenta(cuenta));
  if (totales.descuentoInvalido) {
    return { ok: false, error: `El descuento ya no corresponde a esta cuenta (${totales.descuentoInvalido}) Quitalo o cambialo.` };
  }
  const total = totales.total;
  // Un total en cero es válido cuando es una cortesía (descuento del 100 %): se vende y se factura en cero, y si hace falta se anula la factura.
  if (!Number.isFinite(total) || total < 0) return { ok: false, error: "El total de la cuenta no es válido." };

  // Si la cuenta cambió mientras se cobraba (el mozo cargó algo, o la caja le dio un descuento desde otra pantalla), el
  // monto que la persona vio ya no es el real: se avisa en vez de cobrar otra cosa.
  if (datos?.totalMostrado != null && Math.round(Number(datos.totalMostrado)) !== Math.round(total)) {
    return {
      ok: false,
      error: `La cuenta cambió mientras la cobrabas: ahora es de ${formatearGuarani(total)}. Cerrá este cuadro y volvé a abrir el cobro.`,
    };
  }

  // La propina (si el cliente dejó una con tarjeta o transferencia): se comprueba acá, antes de tocar nada, y el mozo tiene que
  // ser de ESTE local y estar activo. Va aparte de la venta: no suma a su total.
  let propina: PropinaValida | null = null;
  let nombreDelMozoDePropina = "";
  if (datos?.propina != null) {
    const v = validarPropina(datos.propina, total);
    if (!v.ok) return { ok: false, error: v.error };
    const mozoDePropina = await db.mozo.findFirst({
      where: { id: v.propina.mozoId, activo: true },
      select: { nombre: true, apellido: true },
    });
    if (!mozoDePropina) return { ok: false, error: "Ese mozo ya no está activo: elegí otro para la propina." };
    propina = v.propina;
    nombreDelMozoDePropina = [mozoDePropina.nombre, mozoDePropina.apellido].filter(Boolean).join(" ");
  }

  // Venta a crédito (mismas reglas que el mostrador): solo si el local la activó, y solo a un cliente al que se le pueda
  // cobrar después. A crédito va sola: no se combina con otras formas de pago (validarPagosDeVenta lo vuelve a exigir).
  const esCredito =
    Array.isArray(datos?.pagos) &&
    datos.pagos.length === 1 &&
    String(datos.pagos[0]?.forma ?? "").trim().toLowerCase() === FORMA_PAGO_A_CREDITO;
  const clienteNombre = String(datos?.clienteNombre ?? "").trim().slice(0, 80) || null;
  const clienteTelefono = String(datos?.clienteTelefono ?? "").trim().slice(0, 30) || null;
  let fechaVencimientoCredito: Date | null = null;
  if (esCredito) {
    if (!store?.ventasACredito) return { ok: false, error: "Este local no vende a crédito. Se activa en Configuración." };
    // Una cuenta en cero (cortesía) no tiene nada que cobrar después: a crédito no corresponde.
    if (total <= 0) return { ok: false, error: "Una cuenta en cero (cortesía) no se carga a crédito. Elegí otra forma de pago." };
    const conRegistro = esFactura && !esSinRegistroFiscal;
    const nombreDeudor = clienteNombre || (conRegistro ? String(datos.facturaRazonSocial ?? "").trim() : "");
    const contactoDeudor = clienteTelefono || (conRegistro ? String(datos.facturaNumeroIdentificacion ?? "").trim() : "");
    if (!nombreDeudor || !contactoDeudor) {
      return { ok: false, error: "Una venta a crédito necesita el nombre del cliente y su teléfono o su RUC/cédula." };
    }
    const diasPedidos = Math.round(Number(datos.creditoDias ?? 30));
    const dias = Number.isFinite(diasPedidos) ? Math.min(Math.max(diasPedidos, 0), 365) : 30;
    // El vencimiento es un día (no una hora): se guarda a medianoche UTC, como las demás fechas de día.
    fechaVencimientoCredito = new Date(Date.parse(claveDiaAsuncion(new Date())) + dias * 24 * 60 * 60 * 1000);
  }
  const pagosValidados = validarPagosDeVenta(datos?.pagos, total);
  if (!pagosValidados.ok) return { ok: false, error: pagosValidados.error };

  // Para la factura, cada línea lleva su unidad de medida y si es un servicio.
  const idsDeProductos = [...new Set(filas.flatMap((f) => (f.productId ? [f.productId] : [])))];
  const datosProductos = esFactura && idsDeProductos.length
    ? await db.product.findMany({ where: { id: { in: idsDeProductos } }, select: { id: true, unidadMedida: true, esServicio: true } })
    : [];
  const unidadDelProducto = new Map(datosProductos.map((p) => [p.id, p.unidadMedida]));
  const esServicioElProducto = new Map(datosProductos.map((p) => [p.id, p.esServicio]));

  const numero = await siguienteNumeroVentaPos(storeId);
  const notaVenta = `Mesa ${cuenta.mesa} · Cuenta ${formatearNumero(cuenta.numero)}`;

  // Con teléfono, el cliente queda en la lista de clientes (o se le actualiza el nombre): mismo alta que el mostrador.
  if (clienteTelefono) {
    await prisma.customer.upsert({
      where: { storeId_telefono: { storeId, telefono: clienteTelefono } },
      update: clienteNombre ? { nombre: clienteNombre } : {},
      create: { storeId, nombre: clienteNombre || "Cliente de mostrador", telefono: clienteTelefono },
    });
  }

  let ventaId = "";
  try {
    ventaId = await prisma.$transaction(async (tx) => {
      // Primero se cierra la cuenta, con el estado en la condición: si otra caja la cobró (o se canceló) en el mismo
      // instante, acá no encuentra nada, se deshace todo y no queda una factura de más.
      const cerrada = await tx.cuentaMesa.updateMany({
        // "por_cobrar" en la condición: si la reabrieron (o la cobraron) mientras se armaba el cobro, no se cobra.
        where: { id: cuenta.id, storeId, estado: "por_cobrar" },
        data: { estado: "pagada", mesaAbierta: null, cerradaEn: new Date(), cerradaPor: registradoPor },
      });
      if (cerrada.count !== 1) {
        throw new ErrorDeUsuario("Esa cuenta ya fue cobrada, cancelada o reabierta. Actualizá la pantalla.");
      }

      let datosFactura: Record<string, unknown> = { comprobanteTipo: "ticket" };
      let correlativoFactura: number | null = null;

      if (esFactura && puntoExpedicion) {
        if (!esSinRegistroFiscal) {
          await upsertClienteFiscal(tx, storeId, {
            tipoIdentificacion: datos.facturaTipoIdentificacion!,
            numeroIdentificacion: datos.facturaNumeroIdentificacion!.trim(),
            razonSocial: datos.facturaRazonSocial!.trim(),
            email: datos.facturaEmail?.trim() ?? "",
          });
        }
        // Atómico: se incrementa PRIMERO y se usa el valor ya incrementado (dos cobros a la vez no toman el mismo número).
        const peActualizado = await tx.puntoExpedicion.update({
          where: { id: puntoExpedicion.id },
          data: { ultimoNumeroFactura: { increment: 1 } },
          select: { ultimoNumeroFactura: true },
        });
        correlativoFactura = peActualizado.ultimoNumeroFactura;
        const desglose = desglosarIva(filas, totales.descuento);
        datosFactura = {
          comprobanteTipo: "factura",
          facturaTipoIdentificacion: datos.facturaTipoIdentificacion,
          facturaRazonSocial: esSinRegistroFiscal ? null : datos.facturaRazonSocial!.trim(),
          facturaRuc: esSinRegistroFiscal ? SIN_REGISTRO_FISCAL.numero : datos.facturaNumeroIdentificacion!.trim(),
          facturaNumero: formatearNumeroFactura(
            puntoExpedicion.establecimiento,
            puntoExpedicion.puntoExpedicion,
            peActualizado.ultimoNumeroFactura
          ),
          facturaTimbrado: puntoExpedicion.numeroTimbrado,
          facturaVencimiento: puntoExpedicion.timbradoHasta,
          facturaGravado10: desglose.gravado10,
          facturaGravado5: desglose.gravado5,
          facturaExento: desglose.exento,
          facturaIva10: desglose.iva10,
          facturaIva5: desglose.iva5,
          facturaRazonSocialEmisor: puntoExpedicion.razonSocialEmisor,
          facturaRucEmisor: puntoExpedicion.rucEmisor,
        };
      }

      const venta = await tx.ventaPos.create({
        data: {
          storeId,
          turnoPosId: turno.id,
          numero,
          formaPago: pagosValidados.formaPago,
          pagos: {
            create: pagosValidados.pagos.map((p, i) => ({ storeId, forma: p.forma, monto: p.monto, orden: i })),
          },
          total,
          descuento: totales.descuento,
          descuentoPorcentaje: totales.porcentaje,
          registradoPor,
          // Igual que el mostrador: el nombre y el teléfono que se tipearon (a crédito, para saber a quién cobrarle).
          clienteNombre,
          clienteTelefono,
          fechaVencimientoCredito,
          tipoEntrega: "local",
          nota: notaVenta,
          ...datosFactura,
          items: {
            create: filas.map((f) => ({
              storeId,
              productId: f.productId,
              nombreProducto: f.nombreProducto,
              cantidad: f.cantidad,
              precioUnitario: f.precioUnitario,
              iva: f.iva,
              opcionesTexto: f.opcionesTexto,
              costoProducto: f.costoProducto,
              costoAgregados: f.costoAgregados,
              precioAgregados: f.precioAgregados,
              promocionId: f.promocionId ?? null,
              cortesia: f.cortesia === true,
              precioAntesPromo: f.precioAntesPromo ?? null,
            })),
          },
        },
        select: { id: true },
      });

      if (esFactura && puntoExpedicion && correlativoFactura !== null) {
        await crearComprobante(tx, {
          storeId,
          origen: { ventaPosId: venta.id },
          punto: puntoExpedicion,
          correlativo: correlativoFactura,
          receptor: {
            tipoIdentificacion: datos.facturaTipoIdentificacion!,
            numeroIdentificacion: esSinRegistroFiscal ? SIN_REGISTRO_FISCAL.numero : datos.facturaNumeroIdentificacion!.trim(),
            razonSocial: esSinRegistroFiscal ? null : datos.facturaRazonSocial!.trim(),
            email: esSinRegistroFiscal ? null : datos.facturaEmail?.trim() || null,
          },
          presencia: "presencial",
          condicion: esCredito ? "credito" : "contado",
          fechaVencimientoCredito,
          items: filas.map((f) => ({
            productId: f.productId ?? null,
            descripcion: descripcionDeItem(f.nombreProducto, f.opcionesTexto ?? undefined),
            unidadMedida: f.productId ? (unidadDelProducto.get(f.productId) ?? null) : null,
            // Un combo mitad y mitad (sin producto único) es comida: mercadería.
            esServicio: f.productId ? (esServicioElProducto.get(f.productId) ?? false) : false,
            cantidad: f.cantidad,
            precioUnitario: f.precioUnitario,
            iva: f.iva,
          })),
          descuento: totales.descuento,
          emitidoPor: registradoPor,
        });
      }

      await tx.cuentaMesa.update({ where: { id: cuenta.id }, data: { ventaPosId: venta.id } });

      // La propina queda anotada en el mismo instante que el cobro (o no queda ninguna de las dos): pendiente de pagarle al mozo.
      if (propina) {
        await tx.propinaMozo.create({
          data: {
            storeId,
            mozoId: propina.mozoId,
            cuentaMesaId: cuenta.id,
            ventaPosId: venta.id,
            turnoPosId: turno.id,
            monto: propina.monto,
            forma: propina.forma,
            registradoPor,
          },
        });
      }
      return venta.id;
    }, OPCIONES_TX);
  } catch (e) {
    if (e instanceof ErrorDeUsuario) return { ok: false, error: e.message };
    console.error("[comedor] pagarCuenta falló", e);
    return {
      ok: false,
      error: `No se pudo confirmar el cobro. Antes de volver a intentar, fijate en el Historial de cuentas si la venta quedó registrada. (Detalle: ${pistaDelError(e)})`,
    };
  }

  await registrarBitacora(storeId, sesion, {
    modulo: "comedor",
    accion: "cuenta_pagada",
    descripcion: `Cobró la cuenta ${formatearNumero(cuenta.numero)} de la mesa ${cuenta.mesa} por ${formatearGuarani(total)}${
      esFactura ? " con factura" : " con ticket"
    }${esCredito ? ", a crédito" : ""}${
      totales.descuento > 0 ? `, con un descuento de ${formatearGuarani(totales.descuento)}` : ""
    }.`,
    entidad: "VentaPos",
    entidadId: ventaId,
    detalle: {
      cuenta: formatearNumero(cuenta.numero),
      mesa: cuenta.mesa,
      subtotal: totales.subtotal,
      descuento: totales.descuento,
      total,
      comprobante: esFactura ? "factura" : "ticket",
      a_credito: esCredito,
    },
  });
  if (propina) {
    await registrarBitacora(storeId, sesion, {
      modulo: "comedor",
      accion: "propina_registrada",
      descripcion: `Cargó una propina de ${formatearGuarani(propina.monto)} (${etiquetaFormaPropina(propina.forma)}) para ${nombreDelMozoDePropina}, al cobrar la cuenta ${formatearNumero(cuenta.numero)} de la mesa ${cuenta.mesa}.`,
      entidad: "VentaPos",
      entidadId: ventaId,
      detalle: { mozo: nombreDelMozoDePropina, monto: propina.monto, forma: propina.forma, cuenta: formatearNumero(cuenta.numero) },
    });
  }

  revalidatePath("/admin/comedor");
  revalidatePath("/admin/pos");
  revalidatePath("/admin/pos/cuentas");
  return { ok: true, ventaId, total };
}
