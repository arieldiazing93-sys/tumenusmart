"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clasesBoton } from "@/components/ui";
import { enviarDocumentoAhora } from "./actions";

/** Envía a la DNIT un documento pendiente sin esperar a la tarea programada (que lo hace sola cada minuto). */
export function BotonEnviarAhora({ documentoId }: { documentoId: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null);

  function enviar() {
    setMensaje(null);
    iniciar(async () => {
      try {
        const r = await enviarDocumentoAhora(documentoId);
        if (r.ok) setMensaje({ texto: r.estado === "rechazado" ? `Rechazado por la DNIT. ${r.mensaje}` : "Aprobado por la DNIT.", error: r.estado === "rechazado" });
        else setMensaje({ texto: r.error, error: true });
        router.refresh();
      } catch {
        setMensaje({ texto: "No se pudo enviar. Probá de nuevo.", error: true });
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button type="button" onClick={enviar} disabled={pendiente} className={clasesBoton("principal", "sm")}>
        {pendiente ? "Enviando…" : "Enviar ahora"}
      </button>
      {mensaje && <span className={`max-w-[18rem] text-[0.74rem] leading-snug ${mensaje.error ? "text-peligro" : "text-exito"}`}>{mensaje.texto}</span>}
    </div>
  );
}
