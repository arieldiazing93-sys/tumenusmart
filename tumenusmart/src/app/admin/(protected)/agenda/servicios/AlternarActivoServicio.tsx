"use client";

import { useState, useTransition } from "react";
import { alternarActivoServicio } from "./actions";

/**
 * "Activo" / "Suspendido", de un solo toque: para dejar de ofrecer un servicio sin borrarlo
 * (se conserva con su historial, y se puede reactivar en cualquier momento). Mismo patrón que
 * el "Hay" / "Se acabó" de Productos, para no tener que entrar a Editar solo para esto.
 */
export function AlternarActivoServicio({
  id,
  activo,
  nombre,
}: {
  id: string;
  activo: boolean;
  nombre: string;
}) {
  const [pendiente, iniciar] = useTransition();
  const [valor, setValor] = useState(activo);

  return (
    <button
      type="button"
      disabled={pendiente}
      aria-pressed={valor}
      aria-label={valor ? `Suspender ${nombre}` : `Reactivar ${nombre}`}
      title={valor ? "Se ofrece: tocá para suspenderlo" : "Suspendido: tocá para volver a ofrecerlo"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const nuevo = !valor;
        setValor(nuevo); // se mueve al instante; el servidor confirma después
        iniciar(async () => {
          try {
            const r = await alternarActivoServicio(id, nuevo);
            if (!r.ok) setValor(!nuevo);
          } catch {
            setValor(!nuevo); // no se pudo: vuelve como estaba
          }
        });
      }}
      className={`flex flex-none items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.74rem] font-semibold transition-colors duration-150 disabled:opacity-60 ${
        valor ? "border-exito/40 bg-exito-tinte text-exito" : "border-peligro/40 bg-peligro-tinte text-peligro"
      }`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${valor ? "bg-exito" : "bg-peligro"}`} />
      {valor ? "Activo" : "Suspendido"}
    </button>
  );
}
