"use client";

import { useTransition } from "react";
import { clasesBoton } from "@/components/ui";
import { crearCategoria } from "./actions";

export function CrearCategoriaForm() {
  const [pendiente, iniciar] = useTransition();

  function alCrear(formData: FormData) {
    iniciar(async () => {
      const resultado = await crearCategoria(formData);
      if (!resultado.ok) alert(resultado.error);
    });
  }

  return (
    <form action={alCrear} className="mb-6 flex gap-2">
      <input
        name="nombre"
        required
        placeholder="Nueva categoría (ej: Postres)"
        className="flex-1 rounded-lg border border-linea px-3 py-2"
      />
      <button type="submit" disabled={pendiente} className={clasesBoton("principal")}>
        Agregar
      </button>
    </form>
  );
}
