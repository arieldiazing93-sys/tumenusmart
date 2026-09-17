"use client";

import { useRef, useState, useTransition } from "react";
import { clasesBoton } from "@/components/ui";
import { crearEstacion } from "./actions";

export function CrearEstacionForm() {
  const [pendiente, iniciar] = useTransition();
  const [agregada, setAgregada] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function alCrear(formData: FormData) {
    iniciar(async () => {
      const resultado = await crearEstacion(formData);
      if (!resultado.ok) {
        alert(resultado.error);
        return;
      }
      formRef.current?.reset();
      setAgregada(true);
      setTimeout(() => setAgregada(false), 2500);
    });
  }

  return (
    <form ref={formRef} action={alCrear} className="mb-6 flex items-center gap-2">
      <input
        name="nombre"
        required
        placeholder="Nueva estación (ej: Mostrador, Delivery)"
        className="flex-1 rounded-lg border border-linea px-3 py-2"
      />
      <button type="submit" disabled={pendiente} className={clasesBoton("principal")}>
        Agregar
      </button>
      {agregada && <span className="text-xs font-medium text-exito">✓ Agregada</span>}
    </form>
  );
}
