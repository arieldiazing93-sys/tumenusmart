"use client";

import { useTransition } from "react";
import { eliminarZona, alternarActivaZona } from "./actions";

export function EliminarZonaBoton({ id, activo }: { id: string; activo: boolean }) {
  const [pending, startTransition] = useTransition();

  function borrar() {
    if (!confirm("¿Borrar esta zona? No se puede deshacer.")) return;
    startTransition(async () => {
      // alert() y no un texto en la pantalla: el mensaje explica por qué no
      // se puede borrar y qué hacer en su lugar, y es demasiado largo para
      // meterlo apretado al lado del botón sin que se lea como una franja
      // de texto chico ilegible. Un diálogo nativo se lee siempre entero,
      // sea cual sea el ancho de pantalla.
      const resultado = await eliminarZona(id);
      if (!resultado.ok) alert(resultado.error);
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => alternarActivaZona(id, !activo))}
        className="text-sm text-tinta-media hover:underline disabled:opacity-50"
      >
        {activo ? "Desactivar" : "Activar"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={borrar}
        className="text-sm text-peligro hover:underline disabled:opacity-50"
      >
        Borrar
      </button>
    </div>
  );
}
