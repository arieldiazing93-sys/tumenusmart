"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clasesBoton } from "@/components/ui";
import { usarHorarioGeneral } from "./actions";

/**
 * Le saca a una persona su horario propio para que vuelva a usar el horario general del local. Como se pierde lo que
 * se había configurado, primero pide confirmación.
 */
export function BotonVolverAlGeneral({ personalId, nombre }: { personalId: string; nombre: string }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function volver() {
    setError(null);
    iniciar(async () => {
      const r = await usarHorarioGeneral(personalId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setConfirmando(false);
      router.refresh();
    });
  }

  if (!confirmando) {
    return (
      <button type="button" onClick={() => setConfirmando(true)} className={clasesBoton("suave", "sm")}>
        Volver al horario general
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[0.8rem] font-medium text-tinta">¿Quitarle el horario propio a {nombre}?</span>
      <button type="button" onClick={() => setConfirmando(false)} disabled={pendiente} className={clasesBoton("suave", "sm")}>
        Cancelar
      </button>
      <button type="button" onClick={volver} disabled={pendiente} className={clasesBoton("peligro", "sm")}>
        {pendiente ? "Quitando…" : "Sí, volver al general"}
      </button>
      {error && <span className="w-full text-[0.78rem] font-medium text-peligro">{error}</span>}
    </div>
  );
}
