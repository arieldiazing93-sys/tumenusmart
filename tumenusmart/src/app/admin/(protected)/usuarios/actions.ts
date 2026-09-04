"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  cifrarPassword,
  exigirSuperadmin,
  normalizarEmail,
  revisarPasswordNueva,
} from "@/lib/auth";

// Todo lo de este archivo es exclusivo del superadmin. Cada acción lo exige
// por su cuenta: no alcanza con que la pantalla no muestre el botón, porque
// una acción de servidor se puede invocar sin pasar por la pantalla.

const ROLES_PERMITIDOS = new Set(["superadmin", "local"]);

function limpiarRol(valor: string): string {
  return ROLES_PERMITIDOS.has(valor) ? valor : "local";
}

export type ResultadoAccion = { ok: true } | { ok: false; error: string };

/**
 * Devuelve un resultado en vez de lanzar los errores de validación: Next.js
 * oculta en producción el mensaje de cualquier `throw` que salga de una
 * Server Action (lo cambia por un genérico "Server Components render...",
 * por seguridad), así que el motivo real solo llega si viaja en el valor de
 * retorno, no en una excepción.
 */
export async function crearUsuario(formData: FormData): Promise<ResultadoAccion> {
  await exigirSuperadmin();

  const email = normalizarEmail(String(formData.get("email") ?? ""));
  const nombre = String(formData.get("nombre") ?? "").trim();
  const rol = limpiarRol(String(formData.get("rol") ?? "local"));
  const storeIdCrudo = String(formData.get("storeId") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email.includes("@") || email.length < 5) {
    return { ok: false, error: "Escribí un correo válido" };
  }

  const problema = revisarPasswordNueva(password);
  if (problema) return { ok: false, error: problema };

  // El superadmin no pertenece a ningún local; el usuario de local sí, siempre.
  const storeId = rol === "superadmin" ? null : storeIdCrudo || null;
  if (rol !== "superadmin" && !storeId) {
    return { ok: false, error: "Elegí a qué local pertenece este usuario" };
  }

  if (storeId) {
    const local = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true },
    });
    if (!local) return { ok: false, error: "Ese local no existe" };
  }

  const yaExiste = await prisma.usuario.findUnique({
    where: { email },
    select: { id: true },
  });
  if (yaExiste) return { ok: false, error: "Ya hay un usuario con ese correo" };

  await prisma.usuario.create({
    data: {
      email,
      nombre: nombre || null,
      rol,
      storeId,
      passwordHash: await cifrarPassword(password),
      // Vos elegiste esta contraseña y se la pasaste: que la cambie.
      debeCambiarPassword: true,
    },
  });

  revalidatePath("/admin/usuarios");
  return { ok: true };
}

export async function restablecerPassword(
  usuarioId: string,
  formData: FormData
): Promise<ResultadoAccion> {
  await exigirSuperadmin();

  const password = String(formData.get("password") ?? "");
  const problema = revisarPasswordNueva(password);
  if (problema) return { ok: false, error: problema };

  await prisma.usuario.update({
    where: { id: usuarioId },
    data: {
      passwordHash: await cifrarPassword(password),
      debeCambiarPassword: true,
      // Restablecer la contraseña también levanta el freno por intentos
      // fallidos: si alguien quedó trabado, esto lo destraba.
      intentosFallidos: 0,
      bloqueadoHasta: null,
    },
  });

  revalidatePath("/admin/usuarios");
  return { ok: true };
}

export async function alternarActivoUsuario(
  usuarioId: string,
  activo: boolean
): Promise<ResultadoAccion> {
  const sesion = await exigirSuperadmin();

  // Desactivarse a uno mismo dejaría el panel sin nadie que pueda entrar.
  if (usuarioId === sesion.id && !activo) {
    return { ok: false, error: "No podés desactivar tu propio usuario" };
  }

  if (!activo) {
    const problema = await protegerAlUltimoSuperadmin(usuarioId);
    if (problema) return { ok: false, error: problema };
  }

  await prisma.usuario.update({
    where: { id: usuarioId },
    data: { activo },
  });

  revalidatePath("/admin/usuarios");
  return { ok: true };
}

export async function eliminarUsuario(usuarioId: string): Promise<ResultadoAccion> {
  const sesion = await exigirSuperadmin();

  if (usuarioId === sesion.id) {
    return { ok: false, error: "No podés borrar tu propio usuario" };
  }

  const problema = await protegerAlUltimoSuperadmin(usuarioId);
  if (problema) return { ok: false, error: problema };

  await prisma.usuario.delete({ where: { id: usuarioId } });
  revalidatePath("/admin/usuarios");
  return { ok: true };
}

/**
 * Impide quedarse sin ningún superadmin activo.
 *
 * Sin esta comprobación, desactivar o borrar al último administrador dejaría
 * el sistema sin forma de crear usuarios ni de cambiar de local, y habría que
 * arreglarlo escribiendo SQL a mano en la base.
 *
 * Devuelve el motivo si hay que bloquear la acción, o `null` si está bien.
 */
async function protegerAlUltimoSuperadmin(usuarioId: string): Promise<string | null> {
  const objetivo = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: { rol: true, activo: true },
  });
  if (!objetivo || objetivo.rol !== "superadmin" || !objetivo.activo) return null;

  const otrosActivos = await prisma.usuario.count({
    where: { rol: "superadmin", activo: true, id: { not: usuarioId } },
  });
  if (otrosActivos === 0) {
    return "Es el único administrador activo. Creá otro antes de desactivar este.";
  }
  return null;
}
