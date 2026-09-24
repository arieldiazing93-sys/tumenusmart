import { claveDiaAsuncion, ZONA_NEGOCIO } from "./timezone";

/**
 * El mes de un comprobante, en hora de Asunción. Puro y sin base de datos: lo
 * usa el servidor para exigir la confirmación y la pantalla para mostrar la
 * alerta, así los dos dicen siempre lo mismo.
 *
 * Un comprobante de un mes que ya terminó es de un mes que probablemente ya se
 * presentó en Marangatú (el registro de comprobantes RG 90 es mensual): anularlo
 * después ya no se refleja en lo que se informó a la DNIT.
 */

/** "2026-09" — el mes (año y número) de un instante, en Asunción. */
export function mesDeComprobante(fecha: Date): string {
  return claveDiaAsuncion(fecha).slice(0, 7);
}

/** true si el comprobante es de un mes anterior al actual (Asunción). */
export function esDeMesAnterior(fecha: Date, ahora: Date = new Date()): boolean {
  return mesDeComprobante(fecha) < mesDeComprobante(ahora);
}

/** "septiembre de 2026" */
export function nombreDelMes(fecha: Date): string {
  return new Intl.DateTimeFormat("es-PY", { month: "long", year: "numeric", timeZone: ZONA_NEGOCIO }).format(fecha);
}
