import { prisma } from "./prisma";

/**
 * De qué local es lo que se está guardando o leyendo.
 *
 * FASE 1: hay un solo local, así que devuelve ese. Está acá, en un solo
 * lugar, justamente para que la FASE 2 sea cambiar este archivo y no
 * perseguir el dato por veinte pantallas: ahí va a salir del nombre en la
 * URL (para el menú público) o de la sesión firmada (para el panel).
 */
export async function idLocalActual(): Promise<string> {
  const local = await prisma.store.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!local) {
    throw new Error(
      "Todavía no hay ningún negocio cargado. Completá los datos en Configuración."
    );
  }
  return local.id;
}

/** El local completo, cuando además de la identidad hacen falta sus datos. */
export async function localActual() {
  const local = await prisma.store.findFirst({ orderBy: { createdAt: "asc" } });
  if (!local) {
    throw new Error(
      "Todavía no hay ningún negocio cargado. Completá los datos en Configuración."
    );
  }
  return local;
}
