/**
 * Qué horas se pueden reservar en la página pública: las reglas, en limpio.
 *
 * Puro (sin Prisma ni reloj propio: la hora de "ahora" entra como dato) para
 * poder probarlo con casos reales. Lo usan la pantalla de elegir día y hora, la
 * acción que calcula las horas libres y la que crea la cita, así las tres dicen
 * siempre lo mismo.
 *
 * Todo en minutos desde la medianoche, en hora de Asunción.
 */

import { diaDeLaSemana } from "./agenda";
import { claveSumarDias } from "./calendario";
import { aMinutos, esHoraValida, type HorarioDia } from "./horario-trabajo";

/** De cuánto en cuánto se ofrecen las horas: 09:00, 09:15, 09:30… */
export const PASO_MIN = 15;

/** Con cuánta anticipación mínima se puede pedir un turno para hoy. */
export const ANTICIPACION_MIN = 30;

/** Hasta cuántos días adelante se puede reservar (contando hoy). */
export const DIAS_ADELANTE = 60;

/**
 * Un turno pedido por la web que todavía no se confirmó por WhatsApp (y por eso
 * no se ve en el calendario) reserva el horario solo este rato: es lo que tiene el
 * cliente para tocar "Enviar por WhatsApp". Pasado ese tiempo la reserva se cancela
 * (se borra) y el horario queda libre para otro cliente: una reserva que el negocio
 * nunca vio no puede quedar ocupando un turno.
 */
export const MINUTOS_BLOQUEO_SIN_CONFIRMAR = 5;

/** Un tramo ya ocupado de un día. `hasta` incluye el tiempo de búfer del turno. */
export type Ocupado = { desde: number; hasta: number };

/** Los tramos en que se atiende un día (el descanso lo parte en dos), en minutos. */
export function tramosDeTrabajo(h: HorarioDia | undefined): { desde: number; hasta: number }[] {
  if (!h || !h.trabaja || !esHoraValida(h.inicio) || !esHoraValida(h.fin)) return [];
  const inicio = aMinutos(h.inicio);
  const fin = aMinutos(h.fin);
  if (fin <= inicio) return [];

  if (h.descansa && esHoraValida(h.descansoInicio) && esHoraValida(h.descansoFin)) {
    const di = aMinutos(h.descansoInicio);
    const df = aMinutos(h.descansoFin);
    if (df > di && di >= inicio && df <= fin) {
      return [
        { desde: inicio, hasta: di },
        { desde: df, hasta: fin },
      ].filter((t) => t.hasta > t.desde);
    }
  }
  return [{ desde: inicio, hasta: fin }];
}

/**
 * Las horas de inicio libres de un día para un servicio de `duracion` minutos.
 *
 * Una hora sirve si el servicio entra entero en un tramo de trabajo (no puede
 * pisar el descanso ni pasarse del cierre), no es antes de `minutoMinimo` y ni el
 * servicio ni su búfer pisan un turno ya tomado. El búfer sí puede quedar pasado
 * el cierre: es solo tiempo de limpieza.
 */
export function horasLibres(datos: {
  horario: HorarioDia | undefined;
  ocupados: Ocupado[];
  duracion: number;
  buffer: number;
  /** Nada antes de este minuto (para hoy: la hora de ahora más la anticipación). */
  minutoMinimo: number;
}): number[] {
  const { horario, ocupados, duracion, buffer, minutoMinimo } = datos;
  if (duracion <= 0) return [];
  const libres: number[] = [];
  for (const tramo of tramosDeTrabajo(horario)) {
    for (let inicio = tramo.desde; inicio + duracion <= tramo.hasta; inicio += PASO_MIN) {
      if (inicio < minutoMinimo) continue;
      const finConBufer = inicio + duracion + buffer;
      if (ocupados.some((o) => inicio < o.hasta && finConBufer > o.desde)) continue;
      libres.push(inicio);
    }
  }
  return libres;
}

/**
 * Las horas libres de cada día de los próximos `DIAS_ADELANTE` días, para un
 * profesional: `{ "2026-09-25": [540, 555, …] }`. Los días sin ninguna hora libre
 * (cerrado, todo ocupado, ya pasó) no aparecen.
 */
export function horasDelPeriodo(datos: {
  /** Los siete días del horario de trabajo. */
  horarios: HorarioDia[];
  /** Lo ya ocupado de ese profesional, por día ("YYYY-MM-DD"). */
  ocupadosPorDia: Map<string, Ocupado[]>;
  duracion: number;
  buffer: number;
  /** "YYYY-MM-DD" de hoy en Asunción. */
  hoy: string;
  /** La hora de ahora, en minutos desde la medianoche de hoy. */
  minutosAhora: number;
}): Record<string, number[]> {
  const salida: Record<string, number[]> = {};
  for (let i = 0; i < DIAS_ADELANTE; i++) {
    const dia = claveSumarDias(datos.hoy, i);
    const horario = datos.horarios.find((h) => h.diaSemana === diaDeLaSemana(dia));
    const libres = horasLibres({
      horario,
      ocupados: datos.ocupadosPorDia.get(dia) ?? [],
      duracion: datos.duracion,
      buffer: datos.buffer,
      minutoMinimo: i === 0 ? minutoMinimoDeHoy(datos.minutosAhora) : 0,
    });
    if (libres.length > 0) salida[dia] = libres;
  }
  return salida;
}

/** El primer minuto reservable de hoy: ahora más la anticipación, redondeado hacia arriba al paso. */
export function minutoMinimoDeHoy(minutosAhora: number): number {
  return Math.ceil((minutosAhora + ANTICIPACION_MIN) / PASO_MIN) * PASO_MIN;
}

export type MomentoDelDia = "manana" | "tarde" | "noche";

/** Mañana hasta las 12, tarde hasta las 18, noche el resto. */
export function momentoDelDia(minutos: number): MomentoDelDia {
  if (minutos < 12 * 60) return "manana";
  if (minutos < 18 * 60) return "tarde";
  return "noche";
}
