/**
 * El horario general de trabajo de la Reserva de turnos: qué días se atiende,
 * de qué hora a qué hora y el descanso del medio.
 *
 * Puro (sin Prisma) para usarlo igual desde el editor del navegador, desde la
 * acción que guarda y desde el calendario: lo que el editor marca como error,
 * lo que el servidor rechaza y lo que el calendario sombrea salen todos de acá.
 */

/** Un día del horario. `diaSemana`: 0 = domingo, 1 = lunes … 6 = sábado. */
export type HorarioDia = {
  diaSemana: number;
  trabaja: boolean;
  /** "HH:MM" */
  inicio: string;
  fin: string;
  descansa: boolean;
  descansoInicio: string;
  descansoFin: string;
};

/** La semana como la lee la gente: lunes primero, domingo al final. */
export const DIAS_HORARIO = [
  { diaSemana: 1, nombre: "Lunes" },
  { diaSemana: 2, nombre: "Martes" },
  { diaSemana: 3, nombre: "Miércoles" },
  { diaSemana: 4, nombre: "Jueves" },
  { diaSemana: 5, nombre: "Viernes" },
  { diaSemana: 6, nombre: "Sábado" },
  { diaSemana: 0, nombre: "Domingo" },
] as const;

export function nombreDeDia(diaSemana: number): string {
  return DIAS_HORARIO.find((d) => d.diaSemana === diaSemana)?.nombre ?? "";
}

/** Lo que se muestra mientras nadie configuró nada: lunes a sábado de 9 a 18 con descanso de 13 a 14, y domingo cerrado. */
export function horarioPorDefecto(): HorarioDia[] {
  return DIAS_HORARIO.map((d) => ({
    diaSemana: d.diaSemana,
    trabaja: d.diaSemana !== 0,
    inicio: "09:00",
    fin: "18:00",
    descansa: d.diaSemana !== 0,
    descansoInicio: "13:00",
    descansoFin: "14:00",
  }));
}

/** Los siete días en orden de semana; los que falten se completan con el horario por defecto. */
export function completarHorario(filas: HorarioDia[]): HorarioDia[] {
  const porDefecto = horarioPorDefecto();
  return porDefecto.map((base) => filas.find((f) => f.diaSemana === base.diaSemana) ?? base);
}

const FORMATO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "09:30" sí; "9:30", "24:00" y "09:60" no. */
export function esHoraValida(valor: unknown): valor is string {
  return typeof valor === "string" && FORMATO_HORA.test(valor);
}

/** "13:30" → 810. */
export function aMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Lo que está mal en un día, o null si está bien. Un día apagado no se revisa:
 * sus horas no se usan.
 */
export function errorDeDia(d: HorarioDia): string | null {
  if (!d.trabaja) return null;
  const nombre = nombreDeDia(d.diaSemana);
  if (![d.inicio, d.fin].every(esHoraValida)) return `${nombre}: completá la hora de inicio y la de fin.`;
  if (aMinutos(d.fin) <= aMinutos(d.inicio)) {
    return `${nombre}: la hora de fin tiene que ser después de la de inicio.`;
  }
  if (!d.descansa) return null;
  if (![d.descansoInicio, d.descansoFin].every(esHoraValida)) {
    return `${nombre}: completá la hora de inicio y la de fin del descanso.`;
  }
  if (aMinutos(d.descansoFin) <= aMinutos(d.descansoInicio)) {
    return `${nombre}: el descanso tiene que terminar después de empezar.`;
  }
  if (aMinutos(d.descansoInicio) < aMinutos(d.inicio) || aMinutos(d.descansoFin) > aMinutos(d.fin)) {
    return `${nombre}: el descanso tiene que quedar dentro del horario de trabajo.`;
  }
  return null;
}

/** El primer error de la semana, o null si está todo bien. */
export function validarHorario(dias: HorarioDia[]): string | null {
  for (const d of dias) {
    const error = errorDeDia(d);
    if (error) return error;
  }
  return null;
}

// ---------------------------------------------------------------------------
//  Para el calendario
// ---------------------------------------------------------------------------

/**
 * Desde qué hora y hasta cuál se trabaja en la semana (en minutos, a horas
 * enteras), para que el calendario dibuje exactamente ese tramo. null si no se
 * trabaja ningún día.
 */
export function rangoDelHorario(horarios: HorarioDia[]): { inicio: number; fin: number } | null {
  const abiertos = horarios.filter((h) => h.trabaja && esHoraValida(h.inicio) && esHoraValida(h.fin));
  if (abiertos.length === 0) return null;
  return {
    inicio: Math.floor(Math.min(...abiertos.map((h) => aMinutos(h.inicio))) / 60) * 60,
    fin: Math.ceil(Math.max(...abiertos.map((h) => aMinutos(h.fin))) / 60) * 60,
  };
}

/** Un tramo del día que el calendario sombrea: fuera del horario ("cerrado") o el descanso. */
export type Franja = { desde: number; hasta: number; tipo: "cerrado" | "descanso" };

/**
 * Los tramos sombreados de un día dentro de lo que dibuja el calendario
 * (`rango`, en minutos). Sin horario configurado para ese día no hay nada que
 * sombrear.
 */
export function franjasDelDia(h: HorarioDia | undefined, rango: { inicio: number; fin: number }): Franja[] {
  if (!h) return [];
  if (!h.trabaja) return [{ desde: rango.inicio, hasta: rango.fin, tipo: "cerrado" }];

  const franjas: Franja[] = [];
  const inicio = aMinutos(h.inicio);
  const fin = aMinutos(h.fin);
  if (inicio > rango.inicio) franjas.push({ desde: rango.inicio, hasta: Math.min(inicio, rango.fin), tipo: "cerrado" });
  if (fin < rango.fin) franjas.push({ desde: Math.max(fin, rango.inicio), hasta: rango.fin, tipo: "cerrado" });
  if (h.descansa) {
    const desde = Math.max(aMinutos(h.descansoInicio), rango.inicio);
    const hasta = Math.min(aMinutos(h.descansoFin), rango.fin);
    if (hasta > desde) franjas.push({ desde, hasta, tipo: "descanso" });
  }
  return franjas;
}
