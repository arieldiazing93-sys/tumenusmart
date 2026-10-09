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

// ---------------------------------------------------------------------------
//  Imagen (código QR)
// ---------------------------------------------------------------------------

/** Alinea lo que sigue al centro / a la izquierda (ESC a n). */
export const ESC_CENTRO = "\x1B\x61\x01";
export const ESC_IZQUIERDA = "\x1B\x61\x00";

const car = (n: number): string => String.fromCharCode(n & 0xff);

/**
 * Un código QR como imagen para la impresora: el comando de imagen en bloques (GS v 0), que casi todas las impresoras
 * térmicas ESC/POS entienden. Se dibuja la matriz propia del sistema (la misma que se ve en pantalla y que se comprueba con
 * un lector independiente) y no el QR interno de cada marca, así lo impreso es exactamente lo que se verificó.
 *
 * `modulo`: puntos por módulo del QR (a 203 ppp, 4 puntos son medio milímetro: la factura electrónica de ~400 bytes mide así
 * unos 45 mm de lado, muy por encima de los 25 mm que pide la DNIT). `margen`: zona de silencio, en módulos.
 *
 * Devuelve una "cadena binaria": cada carácter es un byte (del 0 al 255). Por eso el que la imprime tiene que mandarla como
 * bytes (base64) y no como texto: ver `imprimirComprobante` y la cabecera `X-Binario` de la ruta.
 */
export function imagenDeQr(matriz: boolean[][], modulo = 4, margen = 4): string {
  const n = matriz.length;
  const lado = (n + 2 * margen) * modulo; // puntos de ancho y de alto
  const bytesPorFila = Math.ceil(lado / 8);
  // Se manda en tandas de 128 filas: algunas impresoras limitan cuánto aceptan en un solo comando de imagen.
  const FILAS_POR_TANDA = 128;
  let salida = ESC_CENTRO;
  for (let desde = 0; desde < lado; desde += FILAS_POR_TANDA) {
    const filas = Math.min(FILAS_POR_TANDA, lado - desde);
    let datos = "";
    for (let y = desde; y < desde + filas; y++) {
      const my = Math.floor(y / modulo) - margen;
      for (let bx = 0; bx < bytesPorFila; bx++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = bx * 8 + bit;
          const mx = Math.floor(x / modulo) - margen;
          if (x < lado && my >= 0 && my < n && mx >= 0 && mx < n && matriz[my][mx]) byte |= 0x80 >> bit;
        }
        datos += car(byte);
      }
    }
    salida += "\x1D\x76\x30\x00" + car(bytesPorFila) + car(bytesPorFila >> 8) + car(filas) + car(filas >> 8) + datos;
  }
  return salida + ESC_IZQUIERDA + "\n";
}
