"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Entrada, clasesBoton } from "@/components/ui";
import { Interruptor } from "@/components/Interruptor";
import { errorDeDia, nombreDeDia, type HorarioDia } from "@/lib/horario-trabajo";
import { guardarHorarioTrabajo } from "./actions";

/**
 * Las columnas de cada día según el ancho de la pantalla:
 *  - celular: dos columnas, todo apilado (nombre y "Trabaja", horas, descanso);
 *  - tablet y notebook chica: cuatro columnas, con el descanso en una segunda línea;
 *  - pantalla ancha (xl): una sola línea con las siete columnas, como una tabla.
 */
const COLUMNAS =
  "grid-cols-2 md:grid-cols-[6rem_9rem_minmax(0,1fr)_minmax(0,1fr)] " +
  "xl:grid-cols-[7rem_4.5rem_minmax(0,1fr)_minmax(0,1fr)_4.5rem_minmax(0,1fr)_minmax(0,1fr)]";

function CampoHora({
  etiqueta,
  valor,
  onChange,
  deshabilitado,
  invalido,
}: {
  etiqueta: string;
  valor: string;
  onChange: (nuevo: string) => void;
  deshabilitado: boolean;
  invalido: boolean;
}) {
  return (
    <label className="block min-w-0">
      {/* En pantalla ancha la cabecera de la tabla ya dice qué es cada columna. */}
      <span className="mb-1 block text-[0.74rem] font-medium text-tinta-suave xl:sr-only">{etiqueta}</span>
      <Entrada
        type="time"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        disabled={deshabilitado}
        invalido={invalido}
        required
        className="cifra"
      />
    </label>
  );
}

