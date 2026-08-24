"use server";

import { revalidatePath } from "next/cache";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";

export async function crearRepartidor(formData: FormData) {
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  const nombre = String(formData.get("nombre") ?? "").trim();
  const telefono = String(formData.get("telefono") ?? "").trim();

  if (!nombre) throw new Error("El nombre es obligatorio");

  await prisma.repartidor.create({
    data: { nombre, telefono: telefono || null },
  });
  revalidatePath("/admin/repartidores");
}

export async function alternarActivoRepartidor(id: string, activo: boolean) {
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  await prisma.repartidor.update({ where: { id }, data: { activo } });
  revalidatePath("/admin/repartidores");
  revalidatePath("/admin/pedidos");
}

export async function eliminarRepartidor(id: string) {
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  const pedidosAsignados = await prisma.order.count({ where: { repartidorId: id } });
  if (pedidosAsignados > 0) {
    throw new Error(
      "No se puede borrar: tiene pedidos asignados. Desactivalo en vez de borrarlo."
    );
  }
  await prisma.repartidor.delete({ where: { id } });
  revalidatePath("/admin/repartidores");
}
