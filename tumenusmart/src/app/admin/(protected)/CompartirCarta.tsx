"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { generarMatrizQR } from "@/lib/qr";
import { dibujarPoster, matrizASvg } from "@/lib/poster-qr";

type Solapa = "link" | "qr";

const SOLAPAS: { id: Solapa; etiqueta: string; icono: string }[] = [
  { id: "link", etiqueta: "Copiar link", icono: "🔗" },
  { id: "qr", etiqueta: "QR", icono: "▣" },
];

/** Deja el nombre listo para usar como nombre de archivo. */
function nombreArchivo(nombre: string): string {
  return (
    nombre
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // saca las tildes ya separadas por NFD
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "carta"
  );
}

export function CompartirCarta({
  nombreNegocio,
  url,
}: {
  nombreNegocio: string;
  url: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [solapa, setSolapa] = useState<Solapa>("link");
  const [copiado, setCopiado] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // El QR se calcula una sola vez por URL: es puro cálculo, no hace falta
  // rehacerlo en cada renderizado.
  const svgQr = useMemo(() => {
    try {
      return matrizASvg(generarMatrizQR(url), 240);
    } catch {
      return null;
    }
  }, [url]);

  // Texto que acompaña al link cuando se usa el menú de compartir del sistema.
  const mensajeCompartir = `¡Hola! Te paso la carta de ${nombreNegocio} para que pidas directo desde tu celular: ${url}`;

  // Cerrar con la tecla Escape, que es lo que uno espera de una ventana así.
  useEffect(() => {
    if (!abierto) return;
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  }, [abierto]);

  async function copiarLink() {
    setError(null);
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setError("No se pudo copiar solo. Marcá el link y copialo a mano.");
    }
  }

  async function compartirNativo() {
    setError(null);
    try {
      if (navigator.share) {
        await navigator.share({ title: nombreNegocio, text: mensajeCompartir, url });
      } else {
        await copiarLink();
      }
    } catch {
      // El usuario canceló el menú de compartir: no es un error que mostrar.
    }
  }

  function descargarPoster() {
    setError(null);
    setDescargando(true);
    try {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("No se pudo preparar el póster");

      dibujarPoster(canvas, { nombreNegocio, url });

      canvas.toBlob((blob) => {
        setDescargando(false);
        if (!blob) {
          setError("No se pudo generar la imagen del póster.");
          return;
        }
        const enlace = document.createElement("a");
        enlace.href = URL.createObjectURL(blob);
        enlace.download = `carta-${nombreArchivo(nombreNegocio)}-qr.png`;
        document.body.appendChild(enlace);
        enlace.click();
        document.body.removeChild(enlace);
        // Se libera el objeto después de que el navegador arrancó la descarga.
        setTimeout(() => URL.revokeObjectURL(enlace.href), 10000);
      }, "image/png");
    } catch (err) {
      setDescargando(false);
      setError(err instanceof Error ? err.message : "No se pudo generar el póster");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-dark"
      >
        🔗 Compartir mi carta
      </button>

      {abierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setAbierto(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-brand">
                  Comparte tu carta
                </p>
                <h2 className="text-xl font-bold text-neutral-900">{nombreNegocio}</h2>
              </div>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar"
                className="text-2xl leading-none text-neutral-400 hover:text-neutral-700"
              >
                ×
              </button>
            </div>

            <div className="mb-5 flex gap-1 rounded-xl bg-neutral-100 p-1">
              {SOLAPAS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSolapa(s.id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium ${
                    solapa === s.id
                      ? "bg-white text-neutral-900 shadow-sm"
                      : "text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  <span aria-hidden>{s.icono}</span>
                  {s.etiqueta}
                </button>
              ))}
            </div>

            {solapa === "link" && (
              <div>
                <h3 className="mb-1 font-semibold text-neutral-900">Tu link público</h3>
                <p className="mb-4 text-sm text-neutral-500">
                  Pegalo en tu Instagram, TikTok, Google Maps o donde quieras recibir pedidos.
                </p>

                <div className="mb-3 flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-3">
                  <span aria-hidden className="flex-none text-neutral-400">
                    🔗
                  </span>
                  <span className="truncate font-mono text-sm text-neutral-700">{url}</span>
                </div>

                <button
                  type="button"
                  onClick={copiarLink}
                  className="mb-3 w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white hover:bg-brand-dark"
                >
                  {copiado ? "✓ Link copiado" : "Copiar link"}
                </button>

                <div className="flex gap-2">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 rounded-xl border border-neutral-300 px-4 py-2.5 text-center text-sm font-medium text-neutral-700 hover:border-brand hover:text-brand"
                  >
                    Abrir carta ↗
                  </a>
                  <button
                    type="button"
                    onClick={compartirNativo}
                    className="flex-1 rounded-xl border border-neutral-300 px-4 py-2.5 text-center text-sm font-medium text-neutral-700 hover:border-brand hover:text-brand"
                  >
                    Compartir...
                  </button>
                </div>
              </div>
            )}

            {solapa === "qr" && (
              <div>
                <h3 className="mb-1 font-semibold text-neutral-900">QR para imprimir</h3>
                <p className="mb-4 text-sm text-neutral-500">
                  Descargá un póster listo para imprimir. Ponelo en la mesa, en el mostrador o
                  en la entrada: el cliente apunta la cámara y entra directo a tu carta.
                </p>

                <div className="mb-4 flex justify-center rounded-xl border border-neutral-200 bg-brand-light/40 p-6">
                  {svgQr ? (
                    <div
                      className="rounded-lg bg-white p-3"
                      // El SVG lo generamos nosotros a partir de la URL del
                      // propio negocio: no hay contenido externo acá.
                      dangerouslySetInnerHTML={{ __html: svgQr }}
                    />
                  ) : (
                    <p className="text-sm text-neutral-500">No se pudo generar el QR.</p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={descargarPoster}
                  disabled={descargando || !svgQr}
                  className="w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
                >
                  {descargando ? "Generando..." : "Descargar póster PNG"}
                </button>
                <p className="mt-2 text-center text-xs text-neutral-400">
                  Tamaño 1200×1600 px · listo para imprimir en carta u oficio
                </p>

                <canvas ref={canvasRef} className="hidden" />
              </div>
            )}

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
