import type { PrismaLocal } from "./prisma-local";
import type { TipoDescuentoDef } from "./tipos-descuento";

/**
 * Lee de la base los tipos de descuento del local (ver tipos-descuento.ts).
 *
 * `db` tiene que ser el cliente del local (`prismaDelLocal`): el filtro por local lo pone él, así un tipo de otro negocio nunca aparece.
 * Por defecto solo los ACTIVOS (los que se pueden elegir al vender); `soloActivos: false` trae todos, para la pantalla de Ajustes.
 */
export type TipoDescuentoFila = TipoDescuentoDef & { activo: boolean };

export async function cargarTiposDescuento(db: PrismaLocal, soloActivos = true): Promise<TipoDescuentoFila[]> {
  const filas = await db.tipoDescuento.findMany({
    where: soloActivos ? { activo: true } : undefined,
    orderBy: [{ nombre: "asc" }],
    select: { id: true, nombre: true, porcentaje: true, activo: true },
  });
  return filas.map((f) => ({ id: f.id, nombre: f.nombre, porcentaje: Number(f.porcentaje), activo: f.activo }));
}
