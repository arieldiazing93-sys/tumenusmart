export type FiltroFecha = "hoy" | "ayer" | "7dias" | "30dias" | "mes" | "rango";

function sumarDias(fecha: Date, dias: number): Date {
  const copia = new Date(fecha);
  copia.setDate(copia.getDate() + dias);
  return copia;
}

// Calcula el rango [gte, lt) según el filtro de fecha elegido, usando la
// fecha del servidor tal cual (mismo criterio que ya usa el resto del panel
// admin para mostrar horarios — sin conversión de huso horario).
export function calcularRangoFecha(
  fecha: string | undefined,
  desde: string | undefined,
  hasta: string | undefined
): { gte: Date; lt: Date } | null {
  const ahora = new Date();
  const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());

  switch (fecha as FiltroFecha | undefined) {
    case "hoy":
      return { gte: inicioHoy, lt: sumarDias(inicioHoy, 1) };
    case "ayer":
      return { gte: sumarDias(inicioHoy, -1), lt: inicioHoy };
    case "7dias":
      return { gte: sumarDias(inicioHoy, -6), lt: sumarDias(inicioHoy, 1) };
    case "30dias":
      return { gte: sumarDias(inicioHoy, -29), lt: sumarDias(inicioHoy, 1) };
    case "mes": {
      const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
      const inicioMesSiguiente = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1);
      return { gte: inicioMes, lt: inicioMesSiguiente };
    }
    case "rango": {
      if (!desde || !hasta) return null;
      const inicio = new Date(`${desde}T00:00:00`);
      const fin = new Date(`${hasta}T00:00:00`);
      if (isNaN(inicio.getTime()) || isNaN(fin.getTime())) return null;
      return { gte: inicio, lt: sumarDias(fin, 1) };
    }
    default:
      return null;
  }
}

/** Lista de días (a medianoche) entre gte y lt, uno por cada día del rango. */
export function listarDias(gte: Date, lt: Date): Date[] {
  const dias: Date[] = [];
  let cursor = new Date(gte.getFullYear(), gte.getMonth(), gte.getDate());
  const fin = new Date(lt.getFullYear(), lt.getMonth(), lt.getDate());
  while (cursor < fin) {
    dias.push(new Date(cursor));
    cursor = sumarDias(cursor, 1);
  }
  return dias;
}

export function claveDia(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(
    fecha.getDate()
  ).padStart(2, "0")}`;
}
