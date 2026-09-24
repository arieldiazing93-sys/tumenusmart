/**
 * Descontar (y, si se cancela, restituir) stock por una venta — compartido
 * entre el checkout público y el POS, para no repetir la agregación en los
 * dos lugares.
 *
 * Recibe siempre el `tx` de la transacción en curso (mismo criterio que
 * `upsertClienteFiscal` en src/lib/prisma-local.ts): el descuento tiene que
 * ser atómico con la creación del pedido/venta, nunca un paso aparte que
 * pueda quedar a mitad de camino. Como es el `tx` CRUDO (no el
 * `prismaDelLocal` filtrado), cada escritura completa `storeId` a mano.
 *
 * Cada producto descuenta del almacén que tiene elegido (Product.almacenId);
 * si no tiene ninguno, del almacén principal del local (ver
 * stock-almacen.ts). Si el local ni siquiera tiene un almacén creado, el
 * movimiento queda sin almacén en vez de frenar la venta.
 *
 * Cada movimiento de venta lleva en `motivo` QUÉ se vendió ("2 × Pizza
 * Muzzarella (Borde relleno)"), así el reporte "Salidas por venta" puede decir
 * por qué salió cada insumo. Un movimiento por línea vendida e insumo — no uno
 * por insumo sumando toda la venta, que perdía esa información.
 *
 * Nunca bloquea por falta de stock — un insumo puede quedar en negativo, es
 * el aviso para revisar después, no un motivo para cortar una venta real.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import type { LineaArmada } from "./precio-pedido";
import { almacenPrincipalId } from "./stock-almacen";

type Db = PrismaClient | Prisma.TransactionClient;
type RefVenta = { orderId: string } | { ventaPosId: string };

function aNumero(valor: unknown): number {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  const n = parseFloat(String(valor));
  return Number.isFinite(n) ? n : 0;
}

function redondear3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

type ConsumoDeLinea = { insumoId: string; almacenId: string | null; cantidad: number; motivo: string };

/** Lo que se vendió en una línea: "2 × Pizza Muzzarella (Borde relleno)". */
function textoDeLinea(linea: LineaArmada): string {
  const nombre = linea.opcionesTexto ? `${linea.nombreProducto} (${linea.opcionesTexto})` : linea.nombreProducto;
  return `${linea.cantidad} × ${nombre}`;
}

/**
 * Lo que consume cada línea vendida, por insumo y almacén (consumo por unidad ×
 * cantidad vendida). Cada línea va aparte, con el texto de lo que se vendió;
 * `almacenPorDefecto` reemplaza a los consumos que no traen almacén. Las
 * cantidades quedan a 3 decimales, que es lo que guardan el stock y el
 * movimiento: al abrir una preparación (0,1 kg de salsa → 0,0375 kg de cebolla)
 * salen cantidades más finas, y así el stock y el historial siempre coinciden.
 */
function consumoPorLinea(lineas: LineaArmada[], almacenPorDefecto: string | null): ConsumoDeLinea[] {
  const resultado: ConsumoDeLinea[] = [];
  for (const linea of lineas) {
    const motivo = textoDeLinea(linea);
    const mapa = new Map<string, { insumoId: string; almacenId: string | null; cantidad: number }>();
    for (const c of linea.consumo) {
      const almacenId = c.almacenId ?? almacenPorDefecto;
      const clave = `${c.insumoId}|${almacenId ?? ""}`;
      const cantidad = c.cantidad * linea.cantidad;
      const actual = mapa.get(clave);
      if (actual) actual.cantidad += cantidad;
      else mapa.set(clave, { insumoId: c.insumoId, almacenId, cantidad });
    }
    for (const c of mapa.values()) {
      const cantidad = redondear3(c.cantidad);
      if (cantidad !== 0) resultado.push({ insumoId: c.insumoId, almacenId: c.almacenId, cantidad, motivo });
    }
  }
  return resultado;
}

/** Suma por insumo (de todos los almacenes): lo que baja el espejo `Insumo.stockActual`. */
function totalPorInsumo(items: { insumoId: string; cantidad: number }[]): Map<string, number> {
  const total = new Map<string, number>();
  for (const i of items) total.set(i.insumoId, (total.get(i.insumoId) ?? 0) + i.cantidad);
  return total;
}

/** Descuenta stock por una venta recién creada y deja el movimiento ("venta") de cada línea e insumo. */
export async function registrarConsumoVenta(
  db: Db,
  storeId: string,
  lineas: LineaArmada[],
  ref: RefVenta,
  registradoPor?: string | null
): Promise<void> {
  const hayConsumoSinAlmacen = lineas.some((l) => l.consumo.some((c) => !c.almacenId));
  const almacenPorDefecto = hayConsumoSinAlmacen ? await almacenPrincipalId(db, storeId) : null;

  const consumo = consumoPorLinea(lineas, almacenPorDefecto);
  if (consumo.length === 0) return;

  // El espejo baja una sola vez por insumo (con todo lo que consumió la venta) y
  // los movimientos se guardan de una — así una venta grande no hace decenas de
  // consultas dentro de la transacción.
  for (const [insumoId, cantidad] of totalPorInsumo(consumo)) {
    await db.insumo.update({ where: { id: insumoId }, data: { stockActual: { decrement: redondear3(cantidad) } } });
  }
  const filas: Prisma.MovimientoStockCreateManyInput[] = consumo.map((c) => ({
    storeId,
    insumoId: c.insumoId,
    almacenId: c.almacenId,
    tipo: "venta",
    cantidad: -c.cantidad,
    motivo: c.motivo,
    registradoPor: registradoPor ?? null,
    ...ref,
  }));
  await db.movimientoStock.createMany({ data: filas });
}

/**
 * Revierte los movimientos "venta" de un pedido/venta cancelado: le
 * devuelve a cada insumo la cantidad que se le había descontado, en el mismo
 * almacén de donde salió, y deja un movimiento "cancelacion" que explica de
 * dónde salió esa reposición (con el mismo texto de lo que se había vendido).
 */
export async function revertirMovimientosVenta(
  db: Db,
  storeId: string,
  ref: RefVenta,
  registradoPor?: string | null
): Promise<void> {
  const movimientos = await db.movimientoStock.findMany({
    where: { ...ref, tipo: "venta" },
    select: { insumoId: true, almacenId: true, cantidad: true, motivo: true },
  });
  if (movimientos.length === 0) return;

  const filas: Prisma.MovimientoStockCreateManyInput[] = [];
  const restituciones: { insumoId: string; cantidad: number }[] = [];
  for (const m of movimientos) {
    const cantidadARestituir = -aNumero(m.cantidad); // el de "venta" ya está en negativo
    if (cantidadARestituir === 0) continue;
    restituciones.push({ insumoId: m.insumoId, cantidad: cantidadARestituir });
    filas.push({
      storeId,
      insumoId: m.insumoId,
      almacenId: m.almacenId,
      tipo: "cancelacion",
      cantidad: cantidadARestituir,
      motivo: m.motivo,
      registradoPor: registradoPor ?? null,
      ...ref,
    });
  }
  if (filas.length === 0) return;

  for (const [insumoId, cantidad] of totalPorInsumo(restituciones)) {
    await db.insumo.update({ where: { id: insumoId }, data: { stockActual: { increment: redondear3(cantidad) } } });
  }
  await db.movimientoStock.createMany({ data: filas });
}
