import { createSign } from "crypto";

// Server-only: nunca se importa desde un componente cliente. La clave
// privada vive en una variable de entorno (no en un archivo — el
// filesystem de Vercel es efímero/read-only en producción serverless),
// mismo criterio que SESSION_SECRET/ADMIN_PASSWORD en src/lib/auth.ts.
//
// Se guardan en base64, en una sola línea (QZ_PRIVATE_KEY_B64 /
// QZ_CERTIFICATE_PEM_B64), no como el PEM multilínea tal cual — probado en
// producción: el campo de variables de entorno de Vercel duplicaba las
// líneas del PEM al pegarlo (una clave de ~27 líneas quedaba guardada con
// 54), y Node rechazaba el resultado con un error opaco
// (`ERR_OSSL_UNSUPPORTED`) sin decir qué estaba mal. Una sola línea en
// base64 no tiene saltos de línea que se puedan duplicar o perder al
// pegarla, así que no hay margen para ese error.
function decodificarPem(valorB64: string): string {
  return Buffer.from(valorB64.trim(), "base64").toString("utf8");
}

export function certificadoQz(): string {
  const cert = process.env.QZ_CERTIFICATE_PEM_B64;
  if (!cert) throw new Error("Falta QZ_CERTIFICATE_PEM_B64");
  return decodificarPem(cert);
}

/** SHA512withRSA — el algoritmo que espera qz.security.setSignatureAlgorithm("SHA512"). */
export function firmarParaQz(mensaje: string): string {
  const clave = process.env.QZ_PRIVATE_KEY_B64;
  if (!clave) throw new Error("Falta QZ_PRIVATE_KEY_B64");
  const pem = decodificarPem(clave);
  const firmador = createSign("SHA512");
  firmador.update(mensaje);
  firmador.end();
  return firmador.sign(pem, "base64");
}
