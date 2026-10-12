"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Aviso } from "@/components/ui";
import { IconoWhatsapp } from "@/components/iconos";
import { cancelarPedidoPendiente, confirmarEnvioPorWhatsapp } from "@/app/[slug]/checkout/actions";

/** «2:41» desde una cantidad de segundos. */
export function formatearCuentaRegresiva(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * El último paso de un pedido cuando el local pide confirmarlo por WhatsApp: el cliente tiene unos minutos para tocar «Enviar por
 * WhatsApp». Al tocarlo el pedido entra al sistema del local y se abre WhatsApp con el mensaje ya escrito; si se acaba el tiempo (o
 * lo cancela) el pedido se cancela y todo vuelve atrás.
 *
 * El orden importa: primero se confirma en el servidor y recién después se lleva al cliente a WhatsApp, así lo que le llega al local por
 * WhatsApp ya está en su bandeja (si el celular suspendiera la pantalla al saltar a WhatsApp, no se perdería la confirmación). Para
 * poder abrir WhatsApp después de esperar al servidor, la ventana se abre en el mismo toque y se la lleva al enlace cuando llega la
 * respuesta; si el navegador no la deja abrir, queda el botón de «Abrir WhatsApp».
 */
export function ConfirmarPorWhatsapp({
  slug,
  token,
  enlace,
  segundos,
  nombreLocal,
  onConfirmado,
  onVencido,
  onCancelado,
}: {
  slug: string;
  token: string;
  /** El enlace de WhatsApp con el pedido ya escrito. */
  enlace: string;
  /** Cuántos segundos le quedan. El reloj corre acá, en el navegador, desde que se muestra (no depende de la hora del celular). */
  segundos: number;
  nombreLocal: string;
  onConfirmado?: (aceptado: boolean) => void;
  onVencido?: () => void;
  onCancelado?: () => void;
}) {
  const router = useRouter();
  const fin = useRef(Date.now() + segundos * 1000);
  const [restante, setRestante] = useState(Math.max(0, Math.ceil(segundos)));
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abrirManual, setAbrirManual] = useState(false);
  const terminado = useRef(false);

  const alVencer = () => (onVencido ? onVencido() : router.refresh());
  const alCancelar = () => (onCancelado ? onCancelado() : router.refresh());
  const alConfirmar = (aceptado: boolean) => (onConfirmado ? onConfirmado(aceptado) : router.refresh());

  useEffect(() => {
    const reloj = setInterval(() => {
      const quedan = Math.max(0, Math.ceil((fin.current - Date.now()) / 1000));
      setRestante(quedan);
      if (quedan === 0 && !terminado.current) {
        terminado.current = true;
        clearInterval(reloj);
        // Se avisa al servidor (no hace falta esperarlo: el pedido pendiente también se cancela solo al verlo vencido).
        void cancelarPedidoPendiente(slug, token).catch(() => undefined);
        alVencer();
      }
    }, 500);
    return () => clearInterval(reloj);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, token]);

  async function enviar() {
    if (confirmando || terminado.current) return;
    setError(null);
    setConfirmando(true);
    // La ventana se abre YA, con el toque; después de esperar al servidor el navegador no deja abrir una nueva.
    const ventana = window.open("", "_blank");
    try {
      const r = await confirmarEnvioPorWhatsapp(slug, token);
      if (!r.ok) {
        ventana?.close();
        if (r.vencido) {
          terminado.current = true;
          alVencer();
          return;
        }
        setError(r.error);
        return;
      }
      terminado.current = true;
      if (ventana && !ventana.closed) {
        try {
          ventana.opener = null;
          ventana.location.href = enlace;
        } catch {
          setAbrirManual(true);
        }
      } else {
        setAbrirManual(true);
      }
      alConfirmar(r.aceptado);
    } catch {
      ventana?.close();
      setError("No pudimos enviar tu pedido. Revisá tu conexión y probá de nuevo.");
    } finally {
      setConfirmando(false);
    }
  }

  async function cancelar() {
    if (confirmando || terminado.current) return;
    terminado.current = true;
    await cancelarPedidoPendiente(slug, token).catch(() => undefined);
    alCancelar();
  }

  const poco = restante <= 30;

  return (
    <div className="flex w-full flex-col gap-4 text-left">
      <Aviso titulo="Falta un paso: enviarlo por WhatsApp" color="aviso">
        Tocá el botón de abajo y mandá el mensaje a {nombreLocal}. Tu pedido recién le llega al local cuando lo enviás; si pasa el
        tiempo, se cancela solo.
      </Aviso>

      <div className="text-center" role="timer" aria-live="off">
        <p className="text-[0.74rem] font-semibold uppercase tracking-rotulo text-tinta-suave">Te quedan</p>
        <p className={`cifra text-[2.4rem] font-bold leading-none ${poco ? "text-peligro" : "text-tinta"}`}>{formatearCuentaRegresiva(restante)}</p>
      </div>

      <button
        type="button"
        onClick={() => void enviar()}
        disabled={confirmando || restante === 0}
        className="flex h-14 w-full animate-llamar items-center justify-center gap-2.5 rounded-2xl bg-[#25D366] px-6 text-[1rem] font-semibold text-white shadow-alta transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98] disabled:animate-none disabled:opacity-60"
      >
        <IconoWhatsapp />
        {confirmando ? "Enviando…" : "Enviar por WhatsApp"}
        <span aria-hidden="true">→</span>
      </button>

      {abrirManual && (
        <a
          href={enlace}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-superficie text-[0.92rem] font-semibold text-tinta ring-1 ring-linea"
        >
          Abrir WhatsApp
        </a>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-peligro-luz px-3.5 py-2.5 text-[0.88rem] font-medium text-peligro">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => void cancelar()}
        disabled={confirmando}
        className="self-center rounded-full border border-peligro/30 bg-peligro-luz px-4 py-2 text-[0.84rem] font-semibold text-peligro transition-colors hover:bg-peligro hover:text-white disabled:opacity-50"
      >
        Cancelar el pedido
      </button>
    </div>
  );
}
