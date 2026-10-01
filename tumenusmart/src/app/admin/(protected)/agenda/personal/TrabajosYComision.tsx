"use client";

import { useEffect, useState } from "react";
import { PERIODOS_COMISION, type PeriodoComision } from "@/lib/agenda-personal";
import { formatearGuarani } from "@/lib/format";
import { trabajosDelPersonal, type ResultadoTrabajos } from "./actions";

/**
 * Los trabajos que terminó una persona (las citas que ya cobró a su nombre) en el período
 * elegido, y de acuerdo a eso, cuánto le toca de comisión. Sale de lo guardado: si acabás
 * de cambiar el porcentaje, guardá el formulario para que se use.
 */
export function TrabajosYComision({ id }: { id: string }) {
  const [periodo, setPeriodo] = useState<PeriodoComision>("mes");
  const [resultado, setResultado] = useState<ResultadoTrabajos | null>(null);

  useEffect(() => {
    let cancelado = false;
    setResultado(null);
    trabajosDelPersonal(id, periodo)
      .then((r) => {
        if (!cancelado) setResultado(r);
      })
      .catch(() => {
        if (!cancelado) setResultado({ ok: false, error: "No se pudieron cargar los trabajos. Probá de nuevo." });
      });
    return () => {
      cancelado = true;
    };
  }, [id, periodo]);

  return (
    <div className="rounded-lg border-2 border-azul/50 bg-superficie p-3">
      <p className="text-[0.86rem] font-semibold text-tinta">Trabajos y comisión</p>
      <p className="mt-0.5 text-[0.78rem] leading-snug text-tinta-suave">
        Los trabajos que terminó (citas cobradas a su nombre) y lo que le toca de comisión.
      </p>

      <div role="group" aria-label="Período" className="mt-2.5 flex flex-wrap gap-1.5">
        {PERIODOS_COMISION.map((p) => (
          <button
            key={p.valor}
            type="button"
            aria-pressed={periodo === p.valor}
            onClick={() => setPeriodo(p.valor)}
            className={`rounded-full border px-3 py-1 text-[0.78rem] font-medium transition-colors ${
              periodo === p.valor
                ? "border-azul bg-azul-luz text-azul-oscuro"
                : "border-linea text-tinta-media hover:border-azul/40 hover:text-tinta"
            }`}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      {resultado === null ? (
        <p className="mt-3 text-[0.82rem] text-tinta-suave">Cargando…</p>
      ) : !resultado.ok ? (
        <p className="mt-3 rounded-lg bg-peligro-luz px-3 py-2 text-[0.8rem] text-peligro">{resultado.error}</p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg bg-papel-suave px-2 py-2">
              <dt className="text-[0.68rem] font-medium text-tinta-suave">Trabajos</dt>
              <dd className="cifra mt-0.5 text-[1.05rem] font-semibold text-tinta">{resultado.trabajos.length}</dd>
            </div>
            <div className="rounded-lg bg-papel-suave px-2 py-2">
              <dt className="text-[0.68rem] font-medium text-tinta-suave">Cobrado</dt>
              <dd className="cifra mt-0.5 truncate text-[0.9rem] font-semibold text-tinta">
                {formatearGuarani(resultado.totalCobrado)}
              </dd>
            </div>
            <div className="rounded-lg bg-exito-luz px-2 py-2">
              <dt className="text-[0.68rem] font-medium text-exito">Comisión servicio</dt>
              <dd className="cifra mt-0.5 truncate text-[0.9rem] font-bold text-exito">
                {formatearGuarani(resultado.totalComision)}
              </dd>
            </div>
            <div className="rounded-lg bg-exito-luz px-2 py-2">
              <dt className="text-[0.68rem] font-medium text-exito">Comisión producto</dt>
              <dd className="cifra mt-0.5 truncate text-[0.9rem] font-bold text-exito">
                {formatearGuarani(resultado.totalComisionProducto)}
              </dd>
            </div>
          </dl>

          {resultado.comisionActual === null && resultado.trabajos.some((t) => t.porcentaje === null) && (
            <p className="mt-2 rounded-lg bg-aviso-luz px-3 py-2 text-[0.78rem] leading-snug text-aviso">
              Todavía no tiene una comisión cargada. Poné el porcentaje arriba y guardá para calcularla.
            </p>
          )}

          {/* Sin trabajos NI comisión de producto: ahí sí no hay nada que mostrar. Alguien que solo
              vendió productos (sin hacer ningún corte) no puede caer acá solo por tener 0 trabajos. */}
          {resultado.trabajos.length === 0 && resultado.totalComisionProducto === 0 && (
            <p className="mt-3 rounded-lg border border-dashed border-linea bg-papel-suave px-3 py-4 text-center text-[0.82rem] text-tinta-media">
              No hay movimiento en este período.
            </p>
          )}

          {/* Rarísimo (más de 300 trabajos en el período) pero posible: las cifras de arriba salen de
              una lista con tope, así que si lo pasa dejan de ser exactas — mejor avisarlo que mostrar
              un número que parece total y no lo es. El detalle fila por fila se ve en Reporte de personal. */}
          {resultado.hayMas && (
            <p className="mt-2 rounded-lg bg-aviso-luz px-3 py-2 text-[0.76rem] leading-snug text-aviso">
              Hay más de 300 trabajos en este período: las cifras de arriba no los cuentan todos. Para el total
              exacto, mirá el Reporte de personal.
            </p>
          )}
        </>
      )}
    </div>
  );
}
