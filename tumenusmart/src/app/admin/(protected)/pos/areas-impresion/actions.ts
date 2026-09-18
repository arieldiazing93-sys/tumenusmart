"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";

export type ResultadoArea = { ok: true } | { ok: false; error: string };

/**
 * Devuelve un resultado en vez de lanzar los errores de validación: Next.js
 * oculta en producción el mensaje de cualquier `throw` que salga de una
 * Server Action, así que el motivo real solo llega si viaja en el retorno.
 * Mismo patrón que estaciones/actions.ts.
 */
export async function crearArea(formData: FormData): Promise<ResultadoArea> {
  await exigirPermiso("pos.gestionarEstaciones");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { ok: false, error: "El nombre es obligatorio" };

  await prisma.areaImpresion.create({ data: { nombre, storeId: idLocal } });
  revalidatePath("/admin/pos/areas-impresion");
  return { ok: true };
}

export async function renombrarArea(id: string, nombre: string): Promise<ResultadoArea> {
  await exigirPermiso("pos.gestionarEstaciones");
  const prisma = prismaDelLocal(await idLocalActual());

  const nombreLimpio = nombre.trim();
  if (!nombreLimpio) return { ok: false, error: "El nombre es obligatorio" };
  await prisma.areaImpresion.update({ where: { id }, data: { nombre: nombreLimpio } });
  revalidatePath("/admin/pos/areas-impresion");
  return { ok: true };
}

export async function alternarActivaArea(id: string, activa: boolean) {
  await exigirPermiso("pos.gestionarEstaciones");
  const prisma = prismaDelLocal(await idLocalActual());

  await prisma.areaImpresion.update({ where: { id }, data: { activa } });
  revalidatePath("/admin/pos/areas-impresion");
}
