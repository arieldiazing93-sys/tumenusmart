/**
 * Servicio comedor — las propinas de los mozos.
 *
 * Una propina es plata que el cliente deja al pagar la cuenta de una mesa y que es del mozo. La que se deja en efectivo se la
 * lleva el mozo y NO se carga en ningún lado. La que se deja con tarjeta o transferencia entra al negocio (por el POS de las
 * tarjetas o a su cuenta), así que el mozo no puede cobrarla directo: se carga acá, se acumula a nombre del mozo y el negocio se
 * la paga después en efectivo desde la caja, como un retiro de caja. No es una venta: no suma a lo vendido ni al IVA.
 *
 * Código sin base de datos ni pantalla.
 */

/** Las formas en que se puede dejar una propina que se cargue: todas menos efectivo (no se carga) y crédito (no es plata del cliente). */
export const FORMAS_PROPINA = [
  { valor: "tarjeta_debito", etiqueta: "Tarjeta débito" },
  { valor: "tarjeta_credito", etiqueta: "Tarjeta crédito" },
  { valor: "transferencia", etiqueta: "Transferencia" },
] as const;

export type FormaPropina = (typeof FORMAS_PROPINA)[number]["valor"];

export function etiquetaFormaPropina(forma: string): string {
  return FORMAS_PROPINA.find((f) => f.valor === forma)?.etiqueta ?? forma;
}

/** Lo máximo que se acepta de una propina: el doble de la cuenta (una propina más grande que eso es casi seguro un error de tipeo). */
export const MULTIPLO_MAXIMO_PROPINA = 2;

export type DatosPropina = { monto: number; forma: string; mozoId: string };

export type PropinaValida = { monto: number; forma: FormaPropina; mozoId: string };

/**
 * Comprueba lo que llega del navegador: un monto entero de guaraníes mayor a cero (no más del doble de la cuenta), una forma de la
 * lista y un mozo. Devuelve el error en palabras, o la propina limpia. Quien la guarda vuelve a comprobar que el mozo sea del local.
 */
export function validarPropina(
  datos: unknown,
  totalDeLaCuenta: number
): { ok: true; propina: PropinaValida } | { ok: false; error: string } {
  const d = (datos && typeof datos === "object" ? datos : {}) as Record<string, unknown>;
  const monto = Math.round(Number(d.monto));
  if (!Number.isFinite(monto) || monto <= 0) return { ok: false, error: "El monto de la propina tiene que ser mayor a cero." };
  if (monto > Math.max(totalDeLaCuenta * MULTIPLO_MAXIMO_PROPINA, 1)) {
    return { ok: false, error: "Esa propina es demasiado grande para esta cuenta: revisá el monto." };
  }
  const forma = FORMAS_PROPINA.find((f) => f.valor === d.forma)?.valor;
  if (!forma) return { ok: false, error: "Elegí cómo pagó la propina el cliente (tarjeta o transferencia)." };
  const mozoId = typeof d.mozoId === "string" ? d.mozoId : "";
  if (!mozoId) return { ok: false, error: "Elegí a qué mozo le corresponde la propina." };
  return { ok: true, propina: { monto, forma, mozoId } };
}
