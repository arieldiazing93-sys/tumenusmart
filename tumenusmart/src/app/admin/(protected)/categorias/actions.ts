"use server";

import { revalidatePath } from "next/cache";
import { idLocalActual } from "@/lib/local-actual";
import { prisma } from "@/lib/prisma";

export async function crearCategoria(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) throw new Error("El nombre es obligatorio");

  const ultima = await prisma.category.findFirst({ orderBy: { orden: "desc" } });

  await prisma.category.create({
    data: { storeId: await idLocalActual(), nombre, orden: (ultima?.orden ?? 0) + 1 },
  });
  revalidatePath("/admin/categorias");
}

export async function renombrarCategoria(id: string, nombre: string) {
  const nombreLimpio = nombre.trim();
  if (!nombreLimpio) throw new Error("El nombre es obligatorio");
  await prisma.category.update({ where: { id }, data: { nombre: nombreLimpio } });
  revalidatePath("/admin/categorias");
  revalidatePath("/");
}

export async function alternarActivaCategoria(id: string, activa: boolean) {
  await prisma.category.update({ where: { id }, data: { activa } });
  revalidatePath("/admin/categorias");
  revalidatePath("/");
}

export async function eliminarCategoria(id: string) {
  const productosEnCategoria = await prisma.product.count({ where: { categoryId: id } });
  if (productosEnCategoria > 0) {
    throw new Error(
      "No se puede borrar: hay productos en esta categoría. Movelos o borralos primero."
    );
  }
  await prisma.category.delete({ where: { id } });
  revalidatePath("/admin/categorias");
}
