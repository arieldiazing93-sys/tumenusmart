"use client";

import { NOMBRES_DIA, DIAS_ORDENADOS } from "@/lib/horario-atencion";
import { EliminarTramoCategoriaBoton } from "./[id]/EliminarTramoCategoriaBoton";
import { AgregarTramoCategoriaForm } from "./[id]/AgregarTramoCategoriaForm";

export type TramoDatos = { id: string; diaSemana: number; abre: string; cierra: string };

/**
 * El horario de BLOQUEO de una categoría: los días y horas en que NO se muestra
 * en la carta (ej: "Hamburguesas Simple" no se vende lunes ni martes). Sin
 * ningún tramo cargado la categoría se muestra siempre. Es la misma pantalla que
 * antes era una página aparte, ahora adentro del panel de la categoría.
 *
 * `ocultaAhora` lo calcula el servidor con la hora de Asunción (la del navegador
 * podría ser otra).
 */
export function HorarioCategoria({
  categoryId,
  tramos,
  ocultaAhora,
}: {
  categoryId: string;
  tramos: TramoDatos[];
  ocultaAhora: boolean;
}) {
  const sinConfigurar = tramos.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="rotulo text-[0.8rem] font-bold">Horario de bloqueo</p>
        <p className="text-sm text-tinta-media">
          Por defecto la categoría se muestra siempre. Cargá acá solo los días y horarios en que{" "}
          <strong>NO</strong> querés venderla; el resto del tiempo sigue visible como siempre.
        </p>
      </div>

      <div
        className={`rounded-lg border p-3 ${
          sinConfigurar
            ? "border-linea bg-white"
            : ocultaAhora
              ? "border-aviso/30 bg-aviso-luz"
              : "border-exito/30 bg-exito-luz"
        }`}
      >
        {sinConfigurar ? (
          <p className="text-sm text-tinta-media">
            Todavía no cargaste ningún bloqueo, así que esta categoría se muestra <strong>siempre</strong>.
          </p>
        ) : ocultaAhora ? (
          <p className="text-sm font-medium text-aviso">🔴 Ahora mismo está OCULTA de la carta por el bloqueo que cargaste.</p>
        ) : (
          <p className="text-sm font-medium text-exito">
            🟢 Ahora mismo está VISIBLE en la carta (no estás dentro de ningún bloqueo).
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-linea bg-white">
        <div className="divide-y divide-linea-fina">
          {DIAS_ORDENADOS.map((dia) => {
            const delDia = tramos.filter((t) => t.diaSemana === dia);
            return (
              <div key={dia} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3">
                <span className="w-24 flex-none font-medium text-tinta">{NOMBRES_DIA[dia]}</span>

                <div className="flex min-w-[10rem] flex-1 flex-wrap items-center gap-1.5">
                  {delDia.length === 0 ? (
                    <span className="rounded-full bg-exito-luz px-2.5 py-0.5 text-xs font-medium text-exito">
                      Visible todo el día
                    </span>
                  ) : (
                    delDia.map((t) => {
                      const todoElDia = t.abre === "00:00" && t.cierra === "23:59";
                      return (
                        <span
                          key={t.id}
                          className="inline-flex items-center gap-1.5 rounded-full border border-aviso/30 bg-aviso-luz px-2.5 py-1 text-sm text-aviso"
                        >
                          {todoElDia ? "Todo el día" : `${t.abre}–${t.cierra}`}
                          {!todoElDia && t.cierra <= t.abre && <span className="text-[10px] text-tinta-suave">+1 día</span>}
                          <EliminarTramoCategoriaBoton categoryId={categoryId} id={t.id} />
                        </span>
                      );
                    })
                  )}
                </div>

                <AgregarTramoCategoriaForm categoryId={categoryId} dia={dia} diaLabel={NOMBRES_DIA[dia]} />
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-tinta-suave">
        Para bloquear un día entero (como lunes y martes en el ejemplo), tildá “Bloquear el día entero” al cargarlo. Si
        el bloqueo cruza la medianoche (ej: 19:00 a 01:00), cargalo tal cual — el sistema entiende que termina al día
        siguiente.
      </p>
    </div>
  );
}
