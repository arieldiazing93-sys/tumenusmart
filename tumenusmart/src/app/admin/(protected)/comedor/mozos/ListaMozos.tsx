"use client";

import { useState } from "react";
import { Pastilla, Vacio, clasesBoton } from "@/components/ui";
import { PanelLateral } from "@/components/PanelLateral";
import { FormularioMozo, type MozoFila } from "./FormularioMozo";

/** Qué muestra el panel lateral: nada, el alta o la edición de un mozo. */
type PanelMozo = null | { modo: "nuevo" } | { modo: "editar"; id: string };

function nombreCompleto(m: MozoFila): string {
  return [m.nombre, m.apellido].filter(Boolean).join(" ");
}

/** La lista de mozos con su botón de alta (verde) y de edición (azul). */
export function ListaMozos({ mozos }: { mozos: MozoFila[] }) {
  const [panel, setPanel] = useState<PanelMozo>(null);
  const mozo = panel && panel.modo === "editar" ? (mozos.find((m) => m.id === panel.id) ?? null) : null;

  const botonAnadir = (
    <button type="button" onClick={() => setPanel({ modo: "nuevo" })} className={clasesBoton("nuevo", "md")}>
      <span aria-hidden="true" className="text-[1.1rem] leading-none">
        +
      </span>
      Añadir mozo
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      {mozos.length > 0 && <div className="flex justify-end">{botonAnadir}</div>}

      {mozos.length === 0 ? (
        <Vacio
          titulo="Todavía no cargaste a ningún mozo"
          detalle="Cada mozo entra al enlace con su propio PIN. Cargalos acá y pasales el enlace de arriba."
          accion={botonAnadir}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {mozos.map((m) => (
            <li
              key={m.id}
              className={`flex items-center gap-3 rounded-xl border-2 p-3 ${
                m.activo ? "border-azul/50 bg-superficie" : "border-amarillo bg-amarillo-luz"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.95rem] font-semibold text-tinta">{nombreCompleto(m)}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {m.activo ? (
                    <Pastilla color="exito" punto>
                      Activo
                    </Pastilla>
                  ) : (
                    <Pastilla color="amarillo" punto>
                      Desactivado
                    </Pastilla>
                  )}
                  {m.sinPin && <Pastilla color="peligro">Sin PIN: no puede entrar</Pastilla>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPanel({ modo: "editar", id: m.id })}
                className={clasesBoton("navegar", "sm")}
              >
                Editar
              </button>
            </li>
          ))}
        </ul>
      )}

      {panel && (panel.modo === "nuevo" || mozo) && (
        <PanelLateral titulo={panel.modo === "nuevo" ? "Añadir mozo" : "Editar mozo"} onCerrar={() => setPanel(null)}>
          <FormularioMozo
            key={panel.modo === "nuevo" ? "nuevo" : `editar-${panel.id}`}
            mozo={mozo}
            onCerrar={() => setPanel(null)}
          />
        </PanelLateral>
      )}
    </div>
  );
}
