/**
 * El KuDE (comprobante impreso de la factura electrónica) en texto crudo ESC/POS, para la impresora térmica de la caja (QZ
 * Tray). Es la misma información que el KuDE en pantalla (`src/components/Kude.tsx`), armada desde el mismo modelo, que sale
 * del archivo firmado: lo impreso es lo que se firmó.
 *
 * Lleva el código QR como imagen (la matriz propia del sistema, verificada con un lector independiente), así que el resultado
 * es una "cadena binaria" (cada carácter es un byte): hay que mandarlo a la impresora como bytes, no como texto.
 */

import { ANCHO_RENGLON, ESC_CORTE, ESC_INIT, centrado, imagenDeQr, negrita, separador } from "../escpos";
import { sinAcentos } from "../format";
import { generarMatrizQR } from "../qr";
import type { ModeloKude } from "./kude";

/** Texto para la impresora: sin acentos y solo con caracteres imprimibles de la tabla básica (lo demás sale como "?"). */
function ascii(texto: string): string {
  return sinAcentos(texto).replace(/[^\x20-\x7E]/g, "?");
}

/** Parte un texto en renglones de a lo sumo `ancho` caracteres, cortando entre palabras (una palabra más larga se corta). */
function envolver(texto: string, ancho: number): string[] {
  const renglones: string[] = [];
  let actual = "";
  for (const palabra of texto.split(/\s+/).filter(Boolean)) {
    let p = palabra;
    while (p.length > ancho) {
      if (actual) {
        renglones.push(actual);
        actual = "";
      }
      renglones.push(p.slice(0, ancho));
      p = p.slice(ancho);
    }
    if (!actual) actual = p;
    else if (actual.length + 1 + p.length <= ancho) actual += " " + p;
    else {
      renglones.push(actual);
      actual = p;
    }
  }
  if (actual) renglones.push(actual);
  return renglones;
}

/** Una etiqueta a la izquierda y un valor a la derecha, en un renglón. */
function izquierdaDerecha(izquierda: string, derecha: string): string {
  const espacio = Math.max(1, ANCHO_RENGLON - izquierda.length - derecha.length);
  return izquierda + " ".repeat(espacio) + derecha;
}

export function kudeAEscpos(m: ModeloKude): string {
  const l: string[] = [];
  const doble = separador("=");
  const simple = separador("-");

  l.push(negrita(centrado(ascii(m.titulo))));
  if (m.esPrueba) {
    for (const r of envolver("DOCUMENTO DE AMBIENTE DE PRUEBAS - SIN VALOR COMERCIAL NI FISCAL", ANCHO_RENGLON)) l.push(negrita(centrado(r)));
  }
  l.push(doble);
  for (const r of envolver(ascii(m.emisor.razonSocial).toUpperCase(), ANCHO_RENGLON)) l.push(negrita(centrado(r)));
  if (m.emisor.nombreFantasia) l.push(centrado(ascii(m.emisor.nombreFantasia)));
  if (m.emisor.actividad) for (const r of envolver(ascii(m.emisor.actividad), ANCHO_RENGLON)) l.push(centrado(r));
  l.push(centrado(`RUC: ${m.emisor.ruc}`));
  for (const r of envolver(ascii(`${m.emisor.direccion}${m.emisor.ciudad ? ` - ${m.emisor.ciudad}` : ""}`), ANCHO_RENGLON)) l.push(centrado(r));
  if (m.emisor.telefono) l.push(centrado(`Tel: ${ascii(m.emisor.telefono)}`));
  l.push(centrado(`Timbrado N: ${m.timbrado}`));
  l.push(centrado(`Inicio de vigencia: ${m.inicioVigencia}`));
  l.push(negrita(centrado(ascii(`${m.tipoDocumento} N: ${m.numero}`))));
  l.push(doble);

  l.push(`Fecha y hora: ${m.fechaEmision}`);
  l.push(`Condicion de venta: ${ascii(m.condicion)}${m.plazo ? ` (${ascii(m.plazo)})` : ""}`);
  l.push(`Moneda: ${ascii(m.moneda)}`);
  l.push(`${ascii(m.receptor.tipoDocumento)}: ${ascii(m.receptor.documento)}`);
  for (const r of envolver(`Nombre: ${ascii(m.receptor.nombre)}`, ANCHO_RENGLON)) l.push(r);
  if (m.receptor.direccion) for (const r of envolver(`Direccion: ${ascii(m.receptor.direccion)}`, ANCHO_RENGLON)) l.push(r);
  if (m.receptor.email) for (const r of envolver(`Correo: ${ascii(m.receptor.email)}`, ANCHO_RENGLON)) l.push(r);
  if (m.tipoOperacion) l.push(`Operacion: ${ascii(m.tipoOperacion)}`);
  l.push(simple);

  l.push(izquierdaDerecha("Cant. Descripcion", "Valor venta"));
  for (const it of m.items) {
    for (const r of envolver(`${it.cantidad} ${ascii(it.unidad)} ${ascii(it.descripcion)}`, ANCHO_RENGLON)) l.push(r);
    const valor = it.iva10 !== "0" ? `${it.iva10} (10%)` : it.iva5 !== "0" ? `${it.iva5} (5%)` : `${it.exentas} (Ex.)`;
    const detalle = `  x ${it.precioUnitario}${it.descuento !== "0" ? ` desc. ${it.descuento}` : ""}`;
    l.push(izquierdaDerecha(detalle, valor));
  }
  l.push(simple);

  l.push(izquierdaDerecha("Subtotal exentas", m.totales.subExentas));
  l.push(izquierdaDerecha("Subtotal 5%", m.totales.sub5));
  l.push(izquierdaDerecha("Subtotal 10%", m.totales.sub10));
  if (m.totales.descuento !== "0") l.push(izquierdaDerecha("Descuento total", m.totales.descuento));
  l.push(negrita(izquierdaDerecha("TOTAL A PAGAR", m.totales.totalOperacion)));
  l.push(izquierdaDerecha("Total en guaranies", m.totales.totalGuaranies));
  l.push(simple);
  l.push(izquierdaDerecha("Liquidacion IVA (5%)", m.totales.liquidacion5));
  l.push(izquierdaDerecha("Liquidacion IVA (10%)", m.totales.liquidacion10));
  l.push(negrita(izquierdaDerecha("Total IVA", m.totales.totalIva)));
  if (m.pagos.length > 0) {
    l.push(simple);
    for (const p of m.pagos) l.push(izquierdaDerecha(ascii(p.forma), p.monto));
  }
  l.push(doble);

  // Todo lo anterior es texto; desde acá viene la imagen del QR (bytes) y otra vez texto.
  const grupos = m.cdcAgrupado.split(" ");
  const cdc1 = grupos.slice(0, 6).join(" ");
  const cdc2 = grupos.slice(6).join(" ");
  const pie: string[] = [];
  for (const r of envolver("Consulte la validez de este documento electronico con el numero de CDC impreso abajo en:", ANCHO_RENGLON)) pie.push(centrado(r));
  for (const r of envolver(m.urlConsulta, ANCHO_RENGLON)) pie.push(negrita(centrado(r)));
  pie.push(negrita(centrado(cdc1)));
  if (cdc2) pie.push(negrita(centrado(cdc2)));
  pie.push(doble);

  const matriz = generarMatrizQR(m.urlQr);
  return ESC_INIT + l.join("\n") + "\n" + imagenDeQr(matriz) + pie.join("\n") + "\n\n\n" + ESC_CORTE;
}
