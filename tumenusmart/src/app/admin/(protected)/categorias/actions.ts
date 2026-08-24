"use server";

import { revalidatePath } from "next/cache";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";

export async function crearCategoria(formData: FormData) {
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) throw new Error("El nombre es obligatorio");

  const ultima = await prisma.category.findFirst({ orderBy: { orden: "desc" } });

  await prisma.category.create({
    data: { nombre, orden: (ultima?.orden ?? 0) + 1 },
  });
  revalidatePath("/admin/categorias");
}

export async function renombrarCategoria(id: string, nombre: string) {
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  const nombreLimpio = nombre.trim();
  if (!nombreLimpio) throw new Error("El nombre es obligatorio");
  await prisma.category.update({ where: { id }, data: { nombre: nombreLimpio } });
  revalidatePath("/admin/categorias");
  revalidatePath("/[slug]", "layout");
}

export async function alternarActivaCategoria(id: string, activa: boolean) {
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  await prisma.category.update({ where: { id }, data: { activa } });
  revalidatePath("/admin/categorias");
  revalidatePath("/[slug]", "layout");
}

export async function eliminarCategoria(id: string) {
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  const productosEnCategoria = await prisma.product.count({ where: { categoryId: id } });
  if (productosEnCategoria > 0) {
    throw new Error(
      "No se puede borrar: hay productos en esta categoría. Movelos o borralos primero."
    );
  }
  await prisma.category.delete({ where: { id } });
  revalidatePath("/admin/categorias");
}
