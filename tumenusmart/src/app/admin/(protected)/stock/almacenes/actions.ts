"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";

export type ResultadoAlmacen = { ok: true } | { ok: false; error: string };

export async function crearAlmacen(formData: FormData): Promise<ResultadoAlmacen> {
  await exigirPermiso("stock.editar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const codigo = String(formData.get("codigo") ?? "").trim();
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!codigo || !nombre) return { ok: false, error: "Código y nombre son obligatorios" };

  await prisma.almacen.create({ data: { storeId: idLocal, codigo, nombre } });
  revalidatePath("/admin/stock/almacenes");
  return { ok: true };
}

export async function editarAlmacen(
  id: string,
  datos: { codigo: string; nombre: string }
): Promise<ResultadoAlmacen> {
  await exigirPermiso("stock.editar");
  const prisma = prismaDelLocal(await idLocalActual());

  const codigo = datos.codigo.trim();
  const nombre = datos.nombre.trim();
  if (!codigo || !nombre) return { ok: false, error: "Código y nombre son obligatorios" };

  await prisma.almacen.update({ where: { id }, data: { codigo, nombre } });
  revalidatePath("/admin/stock/almacenes");
  return { ok: true };
}

export async function alternarActivoAlmacen(id: string, activo: boolean) {
  await exigirPermiso("stock.editar");
  const prisma = prismaDelLocal(await idLocalActual());

  await prisma.almacen.update({ where: { id }, data: { activo } });
  revalidatePath("/admin/stock/almacenes");
}
