"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";

export type ResultadoRepartidor = { ok: true } | { ok: false; error: string };

/**
 * Devuelve un resultado en vez de lanzar los errores de validación: Next.js
 * oculta en producción el mensaje de cualquier `throw` que salga de una
 * Server Action, así que el motivo real solo llega si viaja en el retorno.
 */
export async function crearRepartidor(formData: FormData): Promise<ResultadoRepartidor> {
  await exigirPermiso("repartidores.gestionar");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const nombre = String(formData.get("nombre") ?? "").trim();
  const telefono = String(formData.get("telefono") ?? "").trim();

  if (!nombre) return { ok: false, error: "El nombre es obligatorio" };

  await prisma.repartidor.create({
    data: { nombre, telefono: telefono || null, storeId: idLocal },
  });
  revalidatePath("/admin/repartidores");
  return { ok: true };
}

export async function alternarActivoRepartidor(id: string, activo: boolean) {
  await exigirPermiso("repartidores.gestionar");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  await prisma.repartidor.update({ where: { id }, data: { activo } });
  revalidatePath("/admin/repartidores");
  revalidatePath("/admin/pedidos");
}

export async function eliminarRepartidor(id: string): Promise<ResultadoRepartidor> {
  await exigirPermiso("repartidores.gestionar");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  const pedidosAsignados = await prisma.order.count({ where: { repartidorId: id } });
  if (pedidosAsignados > 0) {
    return {
      ok: false,
      error: "No se puede borrar: tiene pedidos asignados. Desactivalo en vez de borrarlo.",
    };
  }
  await prisma.repartidor.delete({ where: { id } });
  revalidatePath("/admin/repartidores");
  return { ok: true };
}
