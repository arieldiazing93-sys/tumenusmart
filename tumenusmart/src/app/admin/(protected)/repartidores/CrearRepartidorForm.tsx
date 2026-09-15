"use client";

import { useRef, useState, useTransition } from "react";
import { clasesBoton } from "@/components/ui";
import { crearRepartidor } from "./actions";

export function CrearRepartidorForm() {
  const [pendiente, iniciar] = useTransition();
  const [agregado, setAgregado] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function alCrear(formData: FormData) {
    iniciar(async () => {
      const resultado = await crearRepartidor(formData);
      if (!resultado.ok) {
        alert(resultado.error);
        return;
      }
      formRef.current?.reset();
      setAgregado(true);
      setTimeout(() => setAgregado(false), 2500);
    });
  }

  return (
    <form ref={formRef} action={alCrear} className="mb-6 flex flex-wrap items-center gap-2">
      <input
        name="nombre"
        required
        placeholder="Nombre"
        className="min-w-[160px] flex-1 rounded-lg border border-linea px-3 py-2"
      />
      <input
        name="telefono"
        placeholder="Teléfono (opcional)"
        className="min-w-[160px] flex-1 rounded-lg border border-linea px-3 py-2"
      />
      <button type="submit" disabled={pendiente} className={clasesBoton("principal")}>
        Agregar
      </button>
      {agregado && <span className="text-xs font-medium text-exito">✓ Agregado</span>}
    </form>
  );
}
