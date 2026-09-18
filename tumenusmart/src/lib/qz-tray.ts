"use client";

import qz from "qz-tray";

let configurado = false;
let conexionEnCurso: Promise<void> | null = null;

function configurarFirma() {
  if (configurado) return;
  configurado = true;
  qz.security.setSignatureAlgorithm("SHA512");
  qz.security.setCertificatePromise((resolve, reject) => {
    fetch("/api/qz/certificado", { credentials: "include" })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error("No se pudo obtener el certificado"))))
      .then(resolve)
      .catch(reject);
  });
  qz.security.setSignaturePromise((aFirmar) => (resolve, reject) => {
    fetch("/api/qz/firmar", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mensaje: aFirmar }),
    })
      .then((r) => r.json())
      .then((d) => (d.firma ? resolve(d.firma) : reject(new Error(d.error ?? "Firma inválida"))))
      .catch(reject);
  });
}

/**
 * Conecta si todavía no hay conexión activa; reutiliza la que ya está
 * abierta (no reconecta en cada ticket) y coalesce llamadas simultáneas en
 * una sola promesa en vuelo. Rechaza si QZ Tray no está corriendo en esta
 * computadora — ese rechazo es la señal que usan los puntos de disparo
 * para caer al fallback manual.
 */
export async function conectarQz(): Promise<void> {
  configurarFirma();
  if (qz.websocket.isActive()) return;
  if (conexionEnCurso) return conexionEnCurso;
  conexionEnCurso = qz.websocket.connect({ retries: 2, delay: 1 }).finally(() => {
    conexionEnCurso = null;
  });
  return conexionEnCurso;
}

export async function listarImpresoras(): Promise<string[]> {
  await conectarQz();
  return qz.printers.find();
}

/**
 * Imprime un HTML ya renderizado en la impresora indicada. `flavor: 'plain'`
 * es intencional: con `flavor: 'file'` QZ Tray (proceso Java aparte, sin la
 * cookie de sesión del navegador) bajaría la URL él mismo y una pantalla
 * protegida por sesión le devolvería el login en vez del comprobante.
 */
export async function imprimirHtml(nombreImpresora: string, html: string, anchoMm: number): Promise<void> {
  await conectarQz();
  const config = qz.configs.create(nombreImpresora, {
    units: "mm",
    size: { width: anchoMm, height: 297 },
    scaleContent: true,
    rasterize: false,
  });
  await qz.print(config, [{ type: "pixel", format: "html", flavor: "plain", data: html }]);
}
