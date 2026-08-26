"use server";

import { prisma } from "@/lib/prisma";
import {
  cifrarPassword,
  passwordCoincide,
  revisarPasswordNueva,
  sesionObligatoria,
} from "@/lib/auth";

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

  const problema = revisarPasswordNueva(nueva);
  if (problema) return { ok: false, error: problema + "." };

  if (await passwordCoincide(nueva, usuario.passwordHash)) {
    return {
      ok: false,
      error: "La contraseña nueva es igual a la actual. Elegí una distinta.",
    };
  }

  await prisma.usuario.update({
    where: { id: sesion.id },
    data: {
      passwordHash: await cifrarPassword(nueva),
      // Ya es suya: se apaga el recordatorio del panel.
      debeCambiarPassword: false,
    },
  });

  return { ok: true };
}
