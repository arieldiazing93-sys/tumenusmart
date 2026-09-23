/**
 * Stock por almacén.
 *
 * Lo que hay de un insumo en un almacén es la suma de sus MovimientoStock con
 * ese almacenId — el ledger es la fuente de verdad. `Insumo.stockActual` sigue
 * siendo el TOTAL de todos los almacenes (se actualiza en la misma
 * transacción que cada movimiento), así que las pantallas que solo necesitan
 * el total no tienen que tocar nada de esto.
 *
 * Usa el cliente crudo con `storeId` explícito (igual que movimientos-stock.ts)
 * para poder llamarse desde adentro de una transacción.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

type Db = PrismaClient | Prisma.TransactionClient;

export type StockEnAlmacen = {
  /** Null solo para movimientos viejos, de antes de que el stock se repartiera por almacén. */
  almacenId: string | null;
  cantidad: number;
};

function redondear3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Cuánto hay de cada insumo en cada almacén. Los almacenes donde el insumo
 * está en cero no aparecen. Si no se pasan `insumoIds`, trae todos los del local.
 */
export async function stockPorAlmacen(
  storeId: string,
  insumoIds?: string[]
): Promise<Map<string, StockEnAlmacen[]>> {
  const filas = await prisma.movimientoStock.groupBy({
    by: ["insumoId", "almacenId"],
    where: { storeId, ...(insumoIds ? { insumoId: { in: insumoIds } } : {}) },
    _sum: { cantidad: true },
  });

  const porInsumo = new Map<string, StockEnAlmacen[]>();
  for (const fila of filas) {
    const cantidad = redondear3(Number(fila._sum.cantidad ?? 0));
    if (cantidad === 0) continue;
    const lista = porInsumo.get(fila.insumoId) ?? [];
    lista.push({ almacenId: fila.almacenId, cantidad });
    porInsumo.set(fila.insumoId, lista);
  }
  return porInsumo;
}

/** Lo que hay de UN insumo en UN almacén (0 si nunca se movió). */
export async function stockEnAlmacen(
  db: Db,
  storeId: string,
  insumoId: string,
  almacenId: string
): Promise<number> {
  const suma = await db.movimientoStock.aggregate({
    where: { storeId, insumoId, almacenId },
    _sum: { cantidad: true },
  });
  return redondear3(Number(suma._sum.cantidad ?? 0));
}

/**
 * El almacén "principal" del local: el activo más antiguo. Es de donde
 * descuenta una venta cuando el producto no tiene un almacén elegido. Null si
 * el local todavía no creó ninguno.
 */
export async function almacenPrincipalId(db: Db, storeId: string): Promise<string | null> {
  const almacen = await db.almacen.findFirst({
    where: { storeId, activo: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  return almacen?.id ?? null;
}
