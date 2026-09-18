"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clasesBoton } from "@/components/ui";
import { alternarFacturaObligatoria } from "./actions";

/**
 * Política a nivel de LOCAL (no de un punto de expedición puntual): si el
 * timbrado Autoimpresor de este negocio exige facturar TODA venta, el
 * dueño lo prende acá. Se guarda al instante, mismo patrón que
 * PausaPedidosToggle.
 */
export function FacturaObligatoriaToggle({ obligatoria }: { obligatoria: boolean }) {
  const router = useRouter();
  const [activo, setActivo] = useState(obligatoria);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function alternar() {
    const nuevo = !activo;
    setActivo(nuevo);
    setError(null);
    startTransition(async () => {
      try {
        await alternarFacturaObligatoria(nuevo);
        router.refresh();
      } catch (err) {
        setActivo(!nuevo); // vuelve atrás si no se pudo guardar
        setError(err instanceof Error ? err.message : "No se pudo cambiar el estado");
      }
    });
  }

  return (
    <div className={`mb-5 rounded-lg border p-4 ${activo ? "border-brand/30 bg-papel-suave" : "border-linea bg-white"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-tinta">
            {activo ? "🧾 Facturar todas las ventas: obligatorio" : "Facturar todas las ventas: opcional"}
          </p>
          <p className="text-sm text-tinta-media">
            {activo
              ? 'Prendido: en el Punto de Venta ya no se puede vender "Ticket" (solo Factura), y en el checkout público el que elige "Ticket" queda facturado igual, a Consumidor Final.'
              : "Activalo solo si tu timbrado Autoimpresor te obliga a facturar toda venta (RG 90/2021 SET/DNIT). Apagado, todo sigue como hasta ahora."}
          </p>
        </div>
        <button type="button" onClick={alternar} disabled={pending} className={clasesBoton("navegar", "md")}>
          {pending ? "Guardando..." : activo ? "Desactivar" : "Activar"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-peligro">{error}</p>}
    </div>
  );
}
