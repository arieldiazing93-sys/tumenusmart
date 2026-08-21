export type ModoPrecioMitad = "mayor" | "proporcional";

/**
 * Precio de un producto armado "mitad y mitad" a partir de los precios
 * completos de cada mitad.
 * - "mayor": se cobra el precio completo del más caro de los dos (no la
 *   suma de las mitades).
 * - "proporcional": se cobra la mitad del precio de cada uno, sumadas.
 */
export function calcularPrecioMitadYMitad(
  precioA: number,
  precioB: number,
  modo: ModoPrecioMitad
): number {
  if (modo === "proporcional") return precioA / 2 + precioB / 2;
  return Math.max(precioA, precioB);
}
