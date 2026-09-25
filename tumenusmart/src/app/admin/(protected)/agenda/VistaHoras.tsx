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
/** El ancho mínimo de cada día: si no entran, la semana se desliza de costado. */
const ANCHO_MIN_DIA = "7.5rem";
/** Un turno muy corto igual se dibuja con este alto, para que se pueda leer y tocar. */
const REM_MINIMO_TURNO = 1.75;
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
  /** El horario de trabajo, o null si todavía no se configuró (entonces no se sombrea nada). */
  horarios: HorarioDia[] | null;
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
  const rango = rangoDeHoras(locales, horarios ? rangoDelHorario(horarios) : null);
  const horarioPorDia = new Map<number, HorarioDia>(
    (horarios ?? []).map((h): [number, HorarioDia] => [h.diaSemana, h])
  );
  const horasEnteras = (rango.fin - rango.inicio) / 60;
  const alto = horasEnteras * REM_POR_HORA;
  const { minutos: minutosAhora } = partesLocales(ahora);

  // A dónde dejar corrido el calendario al abrirlo: una hora antes de ahora si
  // se está viendo hoy; si no, el primer turno que haya.
  let enfocar = 0;
  if (dias.includes(hoy) && minutosAhora >= rango.inicio) enfocar = minutosAhora - 60;
  else if (locales.length > 0) enfocar = Math.min(...locales.map((c) => c.desde)) - 30;
  const remInicial = Math.max(0, ((enfocar - rango.inicio) / 60) * REM_POR_HORA);

  // Las líneas: una firme cada hora y una fina cada cuarto.
  const fondoLineas = {
    backgroundImage:
      "linear-gradient(to bottom, rgb(var(--linea)) 1px, transparent 1px), linear-gradient(to bottom, rgb(var(--linea-fina)) 1px, transparent 1px)",
    backgroundSize: `100% ${REM_POR_HORA}rem, 100% ${REM_POR_HORA / 4}rem`,
  };

  return (
    <div
      data-scroll-agenda
      className="max-h-[calc(100dvh-13rem)] min-h-[24rem] overflow-auto overscroll-contain"
    >
      <DesplazarAlIniciar rem={remInicial} />
      <div
        className="grid"
        style={{
          gridTemplateColumns: `${ANCHO_HORAS} repeat(${n}, minmax(${n === 1 ? "0px" : ANCHO_MIN_DIA}, 1fr))`,
          minWidth: n === 1 ? undefined : `calc(${ANCHO_HORAS} + ${n} * ${ANCHO_MIN_DIA})`,
        }}
      >
        {/* ---------- cabecera: queda fija arriba al deslizar ---------- */}
        <div className="sticky left-0 top-0 z-40 border-b border-linea bg-superficie" />
        {dias.map((dia) => {
          const esHoy = dia === hoy;
          return (
            <div
              key={dia}
              className={`sticky top-0 z-30 flex items-center justify-center border-b border-l border-linea px-1 py-1.5 ${
                esHoy ? "bg-azul-luz" : "bg-superficie"
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
                // El día y su número en una sola línea ("LUN 21"): la cabecera queda baja.
                <Link
                  href={urlAgenda(parametros, { vista: "dia", fecha: dia })}
                  scroll={false}
                  aria-label={`Ver ${diaLargo(dia)}`}
                  className="group flex items-center gap-1.5"
                >
                  <span
                    className={`text-[0.68rem] font-semibold uppercase tracking-wide ${
                      esHoy ? "text-azul-oscuro" : "text-tinta-suave"
                    }`}
                  >
                    {diaCorto(dia)}
                  </span>
                  <span
                    className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[0.9rem] font-semibold transition-colors ${
                      esHoy ? "bg-azul text-white" : "text-tinta group-hover:bg-papel-hundido"
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
          const delDia = repartirCarriles(locales.filter((c) => c.dia === dia));

          // Lo ya pasado, apenas más apagado: el día entero si es anterior a hoy, o hasta ahora si es hoy.
          const remPasado =
            dia < hoy
              ? alto
              : esHoy
                ? Math.min(alto, Math.max(0, ((minutosAhora - rango.inicio) / 60) * REM_POR_HORA))
                : 0;
          const hayLineaAhora = esHoy && minutosAhora >= rango.inicio && minutosAhora <= rango.fin;

          // Lo que el horario de trabajo dice que ese día no se atiende (rayado) o es el descanso (gris).
          const franjas = franjasDelDia(horarioPorDia.get(diaDeLaSemana(dia)), rango);

          return (
            <div
              key={dia}
              className="relative border-l border-linea bg-superficie"
              style={{ height: `${alto}rem`, ...fondoLineas }}
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
                const remAlto = Math.max(((c.hasta - c.desde) / 60) * REM_POR_HORA, REM_MINIMO_TURNO);
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
                    className={`animate-bloque absolute z-10 overflow-hidden rounded-md border border-l-4 px-1.5 py-1 text-[0.7rem] leading-tight shadow-sm transition-[transform,box-shadow] duration-150 hover:z-20 hover:-translate-y-px hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${estado.bloque}`}
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
                    <p className="cifra truncate font-semibold">
                      {horaDeMinutos(c.desde)} – {horaDeMinutos(c.hasta)}
                    </p>
                    <p className="truncate font-medium">{c.clienteNombre}</p>
                    {c.serviciosTexto && <p className="truncate opacity-90">{c.serviciosTexto}</p>}
                    {c.precio != null && <p className="cifra truncate">{formatearGuarani(c.precio)}</p>}
                    {mostrarPersonal && <p className="truncate opacity-80">{c.personalNombre}</p>}
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
