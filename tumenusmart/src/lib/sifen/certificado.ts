/**
 * Certificado cualificado de firma electrónica del contribuyente (el .p12 / .pfx que entrega el prestador de
 * servicios de certificación): lectura, control y custodia.
 *
 * Fuente: Manual Técnico SIFEN v150, sección 7.5, y Nota Técnica 16. El certificado lo usa el sistema para dos cosas:
 * firmar cada documento y autenticarse ante la DNIT (conexión con autenticación mutua). Tiene que ser un certificado
 * cualificado con el RUC del contribuyente (persona jurídica: en el número de serie del titular, "RUC80012345-6"; persona
 * física: en el nombre alternativo), clave RSA de 2048 bits o más, uso de firma digital y, para conectarse, el uso de
 * autenticación de cliente.
 *
 * Quien tiene la clave privada puede emitir facturas a nombre del contribuyente: por eso nunca se guarda en claro. Se
 * lee el .p12 UNA vez (al subirlo), la contraseña del archivo se descarta y la clave se guarda cifrada con AES-256-GCM,
 * atada al negocio al que pertenece: copiar el texto cifrado de un negocio a otro no lo descifra.
 *
 * Solo para el servidor.
 */

import forge from "node-forge";
import { aBase64, deBase64 } from "./firma";

export type CertificadoLeido = {
  /** La clave privada en PKCS#8 (PEM). Es el secreto: va a la bóveda cifrada, nunca a la base en claro. */
  clavePrivadaPem: string;
  /** El certificado del contribuyente (PEM) y, si el archivo las trae, las de la cadena de confianza. */
  certificadoPem: string;
  cadenaPem: string[];
  /** El certificado en DER y base64: lo que va dentro de <X509Certificate>. */
  certificadoBase64: string;
  sujeto: string;
  emisor: string;
  /** El RUC que lleva el certificado (número y dígito verificador), o null si no se encontró. */
  ruc: string | null;
  dv: string | null;
  validoDesde: Date;
  validoHasta: Date;
  huellaSha256: string;
  bitsClave: number;
  usoFirmaDigital: boolean;
  /** null = el certificado no declara usos extendidos. */
  usoAutenticacionCliente: boolean | null;
  /** Cosas a tener en cuenta que no impiden guardarlo. */
  avisos: string[];
};

export type ResultadoCertificado = { ok: true; certificado: CertificadoLeido } | { ok: false; error: string };

const DIAS_AVISO_VENCIMIENTO = 30;

function atributos(dn: { attributes: { shortName?: string; name?: string; value?: unknown }[] }): string {
  return dn.attributes.map((a) => `${a.shortName ?? a.name ?? "?"}=${String(a.value)}`).join(", ");
}

/**
 * Abre un .p12 / .pfx (en base64) con su contraseña y devuelve lo necesario para firmar y para conectarse. No guarda
 * nada. Los errores se devuelven con un texto para el usuario (nunca se filtra el detalle técnico).
 */
