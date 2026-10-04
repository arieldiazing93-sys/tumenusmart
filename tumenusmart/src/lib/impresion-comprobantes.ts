"use client";

import { imprimirTexto, conectarQz } from "./qz-tray";
import { armarDocumento, centrado, separador } from "./escpos";
import { ZONA_NEGOCIO } from "./timezone";

export type ResultadoImpresion =
  | { ok: true; /** true si no se imprimió nada porque esta estación tiene 0 copias para esto (a propósito). */ omitida?: boolean }
  | { ok: false; motivo: "sin_impresora" | "sin_qz" | "error"; detalle?: string };

/** Las copias que el servidor dice que salen (cabecera `X-Copias`): de 0 a 9; si falta o es rara, una (lo normal). */
function copiasDeLaRespuesta(r: Response): number {
  const n = Number(r.headers.get("X-Copias"));
  return Number.isInteger(n) && n >= 0 && n <= 9 ? n : 1;
}

/**
 * Imprime un comprobante (ticket o comanda de un área) de forma silenciosa
 * vía QZ Tray, en texto crudo ESC/POS — ver src/lib/escpos.ts y las rutas
 * `.../crudo/route.ts` de cada comprobante (versión en texto plano de la
 * misma página HTML que se puede seguir viendo/imprimiendo a mano desde el
 * navegador). Nunca lanza: cualquier falla vuelve como
 * `{ ok: false, motivo }` para que quien llama decida el fallback (aviso
 * con link manual, nunca un `window.open` automático — ver EstadoBotones.tsx
 * y PantallaVenta.tsx).
 *
 * Cuántas veces sale lo decide la estación (Estaciones → Impresoras por área): la ruta lo manda en la cabecera `X-Copias`.
 * Con 0 no se imprime nada (un local que solo quiere la factura y no el ticket) y vuelve `{ ok: true, omitida: true }`.
 */
export async function imprimirComprobante(
  urlCrudo: string,
  impresoraPorDefecto: string | null
): Promise<ResultadoImpresion> {
  try {
    const r = await fetch(urlCrudo, { credentials: "include" });
    if (!r.ok) throw new Error(`No se pudo generar el comprobante (${r.status})`);
    const copias = copiasDeLaRespuesta(r);
    // 0 copias es una decisión del local, no un error: no hace falta ni conectar con la impresora.
    if (copias === 0) return { ok: true, omitida: true };
    // La factura puede tener su propia impresora (distinta de la del ticket): si la ruta la indica, es esa; vacía = el área de
    // la factura todavía no tiene impresora. Sin cabecera, vale la que pasó quien llama.
    const indicada = r.headers.get("X-Impresora");
    const nombreImpresora = indicada !== null ? decodeURIComponent(indicada) || null : impresoraPorDefecto;
    if (!nombreImpresora) return { ok: false, motivo: "sin_impresora" };
    const texto = await r.text();
    try {
      await conectarQz();
    } catch (e) {
      return { ok: false, motivo: "sin_qz", detalle: String(e) };
    }
    // Una tras otra: la cola de QZ las mantiene en orden y sin mezclarse.
    for (let i = 0; i < copias; i++) await imprimirTexto(nombreImpresora, texto);
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: "error", detalle: String(e) };
  }
}

/**
 * Manda una prueba cortita a una impresora, para comprobar que sale antes de usarla con un pedido de verdad (Estaciones →
 * Probar impresión). Siempre una copia, sin pasar por ningún comprobante. Nunca lanza.
 */
export async function imprimirPrueba(nombreImpresora: string, etiqueta: string): Promise<ResultadoImpresion> {
  try {
    await conectarQz();
  } catch (e) {
    return { ok: false, motivo: "sin_qz", detalle: String(e) };
  }
  try {
    const cuando = new Date().toLocaleString("es-PY", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: ZONA_NEGOCIO,
    });
    const texto = armarDocumento([
      separador(),
      centrado("PRUEBA DE IMPRESION"),
      separador(),
      etiqueta,
      nombreImpresora,
      cuando,
      "",
      "Si podes leer esto,",
      "la impresora esta bien.",
      separador(),
    ]);
    await imprimirTexto(nombreImpresora, texto);
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: "error", detalle: e instanceof Error ? e.message : String(e) };
  }
}
