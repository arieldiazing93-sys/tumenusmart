import {
  inicioDeHoyEnAsuncion,
  inicioDeMesEnAsuncion,
  inicioDeMesSiguienteEnAsuncion,
  fechaAsuncionDesdeTexto,
  instanteAsuncionDesdeTexto,
  claveDiaAsuncion,
} from "./timezone";

export type FiltroFecha =
  | "hoy"
  | "ayer"
  | "7dias"
  | "30dias"
  | "45dias"
  | "60dias"
  | "mes"
  | "mesAnterior"
  | "rango";

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
    case "45dias":
      return { gte: sumarDias(inicioHoy, -44), lt: sumarDias(inicioHoy, 1) };
    case "60dias":
      return { gte: sumarDias(inicioHoy, -59), lt: sumarDias(inicioHoy, 1) };
    case "mes":
      return { gte: inicioDeMesEnAsuncion(ahora), lt: inicioDeMesSiguienteEnAsuncion(ahora) };
    case "mesAnterior": {
      const inicioMesActual = inicioDeMesEnAsuncion(ahora);
      // Cualquier día del mes de atrás alcanza como referencia — se usa el
      // último día del mes anterior, que es el día justo antes de hoy-1.
      const unDiaDelMesAnterior = sumarDias(inicioMesActual, -1);
      return { gte: inicioDeMesEnAsuncion(unDiaDelMesAnterior), lt: inicioMesActual };
    }
    case "rango": {
      if (!desde || !hasta) return null;
      // Cada extremo puede venir como "YYYY-MM-DD" (input type=date, un día
      // entero) o "YYYY-MM-DDTHH:MM" (input type=datetime-local, un instante
      // exacto) — se detecta por la "T" y cada uno se resuelve con la función
      // que le corresponde, así ambos formatos conviven en el mismo filtro.
      const conHora = (texto: string) => texto.includes("T");

      const inicio = conHora(desde)
        ? instanteAsuncionDesdeTexto(desde)
        : fechaAsuncionDesdeTexto(desde);
      if (!inicio) return null;

      if (conHora(hasta)) {
        const fin = instanteAsuncionDesdeTexto(hasta);
        if (!fin) return null;
        return { gte: inicio, lt: fin };
      }
      const fin = fechaAsuncionDesdeTexto(hasta);
      if (!fin) return null;
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
