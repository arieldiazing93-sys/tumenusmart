"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clasesBoton } from "@/components/ui";
import { eliminarCotizacion } from "./actions";

/**
 * Borra un presupuesto. Pide confirmación en el mismo lugar (no borra de un
 * clic). No afecta nada más: no mueve stock, caja ni facturas.
 */
export function EliminarCotizacionBoton({ cotizacionId }: { cotizacionId: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function eliminar() {
    setError(null);
    iniciar(async () => {
      const resultado = await eliminarCotizacion(cotizacionId);
      if (!resultado.ok) {
        setError(resultado.error);
        setConfirmando(false);
        return;
      }
      router.push("/admin/cotizaciones");
      router.refresh();
    });
  }

  if (!confirmando) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button type="button" onClick={() => setConfirmando(true)} className={clasesBoton("peligro")}>
          Eliminar
        </button>
        {error && <p className="text-xs font-medium text-peligro">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-sm text-tinta-media">¿Eliminar este presupuesto?</span>
      <button type="button" disabled={pendiente} onClick={eliminar} className={clasesBoton("peligro", "sm")}>
        {pendiente ? "Eliminando…" : "Sí, eliminar"}
      </button>
      <button type="button" disabled={pendiente} onClick={() => setConfirmando(false)} className={clasesBoton("suave", "sm")}>
        No
      </button>
    </div>
  );
}
