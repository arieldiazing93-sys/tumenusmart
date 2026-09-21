/**
 * Unidad de medida de un producto o agregado de Paraguay.
 *
 * Mismo espíritu que src/lib/iva.ts: hoy nadie más lo consume, pero
 * centralizarlo acá evita que el formulario de producto y la futura API de
 * factura electrónica (SIFEN, vía un tercero — no se desarrolla acá) usen
 * dos catálogos distintos. Cada ítem de una factura electrónica en Paraguay
 * necesita su código de unidad de medida oficial.
 *
 * Códigos verificados contra el XSD oficial de la Tabla 5 (Codificación de
 * Unidades de Medida) de SIFEN:
 * https://ekuatia.set.gov.py/sifen/xsd/Unidades_Medida_v141.xsd
 */

export type UnidadMedida = "unidad" | "kilogramo" | "litro";

export const UNIDADES_MEDIDA: { valor: UnidadMedida; etiqueta: string; codigoSifen: number }[] = [
  { valor: "unidad", etiqueta: "Unidad", codigoSifen: 77 },
  { valor: "kilogramo", etiqueta: "Kilogramo", codigoSifen: 83 },
  { valor: "litro", etiqueta: "Litro", codigoSifen: 89 },
];

/** Cualquier valor raro (o vacío) cae en "unidad" — el más común en gastronomía. */
export function normalizarUnidadMedida(valor: unknown): UnidadMedida {
  const texto = String(valor ?? "");
  return UNIDADES_MEDIDA.some((u) => u.valor === texto) ? (texto as UnidadMedida) : "unidad";
}

export function etiquetaUnidadMedida(valor: string): string {
  return UNIDADES_MEDIDA.find((u) => u.valor === valor)?.etiqueta ?? "Unidad";
}
