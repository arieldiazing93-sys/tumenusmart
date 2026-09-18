/**
 * Comandos ESC/POS crudos + helpers de texto para imprimir directo a la
 * impresora térmica, sin pasar por el driver gráfico de Windows — probado
 * en producción: el modo "pixel/html" (vía el driver gráfico) salía
 * borroso, con espaciado impredecible y sin corte de papel confiable entre
 * trabajos. Texto crudo ESC/POS es el estándar de facto que casi todas las
 * impresoras térmicas soportan igual, sea cual sea la marca — es como
 * imprimen la mayoría de los sistemas de punto de venta comerciales.
 *
 * Requiere una impresora configurada como "raw" en Windows (driver
 * Generic / Text Only, mismo puerto que la impresora real) — ver
 * /admin/pos/estaciones.
 */

/** Reinicia la impresora a su estado por defecto — primera línea de cada trabajo. */
export const ESC_INIT = "\x1B\x40";
/** Corte completo de papel (GS V 0) — última línea de cada trabajo. */
export const ESC_CORTE = "\x1D\x56\x00";
const ESC_NEGRITA_ON = "\x1B\x45\x01";
const ESC_NEGRITA_OFF = "\x1B\x45\x00";

/** Envuelve un texto en negrita real de la impresora (no simulada por CSS). */
export function negrita(texto: string): string {
  return `${ESC_NEGRITA_ON}${texto}${ESC_NEGRITA_OFF}`;
}

// Mismo ancho que ya estaba calibrado a mano para 67mm imprimibles (75mm de
// papel) a 40 caracteres por línea — ver el comentario original en
// pos/venta/[id]/ticket/page.tsx.
export const ANCHO_RENGLON = 40;
const COL_CANTIDAD = 3;
const COL_DESCRIPCION = 5;
const COL_MONTO = 32;

/** Línea separadora de tinta real (no CSS) — repetida hasta el ancho del renglón. */
export function separador(caracter: string = "-"): string {
  return caracter.repeat(ANCHO_RENGLON);
}

/**
 * Línea de dos columnas para el desglose de IVA: el monto va pegado a la
 * etiqueta (no alineado a la derecha) — la etiqueta se rellena con
 * espacios hasta `anchoEtiqueta` para que los ":" de un mismo bloque
 * queden alineados entre sí aunque las etiquetas midan distinto.
 */
export function filaEtiqueta(etiqueta: string, monto: string, anchoEtiqueta: number): string {
  return `${etiqueta.padEnd(anchoEtiqueta)}: ${monto}`;
}

/**
 * Fila de la tabla de productos con 3 columnas fijas: cantidad (3
 * caracteres), descripción (arranca en la columna 5, se corta si no entra
 * antes de la columna 32) y monto (arranca en la columna 32). Nunca se le
 * corta un dígito al monto: si no entra en lo que queda del renglón, se
 * imprime completo igual, aunque la línea se pase de 40 caracteres.
 */
export function filaTabla(cantidad: string, descripcion: string, monto: string): string {
  const anchoDescripcion = COL_MONTO - COL_DESCRIPCION;
  const colCantidad = cantidad.padEnd(COL_CANTIDAD).slice(0, COL_CANTIDAD);
  const espacio = " ".repeat(COL_DESCRIPCION - COL_CANTIDAD - 1);
  const colDescripcion =
    descripcion.length > anchoDescripcion
      ? descripcion.slice(0, anchoDescripcion)
      : descripcion.padEnd(anchoDescripcion);
  const anchoMonto = ANCHO_RENGLON - COL_MONTO + 1;
  const colMonto = monto.length >= anchoMonto ? monto : monto.padStart(anchoMonto);
  return colCantidad + espacio + colDescripcion + colMonto;
}

/** Centra un texto en el ancho del renglón, sin cortar si no entra. */
export function centrado(texto: string): string {
  if (texto.length >= ANCHO_RENGLON) return texto;
  const relleno = Math.floor((ANCHO_RENGLON - texto.length) / 2);
  return " ".repeat(relleno) + texto;
}

/** Arma el documento completo: init + líneas + un salto final + corte. */
export function armarDocumento(lineas: string[]): string {
  return ESC_INIT + lineas.join("\n") + "\n\n\n" + ESC_CORTE;
}
