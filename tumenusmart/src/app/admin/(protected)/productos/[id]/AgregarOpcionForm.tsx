"use client";

import { useTransition } from "react";
import { agregarOpcion } from "../actions";

export function AgregarOpcionForm({ productId }: { productId: string }) {
  const [pendiente, iniciar] = useTransition();

  function alAgregar(formData: FormData) {
    iniciar(async () => {
      const resultado = await agregarOpcion(productId, formData);
      if (!resultado.ok) alert(resultado.error);
    });
  }

  return (
    <form action={alAgregar} className="flex flex-wrap items-end gap-2">
      <input
        name="nombre"
        required
        placeholder="Nombre (ej: Extra queso, Borde relleno)"
        className="min-w-[180px] flex-1 rounded-lg border border-linea px-3 py-2 text-sm"
      />
      <input
        type="number"
        name="precioExtra"
        step="1"
        min="0"
        defaultValue={0}
        placeholder="Precio extra"
        className="w-32 rounded-lg border border-linea px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={pendiente}
        className="rounded-lg bg-noche-panel px-4 py-2 text-sm font-medium text-white hover:bg-noche-panel disabled:opacity-50"
      >
        Agregar
      </button>
    </form>
  );
}