export function leerCertificadoP12(pfxBase64: string, clave: string): ResultadoCertificado {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const asn1 = forge.asn1.fromDer(forge.util.decode64(pfxBase64.replace(/\s+/g, "")));
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, clave);
  } catch {
    return { ok: false, error: "No se pudo abrir el archivo. Revisá que sea el .p12 o .pfx del certificado y que la contraseña sea la correcta." };
  }

  const oids = forge.pki.oids;
  const bolsasClave = [
    ...(p12.getBags({ bagType: oids.pkcs8ShroudedKeyBag })[oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: oids.keyBag })[oids.keyBag] ?? []),
  ];
  const clavePrivada = bolsasClave[0]?.key as forge.pki.rsa.PrivateKey | undefined;
  if (!clavePrivada || !clavePrivada.n) {
    return { ok: false, error: "El archivo no trae una clave privada RSA: no sirve para firmar documentos." };
  }

  const certificados = (p12.getBags({ bagType: oids.certBag })[oids.certBag] ?? [])
    .map((b) => b.cert)
    .filter((c): c is forge.pki.Certificate => Boolean(c));
  // El certificado del contribuyente es el que corresponde a la clave privada; los demás son la cadena.
  const hoja = certificados.find((c) => (c.publicKey as forge.pki.rsa.PublicKey).n.toString(16) === clavePrivada.n.toString(16));
  if (!hoja) return { ok: false, error: "El archivo no trae el certificado que corresponde a la clave privada." };

  const bitsClave = clavePrivada.n.toString(2).length;
  if (bitsClave < 2048) {
    return { ok: false, error: `La clave del certificado es de ${bitsClave} bits: la DNIT exige RSA de 2048 bits o más.` };
  }

  const derHoja = forge.asn1.toDer(forge.pki.certificateToAsn1(hoja)).getBytes();
  const avisos: string[] = [];

  // El RUC va como texto "RUC80012345-6" dentro del certificado (titular o nombre alternativo): se lo busca en todo el DER.
  const coincidenciaRuc = /RUC\s*(\d{3,8})\s*-\s*(\d)/i.exec(derHoja);
  if (!coincidenciaRuc) {
    avisos.push('No se encontró el RUC dentro del certificado (debería figurar como "RUC80012345-6"): la DNIT lo exige para aceptar la firma.');
  }

  const uso = hoja.getExtension("keyUsage") as Record<string, unknown> | null;
  const usoFirmaDigital = uso ? Boolean(uso.digitalSignature) : true;
  if (!usoFirmaDigital) avisos.push("El certificado no tiene permitido el uso de firma digital.");
  const usoExtendido = hoja.getExtension("extKeyUsage") as Record<string, unknown> | null;
  const usoAutenticacionCliente = usoExtendido ? Boolean(usoExtendido.clientAuth) : null;
  if (usoAutenticacionCliente === false) {
    avisos.push("El certificado no tiene el uso de autenticación de cliente: no podrá conectarse con los servicios de la DNIT.");
  }

  const ahora = Date.now();
  if (hoja.validity.notAfter.getTime() < ahora) avisos.push("El certificado está vencido.");
  else if (hoja.validity.notAfter.getTime() - ahora < DIAS_AVISO_VENCIMIENTO * 24 * 60 * 60 * 1000) {
    avisos.push(`El certificado vence en menos de ${DIAS_AVISO_VENCIMIENTO} días.`);
  }
  if (hoja.validity.notBefore.getTime() > ahora) avisos.push("El certificado todavía no está vigente.");

  const clavePrivadaPem = forge.pki.privateKeyInfoToPem(forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(clavePrivada)));

  return {
    ok: true,
    certificado: {
      clavePrivadaPem,
      certificadoPem: forge.pki.certificateToPem(hoja),
      cadenaPem: certificados.filter((c) => c !== hoja).map((c) => forge.pki.certificateToPem(c)),
      certificadoBase64: forge.util.encode64(derHoja),
      sujeto: atributos(hoja.subject),
      emisor: atributos(hoja.issuer),
      ruc: coincidenciaRuc ? coincidenciaRuc[1] : null,
      dv: coincidenciaRuc ? coincidenciaRuc[2] : null,
      validoDesde: hoja.validity.notBefore,
      validoHasta: hoja.validity.notAfter,
      huellaSha256: forge.md.sha256.create().update(derHoja).digest().toHex(),
      bitsClave,
      usoFirmaDigital,
      usoAutenticacionCliente,
      avisos,
    },
  };
}

// ---------------------------------------------------------------------------
//  Bóveda: cifrado de secretos (la clave privada, el CSC)
// ---------------------------------------------------------------------------

const comoBuffer = (bytes: Uint8Array): BufferSource => bytes as unknown as BufferSource;

async function claveAes(claveMaestraBase64: string): Promise<CryptoKey> {
  const bytes = deBase64(claveMaestraBase64);
  if (bytes.length !== 32) throw new Error("La clave maestra de la bóveda tiene que ser de 32 bytes (base64)");
  return crypto.subtle.importKey("raw", comoBuffer(bytes), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/**
 * Cifra un texto secreto con AES-256-GCM. `asociado` (por ejemplo el id del negocio) queda atado al texto cifrado: si
 * alguien copia el valor a la fila de otro negocio, no se puede descifrar. Formato: "v1.<iv>.<cifrado>" en base64.
 */
export async function cifrarSecreto(texto: string, claveMaestraBase64: string, asociado: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cifrado = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: comoBuffer(iv), additionalData: comoBuffer(new TextEncoder().encode(asociado)) },
      await claveAes(claveMaestraBase64),
      comoBuffer(new TextEncoder().encode(texto))
    )
  );
  return `v1.${aBase64(iv)}.${aBase64(cifrado)}`;
}

/** Lo contrario de cifrarSecreto. Falla si el texto fue alterado, si la clave maestra no es la misma o si `asociado` no coincide. */
export async function descifrarSecreto(cifrado: string, claveMaestraBase64: string, asociado: string): Promise<string> {
  const partes = cifrado.split(".");
  if (partes.length !== 3 || partes[0] !== "v1") throw new Error("El secreto guardado no tiene el formato esperado");
  const abierto = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: comoBuffer(deBase64(partes[1])), additionalData: comoBuffer(new TextEncoder().encode(asociado)) },
    await claveAes(claveMaestraBase64),
    comoBuffer(deBase64(partes[2]))
  );
  return new TextDecoder().decode(abierto);
}
