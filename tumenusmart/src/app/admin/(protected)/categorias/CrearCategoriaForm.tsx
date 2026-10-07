"use client";

import { useState, useTransition } from "react";
import { Tarjeta, Campo, Entrada, clasesBoton } from "@/components/ui";
import { crearCategoria } from "./actions";

/**
 * El formulario de "Nueva categoría", en el panel de la derecha. Al crearla se
 * abre la categoría para ajustarle lo que haga falta.
 */
export function CrearCategoriaForm({
  onCreada,
  onCancelar,
}: {
  onCreada: (id: string) => void;
  onCancelar: () => void;
}) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function alCrear(formData: FormData) {
    setError(null);
    iniciar(async () => {
      const resultado = await crearCategoria(formData);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      onCreada(resultado.id);
    });
  }

  return (
    <Tarjeta className="!border-2 !border-azul/50 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[1.1rem] font-semibold tracking-titular text-tinta">Nueva categoría</h2>
        <button type="button" onClick={onCancelar} className={clasesBoton("peligro", "sm")}>
          Cancelar
        </button>
      </div>
      <form action={alCrear} className="campos-grises flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <Campo etiqueta="Nombre">
            <Entrada name="nombre" required autoFocus placeholder="Ej: Postres" />
          </Campo>
        </div>
        <button type="submit" disabled={pendiente} className={clasesBoton("nuevo")}>
          {pendiente ? "Creando…" : "Crear categoría"}
        </button>
      </form>
      {error && <p className="text-sm font-medium text-peligro">{error}</p>}
      <p className="text-xs text-tinta-suave">Queda al final de la carta: después la podés subir con las flechas de la lista.</p>
    </Tarjeta>
  );
}
