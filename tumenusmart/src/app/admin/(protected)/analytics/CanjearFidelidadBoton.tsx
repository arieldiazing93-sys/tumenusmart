"use client";

import { useTransition } from "react";
import { registrarCanjeFidelidad } from "./actions";

export function CanjearFidelidadBoton({ telefono, premio }: { telefono: string; premio: string }) {
  const [pending, startTransition] = useTransition();

  function canjear() {
    if (!confirm(`¿Marcar como entregado el premio "${premio}"?`)) return;
    startTransition(async () => {
      try {
        await registrarCanjeFidelidad(telefono);
      } catch (err) {
        alert(err instanceof Error ? err.message : "No se pudo registrar el canje.");
      }
    });
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={canjear}
      className="whitespace-nowrap text-xs font-semibold text-brand hover:underline disabled:opacity-50"
    >
      🎁 Marcar entregado
    </button>
  );
}
