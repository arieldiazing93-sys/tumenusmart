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

export type ResultadoIngresoPantalla = { ok: boolean; error?: string };

/**
 * Verifica las credenciales y abre la sesión.
 *
 * Devuelve el resultado en vez de redirigir cuando falla: así el error aparece
 * sin recargar la pantalla. Recargando, el navegador volvía a completar los
 * mismos datos que acababan de fallar y el intento siguiente fallaba igual.
 */
export async function iniciarSesion(
  email: string,
  password: string
): Promise<ResultadoIngresoPantalla> {
  if (!email || !password) {
    return { ok: false, error: "Escribí tu correo y tu contraseña." };
  }

  const resultado = await verificarIngreso(email, password);

  if (!resultado.ok) {
    if (resultado.motivo === "frenado") {
      return {
        ok: false,
        error: `Demasiados intentos fallidos. Probá de nuevo en ${resultado.minutos ?? 10} minutos.`,
      };
    }
    return { ok: false, error: "Correo o contraseña incorrectos." };
  }

  await abrirSesion(resultado.usuarioId);
  return { ok: true };
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
