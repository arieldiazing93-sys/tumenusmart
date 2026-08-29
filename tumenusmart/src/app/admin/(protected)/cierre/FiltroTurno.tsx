"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Boton } from "@/components/ui";

/**
 * Elegir de qué turno se está cerrando la caja.
 *
 * Los tres botones de arriba resuelven el 95% de las veces y evitan tener que
 * pensar en fechas: "Esta jornada" ya entiende que a las 2 de la madrugada
 * todavía se está trabajando la noche anterior. El rango a mano queda para
 * cuando hay que revisar algo viejo.
 */
export function FiltroTurno({
  desde,
  hasta,
  activo,
}: {
  /** Valores para los campos, en hora de Asunción ("YYYY-MM-DDTHH:MM"). */
  desde: string;
  hasta: string;
  activo: "jornada" | "anterior" | "todo" | "manual";
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [d, setD] = useState(desde);
  const [h, setH] = useState(hasta);
  const [abierto, setAbierto] = useState(activo === "manual");

  function ir(query: string) {
    router.push(`/admin/cierre${query}`);
  }

  const clase = (esActivo: boolean) =>
    `rounded-lg border px-3 py-1.5 text-[0.82rem] font-semibold transition-colors ${
      esActivo
        ? "border-brand bg-brand-light text-brand-texto"
        : "border-linea bg-white text-tinta-media hover:border-brand"
    }`;

  return (
    <div className="mb-5 rounded-xl border border-linea bg-white p-3 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={clase(activo === "jornada")} onClick={() => ir("")}>
          Esta jornada
        </button>
        <button
          type="button"
          className={clase(activo === "anterior")}
          onClick={() => ir("?turno=anterior")}
        >
          Jornada anterior
        </button>
        <button
          type="button"
          className={clase(activo === "todo")}
          onClick={() => ir("?turno=todo")}
        >
          Todo lo pendiente
        </button>

        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className={`${clase(activo === "manual")} ml-auto`}
        >
          {abierto ? "Cerrar" : "Otro rango…"}
        </button>
      </div>

      {abierto && (
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-linea-fina pt-3">
          <label className="flex flex-col gap-1">
            <span className="text-[0.75rem] font-medium text-tinta-media">Desde</span>
            <input
              type="datetime-local"
              value={d}
              onChange={(e) => setD(e.target.value)}
              className="rounded-lg border border-linea px-2.5 py-1.5 text-[0.85rem]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[0.75rem] font-medium text-tinta-media">Hasta</span>
            <input
              type="datetime-local"
              value={h}
              onChange={(e) => setH(e.target.value)}
              className="rounded-lg border border-linea px-2.5 py-1.5 text-[0.85rem]"
            />
          </label>
          <Boton
            tam="sm"
            onClick={() =>
              ir(`?desde=${encodeURIComponent(d)}&hasta=${encodeURIComponent(h)}`)
            }
          >
            Aplicar
          </Boton>
        </div>
      )}

      {/* La hora que se muestra es siempre la de Paraguay, no la del aparato
          desde donde se mira: si el dueño abre esto de viaje, los números
          tienen que seguir siendo los de su local. */}
      <p className="mt-2 text-[0.75rem] text-tinta-suave">
        {params.get("turno") === "todo"
          ? "Mostrando todo lo que está sin rendir, sin importar la fecha."
          : "Una jornada va de las 6 de la mañana a las 6 de la mañana del día siguiente, en hora de Paraguay — así una entrega de la madrugada queda en la noche que le corresponde."}
      </p>
    </div>
  );
}
