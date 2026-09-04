"use server";

import { localPorSlug, estaSuspendido } from "@/lib/local-por-slug";
import { prisma } from "@/lib/prisma";
import { siguienteNumeroReserva } from "@/lib/prisma-local";
import { fechaAsuncionDesdeTexto, claveDiaAsuncion, horaAsuncion } from "@/lib/timezone";
import { TURNOS, MOTIVOS_RESERVA } from "@/lib/reservas";
import { diasCerrados, diaSemanaDeClave, NOMBRES_DIA } from "@/lib/horario-atencion";
import { motivoSinCupo } from "@/lib/cupos-reserva";

export type DatosReserva = {
  /** de qué local es la reserva, tomado de la URL que visitó el cliente */
  slug: string;
  fecha: string; // "YYYY-MM-DD"
  turno: string;
  horario: string;
  personas: number;
  motivo: string;
  clienteNombre: string;
  clienteTelefono: string;
  clienteEmail?: string;
};

export type ResultadoReserva =
  | { ok: true; reservationId: string }
  | { ok: false; error: string };

/**
 * Devuelve un resultado en vez de lanzar los errores de validación: Next.js
 * oculta en producción el mensaje de cualquier `throw` que salga de una
 * Server Action (lo cambia por un genérico "Server Components render...",
 * por seguridad), así que el motivo real de una reserva rechazada solo
 * llega si viaja en el valor de retorno, no en una excepción.
 */
export async function crearReserva(datos: DatosReserva): Promise<ResultadoReserva> {
  // El local se resuelve en el servidor desde el nombre de la URL.
  const local = await localPorSlug(datos.slug);
  const storeId = local.id;

  if (estaSuspendido(local)) {
    return { ok: false, error: "Este menú no está tomando reservas en este momento." };
  }

  if (!datos.clienteNombre?.trim() || !datos.clienteTelefono?.trim()) {
    return { ok: false, error: "Faltan datos de contacto" };
  }
  if (!TURNOS.some((t) => t.value === datos.turno)) {
    return { ok: false, error: "Turno inválido" };
  }
  if (!datos.horario?.trim()) {
    return { ok: false, error: "Falta seleccionar el horario" };
  }
  if (!datos.personas || datos.personas < 1) {
    return { ok: false, error: "Cantidad de personas inválida" };
  }
  if (!MOTIVOS_RESERVA.some((m) => m.value === datos.motivo)) {
    return { ok: false, error: "Motivo inválido" };
  }

  const fecha = fechaAsuncionDesdeTexto(datos.fecha);
  if (!fecha) return { ok: false, error: "Fecha inválida" };

  // Nada de reservar para atrás: ni un día pasado, ni un horario de hoy
  // que ya transcurrió. Se compara siempre contra el reloj de Asunción.
  const ahora = new Date();
  const hoy = claveDiaAsuncion(ahora);
  if (datos.fecha < hoy) {
    return { ok: false, error: "Esa fecha ya pasó. Elegí una fecha de hoy en adelante." };
  }
  if (datos.fecha === hoy && datos.horario <= horaAsuncion(ahora)) {
    return { ok: false, error: "Ese horario ya pasó. Elegí uno más tarde u otra fecha." };
  }

  // No se acepta una reserva para un día en que el local no abre, aunque el
  // navegador se saltee el aviso del formulario.
  const horariosAtencion = await prisma.horarioAtencion.findMany({ where: { storeId } });
  const cerrados = diasCerrados(horariosAtencion);
  const diaSemana = diaSemanaDeClave(datos.fecha);
  if (diaSemana != null && cerrados.includes(diaSemana)) {
    return {
      ok: false,
      error: `Los ${NOMBRES_DIA[diaSemana].toLowerCase()} el local está cerrado. Elegí otra fecha.`,
    };
  }

  // Chequeo real del cupo. Se hace acá y no solo en el formulario porque
  // dos personas pueden estar reservando el mismo horario al mismo tiempo.
  const sinCupo = await motivoSinCupo(storeId, datos.fecha, datos.horario, datos.personas);
  if (sinCupo) return { ok: false, error: sinCupo };

  // Igual que con los pedidos: el número se toma recién cuando ya pasaron
  // todas las validaciones, para no dejar huecos por reservas rechazadas.
  const numero = await siguienteNumeroReserva(storeId);

  const reserva = await prisma.reservation.create({
    data: {
      storeId,
      numero,
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

  return { ok: true, reservationId: reserva.id };
}
