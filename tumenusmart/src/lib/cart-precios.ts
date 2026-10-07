import type { ItemCarrito } from "./cart-types";
import { calcularPrecioMitadYMitad } from "./mitad-mitad";

/**
 * Pone al día los precios del carrito del cliente con los precios VIGENTES de la carta (ver precios-publicos.ts).
 *
 * El carrito guarda en el teléfono lo que el cliente pidió y a qué precio se lo mostraron. Con precios de promoción ese
 * precio cambia con la hora, así que el carrito no puede quedarse con el de cuando se tocó el producto: cada vez que llegan
 * los precios vigentes, se vuelve a calcular el de cada línea:
 *  - un producto normal: su precio vigente;
 *  - un combo mitad y mitad: el precio de las dos mitades, con el mismo modo (mayor o proporcional) que ya tenía;
 *  - cada agregado elegido: su precio vigente.
 * Lo que ya no está en la carta (se ocultó, se borró) queda con el precio que tenía. Devuelve el mismo arreglo si nada cambió.
 */
export function conPreciosVigentes(
  items: ItemCarrito[],
  precios: Record<string, number> | null,
  descuentos: Record<string, number> | null = null
): ItemCarrito[] {
  if (!precios || items.length === 0) return items;

  let cambio = false;
  const nuevos = items.map((item) => {
    let precioBase = item.precioBase;
    if (item.mitadYMitad) {
      const a = precios[item.mitadYMitad.productIdA];
      const b = precios[item.mitadYMitad.productIdB];
      if (typeof a === "number" && typeof b === "number") {
        precioBase = calcularPrecioMitadYMitad(a, b, item.mitadYMitad.modo);
      }
    } else {
      const p = precios[item.productId];
      if (typeof p === "number") {
        // Una promoción por descuento que rige ahora para este producto: baja el precio del producto (redondeado al guaraní, igual que
        // en el servidor). Los agregados y los combos mitad y mitad no se tocan.
        const d = descuentos?.[item.productId];
        precioBase = typeof d === "number" && d > 0 && d < 100 ? Math.round(p * (1 - d / 100)) : p;
      }
    }

    let opcionesCambiaron = false;
    const opciones = item.opciones.map((o) => {
      const vigente = precios[o.id];
      if (typeof vigente === "number" && vigente !== o.precioExtra) {
        opcionesCambiaron = true;
        return { ...o, precioExtra: vigente };
      }
      return o;
    });

    if (precioBase === item.precioBase && !opcionesCambiaron) return item;
    cambio = true;
    return { ...item, precioBase, opciones: opcionesCambiaron ? opciones : item.opciones };
  });
  return cambio ? nuevos : items;
}
