"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";

export type ResultadoAlmacen = { ok: true } | { ok: false; error: string };
export type ResultadoCrearAlmacen = { ok: true; almacenId: string } | { ok: false; error: string };

export async function crearAlmacen(formData: FormData): Promise<ResultadoCrearAlmacen> {
  await exigirPermiso("stock.editar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { ok: false, error: "El nombre es obligatorio" };

  const almacen = await prisma.almacen.create({ data: { storeId: idLocal, nombre } });
  revalidatePath("/admin/stock/almacenes");
  return { ok: true, almacenId: almacen.id };
}

export async function editarAlmacen(id: string, formData: FormData): Promise<ResultadoAlmacen> {
  await exigirPermiso("stock.editar");
  const prisma = prismaDelLocal(await idLocalActual());

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { ok: false, error: "El nombre es obligatorio" };

  await prisma.almacen.update({
    where: { id },
    data: { nombre, activo: formData.get("activo") === "on" },
  });
  revalidatePath("/admin/stock/almacenes");
  return { ok: true };
}
