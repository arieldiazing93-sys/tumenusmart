/**
 * Firma digital del Documento Electrónico (XMLDSig, "enveloped", RSA-SHA256).
 *
 * Fuente: Manual Técnico SIFEN v150, secciones 7.5 a 7.9, con la Nota Técnica 16 (2023, Ley de servicios de confianza):
 *  - Se firma el grupo <DE Id="CDC">; la referencia es URI="#CDC" y es lo ÚNICO que cubre la firma (el QR, que lleva el
 *    DigestValue, queda afuera, en <gCamFuFD>).
 *  - Una sola transformación: enveloped-signature. Sin ella no hay otra canonización explícita, así que el
 *    resumen se calcula sobre el DE en Canonical XML 1.0 (la regla por defecto de XMLDSig).
 *  - SignedInfo se canoniza con la variante que declare (hoy la exclusiva); firma RSA-SHA256, resumen SHA-256.
 *  - No van los elementos KeyValue, X509SubjectName, X509IssuerSerial, X509IssuerName ni X509SKI: solo el
 *    certificado (X509Certificate).
 *
 * Como el XML lo escribimos nosotros (sin espacios sobrantes, sin comentarios ni instrucciones, con las etiquetas
 * siempre abiertas y cerradas), la forma canónica se arma directamente del texto, sin un analizador de XML: es lo que
 * permite correr exactamente el mismo código en el servidor y en las pruebas. Quien verifica (la DNIT) canoniza lo que
 * lee; si algún día se cambia la forma de escribir el XML, las pruebas con un verificador independiente lo detectan.
 *
 * Las dos decisiones que no se pueden confirmar sin el ambiente de pruebas de la DNIT (la variante de canonización y
 * si exige una o dos transformaciones) están en `OpcionesFirma` para cambiarlas en un solo lugar.
 */

import { NAMESPACE_SIFEN, aXmlDE, aXmlRDE, validarContraEsquema, type Nodo } from "./xml";
import { armarRDE } from "./armar-de";
import { controlarCalculos } from "./controlar";
import { construirQr } from "./qr";

const NS_DSIG = "http://www.w3.org/2000/09/xmldsig#";
const NS_XSI = "http://www.w3.org/2001/XMLSchema-instance";

export const ALGORITMOS = {
  c14nInclusiva: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
  c14nExclusiva: "http://www.w3.org/2001/10/xml-exc-c14n#",
  rsaSha256: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
  sha256: "http://www.w3.org/2001/04/xmlenc#sha256",
  enveloped: "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
} as const;

export type OpcionesFirma = {
  /** Cómo se canoniza SignedInfo. La Nota Técnica 16 admite las dos; por defecto la exclusiva. */
  canonizacionSignedInfo?: "exclusiva" | "inclusiva";
};

/** Lo que hace falta para firmar: la clave privada del certificado (PKCS#8, en bytes) y el certificado (DER en base64). */
export type MaterialFirma = {
  clavePrivadaPkcs8: Uint8Array;
  certificadoBase64: string;
};

// ---------------------------------------------------------------------------
//  Bytes y texto
// ---------------------------------------------------------------------------

const utf8 = (texto: string): Uint8Array => new TextEncoder().encode(texto);
const comoBuffer = (bytes: Uint8Array): BufferSource => bytes as unknown as BufferSource;

export function aBase64(bytes: Uint8Array): string {
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binario);
}

