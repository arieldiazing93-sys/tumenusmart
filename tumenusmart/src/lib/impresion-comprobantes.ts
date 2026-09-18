"use client";

import { imprimirTexto, conectarQz } from "./qz-tray";

export type ResultadoImpresion =
  | { ok: true }
  | { ok: false; motivo: "sin_impresora" | "sin_qz" | "error"; detalle?: string };

/**
 * Imprime un comprobante (ticket o comanda de un área) de forma silenciosa
 * vía QZ Tray, en texto crudo ESC/POS — ver src/lib/escpos.ts y las rutas
 * `.../crudo/route.ts` de cada comprobante (versión en texto plano de la
 * misma página HTML que se puede seguir viendo/imprimiendo a mano desde el
 * navegador). Nunca lanza: cualquier falla vuelve como
 * `{ ok: false, motivo }` para que quien llama decida el fallback (aviso
 * con link manual, nunca un `window.open` automático — ver EstadoBotones.tsx
 * y PantallaVenta.tsx).
 */
export async function imprimirComprobante(
  urlCrudo: string,
  nombreImpresora: string | null
): Promise<ResultadoImpresion> {
  if (!nombreImpresora) return { ok: false, motivo: "sin_impresora" };
  try {
    await conectarQz();
  } catch (e) {
    return { ok: false, motivo: "sin_qz", detalle: String(e) };
  }
  try {
    const r = await fetch(urlCrudo, { credentials: "include" });
    if (!r.ok) throw new Error(`No se pudo generar el comprobante (${r.status})`);
    const texto = await r.text();
    await imprimirTexto(nombreImpresora, texto);
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: "error", detalle: String(e) };
  }
}
