/**
 * Cálculo de la Factura Autoimpresor: desglose de IVA y numeración fiscal.
 *
 * Los precios de la carta ya incluyen el IVA (como en cualquier mostrador).
 * El IVA de cada línea se extrae dividiendo el monto gravado por 11 (10%) o
 * por 21 (5%) — fórmula VERIFICADA (no de memoria): Decreto N° 3107/2019
 * (reglamento del IVA, Ley 6380/2019), Artículo 41: "...se dividirá por
 * once (11) el precio total de la operación para las operaciones gravadas
 * con la tasa del diez por ciento (10%), y por veintiuno (21) para las
 * operaciones gravadas con la tasa del cinco por ciento (5%)".
 *
 * Redondeo: ni el Decreto 3107/2019 ni la Ley 6380/2019 establecen una
 * regla de redondeo o cantidad de decimales para los montos de una factura
 * — no está reglamentado. Acá el cálculo se hace sin redondear, se guarda
 * con 2 decimales de precisión (columnas `Decimal(10,2)`) y se redondea al
 * guaraní entero recién al mostrarlo (`formatearGuarani`/`formatearMiles`),
 * porque el guaraní no tiene submúltiplo en uso — mismo criterio que
 * cualquier factura paraguaya real, que nunca imprime decimales.
 */

export type LineaConIva = { precioUnitario: number; cantidad: number; iva: string };

export type DesgloseIva = {
  gravado10: number;
  gravado5: number;
  exento: number;
  iva10: number;
  iva5: number;
  totalGeneral: number;
};

/**
 * `descuento` es el descuento general de la venta, en guaraníes. Se reparte en
 * proporción entre las tres tasas (cada monto gravado se achica por igual), que
 * es como queda el IVA cuando el descuento es sobre toda la cuenta: el IVA se
 * calcula sobre lo que de verdad se cobró, no sobre el precio de lista.
 */
export function desglosarIva(lineas: LineaConIva[], descuento = 0): DesgloseIva {
  let gravado10 = 0;
  let gravado5 = 0;
  let exento = 0;
  for (const l of lineas) {
    const monto = l.precioUnitario * l.cantidad;
    if (l.iva === "gravado10") gravado10 += monto;
    else if (l.iva === "gravado5") gravado5 += monto;
    else exento += monto;
  }
  const subtotal = gravado10 + gravado5 + exento;
  if (descuento > 0 && subtotal > 0) {
    const factor = Math.max(0, (subtotal - descuento) / subtotal);
    gravado10 *= factor;
    gravado5 *= factor;
    exento *= factor;
  }
  return {
    gravado10,
    gravado5,
    exento,
    iva10: gravado10 / 11,
    iva5: gravado5 / 21,
    totalGeneral: gravado10 + gravado5 + exento,
  };
}

/** "001-001-0000001" */
export function formatearNumeroFactura(
  establecimiento: string,
  puntoExpedicion: string,
  numero: number
): string {
  return `${establecimiento}-${puntoExpedicion}-${String(numero).padStart(7, "0")}`;
}

/** Días hasta el vencimiento del timbrado (negativo = ya venció). */
export function diasParaVencer(timbradoHasta: Date, ahora: Date = new Date()): number {
  return Math.ceil((timbradoHasta.getTime() - ahora.getTime()) / (1000 * 60 * 60 * 24));
}

/** A partir de cuántos días antes del vencimiento se muestra el aviso. */
export const DIAS_AVISO_VENCIMIENTO = 30;
