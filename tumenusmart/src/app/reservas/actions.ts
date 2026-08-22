"use server";

import { prisma } from "@/lib/prisma";
import { fechaAsuncionDesdeTexto } from "@/lib/timezone";
import { TURNOS, MOTIVOS_RESERVA } from "@/lib/reservas";

export type DatosReserva = {
  fecha: string; // "YYYY-MM-DD"
  turno: string;
  horario: string;
  personas: number;
  motivo: string;
  clienteNombre: string;
  clienteTelefono: string;
  clienteEmail?: string;
};

export async function crearReserva(datos: DatosReserva): Promise<{ reservationId: string }> {
  if (!datos.clienteNombre?.trim() || !datos.clienteTelefono?.trim()) {
    throw new Error("Faltan datos de contacto");
  }
  if (!TURNOS.some((t) => t.value === datos.turno)) {
    throw new Error("Turno inválido");
  }
  if (!datos.horario?.trim()) {
    throw new Error("Falta seleccionar el horario");
  }
  if (!datos.personas || datos.personas < 1) {
    throw new Error("Cantidad de personas inválida");
  }
  if (!MOTIVOS_RESERVA.some((m) => m.value === datos.motivo)) {
    throw new Error("Motivo inválido");
  }

  const fecha = fechaAsuncionDesdeTexto(datos.fecha);
  if (!fecha) throw new Error("Fecha inválida");

  const reserva = await prisma.reservation.create({
    data: {
      fecha,
      turno: datos.turno,
      horario: datos.horario,
      personas: datos.personas,
      motivo: datos.motivo,
      clienteNombre: datos.clienteNombre,
      clienteTelefono: datos.clienteTelefono,
      clienteEmail: datos.clienteEmail || null,
    },
  });

  return { reservationId: reserva.id };
}
