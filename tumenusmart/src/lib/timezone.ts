// Todo el negocio corre en un solo huso horario por ahora: Asunción,
// Paraguay. Centralizar esto acá permite mostrar y filtrar horarios en la
// hora real del local, sin importar en qué huso horario corra el servidor
// (Vercel corre en UTC, así que sin esto los horarios se ven corridos).
export const ZONA_NEGOCIO = "America/Asuncion";

/** Diferencia (en minutos) entre `zona` y UTC, en el instante `fecha`. */
function offsetMinutos(zona: string, fecha: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const partes: Record<string, string> = {};
  for (const p of dtf.formatToParts(fecha)) {
    if (p.type !== "literal") partes[p.type] = p.value;
  }
  const comoUTC = Date.UTC(
    Number(partes.year),
    Number(partes.month) - 1,
    Number(partes.day),
    Number(partes.hour),
    Number(partes.minute),
    Number(partes.second)
  );
  return Math.round((comoUTC - fecha.getTime()) / 60000);
}

/** Medianoche de "hoy" en Asunción, como instante UTC real. */
export function inicioDeHoyEnAsuncion(referencia: Date = new Date()): Date {
  const offset = offsetMinutos(ZONA_NEGOCIO, referencia);
  const desplazada = new Date(referencia.getTime() + offset * 60000);
  return new Date(
    Date.UTC(desplazada.getUTCFullYear(), desplazada.getUTCMonth(), desplazada.getUTCDate()) -
      offset * 60000
  );
}

/** Primer día del mes actual en Asunción, como instante UTC real. */
export function inicioDeMesEnAsuncion(referencia: Date = new Date()): Date {
  const offset = offsetMinutos(ZONA_NEGOCIO, referencia);
  const desplazada = new Date(referencia.getTime() + offset * 60000);
  return new Date(
    Date.UTC(desplazada.getUTCFullYear(), desplazada.getUTCMonth(), 1) - offset * 60000
  );
}

/** Primer día del mes siguiente al actual en Asunción, como instante UTC real. */
export function inicioDeMesSiguienteEnAsuncion(referencia: Date = new Date()): Date {
  const offset = offsetMinutos(ZONA_NEGOCIO, referencia);
  const desplazada = new Date(referencia.getTime() + offset * 60000);
  return new Date(
    Date.UTC(desplazada.getUTCFullYear(), desplazada.getUTCMonth() + 1, 1) - offset * 60000
  );
}

/** Convierte una fecha "YYYY-MM-DD" (como la de un <input type="date">, en
 * hora de Asunción) al instante UTC real de esa medianoche. */
export function fechaAsuncionDesdeTexto(texto: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const aproximada = new Date(Date.UTC(y, m - 1, d));
  const offset = offsetMinutos(ZONA_NEGOCIO, aproximada);
  return new Date(Date.UTC(y, m - 1, d) - offset * 60000);
}

/** Clave "YYYY-MM-DD" del día que corresponde a `instanteUTC`, en Asunción. */
export function claveDiaAsuncion(instanteUTC: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_NEGOCIO }).format(instanteUTC);
}

const DIAS_EN_INGLES: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Día de la semana en Asunción: 0 = domingo, 1 = lunes ... 6 = sábado. */
export function diaSemanaAsuncion(fecha: Date = new Date()): number {
  const nombre = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA_NEGOCIO,
    weekday: "short",
  }).format(fecha);
  return DIAS_EN_INGLES[nombre] ?? 0;
}

/** Hora del reloj en Asunción, en formato "HH:MM" de 24 horas. */
export function horaAsuncion(fecha: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONA_NEGOCIO,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(fecha);
}

/**
 * Convierte "YYYY-MM-DDTHH:MM" (lo que da un <input type="datetime-local">,
 * escrito en hora de Asunción) al instante UTC real.
 *
 * Hace falta para el cierre de repartidores: el dueño escribe "29/08 18:00"
 * pensando en su reloj, y el servidor de Vercel corre en UTC. Sin esta
 * traducción, filtrar "desde las 18" en Paraguay traería los pedidos desde
 * las 15, y el cierre mostraría entregas de otro turno.
 */
export function instanteAsuncionDesdeTexto(texto: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(texto);
  if (!m) return null;
  const [, y, mes, d, h, min] = m.map(Number) as unknown as number[];
  const aproximada = new Date(Date.UTC(y, mes - 1, d, h, min));
  const offset = offsetMinutos(ZONA_NEGOCIO, aproximada);
  return new Date(Date.UTC(y, mes - 1, d, h, min) - offset * 60000);
}

/** "YYYY-MM-DDTHH:MM" de un instante, en hora de Asunción (para los inputs). */
export function textoLocalDesdeInstante(instante: Date): string {
  const p: Record<string, string> = {};
  for (const parte of new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_NEGOCIO,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instante)) {
    if (parte.type !== "literal") p[parte.type] = parte.value;
  }
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
