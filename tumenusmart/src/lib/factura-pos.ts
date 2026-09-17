/**
 * Cálculo de la Factura Autoimpresor: desglose de IVA y numeración fiscal.
 *
 * Los precios de la carta ya incluyen el IVA (como en cualquier mostrador).
 * El IVA de cada línea se extrae dividiendo el monto gravado por 11 (10%) o
 * por 21 (5%) — fórmula estándar cuando el precio es "IVA incluido".
 *
 * Esta fórmula sale de cómo se arma habitualmente una factura paraguaya, no
 * de una fuente oficial verificada de la DNIT — conviene que el dueño (o su
 * contador) revise el primer ticket de factura impreso antes de usarlo con
 * clientes de verdad.
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

export function desglosarIva(lineas: LineaConIva[]): DesgloseIva {
  let gravado10 = 0;
  let gravado5 = 0;
  let exento = 0;
  for (const l of lineas) {
    const monto = l.precioUnitario * l.cantidad;
    if (l.iva === "gravado10") gravado10 += monto;
    else if (l.iva === "gravado5") gravado5 += monto;
    else exento += monto;
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
