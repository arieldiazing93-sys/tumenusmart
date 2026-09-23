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
 * Nunca bloquea por falta de stock — un insumo puede quedar en negativo, es
 * el aviso para revisar después, no un motivo para cortar una venta real.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import type { LineaArmada } from "./precio-pedido";

type Db = PrismaClient | Prisma.TransactionClient;
type RefVenta = { orderId: string } | { ventaPosId: string };

function aNumero(valor: unknown): number {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  const n = parseFloat(String(valor));
  return Number.isFinite(n) ? n : 0;
}

/** Suma, por insumoId, cuánto consumen todas las líneas (consumo por unidad × cantidad vendida). */
function agregarConsumo(lineas: LineaArmada[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const linea of lineas) {
    for (const c of linea.consumo) {
      mapa.set(c.insumoId, (mapa.get(c.insumoId) ?? 0) + c.cantidad * linea.cantidad);
    }
  }
  return mapa;
}

/** Descuenta stock por una venta recién creada y deja el movimiento ("venta") de cada insumo. */
export async function registrarConsumoVenta(
  db: Db,
  storeId: string,
  lineas: LineaArmada[],
  ref: RefVenta,
  registradoPor?: string | null
): Promise<void> {
  const consumo = agregarConsumo(lineas);
  if (consumo.size === 0) return;

  for (const [insumoId, cantidad] of consumo) {
    if (cantidad === 0) continue;
    await db.insumo.update({ where: { id: insumoId }, data: { stockActual: { decrement: cantidad } } });
    await db.movimientoStock.create({
      data: {
        storeId,
        insumoId,
        tipo: "venta",
        cantidad: -cantidad,
        registradoPor: registradoPor ?? null,
        ...ref,
      },
    });
  }
}

/**
 * Revierte los movimientos "venta" de un pedido/venta cancelado: le
 * devuelve a cada insumo la cantidad que se le había descontado, y deja un
 * movimiento "cancelacion" que explica de dónde salió esa reposición.
 */
export async function revertirMovimientosVenta(
  db: Db,
  storeId: string,
  ref: RefVenta,
  registradoPor?: string | null
): Promise<void> {
  const movimientos = await db.movimientoStock.findMany({
    where: { ...ref, tipo: "venta" },
    select: { insumoId: true, cantidad: true },
  });
  if (movimientos.length === 0) return;

  for (const m of movimientos) {
    const cantidadARestituir = -aNumero(m.cantidad); // el de "venta" ya está en negativo
    if (cantidadARestituir === 0) continue;
    await db.insumo.update({
      where: { id: m.insumoId },
      data: { stockActual: { increment: cantidadARestituir } },
    });
    await db.movimientoStock.create({
      data: {
        storeId,
        insumoId: m.insumoId,
        tipo: "cancelacion",
        cantidad: cantidadARestituir,
        registradoPor: registradoPor ?? null,
        ...ref,
      },
    });
  }
}
