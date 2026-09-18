"use server";

import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";

export type ResultadoActualizarCliente = { ok: true } | { ok: false; error: string };

/**
 * Corrección de nombre/correo — no da de alta clientes (eso lo hace solo
 * el flujo de venta) ni toca tipo/número de identificación (son la clave
 * única del registro; editarlos arriesgaría reasignar la identidad de un
 * cliente con ventas pasadas).
 */
export async function actualizarCliente(
  id: string,
  datos: { nombre: string; email: string }
): Promise<ResultadoActualizarCliente> {
  await exigirPermiso("pos.verHistorico");
  const prisma = prismaDelLocal(await idLocalActual());

  const nombre = datos.nombre.trim();
  if (!nombre) return { ok: false, error: "El nombre no puede quedar vacío." };

  const email = datos.email.trim();
  if (email && !email.includes("@")) return { ok: false, error: "El correo electrónico no es válido." };

  await prisma.customer.update({ where: { id }, data: { nombre, email: email || null } });
  revalidatePath("/admin/pos/clientes");
  return { ok: true };
}
