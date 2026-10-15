"use client";

import { useState } from "react";
import { Pastilla, Vacio, clasesBoton } from "@/components/ui";
import { PanelLateral } from "@/components/PanelLateral";
import { datosDeTipo, etiquetaDeAusencia } from "@/lib/ausencias";
import { diaEnTexto } from "@/lib/rango-dias";
import { FormularioAusencia, type PersonaOpcion } from "./FormularioAusencia";

export type RegistroFila = {
  id: string;
  colaboradorId: string;
  nombre: string;
  cargo: string | null;
  desde: string;
  hasta: string;
  tipo: string;
  pagado: boolean;
  nota: string | null;
  /** Días corridos que abarca. */
  dias: number;
  creadoPor: string | null;
};

type Panel = null | { modo: "nuevo" } | { modo: "editar"; id: string };

/**
 * Las ausencias anotadas: qué pasó, de qué día a qué día, si se paga y el comentario. "Anotar ausencia" y "Editar" abren el panel
 * lateral con el formulario (el mismo que se usa para justificar una falta desde Marcaciones).
 */
export function ListaAusencias({ registros, personas }: { registros: RegistroFila[]; personas: PersonaOpcion[] }) {
  const [panel, setPanel] = useState<Panel>(null);
  const editado = panel && panel.modo === "editar" ? (registros.find((r) => r.id === panel.id) ?? null) : null;

  const botonNuevo = (
    <button type="button" onClick={() => setPanel({ modo: "nuevo" })} className={clasesBoton("nuevo", "md")}>
      <span aria-hidden="true" className="text-[1.1rem] leading-none">
        +
      </span>
      Anotar ausencia
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">{botonNuevo}</div>

      {registros.length === 0 ? (
        <Vacio
          titulo="No hay ausencias anotadas en este período"
          detalle="Cuando alguien no venga y avise, o presente un certificado, anotalo acá: en Marcaciones deja de aparecer como falta sin aviso y la liquidación lo tiene en cuenta."
          accion={botonNuevo}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {registros.map((r) => {
            const tipo = datosDeTipo(r.tipo);
            return (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border-2 border-azul/50 bg-superficie p-3"
              >
                <div className="min-w-[10rem] flex-1">
                  <p className="truncate text-[0.95rem] font-semibold text-tinta">{r.nombre}</p>
                  <p className="text-[0.8rem] text-tinta-media">
                    {r.desde === r.hasta ? diaEnTexto(r.desde) : `${diaEnTexto(r.desde)} al ${diaEnTexto(r.hasta)}`}
                    {r.dias > 1 && <span className="text-tinta-suave"> · {r.dias} días</span>}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Pastilla color={tipo?.color ?? "neutro"}>{etiquetaDeAusencia(r.tipo)}</Pastilla>
                  <Pastilla color={r.pagado ? "exito" : "amarillo"}>{r.pagado ? "Se paga" : "Sin goce"}</Pastilla>
                </div>
                {r.nota && <p className="w-full text-[0.8rem] leading-snug text-tinta-media sm:w-auto sm:max-w-[22rem]">{r.nota}</p>}
                <button
                  type="button"
                  onClick={() => setPanel({ modo: "editar", id: r.id })}
                  className={`${clasesBoton("suave", "sm")} ml-auto`}
                >
                  Editar
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {panel && (panel.modo === "nuevo" || editado) && (
        <PanelLateral titulo={panel.modo === "nuevo" ? "Anotar ausencia" : "Editar ausencia"} onCerrar={() => setPanel(null)}>
          <FormularioAusencia
            key={panel.modo === "nuevo" ? "nuevo" : `editar-${panel.id}`}
            ausencia={editado}
            personas={personas}
            onCerrar={() => setPanel(null)}
          />
        </PanelLateral>
      )}
    </div>
  );
}
