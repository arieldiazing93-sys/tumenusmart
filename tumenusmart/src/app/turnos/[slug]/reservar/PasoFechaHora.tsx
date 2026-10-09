"use client";

import { useEffect, useMemo, useState } from "react";
import { diaCorto, fechaVecina, numeroDeDia } from "@/lib/agenda";
import { construirGrillaMes, diasDeLaSemana, DIAS_SEMANA, NOMBRES_MES } from "@/lib/calendario";
import { DIAS_ADELANTE, momentoDelDia, type MomentoDelDia } from "@/lib/disponibilidad";
import { aMinutos } from "@/lib/horario-trabajo";
import { horasDisponibles } from "../actions";

type Vista = "semana" | "mes";

const TITULOS: Record<MomentoDelDia, string> = { manana: "Mañana", tarde: "Tarde", noche: "Noche" };

/**
 * Paso 3: elegir el día y la hora. Se ve por semana (una tira de siete días) o
 * por mes. Solo se pueden tocar los días con horas libres; las demás quedan
 * grises. Las horas del día elegido van agrupadas en mañana, tarde y noche.
 *
 * Todas las horas libres de los próximos días se piden de una sola vez al entrar,
 * así cambiar de semana o de mes es instantáneo.
 */
export function PasoFechaHora({
  slug,
  servicioIds,
  personalId,
  hoy,
  fecha,
  hora,
  onElegir,
}: {
  slug: string;
  servicioIds: string[];
  personalId: string;
  /** "YYYY-MM-DD" de hoy en Asunción. */
  hoy: string;
  /** El día y la hora que ya estaban elegidos (por ejemplo, tocados en el paso anterior). */
  fecha: string | null;
  hora: string | null;
  onElegir: (fecha: string, hora: string) => void;
}) {
  const [dias, setDias] = useState<Record<string, string[]> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>("semana");
  const [ancla, setAncla] = useState(fecha ?? hoy);
  const [dia, setDia] = useState<string | null>(fecha);
  const claveServicios = servicioIds.join(",");

  useEffect(() => {
    let cancelado = false;
    setDias(null);
    setError(null);
    horasDisponibles(slug, claveServicios.split(","), personalId).then((r) => {
      if (cancelado) return;
      if (r.ok) setDias(r.dias);
      else setError(r.error);
    });
    return () => {
      cancelado = true;
    };
  }, [slug, claveServicios, personalId]);

  // Si todavía no hay un día elegido, se marca el primero que tenga horas.
  useEffect(() => {
    if (!dias || dia) return;
    const primero = Object.keys(dias).sort()[0];
    if (primero) {
      setDia(primero);
      setAncla(primero);
    }
  }, [dias, dia]);

  const hayHoras = (d: string) => (dias?.[d]?.length ?? 0) > 0;

  // Lo que ya pasó no se muestra: ni los días anteriores ni hoy si ya no quedan horas
  // (pasó el cierre). Mientras todavía se están buscando las horas, hoy se deja para no parpadear.
  const diaVisible = (d: string) => d > hoy || (d === hoy && (dias === null || hayHoras(hoy)));

  const semana = diasDeLaSemana(ancla);
  const [anio, mes] = ancla.split("-").map(Number);

  // Las flechas solo aparecen si llevan a algún lado: hacia atrás, si hay horas libres antes de
  // lo que se está viendo; hacia adelante, si hay horas libres después. Así, pasado el horario
  // de hoy, no hay flecha para volver a días que ya no existen.
  const diasConHoras = dias ? Object.keys(dias).sort() : [];
  const primerDia = diasConHoras[0];
  const ultimoDia = diasConHoras[diasConHoras.length - 1];
  const hayAnterior =
    !!primerDia && (vista === "semana" ? primerDia < semana[0] : primerDia.slice(0, 7) < ancla.slice(0, 7));
  const haySiguiente =
    !!ultimoDia && (vista === "semana" ? ultimoDia > semana[6] : ultimoDia.slice(0, 7) > ancla.slice(0, 7));

  const horasDelDia = dia ? (dias?.[dia] ?? []) : [];
  const grupos = useMemo(() => {
    const porMomento: Record<MomentoDelDia, string[]> = { manana: [], tarde: [], noche: [] };
    for (const h of horasDelDia) porMomento[momentoDelDia(aMinutos(h))].push(h);
    return (["manana", "tarde", "noche"] as const).map((m) => ({ momento: m, horas: porMomento[m] }));
  }, [horasDelDia]);

  if (error) return <p className="rounded-lg bg-peligro-luz p-3 text-[0.88rem] text-peligro">{error}</p>;

  // Un día del mes: elegido = relleno del color del negocio; con horas = blanco con aro; sin horas = apagado.
  const claseDia = (d: string, elegido: boolean, activo: boolean) =>
    `flex h-12 w-full items-center justify-center rounded-2xl text-[1rem] font-semibold transition-all ${
      elegido
        ? "bg-brand text-white shadow-media"
        : activo
          ? "bg-superficie text-tinta ring-1 ring-linea hover:ring-brand/60 active:scale-95"
          : "bg-papel-hundido/60 text-tinta-suave/60"
    }`;

  return (
    <div>
      {/* ---------- semana o mes, mes y flechas ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Ver por" className="flex rounded-2xl bg-papel-hundido p-1">
          {(["semana", "mes"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={vista === v}
              onClick={() => setVista(v)}
              className={`rounded-xl px-4 py-2 text-[0.85rem] font-semibold transition-all ${
                vista === v ? "bg-superficie text-tinta shadow-sm" : "text-tinta-media"
              }`}
            >
              {v === "semana" ? "Semana" : "Mes"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="rounded-xl bg-brand-light px-3.5 py-2 text-[0.85rem] font-semibold text-brand-texto">
            {NOMBRES_MES[mes - 1]} {anio}
          </span>
          {/* Sin adónde ir, la flecha no se ve (invisible y no solo apagada; sigue ocupando su lugar
              para que el mes no se corra). */}
          <button
            type="button"
            onClick={() => setAncla(fechaVecina(vista, ancla, -1))}
            aria-label={vista === "semana" ? "Semana anterior" : "Mes anterior"}
            aria-hidden={!hayAnterior}
            tabIndex={hayAnterior ? 0 : -1}
            className={`flex h-9 w-9 items-center justify-center rounded-lg text-tinta transition-colors hover:bg-papel-hundido ${
              hayAnterior ? "" : "invisible"
            }`}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setAncla(fechaVecina(vista, ancla, 1))}
            aria-label={vista === "semana" ? "Semana siguiente" : "Mes siguiente"}
            aria-hidden={!haySiguiente}
            tabIndex={haySiguiente ? 0 : -1}
            className={`flex h-9 w-9 items-center justify-center rounded-lg text-tinta transition-colors hover:bg-papel-hundido ${
              haySiguiente ? "" : "invisible"
            }`}
          >
            ›
          </button>
        </div>
      </div>

      {/* ---------- los días ---------- */}
      {vista === "semana" ? (
        <div className="mt-4 grid grid-cols-7 gap-1.5 sm:gap-2">
          {semana.filter(diaVisible).map((d) => {
            const activo = hayHoras(d);
            const elegido = dia === d;
            const nombre = diaCorto(d);
            return (
              <button
                key={d}
                type="button"
                disabled={!activo}
                onClick={() => setDia(d)}
                aria-pressed={elegido}
                aria-label={`${nombre} ${numeroDeDia(d)}${activo ? "" : ", sin horarios"}`}
                className={`flex flex-col items-center gap-0.5 rounded-2xl px-1 py-2.5 transition-all ${
                  elegido
                    ? "bg-brand text-white shadow-media"
                    : activo
                      ? "bg-superficie text-tinta ring-1 ring-linea hover:ring-brand/60 active:scale-95"
                      : "bg-papel-hundido/60 text-tinta-suave/60"
                }`}
              >
                <span className={`text-[0.68rem] font-semibold uppercase ${elegido ? "text-white/80" : "text-tinta-suave"}`}>
                  {nombre}
                </span>
                <span className="cifra text-[1.2rem] font-bold leading-tight">{dias === null ? "·" : numeroDeDia(d)}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-4">
          <div className="mb-1.5 grid grid-cols-7 gap-1.5 text-center text-[0.72rem] font-semibold text-tinta-suave">
            {DIAS_SEMANA.map((letra, i) => (
              <span key={i}>{letra}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {construirGrillaMes(anio, mes - 1).map((c) => {
              // Los días de otros meses y los que ya pasaron dejan su lugar vacío.
              if (!c.enMes || !diaVisible(c.fecha)) return <span key={c.fecha} aria-hidden="true" />;
              const activo = hayHoras(c.fecha);
              return (
                <button
                  key={c.fecha}
                  type="button"
                  disabled={!activo}
                  onClick={() => setDia(c.fecha)}
                  aria-pressed={dia === c.fecha}
                  aria-label={`${c.dia}${activo ? "" : ", sin horarios"}`}
                  className={claseDia(c.fecha, dia === c.fecha, activo)}
                >
                  {c.dia}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-4 text-center text-[0.72rem] text-tinta-suave">
        La zona horaria del negocio es (GMT-03:00) Asunción, Paraguay
      </p>

      {/* ---------- las horas ---------- */}
      {dias === null ? (
        <div className="mt-6 grid grid-cols-3 gap-2.5 sm:grid-cols-4" aria-busy="true" aria-label="Buscando horarios">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className="h-12 animate-pulse rounded-xl bg-papel-hundido" />
          ))}
        </div>
      ) : Object.keys(dias).length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-linea bg-papel-suave px-5 py-8 text-center text-[0.9rem] text-tinta-media">
          Este profesional no tiene horarios disponibles en los próximos {DIAS_ADELANTE} días.
        </p>
      ) : (
        grupos.map(
          (g) =>
            g.horas.length > 0 && (
              <section key={g.momento} className="mt-6">
                <h3 className="mb-3 flex items-center gap-3 text-[0.95rem] font-semibold text-tinta">
                  {TITULOS[g.momento]}
                  <span aria-hidden="true" className="h-px flex-1 bg-linea" />
                </h3>
                <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                  {g.horas.map((h) => {
                    const elegida = dia !== null && fecha === dia && hora === h;
                    return (
                      <button
                        key={h}
                        type="button"
                        onClick={() => dia && onElegir(dia, h)}
                        aria-pressed={elegida}
                        className={`cifra h-12 rounded-xl text-[0.95rem] font-semibold transition-all active:scale-95 ${
                          elegida
                            ? "bg-brand text-white shadow-media"
                            : "bg-superficie text-tinta ring-1 ring-linea hover:ring-brand/60"
                        }`}
                      >
                        {h}
                      </button>
                    );
                  })}
                </div>
              </section>
            )
        )
      )}
    </div>
  );
}
