"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { TURNOS, ESTADOS_RESERVA } from "@/lib/reservas";

export async function crearHorario(formData: FormData) {
  const turno = String(formData.get("turno") ?? "");
  const hora = String(formData.get("hora") ?? "").trim();

  if (!TURNOS.some((t) => t.value === turno)) throw new Error("Turno inválido");
  if (!hora) throw new Error("Falta el horario");

  await prisma.horarioReserva.upsert({
    where: { turno_hora: { turno, hora } },
    update: { activo: true },
    create: { turno, hora },
  });

  revalidatePath("/admin/reservas/horarios");
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
