"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { subirImagenProducto } from "@/lib/supabase-storage";

export async function subirFotoProducto(formData: FormData): Promise<{ url: string }> {
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File)) {
    throw new Error("No se recibió ninguna imagen");
  }
  const url = await subirImagenProducto(archivo);
  return { url };
}

function parsearIngredientes(formData: FormData): string[] {
  const crudo = String(formData.get("ingredientes") ?? "[]");
  try {
    const lista = JSON.parse(crudo);
    if (!Array.isArray(lista)) return [];
    return lista
      .map((x) => String(x).trim())
      .filter((x) => x.length > 0);
  } catch {
    return [];
  }
}

export async function crearProducto(formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "");
  const precio = parseFloat(String(formData.get("precio") ?? "0"));

  if (!nombre || !categoryId || isNaN(precio)) {
    throw new Error("Faltan datos obligatorios");
  }

  const producto = await prisma.product.create({
    data: {
      nombre,
      categoryId,
      precio,
      descripcion: String(formData.get("descripcion") ?? "") || null,
      imagenUrl: String(formData.get("imagenUrl") ?? "") || null,
      disponible: formData.get("disponible") === "on",
      destacado: formData.get("destacado") === "on",
      ingredientes: parsearIngredientes(formData),
    },
  });

  revalidatePath("/admin/productos");
  revalidatePath("/");
  redirect(`/admin/productos/${producto.id}`);
}

export async function actualizarProducto(productId: string, formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "");
  const precio = parseFloat(String(formData.get("precio") ?? "0"));

  if (!nombre || !categoryId || isNaN(precio)) {
    throw new Error("Faltan datos obligatorios");
  }

  const mitadYMitadGrupo = String(formData.get("mitadYMitadGrupo") ?? "").trim() || null;
  const mitadYMitadModo =
    String(formData.get("mitadYMitadModo") ?? "mayor") === "proporcional"
      ? "proporcional"
      : "mayor";

  await prisma.product.update({
    where: { id: productId },
    data: {
      nombre,
      categoryId,
      precio,
      descripcion: String(formData.get("descripcion") ?? "") || null,
      imagenUrl: String(formData.get("imagenUrl") ?? "") || null,
      disponible: formData.get("disponible") === "on",
      destacado: formData.get("destacado") === "on",
      ingredientes: parsearIngredientes(formData),
      mitadYMitadGrupo,
      mitadYMitadModo,
    },
  });

  revalidatePath("/admin/productos");
  revalidatePath(`/admin/productos/${productId}`);
  revalidatePath("/");
  redirect(`/admin/productos/${productId}?guardado=1`);
}

export async function eliminarProducto(productId: string) {
  await prisma.product.delete({ where: { id: productId } });
  revalidatePath("/admin/productos");
  redirect("/admin/productos");
}

export async function agregarOpcion(productId: string, formData: FormData) {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "agregado");
  const precioExtra = parseFloat(String(formData.get("precioExtra") ?? "0")) || 0;

  if (!nombre) throw new Error("El nombre de la opción es obligatorio");

  await prisma.productOption.create({
    data: { productId, nombre, tipo, precioExtra },
  });
  revalidatePath(`/admin/productos/${productId}`);
}

export async function eliminarOpcion(productId: string, optionId: string) {
  await prisma.productOption.delete({ where: { id: optionId } });
  revalidatePath(`/admin/productos/${productId}`);
}
