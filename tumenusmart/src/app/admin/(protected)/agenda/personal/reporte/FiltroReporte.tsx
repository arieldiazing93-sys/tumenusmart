"use client";

import { useState } from "react";
import { Boton, Campo, Entrada, Selector } from "@/components/ui";

export type AtajoReporte = { etiqueta: string; desde: string; hasta: string };
export type PersonaDelFiltro = { id: string; nombre: string; activo: boolean };

/**
 * Lo que se elige antes de ver el reporte de movimiento del personal: a quién (o a todos) y el
 * período. Nada se calcula hasta tocar "Ver reporte": el formulario manda lo elegido en la
 * dirección de la página y ahí se arma el reporte. Los atajos solo completan las fechas.
 */
export function FiltroReporte({
  personal,
  valores,
  atajos,
}: {
  personal: PersonaDelFiltro[];
  valores: { personal: string; desde: string; hasta: string };
  atajos: AtajoReporte[];
}) {
  const [elegido, setElegido] = useState(valores.personal);
  const [desde, setDesde] = useState(valores.desde);
  const [hasta, setHasta] = useState(valores.hasta);

  return (
    <form
      method="get"
      action="/admin/agenda/personal/reporte"
      className="mb-4 rounded-xl border border-linea bg-superficie p-3.5"
    >
      <div className="flex flex-wrap items-end gap-3">
        <Campo etiqueta="Personal" className="min-w-[13rem] flex-1">
          <Selector name="personal" value={elegido} onChange={(e) => setElegido(e.target.value)}>
            <option value="todos">Todo el personal</option>
            {personal.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
                {p.activo ? "" : " (inactivo)"}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Desde" className="w-40">
          <Entrada
            type="date"
            name="desde"
            value={desde}
            max={hasta || undefined}
            onChange={(e) => setDesde(e.target.value)}
            required
          />
        </Campo>
        <Campo etiqueta="Hasta" className="w-40">
          <Entrada
            type="date"
            name="hasta"
            value={hasta}
            min={desde || undefined}
            onChange={(e) => setHasta(e.target.value)}
            required
          />
        </Campo>
        <Boton type="submit">Ver reporte</Boton>
      </div>

      <div role="group" aria-label="Períodos rápidos" className="mt-2.5 flex flex-wrap gap-1.5">
        {atajos.map((a) => {
          const activo = desde === a.desde && hasta === a.hasta;
          return (
            <button
              key={a.etiqueta}
              type="button"
              aria-pressed={activo}
              onClick={() => {
                setDesde(a.desde);
                setHasta(a.hasta);
              }}
              className={`rounded-full border px-3 py-1 text-[0.78rem] font-medium transition-colors ${
                activo
                  ? "border-azul bg-azul-luz text-azul-oscuro"
                  : "border-linea text-tinta-media hover:border-azul/40 hover:text-tinta"
              }`}
            >
              {a.etiqueta}
            </button>
          );
        })}
      </div>
    </form>
  );
}
