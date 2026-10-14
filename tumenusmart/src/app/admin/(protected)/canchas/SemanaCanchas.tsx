import Link from "next/link";
import { formatearGuarani } from "@/lib/format";
import { franjasDelDia, rangoDelHorario, type HorarioDia } from "@/lib/horario-trabajo";
import {
  diaCorto,
  diaDeLaSemana,
  diaLargo,
  estadoDeCita,
  horaDeMinutos,
  numeroDeDia,
  partesLocales,
  rangoDeHoras,
  repartirCarriles,
} from "@/lib/agenda";
import { textoDuracionCancha, urlCanchas, urlReservaCancha, type ParametrosCanchas } from "@/lib/canchas";
import { DesplazarAlIniciar } from "../agenda/DesplazarAlIniciar";
import type { ReservaGrilla } from "./GrillaCanchas";

/** Cuánto mide una hora en pantalla. */
const REM_POR_HORA = 5;
/** El ancho de la columna de las horas, a la izquierda. */
const ANCHO_HORAS = "3.25rem";
/**
 * El ancho de cada día depende de cuántas reservas coinciden en su peor momento (sus "carriles", ver `repartirCarriles`):
 * un día sin choques es angosto y uno con varias canchas ocupadas a la misma hora se ensancha para que cada reserva se lea.
 * Con una sola cancha elegida nunca hay choques y la semana entera entra en pantalla.
 */
const REM_DIA_SIN_CHOQUES = 7.5;
const REM_POR_CARRIL = 7;
/** El alto mínimo de una reserva, para poder tocarla. */
const REM_MINIMO_RESERVA = 1.25;
/** De cuánto en cuánto se puede tocar un hueco (solo con una cancha elegida) para anotar una reserva. */
const PASO_HUECO_MIN = 30;
const RAYADO = {
  backgroundImage:
    "repeating-linear-gradient(135deg, rgb(var(--linea)) 0, rgb(var(--linea)) 1px, transparent 1px, transparent 7px)",
};

/**
 * La vista de Semana del calendario de canchas: las horas a la izquierda y un día por columna (de lunes a domingo), con
 * las reservas de todas las canchas (o de la que se eligió) como bloques. Cada bloque dice a qué cancha pertenece.
 *
 * Es la misma grilla que la semana de la Agenda de turnos. Tocar una reserva abre su detalle a la derecha; tocar el día de
 * la cabecera lleva a su vista de Día (donde cada cancha tiene su columna). Con UNA cancha elegida, tocar un hueco vacío
 * anota una reserva en esa cancha, ese día y esa hora.
 */
