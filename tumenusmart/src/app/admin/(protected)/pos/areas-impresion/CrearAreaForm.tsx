"use client";

import { useRef, useState, useTransition } from "react";
import { clasesBoton } from "@/components/ui";
import { crearArea } from "./actions";

export function CrearAreaForm() {
  const [pendiente, iniciar] = useTransition();
  const [agregada, setAgregada] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function alCrear(formData: FormData) {
    iniciar(async () => {
      const resultado = await crearArea(formData);
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
        placeholder="Nueva área (ej: Cocina, Barra, Caja)"
        className="flex-1 rounded-lg border border-linea px-3 py-2"
      />
      <button type="submit" disabled={pendiente} className={clasesBoton("principal")}>
        Agregar
      </button>
      {agregada && <span className="text-xs font-medium text-exito">✓ Agregada</span>}
    </form>
  );
}