/** Un interruptor con su texto al lado (el texto se esconde en pantalla ancha, donde manda la cabecera). */
function Palanca({
  texto,
  etiqueta,
  activo,
  onChange,
  deshabilitado = false,
  className = "",
}: {
  texto: string;
  /** Lo que lee un lector de pantalla, con el día: "Trabaja el lunes". */
  etiqueta: string;
  activo: boolean;
  onChange: (nuevo: boolean) => void;
  deshabilitado?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex h-[2.6rem] items-center gap-2.5 ${className}`}>
      <span className="text-[0.84rem] font-medium text-tinta-media xl:sr-only">{texto}</span>
      <Interruptor activo={activo} onChange={onChange} etiqueta={etiqueta} tono="azul" deshabilitado={deshabilitado} />
    </div>
  );
}

/**
 * El editor del horario general: una fila por día con su interruptor de
 * "Trabajo", la hora de inicio y de fin, y el interruptor y las horas del
 * descanso. Un día apagado deja todo lo suyo en gris.
 *
 * Nada se guarda hasta apretar "Guardar cambios": en cuanto se toca algo aparece
 * abajo una barra con "Descartar" y "Guardar cambios", y si se intenta salir de
 * la página con cambios sin guardar el navegador avisa.
 */
export function EditorHorario({
  inicial,
  personalId = null,
}: {
  inicial: HorarioDia[];
  /** null: el horario general del negocio; un id: el horario propio de esa persona. */
  personalId?: string | null;
}) {
  const router = useRouter();
  const [guardado, setGuardado] = useState(inicial);
  const [dias, setDias] = useState(inicial);
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [recienGuardado, setRecienGuardado] = useState(false);

  // Si lo guardado cambia desde afuera (a la persona se le quitó su horario propio y vuelve a valer el general, por
  // ejemplo), el editor arranca de nuevo con eso. Al guardar desde acá llega lo mismo que ya se ve: no cambia nada.
  const firmaInicial = JSON.stringify(inicial);
  useEffect(() => {
    setGuardado(inicial);
    setDias(inicial);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaInicial]);

  const hayCambios = JSON.stringify(dias) !== JSON.stringify(guardado);
  const errores = new Map<number, string | null>(
    dias.map((d): [number, string | null] => [d.diaSemana, errorDeDia(d)])
  );
  const hayErrores = [...errores.values()].some(Boolean);

  // Si se intenta cerrar o recargar con cambios sin guardar, el navegador pregunta.
  useEffect(() => {
    if (!hayCambios) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [hayCambios]);

  // El "Horario guardado" se va solo a los pocos segundos.
  useEffect(() => {
    if (!recienGuardado) return;
    const t = setTimeout(() => setRecienGuardado(false), 3500);
    return () => clearTimeout(t);
  }, [recienGuardado]);

  function cambiar(diaSemana: number, cambios: Partial<HorarioDia>) {
    setDias((actuales) => actuales.map((d) => (d.diaSemana === diaSemana ? { ...d, ...cambios } : d)));
    setError(null);
    setRecienGuardado(false);
  }

  function descartar() {
    setDias(guardado);
    setError(null);
  }

  function guardar() {
    if (hayErrores) return;
    setError(null);
    iniciar(async () => {
      const resultado = await guardarHorarioTrabajo(dias, personalId);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setGuardado(dias);
      setRecienGuardado(true);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-xl border border-linea bg-superficie">
        {/* Cabecera de la tabla: solo en pantalla ancha. */}
        <div
          className={`hidden gap-x-3 border-b border-linea bg-papel-suave px-4 py-3 text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave xl:grid ${COLUMNAS}`}
        >
          <span>Día</span>
          <span>Trabajo</span>
          <span>Hora de inicio</span>
          <span>Hora de fin</span>
          <span>Descanso</span>
          <span>Hora de inicio</span>
          <span>Hora de fin</span>
        </div>

        {dias.map((d) => {
          const nombre = nombreDeDia(d.diaSemana);
          const errorDia = errores.get(d.diaSemana) ?? null;
          const descansoActivo = d.trabaja && d.descansa;
          return (
            <div
              key={d.diaSemana}
              className={`grid items-end gap-x-3 gap-y-3 border-b border-linea-fina px-4 py-4 last:border-b-0 xl:items-center xl:py-3 ${COLUMNAS} ${
                d.trabaja ? "" : "bg-papel-suave/60"
              }`}
            >
              {/* Día */}
              <p
                className={`flex h-[2.6rem] items-center text-[0.95rem] font-semibold md:row-span-2 md:self-center xl:row-span-1 ${
                  d.trabaja ? "text-tinta" : "text-tinta-suave"
                }`}
              >
                {nombre}
              </p>

              {/* Trabajo: apagado, el día queda cerrado. */}
              <Palanca
                texto={d.trabaja ? "Trabaja" : "Cerrado"}
                etiqueta={`Se trabaja el ${nombre.toLowerCase()}`}
                activo={d.trabaja}
                onChange={(v) => cambiar(d.diaSemana, { trabaja: v })}
                className="justify-end md:justify-start"
              />

              <CampoHora
                etiqueta="Hora de inicio"
                valor={d.inicio}
                onChange={(v) => cambiar(d.diaSemana, { inicio: v })}
                deshabilitado={!d.trabaja}
                invalido={d.trabaja && !!errorDia}
              />
              <CampoHora
                etiqueta="Hora de fin"
                valor={d.fin}
                onChange={(v) => cambiar(d.diaSemana, { fin: v })}
                deshabilitado={!d.trabaja}
                invalido={d.trabaja && !!errorDia}
              />

              {/* Descanso (el almuerzo, por ejemplo). Solo tiene sentido si ese día se trabaja. */}
              <Palanca
                texto="Descanso"
                etiqueta={`Hay descanso el ${nombre.toLowerCase()}`}
                activo={descansoActivo}
                onChange={(v) => cambiar(d.diaSemana, { descansa: v })}
                deshabilitado={!d.trabaja}
                className="col-span-2 justify-between md:col-span-1 md:col-start-2 md:justify-start xl:col-start-auto"
              />
              <CampoHora
                etiqueta="Descanso: inicio"
                valor={d.descansoInicio}
                onChange={(v) => cambiar(d.diaSemana, { descansoInicio: v })}
                deshabilitado={!descansoActivo}
                invalido={descansoActivo && !!errorDia}
              />
              <CampoHora
                etiqueta="Descanso: fin"
                valor={d.descansoFin}
                onChange={(v) => cambiar(d.diaSemana, { descansoFin: v })}
                deshabilitado={!descansoActivo}
                invalido={descansoActivo && !!errorDia}
              />

              {errorDia && <p className="col-span-full text-[0.8rem] font-medium text-peligro">{errorDia}</p>}
            </div>
          );
        })}
      </div>

      <p className="text-[0.8rem] leading-snug text-tinta-suave">
        Los días apagados quedan cerrados y las horas fuera del horario y el descanso se ven sombreados en el
        calendario.
      </p>

      {recienGuardado && !hayCambios && (
        <p className="text-[0.86rem] font-semibold text-exito" role="status">
          ✓ Horario guardado.
        </p>
      )}

      {/* Aparece en cuanto se toca algo y queda pegada abajo mientras se desliza. */}
      {hayCambios && (
        <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/30 bg-superficie p-3 shadow-media">
          <p className={`text-[0.86rem] font-medium ${error ? "text-peligro" : "text-tinta"}`} role="status">
            {error ?? (hayErrores ? "Hay horas que corregir antes de guardar." : "Tenés cambios sin guardar.")}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={descartar} disabled={pendiente} className={clasesBoton("suave", "md")}>
              Descartar
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={pendiente || hayErrores}
              className={clasesBoton("principal", "md")}
            >
              {pendiente ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
