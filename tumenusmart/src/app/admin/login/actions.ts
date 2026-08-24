"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  abrirSesion,
  cifrarPassword,
  exigirSecretoDeSesion,
  faltaCrearElPrimerUsuario,
  normalizarEmail,
  passwordDeArranqueValida,
  revisarPasswordNueva,
  verificarIngreso,
} from "@/lib/auth";

export async function iniciarSesion(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/admin/login?error=credenciales");
  }

  const resultado = await verificarIngreso(email, password);

  if (!resultado.ok) {
    if (resultado.motivo === "frenado") {
      redirect(`/admin/login?error=frenado&minutos=${resultado.minutos ?? 10}`);
    }
    redirect("/admin/login?error=credenciales");
  }

  await abrirSesion(resultado.usuarioId);
  redirect("/admin/pedidos");
}

/**
 * Crea la cuenta de superadmin la primera vez.
 *
 * Solo funciona mientras no exista ningún usuario. Para autorizarla pide la
 * contraseña vieja del sistema, que hasta hoy era la única que había. Apenas
 * se crea esta cuenta, la puerta se cierra sola: aunque alguien conozca esa
 * contraseña vieja, ya no le sirve para nada.
 */
export async function crearPrimerUsuario(formData: FormData) {
  // Se comprueba ANTES de crear nada. Si faltara la clave de firma y lo
  // dejáramos crear la cuenta, quedaría creada pero sin poder iniciar sesión
  // —y con la cuenta ya creada esta pantalla desaparece—, o sea encerrado
  // afuera. Cortando acá, no queda nada a medias.
  exigirSecretoDeSesion();

  if (!(await faltaCrearElPrimerUsuario())) {
    redirect("/admin/login?error=arranque_cerrado");
  }

  const passwordVieja = String(formData.get("passwordSistema") ?? "");
  if (!passwordDeArranqueValida(passwordVieja)) {
    redirect("/admin/login?error=arranque_password");
  }

  const email = normalizarEmail(String(formData.get("email") ?? ""));
  if (!email.includes("@") || email.length < 5) {
    redirect("/admin/login?error=arranque_email");
  }

  const nueva = String(formData.get("passwordNueva") ?? "");
  const repetida = String(formData.get("passwordRepetida") ?? "");
  if (nueva !== repetida) {
    redirect("/admin/login?error=arranque_repetida");
  }
  if (revisarPasswordNueva(nueva)) {
    redirect("/admin/login?error=arranque_debil");
  }

  const usuario = await prisma.usuario.create({
    data: {
      email,
      passwordHash: await cifrarPassword(nueva),
      nombre: String(formData.get("nombre") ?? "").trim() || null,
      rol: "superadmin",
      storeId: null,
    },
    select: { id: true },
  });

  await abrirSesion(usuario.id);
  redirect("/admin/pedidos");
}
