/**
 * Lo que necesita la reserva de canchas para consultar la base: las canchas del complejo, su horario y lo que ya está
 * reservado.
 *
 * Esto corre en el servidor y SIN sesión cuando lo usa la página pública (el cliente no tiene cuenta), así que cada
 * consulta lleva el local explícito: el local sale de la dirección de la página, nunca de algo que mande el navegador.
 * El panel lo usa con el mismo local de su sesión.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { partesLocales } from "./agenda";
import { claveSumarDias } from "./calendario";
import {
  completarHorarioCanchas,
  horasPorDuracion,
  limpiarDuraciones,
  normalizarDeporte,
  normalizarPaso,
  type CanchaPublica,
} from "./canchas";
import { DIAS_ADELANTE, MINUTOS_BLOQUEO_SIN_CONFIRMAR, type Ocupado } from "./disponibilidad";
import type { HorarioDia } from "./horario-trabajo";
import { claveDiaAsuncion, fechaAsuncionDesdeTexto } from "./timezone";

type Db = PrismaClient | Prisma.TransactionClient;

/** Las canchas activas del complejo, en el orden en que las acomodó el dueño (con `ids`, solo esas). */
export async function cargarCanchasPublicas(db: Db, storeId: string, ids?: string[]): Promise<CanchaPublica[]> {
  const filas = await db.cancha.findMany({
    where: { storeId, activa: true, ...(ids ? { id: { in: ids } } : {}) },
    orderBy: [{ orden: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  return filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    deporte: normalizarDeporte(f.deporte),
    superficie: f.superficie,
    techada: f.techada,
    descripcion: f.descripcion,
    fotoUrl: f.fotoUrl,
    precioHora: Number(f.precioHora),
    precioNocturnoHora: f.precioNocturnoHora == null ? null : Number(f.precioNocturnoHora),
    nocheDesde: f.nocheDesde,
    duraciones: limpiarDuraciones(f.duraciones),
    pasoMin: normalizarPaso(f.pasoMin),
  }));
}

/** El horario del complejo, con los siete días (los que no se guardaron salen con el horario por defecto). */
export async function cargarHorarioCanchas(db: Db, storeId: string): Promise<HorarioDia[]> {
  const filas = await db.horarioCanchas.findMany({
    where: { storeId },
    select: {
      diaSemana: true,
      trabaja: true,
      inicio: true,
      fin: true,
      descansa: true,
      descansoInicio: true,
      descansoFin: true,
    },
  });
  return completarHorarioCanchas(filas);
}

/**
 * Cancela (borra) las reservas de la web que el cliente no confirmó a tiempo con el aviso por WhatsApp.
 *
 * Con la entrada al calendario "al enviar el aviso", una reserva nace oculta y solo se ve cuando el cliente toca
 * "Enviar por WhatsApp". Si no lo toca dentro de MINUTOS_BLOQUEO_SIN_CONFIRMAR no queda nada a medias: se borra, así no
 * ocupa un horario que otro cliente podría reservar ni cuenta para el freno de reservas pendientes.
 */
export async function limpiarReservasCanchaSinEnviar(db: Db, storeId: string, ahora: Date): Promise<void> {
  const limite = new Date(ahora.getTime() - MINUTOS_BLOQUEO_SIN_CONFIRMAR * 60_000);
  await db.reservaCancha.deleteMany({
    where: { storeId, origen: "web", visible: false, createdAt: { lt: limite } },
  });
}

/**
 * Los tramos ocupados de cada cancha, por día. Cuentan las reservas que no están canceladas ni con inasistencia y que
 * ya se ven en el calendario o se pidieron hace poco (una reserva web sin confirmar reserva el horario un rato).
 */
export async function ocupadosPorCancha(
  db: Db,
  storeId: string,
  canchaIds: string[],
  hoy: string,
  ahora: Date
): Promise<Map<string, Map<string, Ocupado[]>>> {
  const desde = fechaAsuncionDesdeTexto(hoy) as Date;
  const hasta = fechaAsuncionDesdeTexto(claveSumarDias(hoy, DIAS_ADELANTE + 1)) as Date;
  const limiteSinConfirmar = new Date(ahora.getTime() - MINUTOS_BLOQUEO_SIN_CONFIRMAR * 60_000);

  const reservas = await db.reservaCancha.findMany({
    where: {
      storeId,
      canchaId: { in: canchaIds },
      inicio: { gte: desde, lt: hasta },
      estado: { notIn: ["cancelada", "no_asistio"] },
      OR: [{ visible: true }, { createdAt: { gt: limiteSinConfirmar } }],
    },
    select: { canchaId: true, inicio: true, fin: true },
  });

  const porCancha = new Map<string, Map<string, Ocupado[]>>();
  for (const r of reservas) {
    const i = partesLocales(r.inicio);
    const f = partesLocales(r.fin);
    // Una reserva que termina a la medianoche termina "al día siguiente a las 00:00": cuenta hasta el fin del día.
    const hastaMin = f.dia === i.dia ? f.minutos : 24 * 60;
    const porDia = porCancha.get(r.canchaId) ?? new Map<string, Ocupado[]>();
    const lista = porDia.get(i.dia) ?? [];
    lista.push({ desde: i.minutos, hasta: hastaMin });
    porDia.set(i.dia, lista);
    porCancha.set(r.canchaId, porDia);
  }
  return porCancha;
}

/**
 * Las horas libres de cada cancha para cada una de sus duraciones, en los próximos días:
 * `canchaId → { 60: { "2026-09-25": [1080, 1110, …] }, 90: {…} }`.
 */
export async function disponibilidadDeCanchas(
  db: Db,
  storeId: string,
  canchas: CanchaPublica[],
  ahora: Date
): Promise<Map<string, Record<number, Record<string, number[]>>>> {
  const hoy = claveDiaAsuncion(ahora);
  const minutosAhora = partesLocales(ahora).minutos;
  const [horarios, ocupados] = await Promise.all([
    cargarHorarioCanchas(db, storeId),
    ocupadosPorCancha(
      db,
      storeId,
      canchas.map((c) => c.id),
      hoy,
      ahora
    ),
  ]);

  const salida = new Map<string, Record<number, Record<string, number[]>>>();
  for (const cancha of canchas) {
    salida.set(
      cancha.id,
      horasPorDuracion({
        horarios,
        ocupadosPorDia: ocupados.get(cancha.id) ?? new Map<string, Ocupado[]>(),
        duraciones: cancha.duraciones,
        paso: cancha.pasoMin,
        hoy,
        minutosAhora,
      })
    );
  }
  return salida;
}
