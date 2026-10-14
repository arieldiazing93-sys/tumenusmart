/**
 * La comisión del mozo (Servicio comedor): un porcentaje de lo que se cobra en las cuentas que tiene a cargo.
 *
 * Es como la comisión de producto del personal de la agenda (Cita / MiembroPersonal), pero el mozo solo cobra por PRODUCTOS: lo que
 * en la carta está marcado como servicio no cuenta. La base es lo que valen los productos de la cuenta con su parte del descuento
 * general restada (si a la cuenta se le descontó el 10 %, la comisión se calcula sobre el 90 %). El porcentaje y la base quedan
 * congelados en la cuenta al cobrarla (CuentaMesa.comisionMozoPorcentaje / comisionMozoBase): cambiarle el porcentaje al mozo después
 * no mueve lo que ya ganó.
 *
 * Lógica pura, sin base de datos: se prueba con todos los casos (prueba-comision-mozo.js).
 */

/** El porcentaje que escribió el dueño: vacío o 0 = sin comisión; de 0,01 a 100 con hasta dos decimales (acepta coma o punto). */
export function leerPorcentajeDeComision(texto: unknown): { ok: true; valor: number | null } | { ok: false; error: string } {
  const t = String(texto ?? "").trim().replace(",", ".");
  if (t === "") return { ok: true, valor: null };
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) {
    return { ok: false, error: "La comisión es un porcentaje de 0 a 100 (por ejemplo 5 o 7,5)." };
  }
  const valor = Number(t);
  if (valor > 100) return { ok: false, error: "La comisión no puede pasar del 100 %." };
  return { ok: true, valor: valor === 0 ? null : valor };
}

/**
 * Sobre cuánto se calcula la comisión: lo que valen los productos de la cuenta (sin los servicios) menos la parte del descuento
 * general que les toca, en guaraníes enteros. Cada línea es precio por cantidad; `descuento` es el monto descontado a toda la cuenta.
 */
export function baseDeComision(
  lineas: { productId: string | null; precioUnitario: number; cantidad: number }[],
  esServicio: (productId: string) => boolean,
  descuento: number
): number {
  let subtotal = 0;
  let productos = 0;
  for (const l of lineas) {
    const monto = l.precioUnitario * l.cantidad;
    subtotal += monto;
    // Un combo mitad y mitad (sin producto único) es comida: cuenta como producto.
    if (!(l.productId && esServicio(l.productId))) productos += monto;
  }
  if (subtotal <= 0 || productos <= 0) return 0;
  const parteDelDescuento = Math.max(0, descuento) * (productos / subtotal);
  return Math.max(0, Math.round(productos - parteDelDescuento));
}

/** Lo que gana el mozo: base × porcentaje ÷ 100, al guaraní. */
export function montoDeComision(base: number, porcentaje: number): number {
  return Math.round((base * porcentaje) / 100);
}
