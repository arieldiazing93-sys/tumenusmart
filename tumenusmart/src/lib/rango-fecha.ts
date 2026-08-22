import {
  inicioDeHoyEnAsuncion,
  inicioDeMesEnAsuncion,
  inicioDeMesSiguienteEnAsuncion,
  fechaAsuncionDesdeTexto,
  claveDiaAsuncion,
} from "./timezone";

export type FiltroFecha = "hoy" | "ayer" | "7dias" | "30dias" | "mes" | "rango";

function sumarDias(fecha: Date, dias: number): Date {
  return new Date(fecha.getTime() + dias * 24 * 60 * 60 * 1000);
}

// Calcula el rango [gte, lt) según el filtro de fecha elegido, usando el
// calendario de Asunción (Paraguay) — no el huso horario del servidor.
export function calcularRangoFecha(
  fecha: string | undefined,
  desde: string | undefined,
  hasta: string | undefined
): { gte: Date; lt: Date } | null {
  const ahora = new Date();
  const inicioHoy = inicioDeHoyEnAsuncion(ahora);

  switch (fecha as FiltroFecha | undefined) {
    case "hoy":
      return { gte: inicioHoy, lt: sumarDias(inicioHoy, 1) };
    case "ayer":
      return { gte: sumarDias(inicioHoy, -1), lt: inicioHoy };
    case "7dias":
      return { gte: sumarDias(inicioHoy, -6), lt: sumarDias(inicioHoy, 1) };
    case "30dias":
      return { gte: sumarDias(inicioHoy, -29), lt: sumarDias(inicioHoy, 1) };
    case "mes":
      return { gte: inicioDeMesEnAsuncion(ahora), lt: inicioDeMesSiguienteEnAsuncion(ahora) };
    case "rango": {
      if (!desde || !hasta) return null;
      const inicio = fechaAsuncionDesdeTexto(desde);
      const fin = fechaAsuncionDesdeTexto(hasta);
      if (!inicio || !fin) return null;
      return { gte: inicio, lt: sumarDias(fin, 1) };
    }
    default:
      return null;
  }
}

/** Lista de días (medianoche en Asunción) entre gte y lt, uno por día. */
export function listarDias(gte: Date, lt: Date): Date[] {
  const dias: Date[] = [];
  let cursor = gte;
  while (cursor < lt) {
    dias.push(cursor);
    cursor = sumarDias(cursor, 1);
  }
  return dias;
}

export function claveDia(fecha: Date): string {
  return claveDiaAsuncion(fecha);
}
