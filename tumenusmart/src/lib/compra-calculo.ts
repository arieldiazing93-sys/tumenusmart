/**
 * Los números de una compra: subtotales por línea, descuentos, IVA y total.
 *
 * Pura y sin Prisma, igual que precio-pedido.ts: la usa el formulario para
 * mostrar los totales mientras se carga, y la usa el servidor para calcular
 * los que de verdad se guardan — el navegador nunca decide cuánto vale una
 * compra.
 *
 * Convención (la de una factura de compra en Paraguay): el costo unitario se
 * trabaja NETO, sin IVA. El descuento de línea baja el neto de esa línea; el
 * descuento general baja el neto de todas; el IVA se calcula sobre el neto ya
 * descontado y se suma al final. El total es lo que hay que pagar.
 *
 * El operador puede cargar el costo tal cual lo dice la factura del proveedor,
 * con el IVA adentro (`costoIncluyeIva`): acá se le saca el impuesto para
 * llegar al neto, así nadie tiene que hacer esa cuenta a mano.
 */

import { TASAS_IVA } from "./iva";

export type LineaParaCalcular = {
  cantidad: number;
  /** Costo de UNA unidad de compra. Sin IVA, salvo que `costoIncluyeIva` sea true. */
  costoUnitario: number;
  /** true si `costoUnitario` ya trae el IVA del insumo adentro. */
  costoIncluyeIva?: boolean;
  /** 0–100. Vacío o inválido cuenta como 0. */
  descuentoPorcentaje: number;
  /** "gravado10" | "gravado5" | "exento" — ver src/lib/iva.ts. */
  iva: string;
};

export type LineaCalculada = {
  /** cantidad × costo, con el descuento de LÍNEA aplicado; sin IVA. */
  subtotal: number;
  /** Costo unitario sin IVA y sin descuentos — lo que se guarda en CompraItem.costoUnitario. */
  costoUnitarioNeto: number;
  /** Costo unitario + IVA, sin descuentos — la columna informativa. */
  costoUnitarioConImpuesto: number;
  /** Lo que de verdad cuesta cada unidad: neto, con los dos descuentos. */
  costoUnitarioEfectivo: number;
};

export type ResultadoCalculoCompra = {
  lineas: LineaCalculada[];
  /** Suma de subtotales de línea, antes del descuento general. */
  subtotal: number;
  /** Lo que baja el descuento general. */
  descuentoGeneral: number;
  /** Neto final: subtotal - descuentoGeneral. */
  neto: number;
  iva: number;
  /** neto + iva: lo que hay que pagar. */
  total: number;
};

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

function porcentajeValido(valor: number): number {
  if (!Number.isFinite(valor) || valor < 0) return 0;
  return valor > 100 ? 100 : valor;
}

function porcentajeIva(iva: string): number {
  return TASAS_IVA.find((t) => t.valor === iva)?.porcentaje ?? 10;
}

export function calcularCompra(
  lineas: LineaParaCalcular[],
  descuentoGeneralPorcentaje: number
): ResultadoCalculoCompra {
  const descG = porcentajeValido(descuentoGeneralPorcentaje);
  const factorGeneral = 1 - descG / 100;

  let subtotal = 0;
  let neto = 0;
  let iva = 0;

  const calculadas = lineas.map((l) => {
    const cantidad = Number.isFinite(l.cantidad) && l.cantidad > 0 ? l.cantidad : 0;
    const costo = Number.isFinite(l.costoUnitario) && l.costoUnitario > 0 ? l.costoUnitario : 0;
    const descL = porcentajeValido(l.descuentoPorcentaje);
    const pct = porcentajeIva(l.iva);

    // Sin redondear: 10.000 con IVA son 9.090,909… de neto, y redondearlo
    // antes de multiplicar por la cantidad arrastraría el error a cada compra.
    const costoNeto = l.costoIncluyeIva ? costo / (1 + pct / 100) : costo;

    const subtotalLinea = redondear(cantidad * costoNeto * (1 - descL / 100));
    const netoLinea = subtotalLinea * factorGeneral;

    subtotal += subtotalLinea;
    neto += netoLinea;
    iva += (netoLinea * pct) / 100;

    return {
      subtotal: subtotalLinea,
      costoUnitarioNeto: redondear(costoNeto),
      costoUnitarioConImpuesto: l.costoIncluyeIva ? redondear(costo) : redondear(costo * (1 + pct / 100)),
      costoUnitarioEfectivo: redondear(costoNeto * (1 - descL / 100) * factorGeneral),
    };
  });

  const subtotalFinal = redondear(subtotal);
  const netoFinal = redondear(neto);
  const ivaFinal = redondear(iva);

  return {
    lineas: calculadas,
    subtotal: subtotalFinal,
    descuentoGeneral: redondear(subtotalFinal - netoFinal),
    neto: netoFinal,
    iva: ivaFinal,
    total: redondear(netoFinal + ivaFinal),
  };
}
