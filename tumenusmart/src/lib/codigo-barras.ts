/**
 * Códigos de barras de los productos: validar lo que llega (del lector o escrito a mano), generar los propios del local y dibujar las barras
 * de las etiquetas.
 *
 * Está hecho a mano, sin librerías (igual que el generador de QR de qr.ts): son cuentas chicas y se pueden probar de punta a punta.
 *
 *   · Los códigos de fábrica (EAN-13, EAN-8, UPC-A) se escanean y se guardan tal cual.
 *   · Los productos sin código se identifican con un EAN-13 PROPIO: empieza con 2 (el rango que GS1 reserva para uso interno de cada negocio,
 *     así nunca choca con un código de fábrica), seguido del número correlativo del local y del dígito verificador.
 *   · Cualquier otro código (letras y números, de 4 a 40 caracteres) se puede guardar y escanear, pero no se imprime en etiquetas: para
 *     dibujarlo hay que saber su tipo de barras, y de esos códigos "raros" el sistema solo conoce los de la familia EAN/UPC.
 *
 * Un solo código por producto, y no se repite dentro del local.
 */

// ---------------------------------------------------------------------------
//  Dígito verificador (GS1, módulo 10)
// ---------------------------------------------------------------------------

/**
 * El dígito verificador de un código GS1 (EAN-13, EAN-8, UPC-A, GTIN-14): se suman los dígitos del cuerpo (sin el verificador) de derecha a
 * izquierda con peso 3, 1, 3, 1…, y el verificador es lo que falta para llegar a la decena siguiente.
 */
export function digitoVerificadorGs1(cuerpo: string): number {
  if (!/^\d+$/.test(cuerpo)) throw new Error("El cuerpo del código tiene que ser solo de números");
  let suma = 0;
  for (let i = 0; i < cuerpo.length; i++) {
    const digito = cuerpo.charCodeAt(cuerpo.length - 1 - i) - 48;
    suma += digito * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (suma % 10)) % 10;
}

/** ¿Es un EAN-13, UPC-A (12) o EAN-8 con su dígito verificador bien? */
export function esGs1Valido(codigo: string): boolean {
  if (!/^\d+$/.test(codigo)) return false;
  if (codigo.length !== 8 && codigo.length !== 12 && codigo.length !== 13) return false;
  return digitoVerificadorGs1(codigo.slice(0, -1)) === Number(codigo[codigo.length - 1]);
}

// ---------------------------------------------------------------------------
//  Lo que se guarda en el producto
// ---------------------------------------------------------------------------

export const LARGO_MINIMO_CODIGO = 4;
export const LARGO_MAXIMO_CODIGO = 40;

export type ResultadoCodigo = { ok: true; codigo: string } | { ok: false; error: string };

/**
 * Lo que llegó del lector (o se escribió) listo para guardar o para buscar: sin espacios de los costados ni caracteres de control, y las letras
 * en mayúscula (un lector con el bloqueo de mayúsculas cambiado no tiene que "crear" otro código).
 */
