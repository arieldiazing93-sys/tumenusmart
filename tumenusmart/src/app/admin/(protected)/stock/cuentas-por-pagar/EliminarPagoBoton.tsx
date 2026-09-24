"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clasesBoton } from "@/components/ui";
import { eliminarPagoCompra } from "./actions";

/**
 * Elimina un pago cargado por error. Pide confirmación en el mismo lugar (no
 * borra de un clic): la compra vuelve a deber ese monto.
 */
export function EliminarPagoBoton({ pagoId }: { pagoId: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function eliminar() {
    setError(null);
    iniciar(async () => {
      const resultado = await eliminarPagoCompra(pagoId);
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
        {error && <p className="text-xs font-medium text-peligro">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <span className="text-xs text-tinta-media">¿Eliminar este pago?</span>
      <button type="button" disabled={pendiente} onClick={eliminar} className={clasesBoton("peligro", "sm")}>
        {pendiente ? "Eliminando…" : "Sí, eliminar"}
      </button>
      <button type="button" disabled={pendiente} onClick={() => setConfirmando(false)} className={clasesBoton("suave", "sm")}>
        No
      </button>
    </div>
  );
}
