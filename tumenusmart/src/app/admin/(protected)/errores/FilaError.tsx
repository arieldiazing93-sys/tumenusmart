"use client";

import { useState, useTransition } from "react";
import { Pastilla, clasesBoton } from "@/components/ui";
import { marcarErrorResuelto } from "./actions";

/**
 * Un problema en la lista.
 *
 * El rastro técnico viene plegado. Lo primero que uno necesita es decidir si
 * esto importa —qué local, cuántas veces, hace cuánto—; el detalle se abre
 * recién cuando se va a arreglar.
 */
export function FilaError({
  id,
  mensaje,
  ruta,
  local,
  usuario,
  detalle,
  ocurrencias,
  primeraVez,
  ultimaVez,
  avisado,
}: {
  id: string;
  mensaje: string;
  ruta: string;
  local: string | null;
  usuario: string | null;
  detalle: string | null;
  ocurrencias: number;
  primeraVez: string;
  ultimaVez: string;
  avisado: boolean;
}) {
  const [pendiente, iniciar] = useTransition();
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="rounded-xl border border-linea bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[0.9rem] font-semibold leading-snug tracking-titular text-tinta">
            {mensaje}
          </p>

          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.78rem] text-tinta-media">
            <span className="cifra">{ruta}</span>
            {local && (
              <>
                <span className="text-linea">·</span>
                <span>{local}</span>
              </>
            )}
            {usuario && (
              <>
                <span className="text-linea">·</span>
                <span>{usuario}</span>
              </>
            )}
          </p>

          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[0.76rem] text-tinta-suave">
            <Pastilla color={ocurrencias > 10 ? "peligro" : "neutro"}>
              {ocurrencias} {ocurrencias === 1 ? "vez" : "veces"}
            </Pastilla>
            <span>última: {ultimaVez}</span>
            {ocurrencias > 1 && <span>· primera: {primeraVez}</span>}
            {!avisado && (
              <span className="text-aviso">· no se avisó por correo</span>
            )}
          </p>
        </div>

        <div className="flex flex-none flex-wrap items-center gap-2">
          {detalle && (
            <button
              type="button"
              onClick={() => setAbierto((v) => !v)}
              className={clasesBoton("suave", "sm")}
            >
              {abierto ? "Ocultar detalle" : "Ver detalle"}
            </button>
          )}
          <button
            type="button"
            disabled={pendiente}
            onClick={() => iniciar(() => marcarErrorResuelto(id, true))}
            className={clasesBoton("navegar", "sm")}
          >
            Marcar resuelto
          </button>
        </div>
      </div>

      {abierto && detalle && (
        <pre className="cifra mt-3 max-h-80 overflow-auto rounded-lg border border-linea bg-papel-suave p-3 text-[0.72rem] leading-relaxed text-tinta-media">
          {detalle}
        </pre>
      )}
    </div>
  );
}
