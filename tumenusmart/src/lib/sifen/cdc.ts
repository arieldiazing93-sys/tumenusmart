/**
 * Código de Control (CDC) del Documento Electrónico.
 *
 * Fuente: Manual Técnico SIFEN v150 (DNIT), secciones 10.1 a 10.3.
 *
 * Es el identificador único de cada documento: 44 dígitos que arma el sistema del emisor.
 *
 *   tipo de documento       2   iTiDE (01 = factura electrónica)
 *   RUC del emisor          8   sin el dígito verificador, con ceros a la izquierda
 *   DV del RUC              1
 *   establecimiento         3
 *   punto de expedición     3
 *   número del documento    7
 *   tipo de contribuyente   1   1 = persona física, 2 = jurídica
 *   fecha de emisión        8   AAAAMMDD
 *   tipo de emisión         1   1 = normal, 2 = contingencia
 *   código de seguridad     9   aleatorio, distinto en cada documento
 *   DV del CDC              1   módulo 11
 *
 * Sin Prisma ni nada del servidor: corre igual en el navegador y en pruebas.
 */

export const LARGO_CDC = 44;

export type PartesCdc = {
  tipoDocumento: number;
  /** Solo los dígitos del RUC, sin guion ni dígito verificador. */
  rucEmisor: string;
  dvRuc: string;
  establecimiento: string;
  punto: string;
  numero: string;
  /** 1 = persona física, 2 = persona jurídica. */
  tipoContribuyente: number;
  /** AAAAMMDD, en hora de Asunción. */
  fecha: string;
  /** 1 = normal, 2 = contingencia. */
  tipoEmision: number;
  codigoSeguridad: string;
};

/**
 * Dígito verificador por módulo 11 (base máxima 11): los dígitos se multiplican de derecha a izquierda por
 * 2, 3, 4… hasta 11 y vuelven a empezar en 2; el resto de dividir la suma por 11 da el dígito.
 */
export function digitoVerificadorModulo11(digitos: string, baseMaxima = 11): number {
  if (!/^\d+$/.test(digitos)) throw new Error(`El módulo 11 solo acepta dígitos (llegó "${digitos}")`);
  let peso = 2;
  let suma = 0;
  for (let i = digitos.length - 1; i >= 0; i--) {
    suma += Number(digitos[i]) * peso;
    peso = peso === baseMaxima ? 2 : peso + 1;
  }
  const resto = suma % 11;
  return resto > 1 ? 11 - resto : 0;
}

function conCeros(valor: string | number, largo: number, nombre: string): string {
  const texto = String(valor);
  if (!/^\d+$/.test(texto) || texto.length > largo) {
    throw new Error(`${nombre}: "${texto}" no entra en ${largo} dígitos`);
  }
  return texto.padStart(largo, "0");
}

/** Arma el CDC de 44 dígitos (con su dígito verificador al final). */
export function construirCdc(p: PartesCdc): string {
  const base =
    conCeros(p.tipoDocumento, 2, "Tipo de documento") +
    conCeros(p.rucEmisor, 8, "RUC del emisor") +
    conCeros(p.dvRuc, 1, "Dígito verificador del RUC") +
    conCeros(p.establecimiento, 3, "Establecimiento") +
    conCeros(p.punto, 3, "Punto de expedición") +
    conCeros(p.numero, 7, "Número de documento") +
    conCeros(p.tipoContribuyente, 1, "Tipo de contribuyente") +
    conCeros(p.fecha, 8, "Fecha de emisión") +
    conCeros(p.tipoEmision, 1, "Tipo de emisión") +
    conCeros(p.codigoSeguridad, 9, "Código de seguridad");
  return base + String(digitoVerificadorModulo11(base));
}

/** Separa un CDC en sus partes, o devuelve null si no tiene la forma de un CDC. */
export function descomponerCdc(cdc: string): (PartesCdc & { dvCdc: string }) | null {
  if (!/^\d{44}$/.test(cdc)) return null;
  return {
    tipoDocumento: Number(cdc.slice(0, 2)),
    rucEmisor: cdc.slice(2, 10),
    dvRuc: cdc.slice(10, 11),
    establecimiento: cdc.slice(11, 14),
    punto: cdc.slice(14, 17),
    numero: cdc.slice(17, 24),
    tipoContribuyente: Number(cdc.slice(24, 25)),
    fecha: cdc.slice(25, 33),
    tipoEmision: Number(cdc.slice(33, 34)),
    codigoSeguridad: cdc.slice(34, 43),
    dvCdc: cdc.slice(43, 44),
  };
}

/** ¿Tiene 44 dígitos y su último dígito es el que corresponde al módulo 11? */
export function cdcValido(cdc: string): boolean {
  if (!/^\d{44}$/.test(cdc)) return false;
  return Number(cdc[43]) === digitoVerificadorModulo11(cdc.slice(0, 43));
}

/** Como se imprime en el KuDE: grupos de cuatro dígitos ("0144 4444 0170 …"). */
export function cdcParaMostrar(cdc: string): string {
  return cdc.replace(/(\d{4})(?=\d)/g, "$1 ");
}

/**
 * Código de seguridad (dCodSeg): 9 dígitos al azar, entre 000000001 y 999999999, distinto de un documento a otro y
 * sin relación con el número del documento (Manual Técnico, sección 10.3). Usa el generador criptográfico del
 * sistema, no Math.random: tiene que ser imposible de adivinar.
 */
export function generarCodigoSeguridad(numeroDocumento: string): string {
  const MAXIMO = 999_999_999;
  const TOPE = 0x1_0000_0000 - (0x1_0000_0000 % MAXIMO); // se descarta lo que sesgaría el reparto
  const buffer = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    if (buffer[0] >= TOPE) continue;
    const n = (buffer[0] % MAXIMO) + 1;
    // No puede ser igual al número del documento (dNumDoc).
    if (n === Number(numeroDocumento)) continue;
    return String(n).padStart(9, "0");
  }
}
