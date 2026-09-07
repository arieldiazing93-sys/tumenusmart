"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { TURNOS, ESTADOS_RESERVA } from "@/lib/reservas";

/** "" o un número inválido => sin límite (null). */
function parsearCapacidad(valor: FormDataEntryValue | null): number | null {
  const texto = String(valor ?? "").trim();
  if (!texto) return null;
  const numero = parseInt(texto, 10);
  if (isNaN(numero) || numero <= 0) return null;
  return numero;
}

export type ResultadoAccion = { ok: true } | { ok: false; error: string };

/**
 * Devuelve {ok,error} en vez de lanzar: un `throw` que escapa de una Server
 * Action queda con el mensaje real escondido en producción (Next.js lo
 * cambia por un genérico "Application error"), así que quien carga el
 * horario nunca se enteraría de si el problema fue el turno o la hora.
 */
export async function crearHorario(formData: FormData): Promise<ResultadoAccion> {
  await exigirPermiso("reservas.gestionar");
  // La clave compuesta necesita el local escrito, así que acá se pide aparte.
  const storeId = await idLocalActual();
  const prisma = prismaDelLocal(storeId);

  const turno = String(formData.get("turno") ?? "");
  const hora = String(formData.get("hora") ?? "").trim();
  const capacidadPersonas = parsearCapacidad(formData.get("capacidadPersonas"));

  if (!TURNOS.some((t) => t.value === turno)) return { ok: false, error: "Turno inválido" };
  if (!hora) return { ok: false, error: "Falta el horario" };

  await prisma.horarioReserva.upsert({
    // La clave ahora incluye el local: dos negocios pueden tener el mismo
    // horario de las 20:00 sin pisarse entre sí.
    where: { storeId_turno_hora: { storeId, turno, hora } },
    update: { activo: true, capacidadPersonas },
    create: { storeId, turno, hora, capacidadPersonas },
  });

  revalidatePath("/admin/reservas/horarios");
  return { ok: true };
}

export async function actualizarCapacidadHorario(
  id: string,
  capacidad: number | null
): Promise<void> {
  await exigirPermiso("reservas.gestionar");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  await prisma.horarioReserva.update({
    where: { id },
    data: { capacidadPersonas: capacidad && capacidad > 0 ? capacidad : null },
  });

  revalidatePath("/admin/reservas/horarios");
  revalidatePath("/admin/reservas");
}

export async function eliminarHorario(id: string) {
  await exigirPermiso("reservas.gestionar");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  await prisma.horarioReserva.delete({ where: { id } });
  revalidatePath("/admin/reservas/horarios");
}

export async function actualizarEstadoReserva(
  id: string,
  estado: string
): Promise<ResultadoAccion> {
  await exigirPermiso("reservas.gestionar");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  if (!ESTADOS_RESERVA.some((e) => e.value === estado)) {
    return { ok: false, error: "Estado inválido" };
  }
  await prisma.reservation.update({ where: { id }, data: { estado } });
  revalidatePath("/admin/reservas");
  return { ok: true };
}

export async function actualizarNotaReserva(id: string, nota: string) {
  await exigirPermiso("reservas.gestionar");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  await prisma.reservation.update({ where: { id }, data: { nota: nota.trim() || null } });
  revalidatePath("/admin/reservas");
}
