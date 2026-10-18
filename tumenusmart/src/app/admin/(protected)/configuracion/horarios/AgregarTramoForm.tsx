"use client";

import { useRef, useTransition } from "react";
import { llamarAlServidor } from "@/lib/llamar-servidor";
import { alEnviar } from "@/lib/formulario";
import { agregarTramoHorario } from "../actions";

export function AgregarTramoForm({ dia, diaLabel }: { dia: number; diaLabel: string }) {
  const [pendiente, iniciar] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function alAgregar(formData: FormData) {
    iniciar(async () => {
      const resultado = await llamarAlServidor(() => agregarTramoHorario(formData));
      // Es un renglón angosto dentro de la tabla de horarios: el aviso va en un cartel y lo escrito queda en los campos.
      if (!resultado.ok) {
        alert(resultado.error);
        return;
      }
      formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} onSubmit={alEnviar(alAgregar)} className="flex w-full flex-none items-center gap-1.5 sm:w-64">
      <input type="hidden" name="diaSemana" value={dia} />
      <input
        type="time"
        name="abre"
        required
        aria-label={`Hora de apertura del ${diaLabel}`}
        className="w-full rounded-lg border border-linea px-2 py-1.5 text-sm"
      />
      <span className="text-tinta-suave">–</span>
      <input
        type="time"
        name="cierra"
        required
        aria-label={`Hora de cierre del ${diaLabel}`}
        className="w-full rounded-lg border border-linea px-2 py-1.5 text-sm"
      />
      <button
        type="submit"
        disabled={pendiente}
        aria-label={`Agregar tramo al ${diaLabel}`}
        className="flex-none rounded-lg bg-noche-panel px-2.5 py-1.5 text-sm font-semibold text-white hover:bg-noche-panel disabled:opacity-50"
      >
        +
      </button>
    </form>
  );
}
