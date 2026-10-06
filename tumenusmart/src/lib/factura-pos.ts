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

function redondear2(n: number): number {
  return Math.round(n * 100) / 100;
}

function esEntero(n: number): boolean {
  return Math.abs(n - Math.round(n)) < 1e-6;
}

/**
 * Reparte el descuento general de la cuenta entre las líneas (`montos` = lo que vale cada una antes del descuento), en
 * proporción a lo que vale cada una. Con montos y descuento en guaraníes enteros (lo normal) cada parte sale ENTERA y la suma
 * es EXACTAMENTE el descuento: cada línea recibe lo que le toca hacia abajo y los guaraníes que faltan van a las de mayor
 * resto. Así cada línea de la factura queda en guaraníes enteros y las líneas suman el total cobrado, sin huecos (con
 * decimales repartidos, la factura electrónica —que redondea cada línea— se desviaba hasta unos guaraníes del total).
 * Con montos o descuento con decimales (hoy no pasa) cae en el reparto de 2 decimales, donde la última línea se lleva el resto.
 */
export function repartirDescuentoEnLineas(montos: number[], descuentoTotal: number): number[] {
  const totalBruto = montos.reduce((s, m) => s + m, 0);
  const descuento = Math.min(Math.max(descuentoTotal, 0), totalBruto);
  if (descuento <= 0 || totalBruto <= 0) return montos.map(() => 0);

  if (esEntero(descuento) && esEntero(totalBruto) && montos.every(esEntero)) {
    const aRepartir = Math.round(descuento);
    const total = Math.round(totalBruto);
    const exactos = montos.map((m) => (aRepartir * Math.round(m)) / total);
    const partes = exactos.map((e) => Math.floor(e + 1e-9));
    let faltan = aRepartir - partes.reduce((s, p) => s + p, 0);
    const orden = exactos
      .map((e, i) => ({ i, resto: e - partes[i] }))
      .sort((a, b) => b.resto - a.resto || a.i - b.i);
    for (let k = 0; faltan > 0 && orden.length > 0; k = (k + 1) % orden.length) {
      partes[orden[k].i] += 1;
      faltan -= 1;
    }
    return partes;
  }

  let repartido = 0;
  return montos.map((m, idx) => {
    const esUltima = idx === montos.length - 1;
    let d = esUltima ? redondear2(descuento - repartido) : redondear2((descuento * m) / totalBruto);
    d = Math.min(Math.max(d, 0), m);
    repartido += d;
    return d;
  });
}

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
 * proporción entre las líneas (igual que en el comprobante, ver
 * `repartirDescuentoEnLineas`), que es como queda el IVA cuando el descuento es
 * sobre toda la cuenta: el IVA se calcula sobre lo que de verdad se cobró, no
 * sobre el precio de lista. Como cada línea queda en guaraníes enteros, las tres
 * tasas suman EXACTO el total cobrado y coinciden con las del comprobante.
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
    gravado10 = 0;
    gravado5 = 0;
    exento = 0;
    const montos = lineas.map((l) => redondear2(l.precioUnitario * l.cantidad));
    const descuentos = repartirDescuentoEnLineas(montos, descuento);
    lineas.forEach((l, i) => {
      const neto = montos[i] - descuentos[i];
      if (l.iva === "gravado10") gravado10 += neto;
      else if (l.iva === "gravado5") gravado5 += neto;
      else exento += neto;
    });
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
