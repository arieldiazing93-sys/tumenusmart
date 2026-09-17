"use server";

import { cookies } from "next/headers";
import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { COOKIE_ESTACION } from "@/lib/estacion-actual";

export type ResultadoEstacion = { ok: true } | { ok: false; error: string };

/**
 * Devuelve un resultado en vez de lanzar los errores de validación: Next.js
 * oculta en producción el mensaje de cualquier `throw` que salga de una
 * Server Action, así que el motivo real solo llega si viaja en el retorno.
 */
export async function crearEstacion(formData: FormData): Promise<ResultadoEstacion> {
  await exigirPermiso("pos.gestionarEstaciones");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { ok: false, error: "El nombre es obligatorio" };

  await prisma.estacion.create({ data: { nombre, storeId: idLocal } });
  revalidatePath("/admin/pos/estaciones");
  return { ok: true };
}

export async function renombrarEstacion(id: string, nombre: string): Promise<ResultadoEstacion> {
  await exigirPermiso("pos.gestionarEstaciones");
  const prisma = prismaDelLocal(await idLocalActual());

  const nombreLimpio = nombre.trim();
  if (!nombreLimpio) return { ok: false, error: "El nombre es obligatorio" };
  await prisma.estacion.update({ where: { id }, data: { nombre: nombreLimpio } });
  revalidatePath("/admin/pos/estaciones");
  return { ok: true };
}

export async function alternarActivaEstacion(id: string, activa: boolean) {
  await exigirPermiso("pos.gestionarEstaciones");
  const prisma = prismaDelLocal(await idLocalActual());

  await prisma.estacion.update({ where: { id }, data: { activa } });
  revalidatePath("/admin/pos/estaciones");
}

/**
 * Vincula ESTE navegador (el de la computadora física desde la que se hace
 * clic) a una estación, guardando el id en una cookie de larga duración.
 *
 * De acá en más, cualquier cajero que abra el panel desde esa notebook
 * opera bajo esta estación — sin elegir nada. Ver `estacionActual` en
 * src/lib/estacion-actual.ts.
 */
export async function vincularEstacion(estacionId: string): Promise<ResultadoEstacion> {
  await exigirPermiso("pos.gestionarEstaciones");
  const prisma = prismaDelLocal(await idLocalActual());

  const estacion = await prisma.estacion.findFirst({ where: { id: estacionId, activa: true } });
  if (!estacion) return { ok: false, error: "Esa estación no existe o está desactivada." };

  (await cookies()).set(COOKIE_ESTACION, estacionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 400, // ~400 días, el máximo real que respetan los navegadores
    path: "/",
  });
  return { ok: true };
}
