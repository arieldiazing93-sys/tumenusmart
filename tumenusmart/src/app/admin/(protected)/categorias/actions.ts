"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { moverEnLista, cambiosDeOrden, type Direccion } from "@/lib/ordenar";

export type ResultadoCategoria = { ok: true } | { ok: false; error: string };

/**
 * Devuelve un resultado en vez de lanzar los errores de validación: Next.js
 * oculta en producción el mensaje de cualquier `throw` que salga de una
 * Server Action, así que el motivo real solo llega si viaja en el retorno.
 */
export async function crearCategoria(formData: FormData): Promise<ResultadoCategoria> {
  await exigirPermiso("categorias.editar");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { ok: false, error: "El nombre es obligatorio" };

  const ultima = await prisma.category.findFirst({ orderBy: { orden: "desc" } });

  // El local se escribe explícitamente aunque el filtro también lo inyecte:
  // así TypeScript obliga a pensarlo al crear, y el filtro queda de red.
  await prisma.category.create({
    data: { nombre, orden: (ultima?.orden ?? 0) + 1, storeId: idLocal },
  });
  revalidatePath("/admin/categorias");
  return { ok: true };
}

export async function renombrarCategoria(id: string, nombre: string): Promise<ResultadoCategoria> {
  await exigirPermiso("categorias.editar");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  const nombreLimpio = nombre.trim();
  if (!nombreLimpio) return { ok: false, error: "El nombre es obligatorio" };
  await prisma.category.update({ where: { id }, data: { nombre: nombreLimpio } });
  revalidatePath("/admin/categorias");
  revalidatePath("/[slug]", "layout");
  return { ok: true };
}

export async function alternarActivaCategoria(id: string, activa: boolean) {
  await exigirPermiso("categorias.editar");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  await prisma.category.update({ where: { id }, data: { activa } });
  revalidatePath("/admin/categorias");
  revalidatePath("/[slug]", "layout");
}

export async function eliminarCategoria(id: string): Promise<ResultadoCategoria> {
  await exigirPermiso("categorias.editar");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  const productosEnCategoria = await prisma.product.count({ where: { categoryId: id } });
  if (productosEnCategoria > 0) {
    return {
      ok: false,
      error: "No se puede borrar: hay productos en esta categoría. Movelos o borralos primero.",
    };
  }
  await prisma.category.delete({ where: { id } });
  revalidatePath("/admin/categorias");
  return { ok: true };
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

export type ResultadoTramoCategoria = { ok: true } | { ok: false; error: string };

/**
 * Agrega un tramo de BLOQUEO a una categoría — ej: "Hamburguesas Simple"
 * oculta los lunes y martes. Es el criterio contrario al horario de
 * atención del local: ahí sin tramos el local está siempre abierto Y con
 * tramos solo atiende en esas ventanas; acá sin tramos la categoría se
 * muestra SIEMPRE, y los tramos cargados son las ventanas en las que se
 * OCULTA — el resto del tiempo sigue visible sin tocar nada. Es una
 * excepción puntual que configura el que la necesita, no un horario que
 * haya que definir entero para que la carta funcione.
 *
 * Devuelve un resultado en vez de lanzar los errores de validación: Next.js
 * oculta en producción el mensaje de cualquier `throw` que salga de una
 * Server Action, así que el motivo real solo llega si viaja en el retorno.
 */
export async function agregarTramoCategoria(
  categoryId: string,
  formData: FormData
): Promise<ResultadoTramoCategoria> {
  await exigirPermiso("categorias.editar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const diaSemana = Number(formData.get("diaSemana"));
  const abre = String(formData.get("abre") ?? "").trim();
  const cierra = String(formData.get("cierra") ?? "").trim();

  if (!Number.isInteger(diaSemana) || diaSemana < 0 || diaSemana > 6) {
    return { ok: false, error: "Día inválido" };
  }
  if (!abre || !cierra) return { ok: false, error: "Faltan las horas del bloqueo" };

  await prisma.categoriaHorario.create({
    data: { categoryId, diaSemana, abre, cierra, storeId: idLocal },
  });

  revalidatePath(`/admin/categorias/${categoryId}/horario`);
  revalidatePath("/[slug]", "layout");
  return { ok: true };
}

export async function eliminarTramoCategoria(categoryId: string, id: string): Promise<void> {
  await exigirPermiso("categorias.editar");
  const prisma = prismaDelLocal(await idLocalActual());

  await prisma.categoriaHorario.delete({ where: { id } });

  revalidatePath(`/admin/categorias/${categoryId}/horario`);
  revalidatePath("/[slug]", "layout");
}
