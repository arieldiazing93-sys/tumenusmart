"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { moverEnLista, cambiosDeOrden, type Direccion } from "@/lib/ordenar";
import { normalizarIva } from "@/lib/iva";
import { normalizarUnidadMedida } from "@/lib/unidad-medida";

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

export async function agregarGrupoItem(
  groupId: string,
  formData: FormData
): Promise<ResultadoGrupo> {
  await exigirPermiso("productos.editar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const nombre = String(formData.get("nombre") ?? "").trim();
  const precioExtra = parseFloat(String(formData.get("precioExtra") ?? "0")) || 0;
  const crudo = String(formData.get("costo") ?? "").trim();
  const costo = crudo && !isNaN(parseFloat(crudo)) ? parseFloat(crudo) : null;

  if (!nombre) return { ok: false, error: "El nombre del ítem es obligatorio" };

  await prisma.optionGroupItem.create({
    data: { groupId, nombre, precioExtra, costo, storeId: idLocal },
  });
  revalidatePath(`/admin/grupos-agregados/${groupId}`);
  return { ok: true };
}

export async function actualizarNombreGrupoItem(
  groupId: string,
  itemId: string,
  formData: FormData
): Promise<ResultadoGrupo> {
  await exigirPermiso("productos.editar");
  const prisma = prismaDelLocal(await idLocalActual());

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { ok: false, error: "El nombre no puede quedar vacío" };

  // El `where` con groupId de más, aparte de itemId, es defensa en
  // profundidad: mismo criterio que en productos/actions.ts.
  const resultado = await prisma.optionGroupItem.updateMany({
    where: { id: itemId, groupId },
    data: { nombre },
  });
  if (resultado.count === 0) {
    return { ok: false, error: "Ese ítem no existe o no es de este grupo" };
  }

  revalidatePath(`/admin/grupos-agregados/${groupId}`);
  return { ok: true };
}

export async function actualizarCostoGrupoItem(
  groupId: string,
  itemId: string,
  formData: FormData
): Promise<ResultadoGrupo> {
  await exigirPermiso("productos.editar");
  const prisma = prismaDelLocal(await idLocalActual());

  const crudo = String(formData.get("costo") ?? "").trim();
  const costo = crudo && !isNaN(parseFloat(crudo)) ? parseFloat(crudo) : null;

  const resultado = await prisma.optionGroupItem.updateMany({
    where: { id: itemId, groupId },
    data: { costo },
  });
  if (resultado.count === 0) {
    return { ok: false, error: "Ese ítem no existe o no es de este grupo" };
  }

  revalidatePath(`/admin/grupos-agregados/${groupId}`);
  return { ok: true };
}

export async function actualizarPrecioExtraGrupoItem(
  groupId: string,
  itemId: string,
  formData: FormData
): Promise<ResultadoGrupo> {
  await exigirPermiso("productos.editar");
  const prisma = prismaDelLocal(await idLocalActual());

  const precioExtra = parseFloat(String(formData.get("precioExtra") ?? "0")) || 0;

  const resultado = await prisma.optionGroupItem.updateMany({
    where: { id: itemId, groupId },
    data: { precioExtra },
  });
  if (resultado.count === 0) {
    return { ok: false, error: "Ese ítem no existe o no es de este grupo" };
  }

  revalidatePath(`/admin/grupos-agregados/${groupId}`);
  return { ok: true };
}

export async function actualizarIvaGrupoItem(
  groupId: string,
  itemId: string,
  formData: FormData
): Promise<ResultadoGrupo> {
  await exigirPermiso("productos.editar");
  const prisma = prismaDelLocal(await idLocalActual());

  const iva = normalizarIva(formData.get("iva"));

  const resultado = await prisma.optionGroupItem.updateMany({
    where: { id: itemId, groupId },
    data: { iva },
  });
  if (resultado.count === 0) {
    return { ok: false, error: "Ese ítem no existe o no es de este grupo" };
  }

  revalidatePath(`/admin/grupos-agregados/${groupId}`);
  return { ok: true };
}

export async function actualizarUnidadMedidaGrupoItem(
  groupId: string,
  itemId: string,
  formData: FormData
): Promise<ResultadoGrupo> {
  await exigirPermiso("productos.editar");
  const prisma = prismaDelLocal(await idLocalActual());

  const unidadMedida = normalizarUnidadMedida(formData.get("unidadMedida"));

  const resultado = await prisma.optionGroupItem.updateMany({
    where: { id: itemId, groupId },
    data: { unidadMedida },
  });
  if (resultado.count === 0) {
    return { ok: false, error: "Ese ítem no existe o no es de este grupo" };
  }

  revalidatePath(`/admin/grupos-agregados/${groupId}`);
  return { ok: true };
}

export async function eliminarGrupoItem(groupId: string, itemId: string) {
  await exigirPermiso("productos.editar");
  const prisma = prismaDelLocal(await idLocalActual());

  await prisma.optionGroupItem.deleteMany({ where: { id: itemId, groupId } });
  revalidatePath(`/admin/grupos-agregados/${groupId}`);
}

/**
 * Sube o baja un ítem DENTRO de su grupo. Mismo criterio que `moverOpcion`.
 */
export async function moverGrupoItem(id: string, direccion: Direccion) {
  await exigirPermiso("productos.editar");
  const prisma = prismaDelLocal(await idLocalActual());

  const item = await prisma.optionGroupItem.findUnique({
    where: { id },
    select: { groupId: true },
  });
  if (!item) return;

  const items = await prisma.optionGroupItem.findMany({
    where: { groupId: item.groupId },
    orderBy: [{ orden: "asc" }, { id: "asc" }],
    select: { id: true, orden: true },
  });

  const indice = items.findIndex((i) => i.id === id);
  if (indice === -1) return;

  const nuevoOrden = moverEnLista(
    items.map((i) => i.id),
    indice,
    direccion
  );
  const cambios = cambiosDeOrden(nuevoOrden, new Map(items.map((i) => [i.id, i.orden])));
  if (cambios.length === 0) return;

  await prisma.$transaction(
    cambios.map((c) => prisma.optionGroupItem.update({ where: { id: c.id }, data: { orden: c.orden } }))
  );
  revalidatePath(`/admin/grupos-agregados/${item.groupId}`);
}
