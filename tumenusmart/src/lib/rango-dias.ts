/**
 * Rangos de fechas por DÍA ("YYYY-MM-DD"), para los reportes de Compras y de
 * Gastos.
 *
 * La fecha de una compra o de un gasto es el día que el operador puso en el
 * formulario (se guarda a medianoche UTC), no un instante: por eso el rango
 * también se maneja en días, sin horas ni zonas horarias, y ambos extremos
 * entran.
 */

import { claveDiaAsuncion, inicioDeMesEnAsuncion } from "./timezone";

export type RangoDias = { desde: string; hasta: string };

const DIA_MS = 24 * 60 * 60 * 1000;
const FORMATO_DIA = /^\d{4}-\d{2}-\d{2}$/;

function esDiaValido(texto: string | null | undefined): texto is string {
  return !!texto && FORMATO_DIA.test(texto) && !Number.isNaN(Date.parse(texto));
}

/**
 * El rango que pidió la URL. Si falta una fecha (o no es válida) se usa el mes
 * actual en Asunción: del día 1 hasta hoy. Si vienen al revés, se dan vuelta.
 */
export function rangoDeDias(desde?: string | null, hasta?: string | null): RangoDias {
  const ahora = new Date();
  let inicio = esDiaValido(desde) ? desde : claveDiaAsuncion(inicioDeMesEnAsuncion(ahora));
  let fin = esDiaValido(hasta) ? hasta : claveDiaAsuncion(ahora);
  if (inicio > fin) [inicio, fin] = [fin, inicio];
  return { desde: inicio, hasta: fin };
}

/** Los límites para consultar la base: desde el inicio del primer día hasta el fin del último (excluido el siguiente). */
export function limitesDelRango(rango: RangoDias): { gte: Date; lt: Date } {
  return { gte: new Date(rango.desde), lt: new Date(Date.parse(rango.hasta) + DIA_MS) };
}

/** "23/09/2026" — sin correr el día por la zona horaria (las fechas son días, no instantes). */
export function fechaDeDia(fecha: Date): string {
  return fecha.toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}

/** "2026-09-23" → "23/09/2026". */
export function diaEnTexto(dia: string): string {
  const [y, m, d] = dia.split("-");
  return `${d}/${m}/${y}`;
}
