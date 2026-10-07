"use client";

import { useState, useTransition } from "react";
import { Tarjeta, Campo, Entrada, clasesBoton } from "@/components/ui";
import { crearGrupo } from "./actions";

/**
 * El formulario de "Nuevo grupo", en el panel de la derecha. Al crearlo se abre
 * el grupo para cargarle sus modificadores enseguida.
 */
export function CrearGrupoForm({
  onCreado,
  onCancelar,
}: {
  onCreado: (id: string) => void;
  onCancelar: () => void;
}) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function alCrear(formData: FormData) {
    setError(null);
    iniciar(async () => {
      const resultado = await crearGrupo(formData);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      onCreado(resultado.id);
    });
  }

  return (
    <Tarjeta className="!border-2 !border-azul/50 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[1.1rem] font-semibold tracking-titular text-tinta">Nuevo grupo</h2>
        <button type="button" onClick={onCancelar} className={clasesBoton("peligro", "sm")}>
          Cancelar
        </button>
      </div>
      <form action={alCrear} className="campos-grises flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <Campo etiqueta="Nombre">
            <Entrada name="nombre" required autoFocus placeholder="Ej: Salsas, Quesos, Toppings" />
          </Campo>
        </div>
        <button type="submit" disabled={pendiente} className={clasesBoton("nuevo")}>
          {pendiente ? "Creando…" : "Crear grupo"}
        </button>
      </form>
      {error && <p className="text-sm font-medium text-peligro">{error}</p>}
      <p className="text-xs text-tinta-suave">
        Después de crearlo vas a poder agregarle los modificadores. Cada modificador es un producto real de tu
        catálogo (creálo primero en Productos).
      </p>
    </Tarjeta>
  );
}
