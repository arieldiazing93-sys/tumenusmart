"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function crearCategoria(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) throw new Error("El nombre es obligatorio");

  const ultima = await prisma.category.findFirst({ orderBy: { orden: "desc" } });

  await prisma.category.create({
    data: { nombre, orden: (ultima?.orden ?? 0) + 1 },
  });
  revalidatePath("/admin/categorias");
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
