/**
 * Descuento general de una venta de mostrador.
 *
 * Puro a propósito (sin base de datos, sin nada de servidor): lo usa la
 * pantalla del POS para mostrar el total con el descuento puesto, y lo usa
 * `registrarVenta` para calcularlo de verdad. Con la misma función en los dos
 * lados, lo que el cajero ve es exactamente lo que se cobra.
 *
 * Es un descuento sobre TODA la cuenta, no por producto. Se puede pedir como
 * porcentaje ("10 %") o como monto fijo en guaraníes ("5.000"); en los dos
 * casos el resultado es un monto entero de guaraníes.
 */

export type DescuentoPedido = { tipo: "porcentaje" | "monto"; valor: number };

export type ResultadoDescuento =
  | {
      ok: true;
      /** Guaraníes enteros a restar. 0 = no hay descuento. */
      monto: number;
      /** El porcentaje pedido (hasta 2 decimales), solo si se pidió así y el monto no quedó en 0. */
      porcentaje: number | null;
    }
  | { ok: false; error: string };

/**
 * Calcula el descuento sobre un subtotal.
 *
 * Sin pedido, o con valor 0, no hay descuento (no es un error: el campo puede
 * estar tildado y vacío mientras el cajero todavía escribe). Nunca puede
 * llegar al total: una venta gratis no es un descuento, y una factura de
 * cero guaraníes no se puede emitir.
 */
export function calcularDescuento(
  subtotal: number,
  pedido: DescuentoPedido | null | undefined
): ResultadoDescuento {
  if (!pedido) return { ok: true, monto: 0, porcentaje: null };

  const valor = Number(pedido.valor);
  if (!Number.isFinite(valor) || valor < 0) {
    return { ok: false, error: "El descuento no es un número válido." };
  }
  if (valor === 0) return { ok: true, monto: 0, porcentaje: null };

  if (pedido.tipo === "porcentaje") {
    // Dos decimales como máximo: es lo que se guarda y lo que se imprime.
    const porcentaje = Math.round(valor * 100) / 100;
    if (porcentaje >= 100) return { ok: false, error: "El descuento tiene que ser menor al 100 %." };
    const monto = Math.round((subtotal * porcentaje) / 100);
    if (monto >= subtotal) return { ok: false, error: "El descuento tiene que ser menor al total de la venta." };
    return { ok: true, monto, porcentaje: monto > 0 ? porcentaje : null };
  }

  const monto = Math.round(valor);
  if (monto >= subtotal) return { ok: false, error: "El descuento tiene que ser menor al total de la venta." };
  return { ok: true, monto, porcentaje: null };
}

/**
 * Qué fracción de lo que suman los ítems se cobró de verdad.
 *
 * Los ítems de una venta guardan su precio SIN descuento (así el ticket
 * muestra lo que se pidió), y `total` es lo cobrado, ya con el descuento
 * restado. Para los reportes que suman por producto, cada ítem se multiplica
 * por este factor y así el descuento se reparte en proporción entre todos.
 * Sin descuento, 1.
 */
export function factorDeDescuento(total: number, descuento: number): number {
  const bruto = total + descuento;
  return descuento > 0 && bruto > 0 ? total / bruto : 1;
}

/** "10", "12,5" — un porcentaje tal como se imprime (sin ceros de más). */
export function textoPorcentaje(valor: number): string {
  return String(valor).replace(".", ",");
}
