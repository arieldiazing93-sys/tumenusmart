"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clasesBoton } from "@/components/ui";
import { enviarEventoAhora, pedirInutilizacionDeDocumento } from "./actions";

/**
 * Un documento rechazado por la DNIT no se corrige con el mismo número: se avisa que ese número no se usó (inutilización) y la
 * factura se vuelve a emitir con el que sigue. Pide confirmación porque es un aviso formal ante la DNIT.
 */
export function BotonInutilizar({ documentoId }: { documentoId: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null);

  function pedir() {
    setMensaje(null);
    iniciar(async () => {
      try {
        const r = await pedirInutilizacionDeDocumento(documentoId);
        setMensaje({ texto: r.ok ? r.mensaje : r.error, error: !r.ok });
        setConfirmando(false);
        router.refresh();
      } catch {
        setMensaje({ texto: "No se pudo pedir. Probá de nuevo.", error: true });
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      {!confirmando ? (
        <button type="button" onClick={() => setConfirmando(true)} className={clasesBoton("peligro", "sm")}>
          Inutilizar este número
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="max-w-[16rem] text-[0.74rem] leading-snug text-tinta-media">Se avisa a la DNIT que este número no se usó. ¿Seguro?</span>
          <button type="button" disabled={pendiente} onClick={pedir} className={clasesBoton("peligro", "sm")}>
            {pendiente ? "Pidiendo…" : "Sí, inutilizar"}
          </button>
          <button type="button" disabled={pendiente} onClick={() => setConfirmando(false)} className={clasesBoton("suave", "sm")}>
            No
          </button>
        </div>
      )}
      {mensaje && <span className={`max-w-[18rem] text-[0.74rem] leading-snug ${mensaje.error ? "text-peligro" : "text-exito"}`}>{mensaje.texto}</span>}
    </div>
  );
}

/** Envía a la DNIT un evento pendiente (cancelación o inutilización) sin esperar a la tarea programada. */
export function BotonEnviarEventoAhora({ eventoId }: { eventoId: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null);

  function enviar() {
    setMensaje(null);
    iniciar(async () => {
      try {
        const r = await enviarEventoAhora(eventoId);
        setMensaje(r.ok ? { texto: r.estado === "aprobado" ? "Aprobado por la DNIT." : r.estado === "omitido" ? "No hacía falta." : `Rechazado. ${r.mensaje}`, error: r.estado === "rechazado" } : { texto: r.error, error: true });
        router.refresh();
      } catch {
        setMensaje({ texto: "No se pudo enviar. Probá de nuevo.", error: true });
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" onClick={enviar} disabled={pendiente} className={clasesBoton("principal", "sm")}>
        {pendiente ? "Enviando…" : "Enviar ahora"}
      </button>
      {mensaje && <span className={`max-w-[16rem] text-[0.72rem] leading-snug ${mensaje.error ? "text-peligro" : "text-exito"}`}>{mensaje.texto}</span>}
    </span>
  );
}