export function deBase64(texto: string): Uint8Array {
  const binario = atob(texto.replace(/\s+/g, ""));
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/** El contenido binario de un PEM ("-----BEGIN …-----" … "-----END …-----"). */
export function pemADer(pem: string): Uint8Array {
  return deBase64(pem.replace(/-----(BEGIN|END)[^-]+-----/g, "").replace(/\s+/g, ""));
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", comoBuffer(bytes)));
}

// ---------------------------------------------------------------------------
//  Canonical XML
// ---------------------------------------------------------------------------

/**
 * El <DE> tal como lo canoniza XML 1.0 inclusivo (la regla por defecto cuando solo hay "enveloped"): el elemento lleva
 * todas las declaraciones de espacios de nombres que tiene a la vista —el principal y xsi, que el <rDE> declara— y
 * después sus atributos. Lo demás del documento ya se escribe en forma canónica (ver xml.ts).
 */
export function canonizarDE(de: Nodo): string {
  const texto = aXmlDE(de);
  if (!texto.startsWith("<DE Id=")) throw new Error("El DE no empieza con su atributo Id");
  return `<DE xmlns="${NAMESPACE_SIFEN}" xmlns:xsi="${NS_XSI}" Id=` + texto.slice("<DE Id=".length);
}

/** SignedInfo sin declaraciones de espacios de nombres (como va escrito dentro de <Signature>). */
function signedInfoEscrito(cdc: string, digestValue: string, canonizacion: "exclusiva" | "inclusiva"): string {
  const c14n = canonizacion === "exclusiva" ? ALGORITMOS.c14nExclusiva : ALGORITMOS.c14nInclusiva;
  return (
    `<SignedInfo><CanonicalizationMethod Algorithm="${c14n}"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="${ALGORITMOS.rsaSha256}"></SignatureMethod>` +
    `<Reference URI="#${cdc}"><Transforms><Transform Algorithm="${ALGORITMOS.enveloped}"></Transform></Transforms>` +
    `<DigestMethod Algorithm="${ALGORITMOS.sha256}"></DigestMethod><DigestValue>${digestValue}</DigestValue></Reference></SignedInfo>`
  );
}

/**
 * SignedInfo en su forma canónica. En la exclusiva solo se declara el espacio de nombres que el propio elemento usa; en
 * la inclusiva, además, el de xsi que le llega del <rDE>.
 */
function signedInfoCanonico(escrito: string, canonizacion: "exclusiva" | "inclusiva"): string {
  const declaraciones = canonizacion === "exclusiva" ? `xmlns="${NS_DSIG}"` : `xmlns="${NS_DSIG}" xmlns:xsi="${NS_XSI}"`;
  return escrito.replace("<SignedInfo>", `<SignedInfo ${declaraciones}>`);
}

// ---------------------------------------------------------------------------
//  Firmar
// ---------------------------------------------------------------------------

export type DocumentoFirmado = {
  /** El archivo completo (<rDE>…) firmado y con el QR. */
  xml: string;
  cdc: string;
  /** El DigestValue (base64): el que va en el QR. */
  digestValue: string;
  signatureValue: string;
  /** La dirección del QR (con "&" normales). */
  urlQr: string;
};

export type DatosQrFirma = {
  /** El CSC secreto de 32 caracteres que entrega la DNIT. */
  csc: string;
  /** Identificador del CSC (4 dígitos). */
  idCsc: string;
  produccion: boolean;
};

/**
 * Firma un DE ya armado y completa el documento: firma + QR. Se niega a firmar algo que el esquema oficial o las
 * cuentas rechazarían: una firma sobre un documento inválido solo sirve para que la DNIT lo rechace.
 */
export async function firmarDocumento(
  de: Nodo,
  material: MaterialFirma,
  qr: DatosQrFirma,
  opciones: OpcionesFirma = {}
): Promise<DocumentoFirmado> {
  const cdc = String(de["@Id"] ?? "");
  if (!/^\d{44}$/.test(cdc)) throw new Error("El DE no tiene un CDC válido en su atributo Id");

  const errores = validarContraEsquema({ dVerFor: 150, DE: de }, { sinFirma: true });
  if (errores.length > 0) throw new Error(`El documento no cumple el esquema de la DNIT: ${errores[0].ruta} ${errores[0].mensaje}`);
  const cuentas = controlarCalculos(de);
  if (cuentas.length > 0) throw new Error(`Las cuentas del documento no cierran: ${cuentas[0]}`);

  const canonizacion = opciones.canonizacionSignedInfo ?? "exclusiva";

  // 1. El resumen (SHA-256) del DE canónico.
  const digestValue = aBase64(await sha256(utf8(canonizarDE(de))));

  // 2. La firma RSA-SHA256 de SignedInfo canónico.
  const escrito = signedInfoEscrito(cdc, digestValue, canonizacion);
  const clave = await crypto.subtle.importKey(
    "pkcs8",
    comoBuffer(material.clavePrivadaPkcs8),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureValue = aBase64(
    new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", clave, comoBuffer(utf8(signedInfoCanonico(escrito, canonizacion)))))
  );

  const firmaXml =
    `<Signature xmlns="${NS_DSIG}">${escrito}<SignatureValue>${signatureValue}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${material.certificadoBase64.replace(/\s+/g, "")}</X509Certificate></X509Data></KeyInfo></Signature>`;

  // 3. El QR, que lleva el DigestValue (por eso va después de firmar y fuera de lo firmado).
  const receptor = (de.gDatGralOpe as Nodo).gDatRec as Nodo;
  const tot = de.gTotSub as Nodo;
  const items = ((de.gDtipDE as Nodo).gCamItem as Nodo[]) ?? [];
  const conRuc = receptor.dRucRec !== undefined;
  const resultadoQr = await construirQr({
    cdc,
    fechaEmision: String((de.gDatGralOpe as Nodo).dFeEmiDE),
    idReceptor: String(conRuc ? receptor.dRucRec : (receptor.dNumIDRec ?? "0")),
    receptorConRuc: conRuc,
    totalGeneral: Number(tot.dTotGralOpe ?? 0),
    totalIva: Number(tot.dTotIVA ?? 0),
    cantidadItems: items.length,
    digestValue,
    idCsc: qr.idCsc,
    csc: qr.csc,
    produccion: qr.produccion,
  });

  const xml = aXmlRDE(armarRDE(de, firmaXml, resultadoQr.url));
  return { xml, cdc, digestValue, signatureValue, urlQr: resultadoQr.url };
}

// ---------------------------------------------------------------------------
//  Verificar (autocontrol antes de enviar, y pruebas)
// ---------------------------------------------------------------------------

type Tlv = { tag: number; cabecera: number; inicio: number; fin: number };

function leerTlv(b: Uint8Array, pos: number): Tlv {
  let largo = b[pos + 1];
  let cabecera = 2;
  if (largo & 0x80) {
    const n = largo & 0x7f;
    largo = 0;
    for (let i = 0; i < n; i++) largo = largo * 256 + b[pos + 2 + i];
    cabecera = 2 + n;
  }
  return { tag: b[pos], cabecera: pos, inicio: pos + cabecera, fin: pos + cabecera + largo };
}

/** La clave pública (SubjectPublicKeyInfo) de un certificado X.509 en DER. */
export function clavePublicaDeCertificado(der: Uint8Array): Uint8Array {
  const certificado = leerTlv(der, 0);
  const tbs = leerTlv(der, certificado.inicio);
  let elemento = leerTlv(der, tbs.inicio);
  if (elemento.tag === 0xa0) elemento = leerTlv(der, elemento.fin); // versión [0], opcional
  // serie, algoritmo de firma, emisor, vigencia y titular: el siguiente es la clave pública
  for (let i = 0; i < 5; i++) elemento = leerTlv(der, elemento.fin);
  return der.slice(elemento.cabecera, elemento.fin);
}

export type ResultadoVerificacion = { valida: true; cdc: string } | { valida: false; motivo: string };

/**
 * Verifica la firma de un documento que escribió este mismo sistema: que el resumen coincida con el DE actual y que la
 * firma de SignedInfo sea del certificado que trae. No valida la cadena de confianza ni la vigencia del certificado
 * (eso lo hace la DNIT). Sirve de autocontrol antes de enviar y para detectar un documento tocado después de firmado.
 */
export async function verificarFirmaXml(xml: string): Promise<ResultadoVerificacion> {
  const tomar = (patron: RegExp): string | null => {
    const m = patron.exec(xml);
    return m ? m[1] : null;
  };
  const inicioDe = xml.indexOf("<DE Id=");
  const finDe = xml.indexOf("</DE>");
  if (inicioDe < 0 || finDe < 0) return { valida: false, motivo: "No se encontró el grupo <DE>" };
  const deEscrito = xml.slice(inicioDe, finDe + "</DE>".length);
  const cdc = tomar(/<DE Id="(\d{44})">/);
  const referencia = tomar(/<Reference URI="#(\d{44})">/);
  if (!cdc || cdc !== referencia) return { valida: false, motivo: "La referencia de la firma no apunta al CDC del documento" };

  const digestEscrito = tomar(/<DigestValue>([^<]+)<\/DigestValue>/);
  const digestCalculado = aBase64(
    await sha256(utf8(`<DE xmlns="${NAMESPACE_SIFEN}" xmlns:xsi="${NS_XSI}" Id=` + deEscrito.slice("<DE Id=".length)))
  );
  if (digestEscrito !== digestCalculado) return { valida: false, motivo: "El documento fue modificado después de firmarse (el resumen no coincide)" };

  const inicioSi = xml.indexOf("<SignedInfo>");
  const finSi = xml.indexOf("</SignedInfo>");
  if (inicioSi < 0 || finSi < 0) return { valida: false, motivo: "No se encontró SignedInfo" };
  const signedInfoEscrito = xml.slice(inicioSi, finSi + "</SignedInfo>".length);
  const canonizacion = signedInfoEscrito.includes(ALGORITMOS.c14nExclusiva) ? "exclusiva" : "inclusiva";
  const firma = tomar(/<SignatureValue>([^<]+)<\/SignatureValue>/);
  const certificado = tomar(/<X509Certificate>([^<]+)<\/X509Certificate>/);
  if (!firma || !certificado) return { valida: false, motivo: "Falta la firma o el certificado" };

  try {
    const clave = await crypto.subtle.importKey(
      "spki",
      comoBuffer(clavePublicaDeCertificado(deBase64(certificado))),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const correcta = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      clave,
      comoBuffer(deBase64(firma)),
      comoBuffer(utf8(signedInfoCanonico(signedInfoEscrito, canonizacion)))
    );
    return correcta ? { valida: true, cdc } : { valida: false, motivo: "La firma no corresponde al certificado (SignedInfo alterado)" };
  } catch (e) {
    return { valida: false, motivo: "No se pudo verificar la firma: " + (e instanceof Error ? e.message : String(e)) };
  }
}
