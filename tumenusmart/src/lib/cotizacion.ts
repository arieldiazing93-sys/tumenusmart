import { calcularDescuento, type DescuentoPedido } from "./descuento-venta";
import { desglosarIva } from "./factura-pos";
import { normalizarIva, type TasaIva } from "./iva";

/**
 * Los números de un presupuesto: importe de cada línea, descuento, total e IVA.
 *
 * Puro y sin base de datos: lo usa el formulario para mostrar los totales
 * mientras se arma, lo usa el servidor para calcular los que de verdad se
 * guardan, y lo usa el documento (PDF) para mostrar el desglose. El navegador
 * nunca decide cuánto vale un presupuesto.
 *
 * Los precios llevan IVA incluido (como en la carta y en las facturas): el
 * total es lo que paga el cliente y el IVA se muestra aparte, ya contenido.
 */

export type LineaCotizacion = {
  cantidad: number;
  /** De UNA unidad, con IVA. */
  precioUnitario: number;
  iva: string;
};

export type ResultadoCotizacion =
  | {
      ok: true;
      /** El importe de cada línea (cantidad × precio, en guaraníes enteros). */
      importes: number[];
      subtotal: number;
      /** Guaraníes a restar (0 = sin descuento). */
      descuento: number;
      /** Solo si el descuento se pidió en porcentaje. */
      descuentoPorcentaje: number | null;
      total: number;
      /** IVA contenido en el total, por tasa (guaraníes enteros). */
      iva10: number;
      iva5: number;
      /** Lo que está exento de IVA (ya con el descuento repartido). */
      exento: number;
    }
  | { ok: false; error: string };

export function importeDeLinea(l: LineaCotizacion): number {
  const cantidad = Number.isFinite(l.cantidad) && l.cantidad > 0 ? l.cantidad : 0;
  const precio = Number.isFinite(l.precioUnitario) && l.precioUnitario > 0 ? l.precioUnitario : 0;
  return Math.round(cantidad * precio);
}

export function calcularCotizacion(
  lineas: LineaCotizacion[],
  descuentoPedido: DescuentoPedido | null | undefined
): ResultadoCotizacion {
  const importes = lineas.map(importeDeLinea);
  const subtotal = importes.reduce((s, n) => s + n, 0);

  const descuento = calcularDescuento(subtotal, descuentoPedido);
  if (!descuento.ok) return descuento;

  const total = subtotal - descuento.monto;
  // El IVA se saca de lo que de verdad paga el cliente: el descuento se reparte en proporción entre las tasas.
  const desglose = desglosarIva(
    lineas.map((l, i) => ({
      // El importe ya redondeado como una sola línea, para que el desglose coincida con lo que se ve.
      precioUnitario: importes[i],
      cantidad: 1,
      iva: normalizarIva(l.iva) as TasaIva,
    })),
    descuento.monto
  );

  return {
    ok: true,
    importes,
    subtotal,
    descuento: descuento.monto,
    descuentoPorcentaje: descuento.porcentaje,
    total,
    iva10: Math.round(desglose.iva10),
    iva5: Math.round(desglose.iva5),
    exento: Math.round(desglose.exento),
  };
}

/** Cuántos días de validez tiene por defecto un presupuesto nuevo. */
export const VALIDEZ_DIAS_POR_DEFECTO = 15;

/** "Válido hasta": la fecha de emisión más los días de validez. */
export function validaHasta(fecha: Date, validezDias: number): Date {
  return new Date(fecha.getTime() + validezDias * 24 * 60 * 60 * 1000);
}

/** "0007" — el N° de presupuesto como se imprime. */
export function numeroDeCotizacion(numero: number): string {
  return String(numero).padStart(4, "0");
}
