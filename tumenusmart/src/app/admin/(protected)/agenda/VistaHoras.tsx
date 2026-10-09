import Link from "next/link";
import { formatearGuarani } from "@/lib/format";
import { franjasDelDiaDeVarios, rangoDelHorario, type HorarioDia } from "@/lib/horario-trabajo";
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
  urlAgenda,
  urlCita,
  type CitaAgenda,
  type ParametrosAgenda,
} from "@/lib/agenda";
import { DesplazarAlIniciar } from "./DesplazarAlIniciar";

/** Cuánto mide una hora en pantalla. */
const REM_POR_HORA = 5;
/** El ancho de la columna de las horas, a la izquierda. */
const ANCHO_HORAS = "3.25rem";
/**
 * El ancho de cada día de la semana depende de cuántos turnos coinciden en su peor momento (sus "carriles", ver
 * `repartirCarriles`): un día sin turnos o con uno por vez es angosto, y uno con dos o tres citas a la misma hora se
 * ensancha para que cada una se lea. Así, con poca gente a la vez, la semana entera entra en pantalla sin deslizarla de
 * costado; si igual no entra, se desliza (con su propia barra horizontal, igual que la vertical).
 */
const REM_DIA_SIN_CHOQUES = 7.5;
/** Lo que se le suma al ancho de un día por cada turno que coincide en el mismo horario. */
const REM_POR_CARRIL = 7;
/** El alto mínimo de un turno: el de uno de 15 minutos (lo más corto que hay), así nunca se pisa con el que le sigue. */
const REM_MINIMO_TURNO = 1.25;
/** Las rayas diagonales de lo que queda fuera del horario de trabajo. */
const RAYADO = {
  backgroundImage:
    "repeating-linear-gradient(135deg, rgb(var(--linea)) 0, rgb(var(--linea)) 1px, transparent 1px, transparent 7px)",
};

/**
 * La vista de Día y de Semana: las horas a la izquierda y un día por columna.
 *
 * El fondo es blanco (también los fines de semana y hoy), así los turnos, que son lo
 * único con color, se distinguen bien. La cabecera con los días queda fija arriba y la
 * columna de las horas fija a la izquierda mientras se desliza, así en el celular nunca
 * se pierde de vista qué día y qué hora se está mirando. Una línea roja marca el
 * momento de ahora.
 */
