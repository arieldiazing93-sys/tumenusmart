import { cookies } from "next/headers";
import { prisma } from "./prisma";

const COOKIE_LOCAL = "local_admin";

/**
 * Qué local está administrando quien entró al panel.
 *
 * FASE 2 (temporal): sale de una cookie que se elige con el selector del
 * panel, y si no hay ninguna elegida, del primer local cargado. Sirve para
 * poder probar varios locales con una sola contraseña de administrador.
 *
 * FASE 3: esto se reemplaza por el local que trae la sesión firmada de cada
 * usuario, y el selector desaparece. Mientras tanto, cualquiera que tenga la
 * contraseña del panel puede cambiar de local — aceptable porque hoy esa
 * contraseña la tenés solo vos.
 */
export async function idLocalActual(): Promise<string> {
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

/** Todos los locales, para el selector del panel. */
export async function listarLocales() {
  return prisma.store.findMany({
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true, slug: true },
  });
}

export { COOKIE_LOCAL };
