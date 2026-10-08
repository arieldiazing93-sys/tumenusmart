"use client";

import { useState } from "react";
import { Campo, Entrada, Selector, clasesBoton } from "@/components/ui";
import { DIAS_ORDENADOS, NOMBRES_DIA } from "@/lib/horario-atencion";
import { segundosDeHora, textoDeHora, type Franja } from "@/lib/precio-promocion";

/** Una fila de la hoja: un día de inicio con su franja. `aplica` = la casilla "Aplica Lunes". */
export type FilaDeDia = {
  dia: number;
  aplica: boolean;
  horaInicio: string;
  diaFin: number;
  horaFin: string;
};

const DIAS_CORTOS = ["D", "L", "M", "X", "J", "V", "S"];

// La hoja de días en una línea por día (pantallas anchas): el nombre, el inicio, el día del fin (el que sobra se estira) y la hora del fin.
const COLUMNAS = "sm:grid-cols-[9.25rem_7.25rem_minmax(0,1fr)_7.25rem]";
const TITULO_COLUMNA = "text-[0.68rem] font-semibold uppercase tracking-rotulo text-tinta-suave";
// En el celular cada campo lleva su título chiquito arriba; en pantallas anchas lo reemplaza el de la fila de arriba (queda para lectores de pantalla).
const TITULO_EN_CELULAR = "mb-0.5 block text-[0.68rem] font-semibold text-tinta-suave sm:sr-only";
// Campos más bajos que los normales (el "!" gana sobre el relleno de siempre).
const CAMPO_COMPACTO = "!px-2 !py-1 !text-[0.84rem]";
// Las horas, en el celular: menos relleno y sin el ícono del reloj (que se toca igual en el campo), para que entre "18:00:00" completo.
const CAMPO_HORA = `${CAMPO_COMPACTO} max-sm:!px-1.5 max-sm:[&::-webkit-calendar-picker-indicator]:hidden`;
// En el celular, tres columnas por día: la del medio (el día del fin) un poco más ancha.
const COLUMNAS_CELULAR = "grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1fr)]";

export function filaVacia(dia: number): FilaDeDia {
  return { dia, aplica: false, horaInicio: "00:00:00", diaFin: dia, horaFin: "23:59:59" };
}

/** Las siete filas en el orden de la semana del negocio (lunes primero), con lo ya guardado. */
export function filasDesde(franjas: Franja[]): FilaDeDia[] {
  return DIAS_ORDENADOS.map((dia) => {
    const f = franjas.find((x) => x.diaInicio === dia);
    return f ? { dia, aplica: true, horaInicio: f.horaInicio, diaFin: f.diaFin, horaFin: f.horaFin } : filaVacia(dia);
  });
}

/** Lo que se manda al servidor: solo las filas con la casilla puesta. */
export function franjasDe(filas: FilaDeDia[]): Franja[] {
  return filas
    .filter((f) => f.aplica)
    .map((f) => ({ diaInicio: f.dia, horaInicio: f.horaInicio, diaFin: f.diaFin, horaFin: f.horaFin }));
}

/**
 * Los días y horarios en que rige una promoción, como la hoja de SoftRestaurant: por cada día, desde qué hora hasta qué hora (el fin
 * puede caer en otro día, para cruzar la medianoche). Arriba, una carga rápida ("de lunes a viernes de 18 a 20"). A la hora de fin ya
 * no rige: "hasta las 20:00" y 19:59:59 son lo mismo. Las horas son las de Asunción.
 */