export function VistaHoras({
  dias,
  citas,
  hoy,
  ahora,
  parametros,
  horarios,
  mostrarPersonal,
}: {
  /** Uno (vista Día) o siete (vista Semana). */
  dias: string[];
  citas: CitaAgenda[];
  /** "YYYY-MM-DD" de hoy en Asunción. */
  hoy: string;
  ahora: Date;
  parametros: ParametrosAgenda;
  /**
   * El horario de la semana de cada persona que se está viendo (una sola si se eligió a alguien; todas si se ve
   * a todo el personal junto), o null si todavía no se configuró ninguno (entonces no se sombrea nada).
   */
  horarios: HorarioDia[][] | null;
  /** Escribir quién atiende en cada turno (cuando se ve a todo el personal junto). */
  mostrarPersonal: boolean;
}) {
  const n = dias.length;

  // Cada turno con su día y sus minutos en hora de Asunción.
  const locales = citas.map((c) => {
    const i = partesLocales(c.inicio);
    const f = partesLocales(c.fin);
    const hasta = f.dia === i.dia ? f.minutos : 24 * 60;
    return { ...c, dia: i.dia, desde: i.minutos, hasta: Math.max(hasta, i.minutos + 15) };
  });

  // La grilla dibuja el tramo en que se trabaja (y se amplía si algún turno cae afuera).
  const rango = rangoDeHoras(locales, horarios ? rangoDelHorario(horarios.flat()) : null);
  // Para cada día de la semana, el horario de cada persona que se ve ese día.
  const horariosPorDia = new Map<number, HorarioDia[]>();
  for (const semana of horarios ?? []) {
    for (const h of semana) {
      const lista = horariosPorDia.get(h.diaSemana) ?? [];
      lista.push(h);
      horariosPorDia.set(h.diaSemana, lista);
    }
  }
  const horasEnteras = (rango.fin - rango.inicio) / 60;
  const alto = horasEnteras * REM_POR_HORA;
  const { minutos: minutosAhora } = partesLocales(ahora);

  // Los turnos de cada día ya repartidos en carriles, y con eso el ancho de cada columna.
  const turnosPorDia = new Map(dias.map((dia) => [dia, repartirCarriles(locales.filter((c) => c.dia === dia))]));
  const remMinimoDe = (dia: string) => {
    const carriles = Math.max(1, ...(turnosPorDia.get(dia) ?? []).map((c) => c.carriles));
    return carriles === 1 ? REM_DIA_SIN_CHOQUES : carriles * REM_POR_CARRIL;
  };
  const columnas = dias.map((dia) => {
    const min = remMinimoDe(dia);
    return { min, peso: Math.max(1, Math.round(min / REM_DIA_SIN_CHOQUES)) };
  });
  const remTotalDias = columnas.reduce((suma, c) => suma + c.min, 0);

  // Las líneas de las horas (marcadas) y de las medias horas (suaves) dentro de cada día: sin ellas cuesta ver a qué hora cae cada turno.
  const LINEAS_DE_HORAS = {
    backgroundImage:
      `repeating-linear-gradient(to bottom, rgb(var(--linea)) 0, rgb(var(--linea)) 1px, transparent 1px, transparent ${REM_POR_HORA}rem), ` +
      `repeating-linear-gradient(to bottom, transparent 0, transparent ${REM_POR_HORA / 2}rem, rgb(var(--linea-fina)) ${REM_POR_HORA / 2}rem, rgb(var(--linea-fina)) calc(${REM_POR_HORA / 2}rem + 1px), transparent calc(${REM_POR_HORA / 2}rem + 1px), transparent ${REM_POR_HORA}rem)`,
  };

  // A dónde dejar corrido el calendario al abrirlo: una hora antes de ahora si
  // se está viendo hoy; si no, el primer turno que haya.
  let enfocar = 0;
  if (dias.includes(hoy) && minutosAhora >= rango.inicio) enfocar = minutosAhora - 60;
  else if (locales.length > 0) enfocar = Math.min(...locales.map((c) => c.desde)) - 30;
  const remInicial = Math.max(0, ((enfocar - rango.inicio) / 60) * REM_POR_HORA);

  return (
    <div
      data-scroll-agenda
      className="max-h-[calc(100dvh-16rem)] min-h-[24rem] overflow-auto overscroll-contain"
    >
      <DesplazarAlIniciar rem={remInicial} />
      <div
        className="grid"
        style={{
          gridTemplateColumns: `${ANCHO_HORAS} ${columnas
            .map((c) => `minmax(${n === 1 ? "0px" : `${c.min}rem`}, ${n === 1 ? 1 : c.peso}fr)`)
            .join(" ")}`,
          minWidth: n === 1 ? undefined : `calc(${ANCHO_HORAS} + ${remTotalDias}rem)`,
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
              {n === 1 ? (
                <p
                  className={`rounded-full px-3 py-0.5 text-[0.9rem] font-semibold ${
                    esHoy ? "bg-azul text-white" : "text-tinta"
                  }`}
                >
                  {diaLargo(dia)}
                </p>
              ) : (
                // El día arriba y su número abajo, en un círculo (azul si es hoy): se lee de un vistazo qué día es cada columna.
                <Link
                  href={urlAgenda(parametros, { vista: "dia", fecha: dia })}
                  scroll={false}
                  aria-label={`Ver ${diaLargo(dia)}`}
                  className="group flex flex-col items-center gap-0.5"
                >
                  <span
                    className={`text-[0.68rem] font-semibold uppercase tracking-wide ${
                      esHoy ? "text-azul-oscuro" : "text-tinta-suave"
                    }`}
                  >
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
              )}
            </div>
          );
        })}

        {/* ---------- las horas: quedan fijas a la izquierda al deslizar ---------- */}
        <div
          className="sticky left-0 z-30 border-r border-linea bg-superficie"
          style={{ height: `${alto}rem` }}
        >
          {Array.from({ length: horasEnteras }, (_, i) => (
            <span
              key={i}
              className={`cifra absolute right-1.5 text-[0.68rem] text-tinta-suave ${
                i === 0 ? "top-1" : "-translate-y-1/2"
              }`}
              style={i === 0 ? undefined : { top: `${i * REM_POR_HORA}rem` }}
            >
              {horaDeMinutos(rango.inicio + i * 60)}
            </span>
          ))}
        </div>

        {/* ---------- un día por columna ---------- */}
        {dias.map((dia) => {
          const esHoy = dia === hoy;
          const delDia = turnosPorDia.get(dia) ?? [];

          // Lo ya pasado, apenas más apagado: el día entero si es anterior a hoy, o hasta ahora si es hoy.
          const remPasado =
            dia < hoy
              ? alto
              : esHoy
                ? Math.min(alto, Math.max(0, ((minutosAhora - rango.inicio) / 60) * REM_POR_HORA))
                : 0;
          const hayLineaAhora = esHoy && minutosAhora >= rango.inicio && minutosAhora <= rango.fin;

          // Lo que los horarios de trabajo dicen que ese día nadie atiende (rayado) o es el descanso (gris).
          const franjas = franjasDelDiaDeVarios(horariosPorDia.get(diaDeLaSemana(dia)) ?? [], rango);

          return (
            <div
              key={dia}
              className="relative border-l border-linea bg-superficie"
              style={{ height: `${alto}rem`, ...LINEAS_DE_HORAS }}
            >
              {franjas.map((f, i) => (
                <div
                  key={i}
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-x-0 ${
                    f.tipo === "descanso" ? "bg-tinta-suave/25" : "bg-papel-hundido"
                  }`}
                  style={{
                    top: `${((f.desde - rango.inicio) / 60) * REM_POR_HORA}rem`,
                    height: `${((f.hasta - f.desde) / 60) * REM_POR_HORA}rem`,
                    ...(f.tipo === "cerrado" ? RAYADO : undefined),
                  }}
                >
                  {f.tipo === "descanso" && (
                    <span className="absolute left-1.5 top-1 text-[0.6rem] font-semibold uppercase tracking-wide text-tinta-media">
                      Descanso
                    </span>
                  )}
                </div>
              ))}

              {remPasado > 0 && (
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 bg-papel-suave/70"
                  style={{ height: `${remPasado}rem` }}
                />
              )}

              {delDia.map((c, indice) => {
                const estado = estadoDeCita(c.estado);
                // El turno mide lo que dura (con un mínimo para poder tocarlo) y se recorta ahí: antes crecía con su texto y un
                // turno de media hora se veía de casi una hora, pisando al siguiente. Cuanto más alto, más datos muestra.
                const remAlto = Math.max(((c.hasta - c.desde) / 60) * REM_POR_HORA, REM_MINIMO_TURNO);
                const nivel = remAlto < 2.2 ? 1 : remAlto < 3.4 ? 2 : remAlto < 4.6 ? 3 : 4;
                const textoHoras = `${horaDeMinutos(c.desde)} – ${horaDeMinutos(c.hasta)}`;
                const izquierda = (c.carril / c.carriles) * 100;
                return (
                  // Tocar el turno abre su detalle a la derecha (y desde ahí se cobra).
                  <Link
                    key={c.id}
                    href={urlCita(parametros, c.id)}
                    scroll={false}
                    aria-label={`Abrir la cita de ${c.clienteNombre}`}
                    title={[
                      c.clienteNombre,
                      c.serviciosTexto,
                      `${horaDeMinutos(c.desde)} – ${horaDeMinutos(c.hasta)}`,
                      estado.etiqueta,
                      c.personalNombre,
                      c.precio != null ? formatearGuarani(c.precio) : null,
                      c.cobrada ? "Cobrada en caja" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    className={`animate-bloque absolute z-10 overflow-hidden rounded-lg border border-l-4 px-2 ${nivel === 1 ? "py-0.5" : "py-1"} text-[0.72rem] leading-tight shadow-sm transition-[transform,box-shadow] duration-150 hover:z-20 hover:-translate-y-px hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${estado.bloque}`}
                    style={{
                      top: `${((c.desde - rango.inicio) / 60) * REM_POR_HORA}rem`,
                      height: `${remAlto}rem`,
                      left: `calc(${izquierda.toFixed(3)}% + 2px)`,
                      width: `calc(${(100 / c.carriles).toFixed(3)}% - 4px)`,
                      // Los turnos entran apenas escalonados al abrir el calendario.
                      animationDelay: `${Math.min(indice, 8) * 30}ms`,
                    }}
                  >
                    {c.cobrada && (
                      <span
                        aria-label="Cobrada"
                        title="Cobrada en caja"
                        className="absolute right-1 top-0.5 text-[0.78rem] font-bold leading-none"
                      >
                        ✓
                      </span>
                    )}
                    {/* Primero quién es (lo que se busca con la vista), después la hora y el resto, según cuánto lugar haya. */}
                    <p className="truncate pr-3 text-[0.78rem] font-semibold">
                      {nivel === 1 ? `${horaDeMinutos(c.desde)} · ${c.clienteNombre}` : c.clienteNombre}
                    </p>
                    {nivel >= 2 && (
                      <p className="truncate tabular-nums opacity-90">
                        {textoHoras}
                        {nivel === 2 && c.serviciosTexto ? ` · ${c.serviciosTexto}` : ""}
                        {mostrarPersonal ? ` · ${c.personalNombre}` : ""}
                      </p>
                    )}
                    {nivel >= 3 && c.serviciosTexto && <p className="truncate opacity-90">{c.serviciosTexto}</p>}
                    {nivel >= 4 && c.precio != null && (
                      <p className="mt-0.5 truncate font-semibold tabular-nums">{formatearGuarani(c.precio)}</p>
                    )}
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
