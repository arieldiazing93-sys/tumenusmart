"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  cifrarPassword,
  passwordCoincide,
  revisarPasswordNueva,
  sesionObligatoria,
} from "@/lib/auth";

/**
 * Cambio de contraseña propia.
 *
 * Pide la actual además de la nueva: si alguien deja la sesión abierta en la
 * computadora del local, que no le puedan cambiar la contraseña y dejarlo
 * afuera de su propio panel.
 */
export async function cambiarMiPassword(formData: FormData) {
  const sesion = await sesionObligatoria();

  const actual = String(formData.get("actual") ?? "");
  const nueva = String(formData.get("nueva") ?? "");
  const repetida = String(formData.get("repetida") ?? "");

  const usuario = await prisma.usuario.findUnique({
    where: { id: sesion.id },
    select: { passwordHash: true },
  });
  if (!usuario) redirect("/admin/login");

  if (!(await passwordCoincide(actual, usuario.passwordHash))) {
    redirect("/admin/mi-cuenta?error=actual");
  }

  if (nueva !== repetida) {
    redirect("/admin/mi-cuenta?error=repetida");
  }

  const problema = revisarPasswordNueva(nueva);
  if (problema) {
    redirect("/admin/mi-cuenta?error=debil");
  }

  if (await passwordCoincide(nueva, usuario.passwordHash)) {
    redirect("/admin/mi-cuenta?error=igual");
  }

  await prisma.usuario.update({
    where: { id: sesion.id },
    data: {
      passwordHash: await cifrarPassword(nueva),
      // Ya es suya: se apaga el recordatorio del panel.
      debeCambiarPassword: false,
    },
  });

  redirect("/admin/mi-cuenta?guardado=1");
}
