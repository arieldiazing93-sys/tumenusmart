"use client";

import { imprimirHtml, conectarQz, cortarPapel } from "./qz-tray";

/**
 * Trae el fragmento imprimible de una de las páginas de ticket/comanda, SIN
 * el layout del panel (header, menú, banner) que las envuelve — esas partes
 * solo se ocultan con `print:hidden` cuando el NAVEGADOR dispara
 * `@media print`, y no hay garantía de que el motor de renderizado interno
 * de QZ Tray respete esa regla.
 *
 * En vez de depender de eso, se arma acá un documento mínimo aparte:
 * - `?silencioso=1` le dice a la página que no incluya <ImprimirAuto/>.
 * - Se extrae SOLO el div con id="comprobante-imprimible", descartando
 *   header/menú/banner/scripts de hidratación del panel.
 * - Se copian las hojas de estilo reales del <head> (Tailwind compilado) y
 *   se agrega un <base> al origen real, para que las rutas relativas
 *   (`/_next/static/css/...`) resuelvan aunque QZ no tenga el contexto de
 *   esta pestaña.
 */
async function traerFragmentoImprimible(url: string): Promise<string> {
  const separador = url.includes("?") ? "&" : "?";
  const r = await fetch(`${url}${separador}silencioso=1`, { credentials: "include" });
  if (!r.ok) throw new Error(`No se pudo generar el comprobante (${r.status})`);
  const htmlCompleto = await r.text();

  const doc = new DOMParser().parseFromString(htmlCompleto, "text/html");
  const fragmento = doc.getElementById("comprobante-imprimible");
  if (!fragmento) throw new Error("La página del comprobante cambió de forma inesperada.");

  const estilos = [...doc.querySelectorAll('head link[rel="stylesheet"], head style')]
    .map((n) => n.outerHTML)
    .join("\n");

  return `<!DOCTYPE html><html><head><base href="${window.location.origin}/">${estilos}</head><body>${fragmento.outerHTML}</body></html>`;
}

export type ResultadoImpresion =
  | { ok: true }
  | { ok: false; motivo: "sin_impresora" | "sin_qz" | "error"; detalle?: string };

/**
 * Imprime un comprobante (ticket o comanda de un área) de forma silenciosa
 * vía QZ Tray. Nunca lanza: cualquier falla vuelve como
 * `{ ok: false, motivo }` para que quien llama decida el fallback (aviso
 * con link manual, nunca un `window.open` automático — ver EstadoBotones.tsx
 * y PantallaVenta.tsx).
 */
export async function imprimirComprobante(
  url: string,
  nombreImpresora: string | null,
  anchoMm: number
): Promise<ResultadoImpresion> {
  if (!nombreImpresora) return { ok: false, motivo: "sin_impresora" };
  try {
    await conectarQz();
  } catch (e) {
    return { ok: false, motivo: "sin_qz", detalle: String(e) };
  }
  try {
    const html = await traerFragmentoImprimible(url);
    await imprimirHtml(nombreImpresora, html, anchoMm);
  } catch (e) {
    return { ok: false, motivo: "error", detalle: String(e) };
  }
  // El corte es "mejor esfuerzo": si falla, el comprobante ya salió impreso
  // igual — no tiene sentido avisar de un fallo de impresión por esto.
  try {
    await cortarPapel(nombreImpresora);
  } catch {
    // no-op: mejor esfuerzo, no falla el comprobante por esto
  }
  return { ok: true };
}
