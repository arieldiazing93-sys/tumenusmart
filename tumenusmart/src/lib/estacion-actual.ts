import { cookies } from "next/headers";
import type { PrismaLocal } from "./prisma-local";

/**
 * Qué estación (notebook/caja física) es ESTE navegador.
 *
 * No depende del usuario que inició sesión, sino del propio navegador: un
 * sitio web no puede leer el nombre de equipo del sistema operativo, así
 * que el equivalente real es vincular el navegador de esa computadora a una
 * estación una sola vez (ver `vincularEstacion` en
 * `src/app/admin/(protected)/pos/estaciones/actions.ts`) y guardarlo acá en
 * una cookie de larga duración.
 *
 * Como `db` ya viene de `prismaDelLocal(storeId)`, una cookie vieja de OTRO
 * local (o de una estación que se desactivó) simplemente no matchea nada y
 * devuelve null — mismo mecanismo de aislamiento que usa todo el resto del
 * panel, sin tener que repetirlo acá a mano.
 */
export const COOKIE_ESTACION = "pos_estacion";

export async function estacionActual(
  db: PrismaLocal
): Promise<{ id: string; nombre: string } | null> {
  const id = (await cookies()).get(COOKIE_ESTACION)?.value;
  if (!id) return null;
  return db.estacion.findFirst({
    where: { id, activa: true },
    select: { id: true, nombre: true },
  });
}
