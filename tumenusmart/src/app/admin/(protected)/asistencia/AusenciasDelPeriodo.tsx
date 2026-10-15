"use client";

import { useState } from "react";
import { Pastilla, clasesBoton } from "@/components/ui";
import { PanelLateral } from "@/components/PanelLateral";
import { datosDeTipo } from "@/lib/ausencias";
import type { FilaAusenciaReporte } from "@/lib/reporte-asistencia";
import { FormularioAusencia, type PersonaOpcion } from "./ausencias/FormularioAusencia";

/**
 * Los días del período en que alguien tenía que ir y no marcó: las faltas sin aviso (con el botón «Justificar» para anotar por qué),
 * los días con su motivo anotado (reposo, aviso, vacaciones, feriado) y, hoy, los que todavía no marcaron. Un reposo de varios días
 * es una sola fila. El formulario es el mismo de la pantalla Ausencias.
 */
export function AusenciasDelPeriodo({
  filas,
  personas,
}: {
  filas: FilaAusenciaReporte[];
  personas: PersonaOpcion[];
}) {
  const [abierta, setAbierta] = useState<FilaAusenciaReporte | null>(null);
  if (filas.length === 0) return null;

  const faltas = filas.filter((f) => f.estado === "falta").length;

  return (
    <>
      <details open={faltas > 0} className="group rounded-xl border-2 border-azul/50 bg-superficie">
        <summary className="cursor-pointer select-none list-none px-3 py-2 text-[0.82rem] font-semibold text-azul-oscuro">
          Ausencias del período ({filas.length})
          {faltas > 0 && <span className="ml-1.5 font-semibold text-peligro">· {faltas} sin justificar</span>}
          <span className="ml-1.5 font-normal text-tinta-suave group-open:hidden">· tocá para ver</span>
        </summary>
        <ul className="divide-y divide-linea-fina border-t border-linea">
          {filas.map((f) => {
            const tipo = f.tipo ? datosDeTipo(f.tipo) : null;
            return (
              <li key={f.clave} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
                <div className="min-w-[9rem] flex-1">
                  <p className="truncate text-[0.84rem] font-semibold text-tinta">{f.nombre}</p>
                  <p className="text-[0.74rem] text-tinta-media">
                    {f.diaTexto}
                    {f.dias > 1 && <span className="text-tinta-suave"> · {f.dias} días</span>}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Pastilla color={f.estado === "falta" ? "peligro" : f.estado === "pendiente" ? "neutro" : (tipo?.color ?? "neutro")}>
                    {f.etiqueta}
                  </Pastilla>
                  {f.estado === "justificado" && (
                    <Pastilla color={f.pagado ? "exito" : "amarillo"}>{f.pagado ? "Se paga" : "Sin goce"}</Pastilla>
                  )}
                </div>
                {f.nota && <p className="w-full text-[0.76rem] leading-snug text-tinta-media sm:w-auto sm:max-w-[18rem]">{f.nota}</p>}
                <button
                  type="button"
                  onClick={() => setAbierta(f)}
                  className={`${f.estado === "justificado" ? clasesBoton("suave", "sm") : clasesBoton("navegar", "sm")} ml-auto`}
                >
                  {f.estado === "justificado" ? "Editar" : "Justificar"}
                </button>
              </li>
            );
          })}
        </ul>
      </details>

      {abierta && (
        <PanelLateral
          titulo={abierta.estado === "justificado" ? "Editar ausencia" : `Justificar a ${abierta.nombre}`}
          onCerrar={() => setAbierta(null)}
        >
          <FormularioAusencia
            key={abierta.clave}
            ausencia={
              abierta.estado === "justificado" && abierta.ausenciaId && abierta.tipo && abierta.ausenciaDesde && abierta.ausenciaHasta
                ? {
                    id: abierta.ausenciaId,
                    colaboradorId: abierta.colaboradorId,
                    tipo: abierta.tipo,
                    desde: abierta.ausenciaDesde,
                    hasta: abierta.ausenciaHasta,
                    pagado: abierta.pagado,
                    nota: abierta.nota,
                  }
                : null
            }
            inicial={{ colaboradorId: abierta.colaboradorId, dia: abierta.dia, tipo: abierta.estado === "pendiente" ? "aviso" : "reposo" }}
            personas={personas}
            onCerrar={() => setAbierta(null)}
          />
        </PanelLateral>
      )}
    </>
  );
}
