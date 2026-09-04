"use client";

import { useTransition } from "react";
import { clasesBoton } from "@/components/ui";
import { crearRepartidor } from "./actions";

export function CrearRepartidorForm() {
  const [pendiente, iniciar] = useTransition();

  function alCrear(formData: FormData) {
    iniciar(async () => {
      const resultado = await crearRepartidor(formData);
      if (!resultado.ok) alert(resultado.error);
    });
  }

  return (
    <form action={alCrear} className="mb-6 flex flex-wrap gap-2">
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
    </form>
  );
}
