import { createSign } from "crypto";

// Server-only: nunca se importa desde un componente cliente. La clave
// privada vive en una variable de entorno (no en un archivo — el
// filesystem de Vercel es efímero/read-only en producción serverless),
// mismo criterio que SESSION_SECRET/ADMIN_PASSWORD en src/lib/auth.ts.

function normalizarPem(valor: string): string {
  // Por si la variable de entorno quedó cargada con "\n" escapado en vez
  // de saltos de línea reales (depende de cómo se haya pegado en Vercel).
  return valor.includes("\\n") ? valor.replace(/\\n/g, "\n") : valor;
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
