import { diaSemanaAsuncion, horaAsuncion } from "./timezone";

// Índice = número de día tal como lo devuelve diaSemanaAsuncion().
export const NOMBRES_DIA = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

// Orden en que se muestran los días en el panel (semana arrancando el lunes,
// que es como lo piensa un negocio, aunque internamente 0 sea domingo).
export const DIAS_ORDENADOS = [1, 2, 3, 4, 5, 6, 0];

export type TramoHorario = { diaSemana: number; abre: string; cierra: string };

export type EstadoAtencion = {
  abierto: boolean;
  /** Texto listo para mostrar, ej: "hoy a las 18:00" o "el Martes a las 11:00". */
  proximaApertura: string | null;
};

/** "HH:MM" -> minutos desde la medianoche. */
function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** minutos desde la medianoche -> "HH:MM". */
function aTexto(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Decide si el local está abierto ahora mismo según sus tramos de horario.
 *
 * Reglas:
 * - Sin ningún tramo cargado, se considera SIEMPRE ABIERTO. Así un negocio
 *   que todavía no configuró nada sigue vendiendo igual que antes.
 * - Un día sin tramos = cerrado ese día (ej: cierra los lunes).
 * - Si `cierra` es menor que `abre`, el tramo cruza la medianoche
 *   (ej: 19:00-01:00) y se toma en cuenta también en la madrugada siguiente.
 */
export function calcularEstadoAtencion(
  tramos: TramoHorario[],
  ahora: Date = new Date()
): EstadoAtencion {
  if (tramos.length === 0) return { abierto: true, proximaApertura: null };

  const hoy = diaSemanaAsuncion(ahora);
  const minutosAhora = aMinutos(horaAsuncion(ahora));

  // ¿Algún tramo de HOY nos contiene?
  for (const t of tramos.filter((x) => x.diaSemana === hoy)) {
    const abre = aMinutos(t.abre);
    const cierra = aMinutos(t.cierra);
    const cruzaMedianoche = cierra <= abre;
    if (cruzaMedianoche ? minutosAhora >= abre : minutosAhora >= abre && minutosAhora < cierra) {
      return { abierto: true, proximaApertura: null };
    }
  }

  // ¿Venimos arrastrando un tramo de AYER que cruzó la medianoche?
  const ayer = (hoy + 6) % 7;
  for (const t of tramos.filter((x) => x.diaSemana === ayer)) {
    const abre = aMinutos(t.abre);
    const cierra = aMinutos(t.cierra);
    if (cierra <= abre && minutosAhora < cierra) {
      return { abierto: true, proximaApertura: null };
    }
  }

  // Cerrado. Se busca la próxima apertura mirando hasta 7 días hacia adelante.
  for (let salto = 0; salto <= 7; salto++) {
    const dia = (hoy + salto) % 7;
    const aperturas = tramos
      .filter((t) => t.diaSemana === dia)
      .map((t) => aMinutos(t.abre))
      // Para hoy solo cuentan las aperturas que todavía no pasaron.
      .filter((m) => salto > 0 || m > minutosAhora)
      .sort((a, b) => a - b);

    if (aperturas.length > 0) {
      const cuando =
        salto === 0 ? "hoy" : salto === 1 ? "mañana" : `el ${NOMBRES_DIA[dia]}`;
      return { abierto: false, proximaApertura: `${cuando} a las ${aTexto(aperturas[0])}` };
    }
  }

  return { abierto: false, proximaApertura: null };
}

/**
 * Días de la semana en los que el local no abre nunca (no tienen ningún
 * tramo cargado). Se usa para no dejar reservar una mesa un día cerrado.
 * Con la agenda vacía devuelve [] — ningún día bloqueado.
 */
export function diasCerrados(tramos: TramoHorario[]): number[] {
  if (tramos.length === 0) return [];
  const conHorario = new Set(tramos.map((t) => t.diaSemana));
  return [0, 1, 2, 3, 4, 5, 6].filter((d) => !conHorario.has(d));
}

/** Día de la semana (0 = domingo) de una fecha de calendario "YYYY-MM-DD". */
export function diaSemanaDeClave(clave: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clave);
  if (!match) return null;
  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  ).getUTCDay();
}

/** Resumen legible de los tramos de un día, ej: "11:00 a 14:00 · 18:00 a 23:30". */
export function resumenDia(tramos: TramoHorario[], diaSemana: number): string {
  const delDia = tramos
    .filter((t) => t.diaSemana === diaSemana)
    .sort((a, b) => aMinutos(a.abre) - aMinutos(b.abre));
  if (delDia.length === 0) return "Cerrado";
  return delDia.map((t) => `${t.abre} a ${t.cierra}`).join(" · ");
}
