/**
 * Tasas de IVA de Paraguay para un producto de carta.
 *
 * Base para el desglose de la futura Factura Autoimpresor — por ahora nadie
 * más lo consume, pero centralizarlo acá evita que el formulario de
 * producto y (más adelante) el armado de la factura terminen con dos listas
 * de valores distintas.
 */

export type TasaIva = "gravado10" | "gravado5" | "exento";

export const TASAS_IVA: { valor: TasaIva; etiqueta: string; porcentaje: number }[] = [
  { valor: "gravado10", etiqueta: "Gravado 10%", porcentaje: 10 },
  { valor: "gravado5", etiqueta: "Gravado 5%", porcentaje: 5 },
  { valor: "exento", etiqueta: "Exento", porcentaje: 0 },
];

/** Cualquier valor raro (o vacío) cae en "gravado10" — el más común en gastronomía. */
export function normalizarIva(valor: unknown): TasaIva {
  const texto = String(valor ?? "");
  return TASAS_IVA.some((t) => t.valor === texto) ? (texto as TasaIva) : "gravado10";
}

export function etiquetaIva(valor: string): string {
  return TASAS_IVA.find((t) => t.valor === valor)?.etiqueta ?? "Gravado 10%";
}
