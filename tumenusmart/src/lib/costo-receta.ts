/**
 * El costo de un producto sale de su receta: lo que cuesta cada insumo que
 * lleva, por la cantidad que lleva. Así el costo se mantiene solo — cada
 * compra actualiza el costo del insumo (ver Insumo.costoUnitario), y con él el
 * de todo lo que lo usa — sin que nadie lo tenga que cargar a mano.
 *
 * Pura y sin Prisma, igual que precio-pedido.ts: recibe los Decimal como
 * vengan (número, texto u objeto) y devuelve números.
 */

type Monto = number | string | { toString(): string };

/** Una línea de receta con el costo de su insumo ya traído (por unidad de stock). */
export type LineaRecetaConCosto = {
  cantidad: Monto;
  insumo: { costoUnitario: Monto | null };
};

function aNumero(valor: Monto): number {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  const n = parseFloat(String(valor));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Cuánto cuesta preparar UNA unidad, según la receta. Null si no hay receta,
 * o si a algún insumo todavía le falta el costo (nunca se compró): sumar solo
 * los que sí tienen costo daría un número que parece exacto y no lo es.
 */
export function costoDeReceta(receta: LineaRecetaConCosto[] | null | undefined): number | null {
  if (!receta || receta.length === 0) return null;
  let total = 0;
  for (const linea of receta) {
    if (linea.insumo.costoUnitario == null) return null;
    total += aNumero(linea.cantidad) * aNumero(linea.insumo.costoUnitario);
  }
  return Math.round(total * 100) / 100;
}

/**
 * El costo que se usa para un producto: el de su receta si se puede calcular,
 * y si no, el que tenía cargado a mano (Product.costo, de antes de que el
 * formulario dejara de pedirlo). Null si no hay ninguno de los dos.
 */
export function costoDelProducto(
  costoManual: Monto | null | undefined,
  receta: LineaRecetaConCosto[] | null | undefined
): number | null {
  const deReceta = costoDeReceta(receta);
  if (deReceta != null) return deReceta;
  return costoManual != null ? aNumero(costoManual) : null;
}
