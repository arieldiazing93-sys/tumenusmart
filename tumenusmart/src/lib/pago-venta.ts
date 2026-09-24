/**
 * El pago de una venta del mostrador, que puede dividirse entre varias formas
 * (50.000 en efectivo + 50.000 con débito).
 *
 * Acá adentro no hay base de datos: valida lo que manda el navegador y arma el
 * texto para mostrar. Lo importan la Server Action que cobra y las pantallas,
 * por eso no toca Prisma.
 */

import {
  FORMAS_PAGO_POS,
  FORMA_PAGO_A_CREDITO,
  FORMA_PAGO_MIXTO,
  esVentaACredito,
  etiquetaFormaPagoPos,
  type FormaPagoPos,
} from "./turno-pos";
import { formatearGuarani } from "./format";

/** Más formas que esto en una misma cuenta ya no es un cobro real: es un error de carga. */
export const MAX_PAGOS_POR_VENTA = 5;

/** Una parte del cobro tal como la manda la pantalla de venta. */
export type PagoCobro = { forma: FormaPagoPos | typeof FORMA_PAGO_A_CREDITO; monto: number };

export type ResultadoPagos =
  | {
      ok: true;
      pagos: PagoCobro[];
      /** Lo que se guarda en VentaPos.formaPago: la forma única, o "mixto". */
      formaPago: string;
    }
  | { ok: false; error: string };

const FORMAS_VALIDAS = new Set<string>([...FORMAS_PAGO_POS.map((f) => f.valor), FORMA_PAGO_A_CREDITO]);

function redondear2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Valida cómo se paga una venta contra el total que calculó el SERVIDOR.
 *
 * - Una sola forma: cobra el total completo; el monto que mande el navegador se
 *   ignora (no hay nada que "no coincida").
 * - Varias: cada monto tiene que ser mayor a cero y la suma tiene que dar
 *   exactamente el total. "A crédito" no se combina: es una venta que todavía
 *   no se cobró, no una forma de cobro.
 */
export function validarPagosDeVenta(entrada: unknown, total: number): ResultadoPagos {
  if (!Array.isArray(entrada) || entrada.length === 0) {
    return { ok: false, error: "Elegí cómo paga el cliente." };
  }
  if (entrada.length > MAX_PAGOS_POR_VENTA) {
    return { ok: false, error: `Como mucho ${MAX_PAGOS_POR_VENTA} formas de pago por cuenta.` };
  }

  const pagos: PagoCobro[] = [];
  for (const crudo of entrada) {
    const p = (crudo ?? {}) as { forma?: unknown; monto?: unknown };
    const forma = String(p.forma ?? "").trim().toLowerCase();
    if (!FORMAS_VALIDAS.has(forma)) {
      return { ok: false, error: "Una de las formas de pago no es válida." };
    }
    pagos.push({ forma: forma as PagoCobro["forma"], monto: Number(p.monto) });
  }

  if (pagos.length === 1) {
    return { ok: true, pagos: [{ forma: pagos[0].forma, monto: redondear2(total) }], formaPago: pagos[0].forma };
  }

  if (pagos.some((p) => esVentaACredito(p.forma))) {
    return { ok: false, error: "Una venta a crédito no se combina con otras formas de pago." };
  }
  if (pagos.some((p) => !Number.isFinite(p.monto) || p.monto <= 0)) {
    return { ok: false, error: "Cada forma de pago tiene que tener un monto mayor a cero." };
  }

  const redondeados = pagos.map((p) => ({ forma: p.forma, monto: redondear2(p.monto) }));
  const suma = redondear2(redondeados.reduce((s, p) => s + p.monto, 0));
  if (Math.abs(suma - redondear2(total)) > 0.005) {
    return {
      ok: false,
      error: `Los montos suman ${formatearGuarani(suma)} y la cuenta es de ${formatearGuarani(total)}. Revisalos.`,
    };
  }

  const formas = new Set(redondeados.map((p) => p.forma));
  return { ok: true, pagos: redondeados, formaPago: formas.size === 1 ? redondeados[0].forma : FORMA_PAGO_MIXTO };
}

/**
 * "Efectivo Gs. 50.000 + Tarjeta débito Gs. 50.000", para mostrar cómo se pagó.
 * Con una sola forma devuelve solo su nombre (sin el monto, que ya es el total).
 */
export function detallePagos(pagos: { forma: string; monto: number | string }[]): string {
  if (pagos.length === 0) return "";
  if (pagos.length === 1) return etiquetaFormaPagoPos(pagos[0].forma);
  return pagos.map((p) => `${etiquetaFormaPagoPos(p.forma)} ${formatearGuarani(p.monto)}`).join(" + ");
}

/**
 * El pedazo de `where` para filtrar ventas por forma de pago (lista, PDF y
 * Excel de Cuentas). Una forma concreta trae toda venta con ALGUNA parte pagada
 * así: una dividida entre efectivo y débito sale tanto en "Efectivo" como en
 * "Tarjeta débito". "mixto" trae las divididas. Sin forma, no filtra.
 */
export function filtroPorFormaPago(formaPago: string | null | undefined) {
  if (!formaPago) return {};
  if (formaPago === FORMA_PAGO_MIXTO) return { formaPago: FORMA_PAGO_MIXTO };
  return { pagos: { some: { forma: formaPago } } };
}

/** Cuánto de una venta se cobró con una forma concreta (0 si no se usó). */
export function montoCobradoConForma(
  pagos: { forma: string; monto: number | string }[],
  forma: string
): number {
  return pagos.filter((p) => p.forma === forma).reduce((s, p) => s + Number(p.monto), 0);
}
