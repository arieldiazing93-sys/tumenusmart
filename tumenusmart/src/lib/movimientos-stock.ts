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

type ConsumoAgregado = { insumoId: string; almacenId: string | null; cantidad: number };

/**
 * Suma, por insumo y almacén, cuánto consumen todas las líneas (consumo por
 * unidad × cantidad vendida). `almacenPorDefecto` reemplaza a los consumos
 * que no traen almacén.
 */
function agregarConsumo(lineas: LineaArmada[], almacenPorDefecto: string | null): ConsumoAgregado[] {
  const mapa = new Map<string, ConsumoAgregado>();
  for (const linea of lineas) {
    for (const c of linea.consumo) {
      const almacenId = c.almacenId ?? almacenPorDefecto;
      const clave = `${c.insumoId}|${almacenId ?? ""}`;
      const actual = mapa.get(clave);
      const cantidad = c.cantidad * linea.cantidad;
      if (actual) actual.cantidad += cantidad;
      else mapa.set(clave, { insumoId: c.insumoId, almacenId, cantidad });
    }
  }
  // A 3 decimales, que es lo que guardan el stock y el movimiento: al abrir una
  // preparación (0,1 kg de salsa → 0,0375 kg de cebolla) salen cantidades más
  // finas, y así el stock y el historial siempre coinciden exactos.
  return [...mapa.values()].map((c) => ({ ...c, cantidad: redondear3(c.cantidad) }));
}

/** Descuenta stock por una venta recién creada y deja el movimiento ("venta") de cada insumo. */
export async function registrarConsumoVenta(
  db: Db,
  storeId: string,
  lineas: LineaArmada[],
  ref: RefVenta,
  registradoPor?: string | null
): Promise<void> {
  const hayConsumoSinAlmacen = lineas.some((l) => l.consumo.some((c) => !c.almacenId));
  const almacenPorDefecto = hayConsumoSinAlmacen ? await almacenPrincipalId(db, storeId) : null;

  const consumo = agregarConsumo(lineas, almacenPorDefecto);
  if (consumo.length === 0) return;

  for (const c of consumo) {
    if (c.cantidad === 0) continue;
    await db.insumo.update({ where: { id: c.insumoId }, data: { stockActual: { decrement: c.cantidad } } });
    await db.movimientoStock.create({
      data: {
        storeId,
        insumoId: c.insumoId,
        almacenId: c.almacenId,
        tipo: "venta",
        cantidad: -c.cantidad,
        registradoPor: registradoPor ?? null,
        ...ref,
      },
    });
  }
}

/**
 * Revierte los movimientos "venta" de un pedido/venta cancelado: le
 * devuelve a cada insumo la cantidad que se le había descontado, en el mismo
 * almacén de donde salió, y deja un movimiento "cancelacion" que explica de
 * dónde salió esa reposición.
 */
export async function revertirMovimientosVenta(
  db: Db,
  storeId: string,
  ref: RefVenta,
  registradoPor?: string | null
): Promise<void> {
  const movimientos = await db.movimientoStock.findMany({
    where: { ...ref, tipo: "venta" },
    select: { insumoId: true, almacenId: true, cantidad: true },
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
        almacenId: m.almacenId,
        tipo: "cancelacion",
        cantidad: cantidadARestituir,
        registradoPor: registradoPor ?? null,
        ...ref,
      },
    });
  }
}
