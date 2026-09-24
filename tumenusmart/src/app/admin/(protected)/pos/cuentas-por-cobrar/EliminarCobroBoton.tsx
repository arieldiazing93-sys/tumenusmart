"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clasesBoton } from "@/components/ui";
import { eliminarCobroVenta } from "./actions";

/**
 * Elimina un cobro cargado por error. Pide confirmación en el mismo lugar (no
 * borra de un clic): la venta vuelve a deber ese monto, y si fue en efectivo se
 * saca también el ingreso de caja que generó.
 */
export function EliminarCobroBoton({ cobroId }: { cobroId: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function eliminar() {
    setError(null);
    iniciar(async () => {
      const resultado = await eliminarCobroVenta(cobroId);
      if (!resultado.ok) {
        setError(resultado.error);
        setConfirmando(false);
        return;
      }
      router.refresh();
    });
  }

  if (!confirmando) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button type="button" onClick={() => setConfirmando(true)} className={clasesBoton("peligro", "sm")}>
          Eliminar
        </button>
        {error && <p className="max-w-[16rem] text-right text-xs font-medium text-peligro">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <span className="text-xs text-tinta-media">¿Eliminar este cobro?</span>
      <button type="button" disabled={pendiente} onClick={eliminar} className={clasesBoton("peligro", "sm")}>
        {pendiente ? "Eliminando…" : "Sí, eliminar"}
      </button>
      <button type="button" disabled={pendiente} onClick={() => setConfirmando(false)} className={clasesBoton("suave", "sm")}>
        No
      </button>
    </div>
  );
}
