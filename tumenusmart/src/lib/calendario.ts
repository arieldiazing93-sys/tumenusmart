// Calendario mensual dependency-free para el panel de Reservas. Las celdas
// se generan como fechas de calendario "puras" (sin pasar por ningún huso
// horario) — para saber qué reservas caen en cada celda se compara contra
// la clave "YYYY-MM-DD" de cada reserva calculada en hora de Asunción
// (ver claveDiaAsuncion en lib/timezone.ts), no acá.

export type MesReservas = { anio: number; mes: number }; // mes: 0-11

export const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export const DIAS_SEMANA = ["L", "M", "X", "J", "V", "S", "D"];

/** Interpreta el querystring `mes=YYYY-MM`, o cae al mes de `claveHoy` (YYYY-MM-DD). */
export function parsearMes(mesParam: string | undefined, claveHoy: string): MesReservas {
  const match = /^(\d{4})-(\d{2})$/.exec(mesParam ?? "");
  if (match) {
    return { anio: Number(match[1]), mes: Number(match[2]) - 1 };
  }
  const [anio, mes] = claveHoy.split("-").map(Number);
  return { anio, mes: mes - 1 };
}

export function claveMes(anio: number, mes: number): string {
  return `${anio}-${String(mes + 1).padStart(2, "0")}`;
}

export function mesAnterior(anio: number, mes: number): MesReservas {
  return mes === 0 ? { anio: anio - 1, mes: 11 } : { anio, mes: mes - 1 };
}

export function mesSiguiente(anio: number, mes: number): MesReservas {
  return mes === 11 ? { anio: anio + 1, mes: 0 } : { anio, mes: mes + 1 };
}

export type CeldaCalendario = { fecha: string; dia: number; enMes: boolean };

function claveUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Suma (o resta, con `dias` negativo) días a una clave "YYYY-MM-DD". */
export function claveSumarDias(clave: string, dias: number): string {
  const [y, m, d] = clave.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Las 7 claves "YYYY-MM-DD" (lunes a domingo) de la semana que contiene `clave`. */
export function diasDeLaSemana(clave: string): string[] {
  const [y, m, d] = clave.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  const diaSemana = (fecha.getUTCDay() + 6) % 7; // 0 = lunes
  const lunes = claveSumarDias(clave, -diaSemana);
  return Array.from({ length: 7 }, (_, i) => claveSumarDias(lunes, i));
}

/** Genera la grilla completa (semanas de lunes a domingo) del mes `mes` (0-11) del `anio`. */
export function construirGrillaMes(anio: number, mes: number): CeldaCalendario[] {
  const primerDia = new Date(Date.UTC(anio, mes, 1));
  const ultimoDia = new Date(Date.UTC(anio, mes + 1, 0));
  const inicioSemana = (primerDia.getUTCDay() + 6) % 7; // 0 = lunes
  const finSemana = (ultimoDia.getUTCDay() + 6) % 7;

  const celdas: CeldaCalendario[] = [];

  for (let i = inicioSemana; i > 0; i--) {
    const d = new Date(Date.UTC(anio, mes, 1 - i));
    celdas.push({ fecha: claveUTC(d), dia: d.getUTCDate(), enMes: false });
  }
  for (let dia = 1; dia <= ultimoDia.getUTCDate(); dia++) {
    const d = new Date(Date.UTC(anio, mes, dia));
    celdas.push({ fecha: claveUTC(d), dia, enMes: true });
  }
  for (let i = 1; i <= 6 - finSemana; i++) {
    const d = new Date(Date.UTC(anio, mes + 1, i));
    celdas.push({ fecha: claveUTC(d), dia: d.getUTCDate(), enMes: false });
  }

  return celdas;
}
