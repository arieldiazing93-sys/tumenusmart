/**
 * Movimientos de almacén: una entrada o una salida de un insumo que NO viene de
 * una compra ni de una venta — un insumo que se echó a perder, una botella que
 * se rompió, lo que consume el personal, algo que se recibe sin compra.
 *
 * Cada movimiento sube o baja el stock del insumo en ese almacén y queda en el
 * historial del insumo (MovimientoStock, tipo "movimiento") con su motivo. Acá
 * solo están los motivos, puros y sin base de datos, para que los use igual el
 * formulario y el servidor.
 */

export type TipoMovimientoAlmacen = "entrada" | "salida";

export type MotivoMovimiento = { valor: string; etiqueta: string };

export const MOTIVOS_SALIDA: MotivoMovimiento[] = [
  { valor: "vencido", etiqueta: "Se venció" },
  { valor: "echado_a_perder", etiqueta: "Se echó a perder" },
  { valor: "rotura", etiqueta: "Se rompió o se cayó" },
  { valor: "consumo_personal", etiqueta: "Consumo del personal" },
  { valor: "cortesia", etiqueta: "Cortesía o muestra" },
  { valor: "devolucion_proveedor", etiqueta: "Devolución al proveedor" },
  { valor: "otro", etiqueta: "Otro motivo" },
];

export const MOTIVOS_ENTRADA: MotivoMovimiento[] = [
  { valor: "sin_compra", etiqueta: "Recibido sin compra (donación, regalo)" },
  { valor: "devolucion", etiqueta: "Devolución" },
  { valor: "produccion", etiqueta: "Producción propia" },
  { valor: "correccion", etiqueta: "Corrección de un error" },
  { valor: "otro", etiqueta: "Otro motivo" },
];

export function motivosDe(tipo: TipoMovimientoAlmacen): MotivoMovimiento[] {
  return tipo === "entrada" ? MOTIVOS_ENTRADA : MOTIVOS_SALIDA;
}

/**
 * El texto del concepto que queda en el historial: el motivo elegido y, si se
 * escribió, el detalle. Devuelve null si el motivo no es de ese tipo, o si es
 * "Otro motivo" y no se escribió el detalle (en ese caso el detalle ES el motivo).
 */
export function conceptoDelMovimiento(tipo: TipoMovimientoAlmacen, motivo: string, detalle: string): string | null {
  const elegido = motivosDe(tipo).find((m) => m.valor === motivo);
  if (!elegido) return null;
  const extra = detalle.trim();
  if (elegido.valor === "otro") return extra ? extra : null;
  return extra ? `${elegido.etiqueta} — ${extra}` : elegido.etiqueta;
}
