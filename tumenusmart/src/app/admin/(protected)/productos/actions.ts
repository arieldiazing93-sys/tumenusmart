"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { moverEnLista, cambiosDeOrden, type Direccion } from "@/lib/ordenar";
import { subirImagenProducto } from "@/lib/supabase-storage";

export type ResultadoFoto = { ok: true; url: string } | { ok: false; error: string };

/**
 * Devuelve un resultado en vez de lanzar el error de "sin imagen": Next.js
 * oculta en producción el mensaje de cualquier `throw` que salga de una
 * Server Action, así que el motivo real solo llega si viaja en el retorno.
 */
export async function subirFotoProducto(formData: FormData): Promise<ResultadoFoto> {
  await exigirPermiso("productos.editar");
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File)) {
    return { ok: false, error: "No se recibió ninguna imagen" };
  }
  const url = await subirImagenProducto(archivo);
  return { ok: true, url };
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

export type ResultadoProducto = { ok: true } | { ok: false; error: string };

/**
 * Devuelve un resultado en vez de lanzar el error de "faltan datos": Next.js
 * oculta en producción el mensaje de cualquier `throw` que salga de una
 * Server Action. Este formulario todavía se envía directo (sin un
 * componente cliente intermedio), así que hoy nadie lee este valor de
 * retorno — pero evita que una validación fallida rompa la pantalla entera,
 * que es el riesgo más grave de los dos.
 */
export async function crearProducto(formData: FormData): Promise<ResultadoProducto | void> {
  await exigirPermiso("productos.editar");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const nombre = String(formData.get("nombre") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "");
  const precio = parseFloat(String(formData.get("precio") ?? "0"));

  if (!nombre || !categoryId || isNaN(precio)) {
    return { ok: false, error: "Faltan datos obligatorios" };
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

export async function actualizarProducto(
  productId: string,
  formData: FormData
): Promise<ResultadoProducto | void> {
  await exigirPermiso("productos.editar");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  const nombre = String(formData.get("nombre") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "");
  const precio = parseFloat(String(formData.get("precio") ?? "0"));

  if (!nombre || !categoryId || isNaN(precio)) {
    return { ok: false, error: "Faltan datos obligatorios" };
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
  await exigirPermiso("productos.editar");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  await prisma.product.delete({ where: { id: productId } });
  revalidatePath("/admin/productos");
  redirect("/admin/productos");
}

export async function agregarOpcion(
  productId: string,
  formData: FormData
): Promise<ResultadoProducto> {
  await exigirPermiso("productos.editar");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const nombre = String(formData.get("nombre") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "agregado");
  const precioExtra = parseFloat(String(formData.get("precioExtra") ?? "0")) || 0;

  if (!nombre) return { ok: false, error: "El nombre de la opción es obligatorio" };

  await prisma.productOption.create({
    data: { productId, nombre, tipo, precioExtra, storeId: idLocal },
  });
  revalidatePath(`/admin/productos/${productId}`);
  return { ok: true };
}

export async function eliminarOpcion(productId: string, optionId: string) {
  await exigirPermiso("productos.editar");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  await prisma.productOption.delete({ where: { id: optionId } });
  revalidatePath(`/admin/productos/${productId}`);
}

/**
 * Sube o baja un producto DENTRO de su categoría.
 *
 * Se reordena solo entre hermanos: mover una milanesa no puede alterar el
 * orden de las bebidas. Misma renumeración completa y misma transacción que
 * en categorías, y por los mismos motivos.
 */
export async function moverProducto(id: string, direccion: Direccion) {
  await exigirPermiso("productos.editar");
  const prisma = prismaDelLocal(await idLocalActual());

  const producto = await prisma.product.findUnique({
    where: { id },
    select: { categoryId: true },
  });
  if (!producto) return;

  const productos = await prisma.product.findMany({
    where: { categoryId: producto.categoryId },
    orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
    select: { id: true, orden: true },
  });

  const indice = productos.findIndex((p) => p.id === id);
  if (indice === -1) return;

  const nuevoOrden = moverEnLista(
    productos.map((p) => p.id),
    indice,
    direccion
  );
  const cambios = cambiosDeOrden(
    nuevoOrden,
    new Map(productos.map((p) => [p.id, p.orden]))
  );
  if (cambios.length === 0) return;

  await prisma.$transaction(
    cambios.map((c) =>
      prisma.product.update({ where: { id: c.id }, data: { orden: c.orden } })
    )
  );

  revalidatePath("/admin/productos");
  revalidatePath("/[slug]", "layout");
}

/**
 * Marcar un producto agotado o disponible, sin abrir el formulario.
 *
 * Es la única cosa de la carta que puede tocar un empleado, y existe por lo
 * que pasa todos los días en el medio del servicio: se acaba la muzzarella.
 * Si hubiera que entrar a editar el producto, el empleado necesitaría permiso
 * para cambiar precios — y ahí ya no hay nivel intermedio posible.
 *
 * Solo toca esa columna. No puede cambiar precio, nombre ni nada más, aunque
 * alguien llame a esta acción desde afuera del panel.
 */
export async function alternarDisponibleProducto(id: string, disponible: boolean) {
  await exigirPermiso("productos.disponibilidad");
  const prisma = prismaDelLocal(await idLocalActual());

  await prisma.product.update({ where: { id }, data: { disponible } });

  revalidatePath("/admin/productos");
  revalidatePath("/[slug]", "layout");
}
