import type { Prisma } from "@prisma/client";
import type { PrismaLocal } from "@/lib/prisma-local";
import type { PromoDef, TipoPromocion } from "@/lib/promociones";

/**
 * Lee las promociones del local de la base y las deja como las usa el cálculo (promociones.ts).
 *
 * `db` tiene que ser el cliente del local (`prismaDelLocal`): el filtro por local lo pone él, así una promoción de otro negocio nunca
 * aparece. Por defecto solo las ACTIVAS (las que se aplican al vender); `soloActivas: false` trae todas: sirve para recortar las
 * cortesías de una cuenta cuando se cancelan productos (la promoción pudo apagarse mientras la cuenta seguía abierta).
 */

/** Lo que hay que pedirle a Prisma de una promoción. */
export const SELECCION_PROMOCION = {
  dias: { select: { diaInicio: true, horaInicio: true, diaFin: true, horaFin: true } },
  productos: { select: { productId: true } },
} as const;

type FilaDePromocionCompleta = {
  id: string;
  nombre: string;
  tipo: string;
  activa: boolean;
  porcentaje: { toString(): string } | null;
  porCada: number | null;
  regalar: number | null;
  forzarPorProducto: boolean;
  aplicaAModificadores: boolean;
  dias: { diaInicio: number; horaInicio: string; diaFin: number; horaFin: string }[];
  productos: { productId: string }[];
};

/** Una fila de la base (con sus días y productos) → la promoción que usa el cálculo. */
export function promoDeFila(f: FilaDePromocionCompleta): PromoDef {
  const tipo: TipoPromocion = f.tipo === "volumen" ? "volumen" : "descuento";
  return {
    id: f.id,
    nombre: f.nombre,
    tipo,
    activa: f.activa,
    porcentaje: f.porcentaje === null ? null : Number(f.porcentaje.toString()),
    porCada: f.porCada,
    regalar: f.regalar,
    forzarPorProducto: f.forzarPorProducto,
    aplicaAModificadores: f.aplicaAModificadores,
    franjas: f.dias.map((d) => ({ diaInicio: d.diaInicio, horaInicio: d.horaInicio, diaFin: d.diaFin, horaFin: d.horaFin })),
    productIds: f.productos.map((p) => p.productId),
  };
}

export async function cargarPromociones(db: PrismaLocal, soloActivas = true): Promise<PromoDef[]> {
  const filas = await db.promocion.findMany({
    where: soloActivas ? { activa: true } : undefined,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: SELECCION_PROMOCION,
  });
  return filas.map(promoDeFila);
}

/** Lo mismo que `cargarPromociones`, pero adentro de una transacción (con el cliente de la transacción): trae TODAS las promociones del local. */
export async function cargarPromocionesEnTransaccion(tx: Prisma.TransactionClient, storeId: string): Promise<PromoDef[]> {
  const filas = await tx.promocion.findMany({
    where: { storeId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: SELECCION_PROMOCION,
  });
  return filas.map(promoDeFila);
}
