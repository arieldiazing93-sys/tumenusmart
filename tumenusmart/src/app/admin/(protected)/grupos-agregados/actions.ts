"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { moverEnLista, cambiosDeOrden, type Direccion } from "@/lib/ordenar";
import { etiquetaIva } from "@/lib/iva";
import { etiquetaUnidadMedida } from "@/lib/unidad-medida";

export type ResultadoGrupo = { ok: true } | { ok: false; error: string };

/**
 * Devuelve un resultado en vez de lanzar los errores de validación: Next.js
 * oculta en producción el mensaje de cualquier `throw` que salga de una
 * Server Action. Mismo patrón que areas-impresion/actions.ts y
 * productos/actions.ts.
 */
export async function crearGrupo(formData: FormData): Promise<ResultadoGrupo> {
  await exigirPermiso("productos.editar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { ok: false, error: "El nombre es obligatorio" };

  await prisma.optionGroup.create({ data: { nombre, storeId: idLocal } });
  revalidatePath("/admin/grupos-agregados");
  return { ok: true };
}

export async function renombrarGrupo(id: string, nombre: string): Promise<ResultadoGrupo> {
  await exigirPermiso("productos.editar");
  const prisma = prismaDelLocal(await idLocalActual());

  const nombreLimpio = nombre.trim();
  if (!nombreLimpio) return { ok: false, error: "El nombre es obligatorio" };
  await prisma.optionGroup.update({ where: { id }, data: { nombre: nombreLimpio } });
  revalidatePath("/admin/grupos-agregados");
  revalidatePath(`/admin/grupos-agregados/${id}`);
  return { ok: true };
}

/**
 * No se borra un grupo todavía adjuntado a algún producto — mismo criterio
 * que `eliminarProducto`: borrarlo de golpe le sacaría en silencio ese
 * agregado a todos los productos que lo usan, en el momento menos pensado.
 * Primero hay que desadjuntarlo de cada producto (tarjeta "Grupos de
 * agregados" de ese producto).
 */
export async function eliminarGrupo(id: string): Promise<ResultadoGrupo> {
  await exigirPermiso("productos.editar");
  const prisma = prismaDelLocal(await idLocalActual());

  const productosQueLoUsan = await prisma.productOptionGroup.count({ where: { groupId: id } });
  if (productosQueLoUsan > 0) {
    return {
      ok: false,
      error: `No se puede borrar: ${productosQueLoUsan} producto(s) todavía lo tienen adjuntado. Desadjuntalo de cada uno primero.`,
    };
  }

  await prisma.optionGroup.delete({ where: { id } });
  revalidatePath("/admin/grupos-agregados");
  return { ok: true };
}

/**
 * Sube o baja un grupo dentro del listado general.
 *
 * Mismo criterio que `moverProducto`/`moverOpcion`: se renumera TODA la
 * lista, no solo los dos que se tocaron.
 */
export async function moverGrupo(id: string, direccion: Direccion) {
  await exigirPermiso("productos.editar");
  const prisma = prismaDelLocal(await idLocalActual());

  const grupos = await prisma.optionGroup.findMany({
    orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
    select: { id: true, orden: true },
  });

  const indice = grupos.findIndex((g) => g.id === id);
  if (indice === -1) return;

  const nuevoOrden = moverEnLista(
    grupos.map((g) => g.id),
    indice,
    direccion
  );
  const cambios = cambiosDeOrden(nuevoOrden, new Map(grupos.map((g) => [g.id, g.orden])));
  if (cambios.length === 0) return;

  await prisma.$transaction(
    cambios.map((c) => prisma.optionGroup.update({ where: { id: c.id }, data: { orden: c.orden } }))
  );
  revalidatePath("/admin/grupos-agregados");
}

export type ProductoParaGrupo = {
  id: string;
  nombre: string;
  precio: number;
  categoriaNombre: string;
  iva: string;
  unidadMedida: string;
};

/**
 * Busca productos del local para agregar como modificador a un grupo —
 * excluye los que ya están en este grupo, y no filtra por categoría (el
 * dueño escribe el nombre, ej. "salsa", y elige de la lista).
 */
export async function buscarProductosParaGrupo(
  groupId: string,
  query: string
): Promise<ProductoParaGrupo[]> {
  await exigirPermiso("productos.editar");
  const prisma = prismaDelLocal(await idLocalActual());

  const texto = query.trim();
  if (!texto) return [];

  const yaEnGrupo = await prisma.optionGroupProduct.findMany({
    where: { groupId },
    select: { productId: true },
  });

  const productos = await prisma.product.findMany({
    where: {
      nombre: { contains: texto, mode: "insensitive" },
      id: { notIn: yaEnGrupo.map((o) => o.productId) },
    },
    orderBy: { nombre: "asc" },
    take: 10,
    select: {
      id: true,
      nombre: true,
      precio: true,
      iva: true,
      unidadMedida: true,
      category: { select: { nombre: true } },
    },
  });

  return productos.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    precio: Number(p.precio),
    categoriaNombre: p.category.nombre,
    iva: etiquetaIva(p.iva),
    unidadMedida: etiquetaUnidadMedida(p.unidadMedida),
  }));
}

export async function agregarProductoAGrupo(
  groupId: string,
  productId: string
): Promise<ResultadoGrupo> {
  await exigirPermiso("productos.editar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  await prisma.optionGroupProduct.upsert({
    where: { groupId_productId: { groupId, productId } },
    update: {},
    create: { groupId, productId, storeId: idLocal },
  });

  revalidatePath(`/admin/grupos-agregados/${groupId}`);
  revalidatePath("/[slug]", "layout");
  return { ok: true };
}

export async function quitarProductoDeGrupo(groupId: string, productId: string) {
  await exigirPermiso("productos.editar");
  const prisma = prismaDelLocal(await idLocalActual());

  await prisma.optionGroupProduct.deleteMany({ where: { groupId, productId } });
  revalidatePath(`/admin/grupos-agregados/${groupId}`);
  revalidatePath("/[slug]", "layout");
}

/**
 * Sube o baja un modificador DENTRO de su grupo. Mismo criterio que
 * `moverOpcion`.
 */
export async function moverModificadorDeGrupo(id: string, direccion: Direccion) {
  await exigirPermiso("productos.editar");
  const prisma = prismaDelLocal(await idLocalActual());

  const fila = await prisma.optionGroupProduct.findUnique({
    where: { id },
    select: { groupId: true },
  });
  if (!fila) return;

  const filas = await prisma.optionGroupProduct.findMany({
    where: { groupId: fila.groupId },
    orderBy: [{ orden: "asc" }, { id: "asc" }],
    select: { id: true, orden: true },
  });

  const indice = filas.findIndex((f) => f.id === id);
  if (indice === -1) return;

  const nuevoOrden = moverEnLista(
    filas.map((f) => f.id),
    indice,
    direccion
  );
  const cambios = cambiosDeOrden(nuevoOrden, new Map(filas.map((f) => [f.id, f.orden])));
  if (cambios.length === 0) return;

  await prisma.$transaction(
    cambios.map((c) => prisma.optionGroupProduct.update({ where: { id: c.id }, data: { orden: c.orden } }))
  );
  revalidatePath(`/admin/grupos-agregados/${fila.groupId}`);
}
