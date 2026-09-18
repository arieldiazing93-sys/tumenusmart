import { createSign } from "crypto";

// Server-only: nunca se importa desde un componente cliente. La clave
// privada vive en una variable de entorno (no en un archivo — el
// filesystem de Vercel es efímero/read-only en producción serverless),
// mismo criterio que SESSION_SECRET/ADMIN_PASSWORD en src/lib/auth.ts.

/**
 * Reconstruye el PEM sin importar cómo haya quedado guardada la variable de
 * entorno — el campo de texto de Vercel (u otros paneles) a veces "aplana"
 * los saltos de línea reales a una sola línea, o los deja como `\n`
 * escapado en vez de saltos de línea de verdad. Node rechaza esos formatos
 * con un error opaco (`ERR_OSSL_UNSUPPORTED`) en vez de avisar qué está
 * mal, así que en vez de adivinar CÓMO llegó pegada la clave, se rearma
 * desde cero: se separan cabecera/pie de la parte en base64, se le saca
 * TODO espacio/salto de línea a la base64, y se la vuelve a partir en
 * líneas de 64 caracteres — el formato PEM real, funcione como funcione la
 * entrada.
 */
function normalizarPem(valor: string): string {
  const match = valor.match(/-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/);
  if (!match) return valor.trim();
  const [, tipo, cuerpo] = match;
  const base64 = cuerpo.replace(/\s+/g, "");
  const lineas = base64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${tipo}-----\n${lineas.join("\n")}\n-----END ${tipo}-----\n`;
}

export function certificadoQz(): string {
  const cert = process.env.QZ_CERTIFICATE_PEM;
  if (!cert) throw new Error("Falta QZ_CERTIFICATE_PEM");
  return normalizarPem(cert);
}

/** SHA512withRSA — el algoritmo que espera qz.security.setSignatureAlgorithm("SHA512"). */
export function firmarParaQz(mensaje: string): string {
  const clave = process.env.QZ_PRIVATE_KEY;
  if (!clave) throw new Error("Falta QZ_PRIVATE_KEY");
  const firmador = createSign("SHA512");
  firmador.update(mensaje);
  firmador.end();
  return firmador.sign(normalizarPem(clave), "base64");
}