export function SemanaCanchas({
  dias,
  reservas,
  nombres,
  hoy,
  ahora,
  horarios,
  parametros,
  canchaUnica,
}: {
  /** Los siete días de la semana ("YYYY-MM-DD"). */
  dias: string[];
  reservas: ReservaGrilla[];
  /** El nombre de cada cancha por su id. */
  nombres: Record<string, string>;
  /** "YYYY-MM-DD" de hoy en Asunción. */
  hoy: string;
  ahora: Date;
  /** El horario del complejo de cada día de la semana (vacío si todavía no se configuró: no se sombrea nada). */
  horarios: HorarioDia[];
  parametros: ParametrosCanchas;
  /** La cancha elegida, si se mira una sola: tocar un hueco anota ahí. null si se ven todas. */
  canchaUnica: { id: string; nombre: string; activa: boolean } | null;
}) {
  // Cada reserva con su día y sus minutos en hora de Asunción.
  const locales = reservas.map((r) => {
    const i = partesLocales(r.inicio);
    const f = partesLocales(r.fin);
    const hasta = f.dia === i.dia ? f.minutos : 24 * 60;
    return { ...r, dia: i.dia, desde: i.minutos, hasta: Math.max(hasta, i.minutos + 15) };
  });

  // Un cierre a las 23:59 es la medianoche: sin esto quedaría un minuto rayado al final de la grilla.
  const horarioDe = (dia: string): HorarioDia | undefined => {
    const h = horarios.find((x) => x.diaSemana === diaDeLaSemana(dia));
    return h && h.fin === "23:59" ? { ...h, fin: "24:00" } : h;
  };
  // La grilla dibuja el tramo en que se abre algún día de la semana (y se amplía si alguna reserva cae afuera).
  const rango = rangoDeHoras(locales, horarios.length > 0 ? rangoDelHorario(horarios) : null);
  const horasEnteras = (rango.fin - rango.inicio) / 60;
  const alto = horasEnteras * REM_POR_HORA;
  const { minutos: minutosAhora } = partesLocales(ahora);

  // Las reservas de cada día ya repartidas en carriles, y con eso el ancho de cada columna.
  const porDia = new Map(dias.map((dia) => [dia, repartirCarriles(locales.filter((r) => r.dia === dia))]));
  const columnas = dias.map((dia) => {
    const carriles = Math.max(1, ...(porDia.get(dia) ?? []).map((r) => r.carriles));
    const min = carriles === 1 ? REM_DIA_SIN_CHOQUES : carriles * REM_POR_CARRIL;
    return { min, peso: Math.max(1, Math.round(min / REM_DIA_SIN_CHOQUES)) };
  });
  const remTotalDias = columnas.reduce((suma, c) => suma + c.min, 0);

  const LINEAS_DE_HORAS = {
    backgroundImage:
      `repeating-linear-gradient(to bottom, rgb(var(--linea)) 0, rgb(var(--linea)) 1px, transparent 1px, transparent ${REM_POR_HORA}rem), ` +
      `repeating-linear-gradient(to bottom, transparent 0, transparent ${REM_POR_HORA / 2}rem, rgb(var(--linea-fina)) ${REM_POR_HORA / 2}rem, rgb(var(--linea-fina)) calc(${REM_POR_HORA / 2}rem + 1px), transparent calc(${REM_POR_HORA / 2}rem + 1px), transparent ${REM_POR_HORA}rem)`,
  };

  // A dónde dejar corrido el calendario al abrirlo: una hora antes de ahora si se ve la semana de hoy; si no, la primera reserva.
  let enfocar = 0;
  if (dias.includes(hoy) && minutosAhora >= rango.inicio) enfocar = minutosAhora - 60;
  else if (locales.length > 0) enfocar = Math.min(...locales.map((r) => r.desde)) - 30;
  const remInicial = Math.max(0, ((enfocar - rango.inicio) / 60) * REM_POR_HORA);

  const huecos: number[] = [];
  if (canchaUnica?.activa) {
    for (let m = rango.inicio; m + PASO_HUECO_MIN <= rango.fin; m += PASO_HUECO_MIN) huecos.push(m);
  }

  return (
    <div data-scroll-agenda className="max-h-[calc(100dvh-17rem)] min-h-[24rem] overflow-auto overscroll-contain">
      <DesplazarAlIniciar rem={remInicial} />
      <div
        className="grid"
        style={{
          gridTemplateColumns: `${ANCHO_HORAS} ${columnas.map((c) => `minmax(${c.min}rem, ${c.peso}fr)`).join(" ")}`,
          minWidth: `calc(${ANCHO_HORAS} + ${remTotalDias}rem)`,
        }}
      >
        {/* ---------- cabecera: queda fija arriba al deslizar ---------- */}
        <div className="sticky left-0 top-0 z-40 border-b border-linea bg-superficie" />
        {dias.map((dia) => {
          const esHoy = dia === hoy;
          return (
            <div
              key={dia}
              className={`sticky top-0 z-30 flex items-center justify-center border-b border-l border-linea px-1 py-2 ${
                esHoy ? "border-t-2 border-t-azul bg-azul-luz" : "bg-superficie"
              }`}
            >
              {/* El día arriba y su número abajo, en un círculo (azul si es hoy). Tocarlo abre ese día, con una columna por cancha. */}
              <Link
                href={urlCanchas(parametros, { vista: "dia", fecha: dia })}
                scroll={false}
                aria-label={`Ver ${diaLargo(dia)}`}
                className="group flex flex-col items-center gap-0.5"
              >
                <span className={`text-[0.68rem] font-semibold uppercase tracking-wide ${esHoy ? "text-azul-oscuro" : "text-tinta-suave"}`}>
                  {diaCorto(dia)}
                </span>
                <span
                  className={`flex h-8 min-w-8 items-center justify-center rounded-full px-1 text-[1.1rem] font-semibold leading-none transition-colors ${
                    esHoy ? "bg-azul text-white shadow-sm" : "text-tinta group-hover:bg-papel-hundido"
                  }`}
                >
                  {numeroDeDia(dia)}
                </span>
              </Link>
            </div>
          );
        })}

        {/* ---------- las horas: quedan fijas a la izquierda al deslizar ---------- */}
        <div className="sticky left-0 z-30 border-r border-linea bg-superficie" style={{ height: `${alto}rem` }}>
          {Array.from({ length: horasEnteras }, (_, i) => (
            <span
              key={i}
              className={`cifra absolute right-1.5 text-[0.68rem] text-tinta-suave ${i === 0 ? "top-1" : "-translate-y-1/2"}`}
              style={i === 0 ? undefined : { top: `${i * REM_POR_HORA}rem` }}
            >
              {horaDeMinutos(rango.inicio + i * 60)}
            </span>
          ))}
        </div>

        {/* ---------- un día por columna ---------- */}
        {dias.map((dia) => {
          const esHoy = dia === hoy;
          const delDia = porDia.get(dia) ?? [];
          const remPasado =
            dia < hoy
              ? alto
              : esHoy
                ? Math.min(alto, Math.max(0, ((minutosAhora - rango.inicio) / 60) * REM_POR_HORA))
                : 0;
          const hayLineaAhora = esHoy && minutosAhora >= rango.inicio && minutosAhora <= rango.fin;
          // Lo que el horario del complejo dice que ese día está cerrado (rayado) o es el descanso (gris).
          const franjas = franjasDelDia(horarioDe(dia), rango);

          return (
            <div key={dia} className="relative border-l border-linea bg-superficie" style={{ height: `${alto}rem`, ...LINEAS_DE_HORAS }}>
              {franjas.map((f, i) => (
                <div
                  key={i}
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-x-0 ${f.tipo === "descanso" ? "bg-tinta-suave/25" : "bg-papel-hundido"}`}
                  style={{
                    top: `${((f.desde - rango.inicio) / 60) * REM_POR_HORA}rem`,
                    height: `${((f.hasta - f.desde) / 60) * REM_POR_HORA}rem`,
                    ...(f.tipo === "cerrado" ? RAYADO : undefined),
                  }}
                />
              ))}

              {/* Los huecos: con una cancha elegida, tocar uno anota una reserva en esa cancha, ese día y esa hora. */}
              {canchaUnica &&
                huecos.map((m) => (
                  <Link
                    key={m}
                    href={urlReservaCancha({ ...parametros, fecha: dia }, "nueva", { cancha: canchaUnica.id, hora: horaDeMinutos(m) })}
                    scroll={false}
                    aria-label={`Anotar una reserva en ${canchaUnica.nombre} el ${diaLargo(dia)} a las ${horaDeMinutos(m)}`}
                    title={`Anotar reserva · ${canchaUnica.nombre} · ${diaLargo(dia)} ${horaDeMinutos(m)}`}
                    className="absolute inset-x-0 z-0 transition-colors hover:bg-azul-luz/70"
                    style={{
                      top: `${((m - rango.inicio) / 60) * REM_POR_HORA}rem`,
                      height: `${(PASO_HUECO_MIN / 60) * REM_POR_HORA}rem`,
                    }}
                  />
                ))}

              {remPasado > 0 && (
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 z-[1] bg-papel-suave/70"
                  style={{ height: `${remPasado}rem` }}
                />
              )}

              {delDia.map((r, indice) => {
                const estado = estadoDeCita(r.estado);
                const remAlto = Math.max(((r.hasta - r.desde) / 60) * REM_POR_HORA, REM_MINIMO_RESERVA);
                const nivel = remAlto < 2.2 ? 1 : remAlto < 3.4 ? 2 : remAlto < 4.6 ? 3 : 4;
                const textoHoras = `${horaDeMinutos(r.desde)} – ${horaDeMinutos(r.hasta)}`;
                const cancha = nombres[r.canchaId] ?? "Cancha";
                const izquierda = (r.carril / r.carriles) * 100;
                return (
                  <Link
                    key={r.id}
                    href={urlReservaCancha(parametros, r.id)}
                    scroll={false}
                    aria-label={`Abrir la reserva de ${r.clienteNombre}`}
                    title={[
                      r.clienteNombre,
                      cancha,
                      textoHoras,
                      textoDuracionCancha(r.duracionMin),
                      estado.etiqueta,
                      formatearGuarani(r.precio),
                      r.origen === "web" ? "Pedida desde la página" : null,
                      r.cobrada ? "Cobrada en caja" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    className={`animate-bloque absolute z-10 overflow-hidden rounded-lg border border-l-4 px-2 ${nivel === 1 ? "py-0.5" : "py-1"} text-[0.72rem] leading-tight shadow-sm transition-[transform,box-shadow] duration-150 hover:z-20 hover:-translate-y-px hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${estado.bloque}`}
                    style={{
                      top: `${((r.desde - rango.inicio) / 60) * REM_POR_HORA}rem`,
                      height: `${remAlto}rem`,
                      left: `calc(${izquierda.toFixed(3)}% + 2px)`,
                      width: `calc(${(100 / r.carriles).toFixed(3)}% - 4px)`,
                      animationDelay: `${Math.min(indice, 8) * 30}ms`,
                    }}
                  >
                    {r.cobrada && (
                      <span aria-label="Cobrada" title="Cobrada en caja" className="absolute right-1 top-0.5 text-[0.78rem] font-bold leading-none">
                        ✓
                      </span>
                    )}
                    {/* Primero quién es, después la hora y la cancha, según cuánto lugar haya. */}
                    <p className="truncate pr-3 text-[0.78rem] font-semibold">
                      {nivel === 1 ? `${horaDeMinutos(r.desde)} · ${r.clienteNombre}` : r.clienteNombre}
                    </p>
                    {nivel >= 2 && (
                      <p className="truncate tabular-nums opacity-90">
                        {textoHoras}
                        {canchaUnica ? "" : ` · ${cancha}`}
                      </p>
                    )}
                    {nivel >= 3 && <p className="truncate opacity-90">{textoDuracionCancha(r.duracionMin)}</p>}
                    {nivel >= 4 && <p className="mt-0.5 truncate font-semibold tabular-nums">{formatearGuarani(r.precio)}</p>}
                  </Link>
                );
              })}

              {hayLineaAhora && (
                <div
                  className="pointer-events-none absolute inset-x-0 z-20 flex -translate-y-1/2 items-center"
                  style={{ top: `${((minutosAhora - rango.inicio) / 60) * REM_POR_HORA}rem` }}
                >
                  <span className="-ml-1 h-2 w-2 flex-none rounded-full bg-peligro" />
                  <span className="h-px flex-1 bg-peligro" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
