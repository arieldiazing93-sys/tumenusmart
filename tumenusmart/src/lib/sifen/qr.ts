/**
 * Código QR del KuDE.
 *
 * Fuente: Manual Técnico SIFEN v150 (DNIT), sección 13.8. El QR lleva una dirección de consulta de la DNIT con los
 * datos principales del documento y un hash que prueba que lo armó quien tiene el Código de Seguridad del
 * Contribuyente (CSC). Ese hash necesita el DigestValue de la firma, así que el QR se arma DESPUÉS de firmar.
 *
 * Esta pieza solo arma el texto (la dirección); dibujar el cuadradito es otro paso.
 * El CSC es secreto: entra para calcular el hash y NUNCA sale en la dirección.
 */

export const URL_QR_PRODUCCION = "https://ekuatia.set.gov.py/consultas/qr?";
export const URL_QR_PRUEBAS = "https://ekuatia.set.gov.py/consultas-test/qr?";

export type DatosQr = {
  /** El CDC de 44 dígitos (campo Id). */
  cdc: string;
  /** dFeEmiDE tal cual va en el documento: "2026-10-09T14:30:05". */
  fechaEmision: string;
  /** El número de RUC (sin dígito verificador) si el comprador es contribuyente; si no, su número de documento; "0" si es innominado. */
  idReceptor: string;
  /** true = el comprador se identifica con RUC (dRucRec); false = con otro documento (dNumIDRec). */
  receptorConRuc: boolean;
  /** dTotGralOpe. */
  totalGeneral: number;
  /** dTotIVA. */
  totalIva: number;
  /** Cantidad de ítems (cuántos gCamItem tiene el documento). */
  cantidadItems: number;
  /** El DigestValue de la firma, en base64 tal cual está en el XML. */
  digestValue: string;
  /** Identificador del CSC (4 dígitos, ej. "0001"). */
  idCsc: string;
  /** El código secreto de 32 caracteres que entrega la DNIT. */
  csc: string;
  produccion: boolean;
};

/** El texto en hexadecimal de sus caracteres (así lo pide el manual para la fecha y el DigestValue). */
export function aHexadecimal(texto: string): string {
  return Array.from(new TextEncoder().encode(texto), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(texto: string): Promise<string> {
  const huella = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(huella), (b) => b.toString(16).padStart(2, "0")).join("");
}

export type ResultadoQr = {
  /**
   * Dirección completa, con "&" normales: es la que se dibuja en el QR y la que va en <dCarQR>. Al escribir el XML
   * el "&" sale como "&amp;" (paso 5 del manual) porque el generador de XML escapa todo texto: NO se escapa antes.
   */
  url: string;
  /** El hash (cHashQR), en hexadecimal. */
  hash: string;
  /** Los parámetros sin la dirección base ni el hash (el "paso 1" del manual). */
  parametros: string;
};

export async function construirQr(d: DatosQr): Promise<ResultadoQr> {
  if (!/^\d{44}$/.test(d.cdc)) throw new Error("El CDC del QR tiene que tener 44 dígitos");
  if (!/^\d{4}$/.test(d.idCsc)) throw new Error("El IdCSC tiene que tener 4 dígitos");
  if (d.csc.length === 0) throw new Error("Falta el código de seguridad del contribuyente (CSC)");
  const receptor = d.receptorConRuc ? `dRucRec=${d.idReceptor}` : `dNumIDRec=${d.idReceptor || "0"}`;
  const parametros = [
    "nVersion=150",
    `Id=${d.cdc}`,
    `dFeEmiDE=${aHexadecimal(d.fechaEmision)}`,
    receptor,
    `dTotGralOpe=${d.totalGeneral || 0}`,
    `dTotIVA=${d.totalIva || 0}`,
    `cItems=${d.cantidadItems || 0}`,
    `DigestValue=${aHexadecimal(d.digestValue)}`,
    `IdCSC=${d.idCsc}`,
  ].join("&");
  // El CSC se agrega SOLO para calcular el hash.
  const hash = await sha256Hex(parametros + d.csc);
  const url = (d.produccion ? URL_QR_PRODUCCION : URL_QR_PRUEBAS) + parametros + "&cHashQR=" + hash;
  return { url, hash, parametros };
}
