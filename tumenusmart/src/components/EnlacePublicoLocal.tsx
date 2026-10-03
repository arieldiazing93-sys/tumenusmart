"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MensajeError, Tarjeta, clasesBoton } from "@/components/ui";
import { generarMatrizQR } from "@/lib/qr";
import { matrizASvg } from "@/lib/poster-qr";

type Resultado = { ok: true } | { ok: false; error: string };

/**
 * La tarjeta del enlace público de un local (por ejemplo /mozo/<llave>): activarlo, copiarlo, abrirlo, verlo como QR
 * para pasarlo al celular, sacar uno nuevo o apagarlo. El QR se arma acá mismo, en el navegador: no sale ningún dato
 * hacia afuera. Las acciones de activar y apagar llegan de quien la usa (cada módulo guarda su propia llave).
 */
export function EnlacePublicoLocal({
  token,
  rutaBase,
  generar,
  apagar,
  textos,
}: {
  token: string | null;
  /** La ruta pública antes de la llave, sin la barra final: "/mozo". */
  rutaBase: string;
  generar: () => Promise<Resultado>;
  apagar: () => Promise<Resultado>;
  textos: {
    tituloApagado: string;
    descripcionApagado: string;
    botonActivar: string;
    tituloEncendido: string;
    descripcionEncendido: string;
    pieDelQr: string;
    botonApagar: string;
    avisoNuevo: string;
    avisoApagar: string;
  };
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [origen, setOrigen] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [confirmando, setConfirmando] = useState<null | "nuevo" | "apagar">(null);
  const [error, setError] = useState<string | null>(null);

  // El origen (https://…) recién se conoce en el navegador.
  useEffect(() => {
    setOrigen(window.location.origin);
  }, []);

  const url = token && origen ? `${origen}${rutaBase}/${token}` : "";

  const qr = useMemo(() => {
    if (!url) return null;
    try {
      return matrizASvg(generarMatrizQR(url), 200);
    } catch {
      return null;
    }
  }, [url]);

  function ejecutar(accion: () => Promise<Resultado>) {
    setError(null);
    iniciar(async () => {
      const resultado = await accion();
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setConfirmando(null);
      router.refresh();
    });
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Si el navegador bloquea el portapapeles, el enlace queda visible para copiarlo a mano.
    }
  }

  if (!token) {
    return (
      <Tarjeta className="flex flex-col items-start gap-3 !border-2 !border-azul/50">
        <div>
          <h2 className="text-[1rem] font-semibold tracking-titular text-tinta">{textos.tituloApagado}</h2>
          <p className="mt-0.5 text-[0.84rem] leading-snug text-tinta-media">{textos.descripcionApagado}</p>
        </div>
        <button
          type="button"
          onClick={() => ejecutar(generar)}
          disabled={pendiente}
          className={clasesBoton("nuevo", "md")}
        >
          {pendiente ? "Activando…" : textos.botonActivar}
        </button>
        {error && <MensajeError>{error}</MensajeError>}
      </Tarjeta>
    );
  }

  return (
    <Tarjeta className="flex flex-col gap-4 !border-2 !border-azul/50">
      <div>
        <h2 className="text-[1rem] font-semibold tracking-titular text-tinta">{textos.tituloEncendido}</h2>
        <p className="mt-0.5 text-[0.84rem] leading-snug text-tinta-media">{textos.descripcionEncendido}</p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {qr && (
          <div className="flex-none self-center rounded-xl border border-linea bg-papel-suave p-3">
            {/* El SVG lo armamos acá mismo a partir del enlace: no hay contenido externo. */}
            <div className="rounded-lg bg-white p-2" dangerouslySetInnerHTML={{ __html: qr }} />
            <p className="mt-1.5 text-center text-[0.72rem] text-tinta-suave">{textos.pieDelQr}</p>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="break-all rounded-md bg-papel-suave px-2.5 py-2 text-[0.8rem] text-tinta-media">{url || "…"}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={copiar} disabled={!url} className={clasesBoton("suave", "sm")}>
              {copiado ? "¡Copiado!" : "Copiar enlace"}
            </button>
            {url && (
              <a href={url} target="_blank" rel="noopener noreferrer" className={clasesBoton("navegar", "sm")}>
                Abrir
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-linea pt-3">
        {confirmando === null ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setConfirmando("nuevo")} className={clasesBoton("navegar", "sm")}>
              Generar un enlace nuevo
            </button>
            <button type="button" onClick={() => setConfirmando("apagar")} className={clasesBoton("peligro", "sm")}>
              {textos.botonApagar}
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-peligro/30 bg-peligro-luz p-3">
            <p className="text-[0.84rem] font-semibold text-peligro">
              {confirmando === "nuevo" ? textos.avisoNuevo : textos.avisoApagar}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pendiente}
                onClick={() => ejecutar(confirmando === "nuevo" ? generar : apagar)}
                className={clasesBoton("peligro", "sm")}
              >
                {pendiente ? "Un momento…" : confirmando === "nuevo" ? "Sí, generar uno nuevo" : "Sí, apagarlo"}
              </button>
              <button type="button" onClick={() => setConfirmando(null)} className={clasesBoton("suave", "sm")}>
                No, dejarlo como está
              </button>
            </div>
          </div>
        )}
        {error && <MensajeError>{error}</MensajeError>}
      </div>
    </Tarjeta>
  );
}
