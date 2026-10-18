"use client";

import { useRef, useState, useTransition } from "react";
import { clasesBoton } from "@/components/ui";
import { llamarAlServidor } from "@/lib/llamar-servidor";
import { alEnviar } from "@/lib/formulario";
import { crearZona } from "./actions";

export function CrearZonaForm() {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function alCrear(formData: FormData) {
    setError(null);
    iniciar(async () => {
      const resultado = await llamarAlServidor(() => crearZona(formData));
      if (!resultado.ok) {
        // El error se queda a la vista y lo escrito NO se pierde (con un corte de internet, tampoco).
        setError(resultado.error);
        return;
      }
      formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} onSubmit={alEnviar(alCrear)} className="mb-4 flex flex-wrap gap-2">
      <input
        name="nombre"
        required
        placeholder="Nombre (ej: Zona 1)"
        className="min-w-[140px] flex-1 rounded-lg border border-linea px-3 py-2"
      />
      <input
        type="number"
        name="radioKm"
        required
        step="0.1"
        min="0.1"
        placeholder="Radio (km)"
        onWheel={(e) => e.currentTarget.blur()}
        className="w-32 rounded-lg border border-linea px-3 py-2"
      />
      <input
        type="number"
        name="costoEnvio"
        required
        step="1"
        min="0"
        placeholder="Costo (Gs.)"
        onWheel={(e) => e.currentTarget.blur()}
        className="w-36 rounded-lg border border-linea px-3 py-2"
      />
      <button type="submit" disabled={pendiente} className={clasesBoton("suave", "md")}>
        {pendiente ? "Agregando…" : "Agregar"}
      </button>
      {error && (
        <p role="alert" className="basis-full text-sm font-medium text-peligro">
          {error}
        </p>
      )}
    </form>
  );
}
