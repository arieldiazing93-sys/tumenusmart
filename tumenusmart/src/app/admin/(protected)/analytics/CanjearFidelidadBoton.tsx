"use client";

import { useTransition } from "react";
import { llamarAlServidor, MENSAJE_DUDOSO } from "@/lib/llamar-servidor";
import { registrarCanjeFidelidad } from "./actions";

export function CanjearFidelidadBoton({ telefono, premio }: { telefono: string; premio: string }) {
  const [pending, startTransition] = useTransition();

  function canjear() {
    if (!confirm(`¿Marcar como entregado el premio "${premio}"?`)) return;
    startTransition(async () => {
      // Marca un premio como entregado: si se corta la red no sabemos si quedó marcado → MENSAJE_DUDOSO.
      const resultado = await llamarAlServidor(() => registrarCanjeFidelidad(telefono), MENSAJE_DUDOSO);
      if (!resultado.ok) alert(resultado.error);
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
