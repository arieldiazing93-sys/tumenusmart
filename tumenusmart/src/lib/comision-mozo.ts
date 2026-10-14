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

// ---------------------------------------------------------------------------
//  Pagar la comisión: lo que se le debe al mozo y el pago
// ---------------------------------------------------------------------------

/** Lo que se le debe a un mozo: lo ganado menos lo ya pagado. Nunca negativo (si se pagó de más —una venta se canceló después—, debe 0). */
export function comisionPendiente(ganada: number, pagada: number): number {
  return Math.max(0, Math.round(ganada) - Math.round(pagada));
}

export type PagoDeComisionValido = {
  monto: number;
  /** "YYYY-MM-DD" o null. */
  desde: string | null;
  hasta: string | null;
  nota: string | null;
};

function diaValido(valor: unknown): string | null {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const t = Date.parse(valor);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === valor ? valor : null;
}

/**
 * Comprueba lo que llega del navegador al pagar una comisión: un monto entero de guaraníes mayor a cero que no pase de lo que se le debe
 * al mozo, el período que paga (opcional, "desde" no después de "hasta") y una nota corta. Devuelve el error en palabras, o el pago
 * limpio. Quien lo guarda vuelve a calcular lo que se le debe en el servidor.
 */
export function validarPagoDeComision(
  datos: unknown,
  pendiente: number
): { ok: true; pago: PagoDeComisionValido } | { ok: false; error: string } {
  const d = (datos && typeof datos === "object" ? datos : {}) as Record<string, unknown>;
  const monto = Math.round(Number(d.monto));
  if (!Number.isFinite(monto) || monto <= 0) return { ok: false, error: "El monto a pagar tiene que ser mayor a cero." };
  if (pendiente <= 0) return { ok: false, error: "Ese mozo no tiene comisión pendiente de pago." };
  if (monto > Math.round(pendiente)) {
    return { ok: false, error: "Ese monto es mayor a lo que se le debe al mozo. Revisalo." };
  }

  const desdeEscrito = typeof d.desde === "string" && d.desde.trim() !== "";
  const hastaEscrito = typeof d.hasta === "string" && d.hasta.trim() !== "";
  const desde = desdeEscrito ? diaValido(d.desde) : null;
  const hasta = hastaEscrito ? diaValido(d.hasta) : null;
  if ((desdeEscrito && !desde) || (hastaEscrito && !hasta)) return { ok: false, error: "Una de las fechas del período no es válida." };
  if (desde && hasta && desde > hasta) return { ok: false, error: "El período está al revés: «desde» tiene que ser antes que «hasta»." };

  const nota = String(d.nota ?? "")
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  return { ok: true, pago: { monto, desde, hasta, nota: nota || null } };
}

/** "2026-10-07" → "07/10/2026". */
function diaCorto(dia: string): string {
  const [a, m, d] = dia.split("-");
  return `${d}/${m}/${a}`;
}

/** El período de un pago dicho en palabras ("del 01/10/2026 al 07/10/2026", "desde el 01/10/2026", "hasta el 07/10/2026"), o "" si no tiene. */
export function textoDelPeriodo(desde: string | null | undefined, hasta: string | null | undefined): string {
  if (desde && hasta) return desde === hasta ? `del ${diaCorto(desde)}` : `del ${diaCorto(desde)} al ${diaCorto(hasta)}`;
  if (desde) return `desde el ${diaCorto(desde)}`;
  if (hasta) return `hasta el ${diaCorto(hasta)}`;
  return "";
}
