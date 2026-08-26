"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
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


/**
 * Lee el costo del formulario.
 *
 * Vacío significa "no lo sé todavía", que no es lo mismo que cero: por eso
 * devuelve null y no 0. Un cero haría creer al analista que el producto no
 * cuesta nada y que todo lo que factura es ganancia.
 */
function leerCosto(formData: FormData): number | null {
  const crudo = String(formData.get("costo") ?? "").trim();
  if (!crudo) return null;
  const valor = parseFloat(crudo);
  if (isNaN(valor) || valor < 0) return null;
  return valor;
}

export async function crearProducto(formData: FormData) {
  // Todas las consultas de acá abajo quedan atadas a este local.
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

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
      costo: leerCosto(formData),
      storeId: idLocal,
    },
  });

  revalidatePath("/admin/productos");
  revalidatePath("/[slug]", "layout");
  // Vuelve a la lista de la misma categoría (no al detalle del producto)
  // para poder seguir cargando productos sin ir y venir entre pantallas.
  redirect(`/admin/productos?categoria=${producto.categoryId}&guardado=1`);
}

export async function actualizarProducto(productId: string, formData: FormData) {
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

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
      costo: leerCosto(formData),
      mitadYMitadGrupo,
      mitadYMitadModo,
    },
  });

  revalidatePath("/admin/productos");
  revalidatePath(`/admin/productos/${productId}`);
  revalidatePath("/[slug]", "layout");
  redirect(`/admin/productos/${productId}?guardado=1`);
}

export async function eliminarProducto(productId: string) {
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  await prisma.product.delete({ where: { id: productId } });
  revalidatePath("/admin/productos");
  redirect("/admin/productos");
}

export async function agregarOpcion(productId: string, formData: FormData) {
  // Todas las consultas de acá abajo quedan atadas a este local.
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const nombre = String(formData.get("nombre") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "agregado");
  const precioExtra = parseFloat(String(formData.get("precioExtra") ?? "0")) || 0;

  if (!nombre) throw new Error("El nombre de la opción es obligatorio");

  await prisma.productOption.create({
    data: { productId, nombre, tipo, precioExtra, storeId: idLocal },
  });
  revalidatePath(`/admin/productos/${productId}`);
}

export async function eliminarOpcion(productId: string, optionId: string) {
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  await prisma.productOption.delete({ where: { id: optionId } });
  revalidatePath(`/admin/productos/${productId}`);
}
