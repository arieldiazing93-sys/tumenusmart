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
 * por mes. Se pueden tocar los días con horas libres; los que ya no tienen ninguna
 * pero sí turnos tomados salen en rojo («completo») y se pueden abrir a mirar; los
 * que no se atienden quedan grises. Las horas del día elegido van agrupadas en
 * mañana, tarde y noche, y las que ya están tomadas NO desaparecen: se ven
 * tachadas y en rojo, para que el cliente sepa que existen y que ya están ocupadas.
 *
 * Todas las horas de los próximos días se piden de una sola vez al entrar,
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
  // Las horas que ya tomó otro cliente, por día: se muestran tachadas (no se pueden elegir).
  const [ocupadas, setOcupadas] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>("semana");
  const [ancla, setAncla] = useState(fecha ?? hoy);
  const [dia, setDia] = useState<string | null>(fecha);
  const claveServicios = servicioIds.join(",");

  useEffect(() => {
    let cancelado = false;
    setDias(null);
    setOcupadas({});
    setError(null);
    horasDisponibles(slug, claveServicios.split(","), personalId).then((r) => {
      if (cancelado) return;
      if (r.ok) {
        setDias(r.dias);
        setOcupadas(r.ocupadas ?? {});
      } else setError(r.error);
    });
    return () => {
      cancelado = true;
    };
  }, [slug, claveServicios, personalId]);

  const hayHoras = (d: string) => (dias?.[d]?.length ?? 0) > 0;
  const hayOcupadas = (d: string) => (ocupadas[d]?.length ?? 0) > 0;
  /** Un día con horas libres o, aunque no le quede ninguna, con turnos ya tomados (completo): sigue a la vista. */
  const hayAlgo = (d: string) => hayHoras(d) || hayOcupadas(d);

  // Si todavía no hay un día elegido, se marca el primero que tenga horas libres (o, si no hay ninguno, el primero con turnos tomados).
  useEffect(() => {
    if (!dias || dia) return;
    const primero = Object.keys(dias).sort()[0] ?? Object.keys(ocupadas).sort()[0];
    if (primero) {
      setDia(primero);
      setAncla(primero);
    }
  }, [dias, ocupadas, dia]);

  // Lo que ya pasó no se muestra: ni los días anteriores ni hoy si ya no queda nada (pasó el cierre). Mientras
  // todavía se están buscando las horas, hoy se deja para no parpadear.
  const diaVisible = (d: string) => d > hoy || (d === hoy && (dias === null || hayAlgo(hoy)));

  const semana = diasDeLaSemana(ancla);
  const [anio, mes] = ancla.split("-").map(Number);

  // Las flechas solo aparecen si llevan a algún lado: hacia atrás, si hay algo (horas libres o tomadas) antes de
  // lo que se está viendo; hacia adelante, si hay algo después. Así, pasado el horario de hoy, no hay flecha para
  // volver a días que ya no existen.
  const diasConAlgo = dias ? [...new Set([...Object.keys(dias), ...Object.keys(ocupadas)])].sort() : [];
  const primerDia = diasConAlgo[0];
  const ultimoDia = diasConAlgo[diasConAlgo.length - 1];
  const hayAnterior =
    !!primerDia && (vista === "semana" ? primerDia < semana[0] : primerDia.slice(0, 7) < ancla.slice(0, 7));
  const haySiguiente =
    !!ultimoDia && (vista === "semana" ? ultimoDia > semana[6] : ultimoDia.slice(0, 7) > ancla.slice(0, 7));

  const horasLibresDelDia = dia ? (dias?.[dia] ?? []) : [];
  const horasOcupadasDelDia = dia ? (ocupadas[dia] ?? []) : [];
  const grupos = useMemo(() => {
    // Libres y ocupadas juntas, en orden de hora: lo ocupado no desaparece, se ve tachado.
    const todas = [
      ...horasLibresDelDia.map((h) => ({ h, libre: true })),
      ...horasOcupadasDelDia.map((h) => ({ h, libre: false })),
    ].sort((a, b) => aMinutos(a.h) - aMinutos(b.h));
    const porMomento: Record<MomentoDelDia, { h: string; libre: boolean }[]> = { manana: [], tarde: [], noche: [] };
    for (const t of todas) porMomento[momentoDelDia(aMinutos(t.h))].push(t);
    return (["manana", "tarde", "noche"] as const).map((m) => ({ momento: m, horas: porMomento[m] }));
  }, [horasLibresDelDia, horasOcupadasDelDia]);

  if (error) return <p className="rounded-lg bg-peligro-luz p-3 text-[0.88rem] text-peligro">{error}</p>;

  // Un día del mes: elegido = relleno del color del negocio; con horas = blanco con aro; completo = rojo; sin nada = apagado.
  const claseDia = (elegido: boolean, activo: boolean, completo: boolean) =>
    `flex h-12 w-full items-center justify-center rounded-2xl text-[1rem] font-semibold transition-all ${
      elegido
        ? "bg-brand text-white shadow-media"
        : activo
          ? "bg-superficie text-tinta ring-1 ring-linea hover:ring-brand/60 active:scale-95"
          : completo
            ? "bg-peligro-luz text-peligro ring-1 ring-peligro/30 active:scale-95"
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
            // Sin horas libres pero con turnos tomados: el día está completo (se puede abrir a mirar, todo tachado).
            const completo = !activo && hayOcupadas(d);
            const elegido = dia === d;
            const nombre = diaCorto(d);
            return (
              <button
                key={d}
                type="button"
                disabled={!activo && !completo}
                onClick={() => setDia(d)}
                aria-pressed={elegido}
                aria-label={`${nombre} ${numeroDeDia(d)}${activo ? "" : completo ? ", completo" : ", sin horarios"}`}
                className={`flex flex-col items-center gap-0.5 rounded-2xl px-1 py-2.5 transition-all ${
                  elegido
                    ? "bg-brand text-white shadow-media"
                    : activo
                      ? "bg-superficie text-tinta ring-1 ring-linea hover:ring-brand/60 active:scale-95"
                      : completo
                        ? "bg-peligro-luz text-peligro ring-1 ring-peligro/30 active:scale-95"
                        : "bg-papel-hundido/60 text-tinta-suave/60"
                }`}
              >
                <span
                  className={`text-[0.68rem] font-semibold uppercase ${
                    elegido ? "text-white/80" : completo ? "text-peligro" : "text-tinta-suave"
                  }`}
                >
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
              const completo = !activo && hayOcupadas(c.fecha);
              return (
                <button
                  key={c.fecha}
                  type="button"
                  disabled={!activo && !completo}
                  onClick={() => setDia(c.fecha)}
                  aria-pressed={dia === c.fecha}
                  aria-label={`${c.dia}${activo ? "" : completo ? ", completo" : ", sin horarios"}`}
                  className={claseDia(dia === c.fecha, activo, completo)}
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
      ) : Object.keys(dias).length === 0 && Object.keys(ocupadas).length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-linea bg-papel-suave px-5 py-8 text-center text-[0.9rem] text-tinta-media">
          Este profesional no tiene horarios disponibles en los próximos {DIAS_ADELANTE} días.
        </p>
      ) : (
        <>
          {horasOcupadasDelDia.length > 0 && (
            <p className="mt-5 flex flex-wrap items-center justify-end gap-x-3 text-[0.74rem] text-tinta-media">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="inline-block h-3 w-5 rounded bg-peligro-luz ring-1 ring-peligro/30" />
                <span className="line-through decoration-peligro">Tachado</span> = ocupado
              </span>
            </p>
          )}
          {horasLibresDelDia.length === 0 && horasOcupadasDelDia.length > 0 && (
            <p className="mt-3 rounded-2xl bg-peligro-luz px-4 py-3 text-center text-[0.88rem] font-medium text-peligro">
              Este día ya no tiene horarios libres. Probá con otro día.
            </p>
          )}
          {grupos.map(
            (g) =>
              g.horas.length > 0 && (
                <section key={g.momento} className="mt-6">
                  <h3 className="mb-3 flex items-center gap-3 text-[0.95rem] font-semibold text-tinta">
                    {TITULOS[g.momento]}
                    <span aria-hidden="true" className="h-px flex-1 bg-linea" />
                  </h3>
                  <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                    {g.horas.map(({ h, libre }) => {
                      if (!libre) {
                        // Una hora que ya tomó otro cliente: se ve, pero tachada y en rojo (no se puede elegir).
                        return (
                          <span
                            key={h}
                            role="img"
                            aria-label={`${h}, ocupado`}
                            title="Ocupado"
                            className="flex h-12 cursor-not-allowed flex-col items-center justify-center rounded-xl bg-peligro-luz text-peligro ring-1 ring-peligro/30"
                          >
                            <span className="cifra text-[0.95rem] font-bold leading-tight line-through decoration-2">{h}</span>
                            <span className="text-[0.6rem] font-semibold uppercase tracking-wide">Ocupado</span>
                          </span>
                        );
                      }
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
          )}
        </>
      )}
    </div>
  );
}
