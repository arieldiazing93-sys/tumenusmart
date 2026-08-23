"use server";

import { revalidatePath } from "next/cache";
import { idLocalActual } from "@/lib/local-actual";
import { prisma } from "@/lib/prisma";
import { TURNOS, ESTADOS_RESERVA } from "@/lib/reservas";

/** "" o un número inválido => sin límite (null). */
function parsearCapacidad(valor: FormDataEntryValue | null): number | null {
  const texto = String(valor ?? "").trim();
  if (!texto) return null;
  const numero = parseInt(texto, 10);
  if (isNaN(numero) || numero <= 0) return null;
  return numero;
}

export async function crearHorario(formData: FormData) {
  const turno = String(formData.get("turno") ?? "");
  const hora = String(formData.get("hora") ?? "").trim();
  const capacidadPersonas = parsearCapacidad(formData.get("capacidadPersonas"));

  if (!TURNOS.some((t) => t.value === turno)) throw new Error("Turno inválido");
  if (!hora) throw new Error("Falta el horario");

  const storeId = await idLocalActual();
  await prisma.horarioReserva.upsert({
    // La clave ahora incluye el local: dos negocios pueden tener el mismo
    // horario de las 20:00 sin pisarse entre sí.
    where: { storeId_turno_hora: { storeId, turno, hora } },
    update: { activo: true, capacidadPersonas },
    create: { storeId, turno, hora, capacidadPersonas },
  });

  revalidatePath("/admin/reservas/horarios");
  revalidatePath("/reservas");
}

export async function actualizarCapacidadHorario(
  id: string,
  capacidad: number | null
): Promise<void> {
  await prisma.horarioReserva.update({
    where: { id },
    data: { capacidadPersonas: capacidad && capacidad > 0 ? capacidad : null },
  });

  revalidatePath("/admin/reservas/horarios");
  revalidatePath("/admin/reservas");
  revalidatePath("/reservas");
}

export async function eliminarHorario(id: string) {
  await prisma.horarioReserva.delete({ where: { id } });
  revalidatePath("/admin/reservas/horarios");
  revalidatePath("/reservas");
}

export async function actualizarEstadoReserva(id: string, estado: string) {
  if (!ESTADOS_RESERVA.some((e) => e.value === estado)) throw new Error("Estado inválido");
  await prisma.reservation.update({ where: { id }, data: { estado } });
  revalidatePath("/admin/reservas");
}

export async function actualizarNotaReserva(id: string, nota: string) {
  await prisma.reservation.update({ where: { id }, data: { nota: nota.trim() || null } });
  revalidatePath("/admin/reservas");
}
