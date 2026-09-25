"use client";

import { useEffect, useMemo, useState } from "react";
import { diaCorto, fechaVecina, numeroDeDia } from "@/lib/agenda";
import { claveSumarDias, construirGrillaMes, diasDeLaSemana, DIAS_SEMANA, NOMBRES_MES } from "@/lib/calendario";
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
  const limiteMaximo = claveSumarDias(hoy, DIAS_ADELANTE - 1);

  const semana = diasDeLaSemana(ancla);
  const [anio, mes] = ancla.split("-").map(Number);
  const anteriorBloqueado = vista === "semana" ? semana[0] <= hoy : ancla.slice(0, 7) <= hoy.slice(0, 7);
  const siguienteBloqueado =
    vista === "semana" ? semana[6] >= limiteMaximo : ancla.slice(0, 7) >= limiteMaximo.slice(0, 7);

  const horasDelDia = dia ? (dias?.[dia] ?? []) : [];
  const grupos = useMemo(() => {
    const porMomento: Record<MomentoDelDia, string[]> = { manana: [], tarde: [], noche: [] };
    for (const h of horasDelDia) porMomento[momentoDelDia(aMinutos(h))].push(h);
    return (["manana", "tarde", "noche"] as const).map((m) => ({ momento: m, horas: porMomento[m] }));
  }, [horasDelDia]);

  if (error) return <p className="rounded-lg bg-peligro-luz p-3 text-[0.88rem] text-peligro">{error}</p>;

  const claseDia = (d: string, elegido: boolean, activo: boolean) =>
    `flex h-12 w-full items-center justify-center rounded-xl border text-[1rem] font-semibold transition-colors ${
      elegido
        ? "border-brand bg-brand text-white"
        : activo
          ? "border-linea bg-superficie text-tinta hover:border-brand"
          : "border-transparent bg-papel-hundido text-tinta-suave"
    }`;

  return (
    <div>
      {/* ---------- semana o mes, mes y flechas ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Ver por" className="flex rounded-xl bg-papel-hundido p-1">
          {(["semana", "mes"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={vista === v}
              onClick={() => setVista(v)}
              className={`rounded-lg px-4 py-2 text-[0.85rem] font-semibold transition-colors ${
                vista === v ? "bg-superficie text-tinta shadow-sm" : "text-tinta-media"
              }`}
            >
              {v === "semana" ? "Semana" : "Mes"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="rounded-xl bg-papel-hundido px-3.5 py-2 text-[0.85rem] font-semibold text-tinta">
            {NOMBRES_MES[mes - 1]} {anio}
          </span>
          <button
            type="button"
            onClick={() => setAncla(fechaVecina(vista, ancla, -1))}
            disabled={anteriorBloqueado}
            aria-label={vista === "semana" ? "Semana anterior" : "Mes anterior"}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-tinta transition-colors hover:bg-papel-hundido disabled:opacity-30"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setAncla(fechaVecina(vista, ancla, 1))}
            disabled={siguienteBloqueado}
            aria-label={vista === "semana" ? "Semana siguiente" : "Mes siguiente"}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-tinta transition-colors hover:bg-papel-hundido disabled:opacity-30"
          >
            ›
          </button>
        </div>
      </div>

      {/* ---------- los días ---------- */}
      {vista === "semana" ? (
        <div className="mt-4 grid grid-cols-7 gap-1.5 sm:gap-2">
          {semana.map((d) => {
            const activo = hayHoras(d);
            const nombre = diaCorto(d);
            return (
              <button
                key={d}
                type="button"
                disabled={!activo}
                onClick={() => setDia(d)}
                aria-pressed={dia === d}
                aria-label={`${nombre} ${numeroDeDia(d)}${activo ? "" : ", sin horarios"}`}
                className="flex flex-col items-center gap-1.5"
              >
                <span className={claseDia(d, dia === d, activo)}>{dias === null ? "·" : numeroDeDia(d)}</span>
                <span className="text-[0.72rem] text-tinta-media">{nombre.charAt(0).toUpperCase() + nombre.slice(1)}</span>
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
              if (!c.enMes) return <span key={c.fecha} aria-hidden="true" />;
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
        <div className="mt-5 flex flex-wrap gap-2.5" aria-busy="true" aria-label="Buscando horarios">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className="h-10 w-20 animate-pulse rounded-full bg-papel-hundido" />
          ))}
        </div>
      ) : Object.keys(dias).length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-linea bg-papel-suave px-5 py-8 text-center text-[0.88rem] text-tinta-media">
          Este profesional no tiene horarios disponibles en los próximos {DIAS_ADELANTE} días.
        </p>
      ) : (
        grupos.map(
          (g) =>
            g.horas.length > 0 && (
              <section key={g.momento} className="mt-5">
                <h3 className="mb-2.5 text-[0.92rem] font-semibold text-tinta">{TITULOS[g.momento]}</h3>
                <div className="flex flex-wrap gap-2.5">
                  {g.horas.map((h) => {
                    const elegida = dia !== null && fecha === dia && hora === h;
                    return (
                      <button
                        key={h}
                        type="button"
                        onClick={() => dia && onElegir(dia, h)}
                        aria-pressed={elegida}
                        className={`cifra rounded-full border px-4 py-2.5 text-[0.9rem] font-medium transition-colors ${
                          elegida
                            ? "border-brand bg-brand text-white"
                            : "border-linea bg-superficie text-tinta hover:border-brand"
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
