"use client";

import { useState, useTransition } from "react";
import { alternarDisponibleProducto } from "./actions";

/**
 * "Se acabó" / "Hay".
 *
 * Es el control que más se toca durante un servicio, y el único de la carta
 * que puede usar un empleado. Por eso es un interruptor de un toque y no un
 * formulario: cuando se acaba algo, la cocina no tiene tiempo de entrar a
 * editar el producto.
 */
export function DisponibleToggle({
  id,
  disponible,
  nombre,
}: {
  id: string;
  disponible: boolean;
  nombre: string;
}) {
  const [pendiente, iniciar] = useTransition();
  const [valor, setValor] = useState(disponible);

  return (
    <button
      type="button"
      disabled={pendiente}
      aria-pressed={valor}
      aria-label={valor ? `Marcar ${nombre} como agotado` : `Marcar ${nombre} como disponible`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const nuevo = !valor;
        setValor(nuevo); // se mueve al instante; el servidor confirma después
        iniciar(async () => {
          try {
            await alternarDisponibleProducto(id, nuevo);
          } catch {
            setValor(!nuevo); // no se pudo: vuelve como estaba
          }
        });
      }}
      className={`flex flex-none items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.74rem] font-semibold transition-colors duration-150 disabled:opacity-60 ${
        valor
          ? "border-exito/40 bg-exito-tinte text-exito"
          : "border-peligro/40 bg-peligro-tinte text-peligro"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${valor ? "bg-exito" : "bg-peligro"}`}
      />
      {valor ? "Hay" : "Se acabó"}
    </button>
  );
}
