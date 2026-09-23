/**
 * Categorías de gasto — mismo criterio que src/lib/iva.ts o unidad-medida.ts:
 * una lista chica y fija, con whitelist en la Server Action.
 */

export const CATEGORIAS_GASTO = [
  { valor: "alquiler", etiqueta: "Alquiler" },
  { valor: "servicios", etiqueta: "Servicios" },
  { valor: "sueldos", etiqueta: "Sueldos" },
  { valor: "insumos", etiqueta: "Insumos" },
  { valor: "otros", etiqueta: "Otros" },
] as const;

export function normalizarCategoriaGasto(valor: unknown): string {
  const texto = String(valor ?? "otros");
  return CATEGORIAS_GASTO.some((c) => c.valor === texto) ? texto : "otros";
}

export function etiquetaCategoriaGasto(valor: string): string {
  return CATEGORIAS_GASTO.find((c) => c.valor === valor)?.etiqueta ?? "Otros";
}
