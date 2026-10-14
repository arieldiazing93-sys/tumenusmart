/**
 * Partes de un monto repartidas en guaraníes ENTEROS que suman justo el total redondeado (el guaraní no tiene decimales). Los enteros
 * que faltan para llegar al total se reparten a las partes con más decimales. Es la cuenta de los registros para la DNIT (RG 90) y de
 * los libros de IVA: el total de un comprobante tiene que ser EXACTAMENTE la suma de sus partes.
 */
export function repartirEnEnteros(partes: number[]): number[] {
  const total = Math.round(partes.reduce((s, p) => s + p, 0));
  const pisos = partes.map((p) => Math.floor(p));
  let resto = total - pisos.reduce((s, p) => s + p, 0);
  const porDecimales = partes.map((p, i) => ({ i, dec: p - Math.floor(p) })).sort((a, b) => b.dec - a.dec);
  const resultado = [...pisos];
  for (const { i } of porDecimales) {
    if (resto <= 0) break;
    resultado[i] += 1;
    resto -= 1;
  }
  return resultado;
}
