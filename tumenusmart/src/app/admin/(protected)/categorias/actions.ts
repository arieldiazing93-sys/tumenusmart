"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { moverEnLista, cambiosDeOrden, type Direccion } from "@/lib/ordenar";

export async function crearCategoria(formData: FormData) {
  await exigirPermiso("categorias.editar");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) throw new Error("El nombre es obligatorio");

  const ultima = await prisma.category.findFirst({ orderBy: { orden: "desc" } });

  // El local se escribe explícitamente aunque el filtro también lo inyecte:
  // así TypeScript obliga a pensarlo al crear, y el filtro queda de red.
  await prisma.category.create({
    data: { nombre, orden: (ultima?.orden ?? 0) + 1, storeId: idLocal },
  });
  revalidatePath("/admin/categorias");
}

export async function renombrarCategoria(id: string, nombre: string) {
  await exigirPermiso("categorias.editar");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  const nombreLimpio = nombre.trim();
  if (!nombreLimpio) throw new Error("El nombre es obligatorio");
  await prisma.category.update({ where: { id }, data: { nombre: nombreLimpio } });
  revalidatePath("/admin/categorias");
  revalidatePath("/[slug]", "layout");
}

export async function alternarActivaCategoria(id: string, activa: boolean) {
  await exigirPermiso("categorias.editar");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  await prisma.category.update({ where: { id }, data: { activa } });
  revalidatePath("/admin/categorias");
  revalidatePath("/[slug]", "layout");
}

export async function eliminarCategoria(id: string) {
  await exigirPermiso("categorias.editar");
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

/**
 * Sube o baja una categoría en la carta.
 *
 * Renumera TODAS las categorías del local de 1 en adelante, no solo las dos
 * que se tocan. Es a propósito: hoy pueden estar todas con el mismo número
 * (o con huecos de alguna borrada), y en ese caso intercambiar dos valores
 * iguales no cambiaría nada visible. Con la renumeración, el primer clic
 * deja la lista prolija para siempre.
 *
 * Todo va en una transacción: o se acomoda la carta entera, o no se toca nada.
 * Una carta a medio ordenar sería peor que una desordenada.
 */
export async function moverCategoria(id: string, direccion: Direccion) {
  await exigirPermiso("categorias.editar");
  const prisma = prismaDelLocal(await idLocalActual());

  // El desempate por createdAt importa: sin él, con órdenes repetidas
  // Postgres puede devolver las filas en distinto orden en cada consulta y
  // el botón movería una categoría distinta cada vez.
  const categorias = await prisma.category.findMany({
    orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
    select: { id: true, orden: true },
  });

  const indice = categorias.findIndex((c) => c.id === id);
  if (indice === -1) return;

  const nuevoOrden = moverEnLista(
    categorias.map((c) => c.id),
    indice,
    direccion
  );
  const cambios = cambiosDeOrden(
    nuevoOrden,
    new Map(categorias.map((c) => [c.id, c.orden]))
  );
  if (cambios.length === 0) return;

  await prisma.$transaction(
    cambios.map((c) =>
      prisma.category.update({ where: { id: c.id }, data: { orden: c.orden } })
    )
  );

  revalidatePath("/admin/categorias");
  revalidatePath("/admin/productos");
  revalidatePath("/[slug]", "layout");
}
