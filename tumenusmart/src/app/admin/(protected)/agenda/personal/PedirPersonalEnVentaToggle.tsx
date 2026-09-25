"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Interruptor } from "@/components/Interruptor";
import { alternarPedirPersonalEnVenta } from "./actions";

/**
 * La opción de "preguntar el personal al cobrar" en el punto de venta. Es para los negocios donde
 * llega gente sin reserva (barberías, salones): al cobrar en el mostrador el punto de venta
 * pregunta a quién se le asigna el trabajo. En los demás negocios se deja apagada y el punto de
 * venta no muestra nada del personal. Se guarda al instante.
 */
export function PedirPersonalEnVentaToggle({ activa }: { activa: boolean }) {
  const router = useRouter();
  const [activo, setActivo] = useState(activa);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function cambiar(nuevo: boolean) {
    setActivo(nuevo);
    setError(null);
    iniciar(async () => {
      try {
        const r = await alternarPedirPersonalEnVenta(nuevo);
        if (!r.ok) {
          setActivo(!nuevo);
          setError(r.error);
          return;
        }
        router.refresh();
      } catch {
        setActivo(!nuevo); // vuelve atrás si no se pudo guardar
        setError("No se pudo guardar el cambio. Probá de nuevo.");
      }
    });
  }

  return (
    <div className="rounded-xl border border-linea bg-superficie p-3.5">
      <div className="flex items-start gap-3">
        <div className="pt-0.5">
          <Interruptor
            activo={activo}
            onChange={cambiar}
            etiqueta="Preguntar el personal al cobrar en el punto de venta"
            tono="azul"
            deshabilitado={pendiente}
          />
        </div>
        <div className="min-w-0">
          <p className="text-[0.9rem] font-semibold text-tinta">Preguntar el personal al cobrar en el punto de venta</p>
          <p className="mt-0.5 text-[0.8rem] leading-snug text-tinta-media">
            Para los negocios donde llega gente sin reserva: al cobrar en el mostrador pregunta a quién se le asigna el
            trabajo, y queda a su nombre (cuenta en su vista de trabajo y en su comisión). Apagado, el punto de venta no
            muestra el personal.
          </p>
        </div>
      </div>
      {error && <p className="mt-2 text-[0.78rem] font-medium text-peligro">{error}</p>}
    </div>
  );
}
