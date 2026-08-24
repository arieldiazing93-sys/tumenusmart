import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { sesionObligatoria } from "./auth";

const COOKIE_LOCAL = "local_admin";

/**
 * Qué local está administrando quien entró al panel.
 *
 * Desde la fase 3 sale de la sesión:
 *
 *   - Un usuario de local queda atado al negocio que tiene asignado. No hay
 *     forma de que administre otro: no depende de ninguna cookie que se pueda
 *     editar, sino de la fila de su usuario en la base.
 *
 *   - El superadmin no pertenece a ningún local, así que para él sí hace falta
 *     elegir uno. Esa elección va en una cookie y se cambia con el selector,
 *     que solamente él ve.
 */
export async function idLocalActual(): Promise<string> {
  const sesion = await sesionObligatoria();

  if (sesion.rol !== "superadmin") {
    if (!sesion.storeId) {
      throw new Error("Tu usuario todavía no tiene un local asignado");
    }
    return sesion.storeId;
  }

  const elegido = (await cookies()).get(COOKIE_LOCAL)?.value;
  if (elegido) {
    const existe = await prisma.store.findUnique({
      where: { id: elegido },
      select: { id: true },
    });
    if (existe) return existe.id;
  }

  const primero = await prisma.store.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!primero) {
    throw new Error(
      "Todavía no hay ningún negocio cargado. Completá los datos en Configuración."
    );
  }
  return primero.id;
}

/** El local completo, cuando además de la identidad hacen falta sus datos. */
export async function localActual() {
  const id = await idLocalActual();
  const local = await prisma.store.findUnique({ where: { id } });
  if (!local) throw new Error("El local elegido ya no existe");
  return local;
}

/**
 * Los locales que puede administrar quien entró.
 *
 * El superadmin los ve todos; cualquier otro usuario ve solamente el suyo, y
 * por eso el selector no le aparece.
 */
export async function listarLocales() {
  const sesion = await sesionObligatoria();

  if (sesion.rol !== "superadmin") {
    if (!sesion.storeId) return [];
    const propio = await prisma.store.findUnique({
      where: { id: sesion.storeId },
      select: { id: true, nombre: true, slug: true },
    });
    return propio ? [propio] : [];
  }

  return prisma.store.findMany({
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true, slug: true },
  });
}

export { COOKIE_LOCAL };
