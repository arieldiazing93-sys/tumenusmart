"use server";

import { prisma } from "@/lib/prisma";
import {
  abrirSesion,
  cifrarPassword,
  passwordCoincide,
  revisarPasswordNueva,
  sesionObligatoria,
} from "@/lib/auth";
import {
  ERROR_CLAVE_REPETIDA,
  ERROR_DEMASIADAS_PRUEBAS,
  anotarClaveCambiada,
  anotarClaveRepetida,
  claveYaExiste,
  debeSerUnica,
  demasiadasPruebas,
} from "@/lib/clave-unica";

export type ResultadoCambio = { ok: boolean; error?: string };

/**
 * Cambio de contraseña propia.
 *
 * Pide la actual además de la nueva: si alguien deja la sesión abierta en la
 * computadora del local, que no le puedan cambiar la contraseña y dejarlo
 * afuera de su propio panel.
 *
 * Devuelve el resultado en vez de redirigir, para que el error aparezca al
 * lado del botón y sin recargar. Recargando se perdía lo escrito y el
 * navegador volvía a autocompletar los campos, que era justo el problema.
 */
export async function cambiarMiPassword(formData: FormData): Promise<ResultadoCambio> {
  const sesion = await sesionObligatoria();

  const actual = String(formData.get("actual") ?? "");
  const nueva = String(formData.get("nueva") ?? "");
  const repetida = String(formData.get("repetida") ?? "");

  if (!actual) return { ok: false, error: "Escribí tu contraseña actual" };
  if (!nueva) return { ok: false, error: "Escribí la contraseña nueva" };

  const usuario = await prisma.usuario.findUnique({
    where: { id: sesion.id },
    select: { passwordHash: true },
  });
  if (!usuario) return { ok: false, error: "No encontré tu usuario. Volvé a iniciar sesión." };

  if (!(await passwordCoincide(actual, usuario.passwordHash))) {
    return { ok: false, error: "La contraseña actual no es correcta." };
  }

  if (nueva !== repetida) {
    return { ok: false, error: "Las dos contraseñas nuevas no coinciden." };
  }

  // La regla depende de quién es (el dueño y el cajero: 5 caracteres de cualquier tipo): sale de la sesión, no del formulario.
  const problema = revisarPasswordNueva(nueva, sesion.rol);
  if (problema) return { ok: false, error: problema + "." };

  if (await passwordCoincide(nueva, usuario.passwordHash)) {
    return {
      ok: false,
      error: "La contraseña nueva es igual a la actual. Elegí una distinta.",
    };
  }

  // Dueño, administrador y cajero: la contraseña no puede ser la de otra persona del local (con ella se identifica quien autoriza en la
  // caja). Decir «ya existe» es una pista, así que quien prueba muchas seguidas se frena (ver clave-unica.ts).
  const storeId = sesion.storeId;
  if (storeId && debeSerUnica(sesion.rol)) {
    if (await demasiadasPruebas(storeId, sesion.email)) return { ok: false, error: ERROR_DEMASIADAS_PRUEBAS };
    if (await claveYaExiste(storeId, nueva, sesion.id)) {
      await anotarClaveRepetida(storeId, sesion);
      return { ok: false, error: ERROR_CLAVE_REPETIDA };
    }
  }

  await prisma.usuario.update({
    where: { id: sesion.id },
    data: {
      passwordHash: await cifrarPassword(nueva),
      // Ya es suya: se apaga el recordatorio del panel.
      debeCambiarPassword: false,
    },
  });
  if (storeId) await anotarClaveCambiada(storeId, sesion);

  // Cambiar la contraseña cierra TODAS las sesiones abiertas con la anterior (están atadas a ella, ver abrirSesion): la de esta
  // computadora se vuelve a abrir acá para que no tenga que entrar de nuevo, y las demás (un celular perdido, una cookie robada) quedan afuera.
  await abrirSesion(sesion.id);

  return { ok: true };
}
