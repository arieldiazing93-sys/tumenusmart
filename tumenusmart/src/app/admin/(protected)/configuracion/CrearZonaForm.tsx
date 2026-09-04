"use client";

import { useTransition } from "react";
import { clasesBoton } from "@/components/ui";
import { crearZona } from "./actions";

export function CrearZonaForm() {
  const [pendiente, iniciar] = useTransition();

  function alCrear(formData: FormData) {
    iniciar(async () => {
      const resultado = await crearZona(formData);
      if (!resultado.ok) alert(resultado.error);
    });
  }

  return (
    <form action={alCrear} className="mb-4 flex flex-wrap gap-2">
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
        className="w-32 rounded-lg border border-linea px-3 py-2"
      />
      <input
        type="number"
        name="costoEnvio"
        required
        step="1"
        min="0"
        placeholder="Costo (Gs.)"
        className="w-36 rounded-lg border border-linea px-3 py-2"
      />
      <button type="submit" disabled={pendiente} className={clasesBoton("suave", "md")}>
        Agregar
      </button>
    </form>
  );
}