export function FranjasPromocion({ filas, onChange }: { filas: FilaDeDia[]; onChange: (filas: FilaDeDia[]) => void }) {
  const [diasRapidos, setDiasRapidos] = useState<number[]>([]);
  const [desde, setDesde] = useState("18:00:00");
  const [hasta, setHasta] = useState("21:00:00");
  const [errorRapido, setErrorRapido] = useState<string | null>(null);

  function cambiar(dia: number, cambios: Partial<FilaDeDia>) {
    onChange(filas.map((f) => (f.dia === dia ? { ...f, ...cambios } : f)));
  }

  function aplicarRapido() {
    setErrorRapido(null);
    if (diasRapidos.length === 0) return setErrorRapido("Elegí al menos un día.");
    const si = segundosDeHora(desde);
    const sf = segundosDeHora(hasta);
    if (si === null || sf === null) return setErrorRapido("Escribí la hora de inicio y la de fin.");
    if (si === sf) return setErrorRapido("El inicio y el fin no pueden ser la misma hora.");
    // Si el fin queda antes que el inicio (22:00 a 02:00) la promoción cruza la medianoche: termina al día siguiente.
    const cruza = sf < si;
    onChange(
      filas.map((f) =>
        diasRapidos.includes(f.dia)
          ? { dia: f.dia, aplica: true, horaInicio: textoDeHora(si), diaFin: cruza ? (f.dia + 1) % 7 : f.dia, horaFin: textoDeHora(sf) }
          : f
      )
    );
  }

  const cantidad = filas.filter((f) => f.aplica).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="campos-grises flex flex-col gap-3 rounded-xl border border-azul/30 bg-azul-luz p-3.5">
        <p className="rotulo text-[0.78rem] font-bold text-azul-oscuro">Carga rápida</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {DIAS_ORDENADOS.map((dia) => {
            const activo = diasRapidos.includes(dia);
            return (
              <button
                key={dia}
                type="button"
                aria-pressed={activo}
                aria-label={NOMBRES_DIA[dia]}
                title={NOMBRES_DIA[dia]}
                onClick={() => {
                  setErrorRapido(null);
                  setDiasRapidos(activo ? diasRapidos.filter((d) => d !== dia) : [...diasRapidos, dia]);
                }}
                className={`flex h-9 w-9 items-center justify-center rounded-full border text-[0.85rem] font-semibold transition-colors ${
                  activo ? "border-azul bg-azul text-white" : "border-linea bg-white text-tinta-media hover:border-azul"
                }`}
              >
                {DIAS_CORTOS[dia]}
              </button>
            );
          })}
          <button type="button" onClick={() => setDiasRapidos([1, 2, 3, 4, 5])} className={clasesBoton("suave", "sm")}>
            Lunes a viernes
          </button>
          <button type="button" onClick={() => setDiasRapidos([6, 0])} className={clasesBoton("suave", "sm")}>
            Fin de semana
          </button>
          <button type="button" onClick={() => setDiasRapidos(DIAS_ORDENADOS)} className={clasesBoton("suave", "sm")}>
            Todos
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Campo etiqueta="Desde">
            <Entrada type="time" step={1} value={desde} onChange={(e) => setDesde(e.target.value)} />
          </Campo>
          <Campo etiqueta="Hasta">
            <Entrada type="time" step={1} value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </Campo>
          <div className="col-span-2 flex items-end sm:col-span-1">
            <button type="button" onClick={aplicarRapido} className={`w-full ${clasesBoton("nuevo")}`}>
              Aplicar a esos días
            </button>
          </div>
        </div>
        {errorRapido && <p className="text-[0.82rem] font-medium text-peligro">{errorRapido}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="rotulo text-[0.78rem] font-bold">Días en que rige</p>
          {cantidad > 0 && (
            <button type="button" onClick={() => onChange(DIAS_ORDENADOS.map(filaVacia))} className={clasesBoton("peligro", "sm")}>
              Quitar todos
            </button>
          )}
        </div>
        {/* Los títulos de las columnas, una sola vez arriba (en el celular cada campo lleva el suyo chiquito). */}
        <div aria-hidden="true" className={`hidden gap-2 border border-transparent px-2.5 sm:grid ${COLUMNAS}`}>
          <span />
          <span className={TITULO_COLUMNA}>Inicio</span>
          <span className={TITULO_COLUMNA}>Fin (día)</span>
          <span className={TITULO_COLUMNA}>Fin (hora)</span>
        </div>
        {filas.map((f) => (
          // Una sola línea por día en pantallas anchas; en el celular, el nombre del día arriba y los tres campos abajo.
          <div
            key={f.dia}
            className={`campos-grises grid ${COLUMNAS_CELULAR} items-end gap-x-2 gap-y-1 rounded-lg border px-2.5 py-1.5 transition-colors sm:items-center ${COLUMNAS} ${
              f.aplica ? "border-azul/40 bg-white" : "border-linea bg-papel-suave"
            }`}
          >
            <label className="col-span-3 flex cursor-pointer items-center gap-2 text-[0.88rem] font-semibold text-tinta sm:col-span-1">
              <input
                type="checkbox"
                checked={f.aplica}
                onChange={(e) => cambiar(f.dia, { aplica: e.target.checked })}
                className="h-4 w-4 accent-azul"
              />
              Aplica {NOMBRES_DIA[f.dia]}
            </label>
            <label className={`block min-w-0 ${f.aplica ? "" : "opacity-50"}`}>
              <span className={TITULO_EN_CELULAR}>Inicio</span>
              <Entrada
                type="time"
                step={1}
                value={f.horaInicio}
                disabled={!f.aplica}
                onChange={(e) => cambiar(f.dia, { horaInicio: e.target.value })}
                className={CAMPO_HORA}
              />
            </label>
            <label className={`block min-w-0 ${f.aplica ? "" : "opacity-50"}`}>
              <span className={TITULO_EN_CELULAR}>Fin (día)</span>
              <Selector
                value={f.diaFin}
                disabled={!f.aplica}
                onChange={(e) => cambiar(f.dia, { diaFin: Number(e.target.value) })}
                className={CAMPO_COMPACTO}
              >
                {DIAS_ORDENADOS.map((d) => (
                  <option key={d} value={d}>
                    {NOMBRES_DIA[d]}
                    {d === f.dia ? "" : d === (f.dia + 1) % 7 ? " (día siguiente)" : ""}
                  </option>
                ))}
              </Selector>
            </label>
            <label className={`block min-w-0 ${f.aplica ? "" : "opacity-50"}`}>
              <span className={TITULO_EN_CELULAR}>Fin (hora)</span>
              <Entrada
                type="time"
                step={1}
                value={f.horaFin}
                disabled={!f.aplica}
                onChange={(e) => cambiar(f.dia, { horaFin: e.target.value })}
                className={CAMPO_HORA}
              />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
