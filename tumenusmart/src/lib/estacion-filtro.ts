import type { PrismaLocal } from "./prisma-local";

/**
 * Filtrar el Historial de cuentas por estación (la caja desde la que se cobró). Una venta no guarda la estación: la tiene su turno de
 * caja (`TurnoPos.estacionId`), así que el filtro pasa por el turno. Sin estación, no filtra.
 */
export function filtroPorEstacion(estacionId: string | null | undefined) {
  if (!estacionId) return {};
  return { turnoPos: { estacionId } };
}

export type EstacionParaFiltro = { id: string; nombre: string };

/**
 * Las estaciones del local (también las desactivadas: una cuenta vieja sigue siendo de su caja) y cuál se eligió en la dirección.
 * Un id que no es de este local (o que ya no existe) no elige nada. `varias` dice si hay más de una: con una sola caja la columna y el
 * filtro de estación no aportan nada y no se muestran.
 */
export async function cargarEstacionesParaFiltro(
  db: PrismaLocal,
  idElegido: string | null | undefined
): Promise<{ estaciones: EstacionParaFiltro[]; elegida: EstacionParaFiltro | null; varias: boolean }> {
  const estaciones = await db.estacion.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, nombre: true },
  });
  return {
    estaciones,
    elegida: estaciones.find((e) => e.id === idElegido) ?? null,
    varias: estaciones.length > 1,
  };
}