export function limpiarCodigo(texto: unknown): string {
  return String(texto ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .toUpperCase();
}

/**
 * Valida un código antes de guardarlo. Se aceptan letras, números, punto, guion y guion bajo (4 a 40 caracteres). Si son solo números y
 * tienen el largo de un EAN-8, UPC-A o EAN-13, el dígito verificador tiene que coincidir: un lector nunca entrega un código con el
 * verificador mal, así que si no coincide es porque se escribió a mano con un error.
 */
export function validarCodigoDeBarras(texto: unknown): ResultadoCodigo {
  const codigo = limpiarCodigo(texto);
  if (codigo.length === 0) return { ok: false, error: "Escaneá o escribí el código." };
  if (codigo.length < LARGO_MINIMO_CODIGO) {
    return { ok: false, error: `El código es muy corto (mínimo ${LARGO_MINIMO_CODIGO} caracteres).` };
  }
  if (codigo.length > LARGO_MAXIMO_CODIGO) {
    return { ok: false, error: `El código es muy largo (máximo ${LARGO_MAXIMO_CODIGO} caracteres).` };
  }
  if (!/^[A-Z0-9._-]+$/.test(codigo)) {
    return { ok: false, error: "El código solo puede llevar letras, números, punto y guion." };
  }
  if (/^\d+$/.test(codigo) && (codigo.length === 8 || codigo.length === 12 || codigo.length === 13) && !esGs1Valido(codigo)) {
    return { ok: false, error: "El dígito verificador no coincide: revisá el código (si lo escribiste a mano, probá escaneándolo)." };
  }
  return { ok: true, codigo };
}

/**
 * Las formas en que puede venir escrito el MISMO producto: un UPC-A de 12 dígitos es un EAN-13 con un 0 adelante, y algunos lectores entregan
 * uno y otros el otro. Sirve para buscar un código escaneado entre los guardados.
 */
export function variantesDeCodigo(codigo: string): string[] {
  const limpio = limpiarCodigo(codigo);
  const variantes = [limpio];
  if (/^\d{13}$/.test(limpio) && limpio.startsWith("0")) variantes.push(limpio.slice(1));
  if (/^\d{12}$/.test(limpio)) variantes.push("0" + limpio);
  return variantes;
}

// ---------------------------------------------------------------------------
//  Códigos propios
// ---------------------------------------------------------------------------

/** El correlativo más alto que entra en un EAN-13 propio (11 dígitos de cuerpo). */
export const CORRELATIVO_MAXIMO_INTERNO = 99_999_999_999;

/**
 * El EAN-13 propio número `correlativo` del local: "2" + el número con ceros a la izquierda (11 dígitos) + el dígito verificador.
 * El 2 adelante es el rango de GS1 para uso interno: un producto de fábrica nunca tiene un código que empiece con 2.
 */
export function generarEan13Interno(correlativo: number): string {
  if (!Number.isInteger(correlativo) || correlativo < 1 || correlativo > CORRELATIVO_MAXIMO_INTERNO) {
    throw new Error("El número del código propio no es válido");
  }
  const cuerpo = "2" + String(correlativo).padStart(11, "0");
  return cuerpo + digitoVerificadorGs1(cuerpo);
}

/** ¿Es uno de los códigos propios del sistema (EAN-13 que empieza con 2)? */
export function esCodigoInterno(codigo: string): boolean {
  return /^2\d{12}$/.test(codigo) && esGs1Valido(codigo);
}

// ---------------------------------------------------------------------------
//  Las barras (EAN-13, EAN-8 y UPC-A)
// ---------------------------------------------------------------------------

/** Cómo se dibuja cada dígito en la mitad izquierda (código L); de ahí se sacan los otros dos. 1 = barra, 0 = espacio, 7 módulos por dígito. */
const CODIGO_L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
/** Mitad derecha (código R): el contrario del L (las barras pasan a espacios y al revés). */
const CODIGO_R = CODIGO_L.map((p) => [...p].map((b) => (b === "1" ? "0" : "1")).join(""));
/** El otro dibujo de la mitad izquierda (código G): el R leído al revés. */
const CODIGO_G = CODIGO_R.map((p) => [...p].reverse().join(""));
/** Qué dibujo (L o G) usa cada uno de los 6 dígitos de la izquierda de un EAN-13, según el primer dígito (que no se dibuja: se deduce de esto). */
const PARIDAD_PRIMER_DIGITO = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

const GUARDA_EXTREMOS = "101";
const GUARDA_CENTRAL = "01010";

export type TipoBarras = "ean13" | "ean8";

/** El EAN-13 como módulos: 95 caracteres, "1" barra y "0" espacio (guarda 3 + 6 dígitos × 7 + guarda central 5 + 6 × 7 + guarda 3). */
export function patronEan13(codigo: string): string {
  if (!/^\d{13}$/.test(codigo)) throw new Error("Un EAN-13 tiene 13 números");
  const paridad = PARIDAD_PRIMER_DIGITO[Number(codigo[0])];
  let bits = GUARDA_EXTREMOS;
  for (let i = 1; i <= 6; i++) {
    const d = Number(codigo[i]);
    bits += paridad[i - 1] === "L" ? CODIGO_L[d] : CODIGO_G[d];
  }
  bits += GUARDA_CENTRAL;
  for (let i = 7; i <= 12; i++) bits += CODIGO_R[Number(codigo[i])];
  return bits + GUARDA_EXTREMOS;
}

/** El EAN-8 como módulos: 67 caracteres (guarda 3 + 4 dígitos L + guarda central + 4 dígitos R + guarda). */
export function patronEan8(codigo: string): string {
  if (!/^\d{8}$/.test(codigo)) throw new Error("Un EAN-8 tiene 8 números");
  let bits = GUARDA_EXTREMOS;
  for (let i = 0; i < 4; i++) bits += CODIGO_L[Number(codigo[i])];
  bits += GUARDA_CENTRAL;
  for (let i = 4; i < 8; i++) bits += CODIGO_R[Number(codigo[i])];
  return bits + GUARDA_EXTREMOS;
}

/** Las barras listas para dibujar de un código guardado. */
export type BarrasDibujables = {
  tipo: TipoBarras;
  /** Los módulos del símbolo: "1" barra, "0" espacio. */
  bits: string;
  /** Los números que se leen debajo de las barras (13 u 8). */
  digitos: string;
};

/**
 * Las barras de un código guardado, o null si el sistema no lo puede imprimir. Se imprimen los EAN-13, los UPC-A (que son un EAN-13 con un 0
 * adelante: las barras son las mismas) y los EAN-8, siempre con su dígito verificador bien.
 */
export function barrasDeCodigo(codigo: string): BarrasDibujables | null {
  const limpio = limpiarCodigo(codigo);
  if (!/^\d+$/.test(limpio) || !esGs1Valido(limpio)) return null;
  if (limpio.length === 13) return { tipo: "ean13", bits: patronEan13(limpio), digitos: limpio };
  if (limpio.length === 12) return { tipo: "ean13", bits: patronEan13("0" + limpio), digitos: "0" + limpio };
  return { tipo: "ean8", bits: patronEan8(limpio), digitos: limpio };
}

/** Si el código se puede imprimir como etiqueta. */
export function sePuedeImprimir(codigo: string | null | undefined): boolean {
  return !!codigo && barrasDeCodigo(codigo) !== null;
}

/** Una barra del dibujo: dónde empieza y cuánto mide, en módulos, y si es de las "guardas" (las que se estiran hacia abajo en un EAN). */
export type BarraDibujada = { x: number; ancho: number; guarda: boolean };

/** Los módulos del símbolo agrupados en barras (los "1" seguidos son una sola barra), con las de guarda marcadas. */
export function barrasDelSimbolo(barras: BarrasDibujables): BarraDibujada[] {
  const { bits, tipo } = barras;
  // Las guardas: la de inicio, la del medio y la del final (módulos desde 0).
  const guardas: [number, number][] =
    tipo === "ean13" ? [[0, 2], [45, 49], [92, 94]] : [[0, 2], [31, 35], [64, 66]];
  const esGuarda = (x: number) => guardas.some(([desde, hasta]) => x >= desde && x <= hasta);
  const salida: BarraDibujada[] = [];
  let i = 0;
  while (i < bits.length) {
    if (bits[i] !== "1") {
      i++;
      continue;
    }
    let j = i;
    while (j < bits.length && bits[j] === "1") j++;
    // Una barra de guarda y una de dígito pueden quedar pegadas: se parten para que solo la de guarda baje.
    let inicio = i;
    for (let x = i; x < j; x++) {
      const final = x === j - 1 || esGuarda(x) !== esGuarda(x + 1);
      if (final) {
        salida.push({ x: inicio, ancho: x - inicio + 1, guarda: esGuarda(inicio) });
        inicio = x + 1;
      }
    }
    i = j;
  }
  return salida;
}

// ---------------------------------------------------------------------------
//  Medidas de la etiqueta
// ---------------------------------------------------------------------------

/** Cuántos módulos de margen en blanco pide cada lado del símbolo (los números del estándar: 11 a la izquierda y 7 a la derecha en un EAN-13; 7 y 7 en un EAN-8). */
export function margenesEnModulos(tipo: TipoBarras): { izquierdo: number; derecho: number } {
  return tipo === "ean13" ? { izquierdo: 11, derecho: 7 } : { izquierdo: 7, derecho: 7 };
}

/** Cuántos módulos mide el símbolo (las barras) sin sus márgenes. */
export function modulosDelSimbolo(tipo: TipoBarras): number {
  return tipo === "ean13" ? 95 : 67;
}

/** El ancho de un módulo "nominal" del estándar (0,33 mm): 100 % de aumento. Menos de 80 % (0,264 mm) ya es difícil de leer para algunos lectores. */
export const MODULO_NOMINAL_MM = 0.33;

export type MedidaDeBarras =
  | { ok: true; moduloMm: number; puntos: number; aumento: number; advertencia: string | null }
  | { ok: false; error: string };

/**
 * El ancho del módulo (cada barra más fina) que entra en un ancho disponible, medido en PUNTOS de la impresora: una impresora no puede hacer
 * medio punto, y una barra de 2,6 puntos sale unas veces de 2 y otras de 3 y se lee mal. Por eso se usa un número ENTERO de puntos por módulo
 * (la impresora térmica común es de 203 puntos por pulgada: un punto = 0,125 mm). Con menos de 2 puntos no se puede imprimir; con 2 se
 * imprime pero justo (advertencia); de 3 en adelante queda holgado.
 */
export function medirBarras(tipo: TipoBarras, anchoDisponibleMm: number, dpi: number): MedidaDeBarras {
  if (!(anchoDisponibleMm > 0) || !(dpi > 0)) return { ok: false, error: "Faltan las medidas de la etiqueta." };
  const puntoMm = 25.4 / dpi;
  const { izquierdo, derecho } = margenesEnModulos(tipo);
  const modulosTotales = izquierdo + modulosDelSimbolo(tipo) + derecho;
  const puntos = Math.floor(anchoDisponibleMm / modulosTotales / puntoMm + 1e-9);
  if (puntos < 2) {
    return { ok: false, error: "La etiqueta es muy angosta para este código: usá una más ancha o una impresora de más resolución." };
  }
  const moduloMm = puntos * puntoMm;
  const aumento = moduloMm / MODULO_NOMINAL_MM;
  return {
    ok: true,
    moduloMm,
    puntos,
    aumento,
    advertencia:
      aumento < 0.8
        ? "El código sale chico (menos del 80 % del tamaño estándar): puede costar leerlo. Probá con una etiqueta más ancha."
        : null,
  };
}
