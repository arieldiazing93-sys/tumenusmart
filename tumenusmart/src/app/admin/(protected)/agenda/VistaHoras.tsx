import Link from "next/link";
import { formatearGuarani } from "@/lib/format";
import { franjasDelDia, rangoDelHorario, type HorarioDia } from "@/lib/horario-trabajo";
import {
  MOMENTOS_DEL_DIA,
  diaCorto,
  diaDeLaSemana,
  diaLargo,
  esFinDeSemana,
  estadoDeCita,
  horaDeMinutos,
  iniciales,
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
import { IconoEstado } from "./IconosAgenda";

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
 * La cabecera con los días queda fija arriba y la columna de las horas fija a
 * la izquierda mientras se desliza, así en el celular nunca se pierde de vista
 * qué día y qué hora se está mirando. Lo ya pasado se ve en gris y una línea
 * roja marca el momento de ahora.
 *
 * Los colores ayudan a entender sin leer: el fondo va de amarillo (mañana) a naranja
 * (tarde) y a índigo (noche); hoy se destaca con el color de la marca; cada turno tiene
 * el color de su estado, un ícono en la esquina y los puntitos de color de sus servicios.
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

  // Cuántos turnos tiene cada día (el numerito de la cabecera).
  const turnosPorDia = new Map<string, number>();
  for (const c of locales) turnosPorDia.set(c.dia, (turnosPorDia.get(c.dia) ?? 0) + 1);

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

  // Los tramos de mañana, tarde y noche que caen dentro de lo que se dibuja.
  const momentos = MOMENTOS_DEL_DIA.flatMap((m) => {
    const desde = Math.max(m.desde, rango.inicio);
    const hasta = Math.min(m.hasta, rango.fin);
    if (hasta <= desde) return [];
    return [
      {
        ...m,
        top: `${((desde - rango.inicio) / 60) * REM_POR_HORA}rem`,
        alto: `${((hasta - desde) / 60) * REM_POR_HORA}rem`,
      },
    ];
  });

  return (
    <div
      data-scroll-agenda
      className="max-h-[calc(100dvh-19rem)] min-h-[24rem] overflow-auto overscroll-contain"
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
          const finDeSemana = esFinDeSemana(dia);
          const cantidad = turnosPorDia.get(dia) ?? 0;
          const textoCantidad = `${cantidad} ${cantidad === 1 ? "cita" : "citas"}`;
          return (
            <div
              key={dia}
              className={`sticky top-0 z-30 flex items-center justify-center border-b border-l border-linea px-1 py-2 ${
                esHoy
                  ? "bg-gradient-to-b from-brand-light to-superficie"
                  : finDeSemana
                    ? "bg-violet-50"
                    : "bg-superficie"
              }`}
            >
              {n === 1 ? (
                <div className="flex items-center gap-2.5">
                  <p
                    className={`rounded-full px-4 py-1.5 text-[0.95rem] font-bold ${
                      esHoy
                        ? "bg-gradient-to-br from-brand to-brand-dark text-white shadow-md shadow-brand/30"
                        : "text-tinta"
                    }`}
                  >
                    {diaLargo(dia)}
                  </p>
                  {cantidad > 0 && (
                    <span className="rounded-full bg-brand-light px-2.5 py-1 text-[0.74rem] font-bold text-brand-texto">
                      {textoCantidad}
                    </span>
                  )}
                </div>
              ) : (
                <Link
                  href={urlAgenda(parametros, { vista: "dia", fecha: dia })}
                  scroll={false}
                  aria-label={`Ver ${diaLargo(dia)}`}
                  className="group flex flex-col items-center gap-0.5"
                >
                  <span
                    className={`text-[0.68rem] font-bold uppercase tracking-wide ${
                      esHoy ? "text-brand-texto" : finDeSemana ? "text-violet-500" : "text-tinta-suave"
                    }`}
                  >
                    {diaCorto(dia)}
                  </span>
                  <span
                    className={`flex h-8 min-w-8 items-center justify-center rounded-full px-1 text-[1rem] font-bold transition-all duration-200 ${
                      esHoy
                        ? "bg-gradient-to-br from-brand to-brand-dark text-white shadow-md shadow-brand/30 ring-4 ring-brand/15"
                        : "text-tinta group-hover:scale-110 group-hover:bg-brand-light group-hover:text-brand-texto"
                    }`}
                  >
                    {numeroDeDia(dia)}
                  </span>
                  {/* Siempre ocupa su lugar, así todas las cabeceras miden lo mismo. */}
                  <span
                    className={`h-4 rounded-full px-1.5 text-[0.6rem] font-bold leading-4 ${
                      cantidad > 0 ? "bg-brand-light text-brand-texto" : "text-transparent"
                    }`}
                  >
                    {cantidad > 0 ? textoCantidad : "·"}
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
          {/* Una barrita de color al costado: amarilla de mañana, naranja de tarde, índigo de noche. */}
          {momentos.map((m, i) => (
            <span
              key={i}
              aria-hidden="true"
              className={`absolute right-0 w-[3px] ${m.barra}`}
              style={{ top: m.top, height: m.alto }}
            />
          ))}
          {Array.from({ length: horasEnteras }, (_, i) => (
            <span
              key={i}
              className={`cifra absolute right-2 text-[0.68rem] font-medium text-tinta-suave ${
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

          // Lo que ya pasó, en gris: el día entero si es anterior a hoy, o hasta ahora si es hoy.
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
              className={`relative border-l border-linea ${
                esHoy ? "bg-brand-light/20" : esFinDeSemana(dia) ? "bg-violet-50/50" : "bg-superficie"
              }`}
              style={{ height: `${alto}rem`, ...fondoLineas }}
            >
              {/* El fondo por momento del día: mañana, tarde y noche. */}
              {momentos.map((m, i) => (
                <div
                  key={i}
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-x-0 ${m.fondo}`}
                  style={{ top: m.top, height: m.alto }}
                />
              ))}

              {franjas.map((f, i) => (
                <div
                  key={i}
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-x-0 ${
                    f.tipo === "descanso" ? "bg-slate-400/25" : "bg-papel-hundido"
                  }`}
                  style={{
                    top: `${((f.desde - rango.inicio) / 60) * REM_POR_HORA}rem`,
                    height: `${((f.hasta - f.desde) / 60) * REM_POR_HORA}rem`,
                    ...(f.tipo === "cerrado" ? RAYADO : undefined),
                  }}
                >
                  {f.tipo === "descanso" && (
                    <span className="absolute left-1.5 top-1 rounded-full bg-slate-500/80 px-2 py-px text-[0.6rem] font-bold uppercase tracking-wide text-white">
                      Descanso
                    </span>
                  )}
                </div>
              ))}

              {remPasado > 0 && (
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 bg-papel-hundido/60"
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
                    className={`animate-bloque absolute z-10 overflow-hidden rounded-lg border border-l-4 px-1.5 py-1 text-[0.7rem] leading-tight shadow-sm transition-[transform,box-shadow] duration-150 hover:z-20 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${estado.bloque}`}
                    style={{
                      top: `${((c.desde - rango.inicio) / 60) * REM_POR_HORA}rem`,
                      height: `${remAlto}rem`,
                      left: `calc(${izquierda.toFixed(3)}% + 2px)`,
                      width: `calc(${(100 / c.carriles).toFixed(3)}% - 4px)`,
                      // Los turnos entran uno tras otro al abrir el calendario.
                      animationDelay: `${Math.min(indice, 14) * 45}ms`,
                    }}
                  >
                    {/* El ícono del estado en la esquina: reloj, flecha, tilde, cruz o prohibido. */}
                    <span
                      aria-hidden="true"
                      className={`absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full shadow-sm ${estado.insignia}`}
                    >
                      <IconoEstado estado={c.estado} tam={9} />
                    </span>
                    <p className="cifra truncate pr-5 font-bold">
                      {horaDeMinutos(c.desde)} – {horaDeMinutos(c.hasta)}
                    </p>
                    <p className="truncate pr-5 font-semibold">{c.clienteNombre}</p>
                    {c.serviciosTexto && <p className="truncate opacity-90">{c.serviciosTexto}</p>}
                    {c.precio != null && (
                      <p className="mt-0.5">
                        <span className="cifra inline-block rounded-full bg-white/75 px-1.5 py-px text-[0.66rem] font-bold">
                          {formatearGuarani(c.precio)}
                        </span>
                      </p>
                    )}
                    {mostrarPersonal && (
                      <p className="mt-0.5 flex items-center gap-1 truncate opacity-90">
                        <span className="flex h-3.5 min-w-3.5 flex-none items-center justify-center rounded-full bg-white/75 px-0.5 text-[0.5rem] font-bold">
                          {iniciales(c.personalNombre)}
                        </span>
                        <span className="truncate">{c.personalNombre}</span>
                      </p>
                    )}
                    {/* Un puntito por servicio, con el color que se le eligió en Servicios. */}
                    {c.colores.length > 0 && remAlto >= 2.6 && (
                      <span aria-hidden="true" className="absolute bottom-1 right-1 flex gap-0.5">
                        {c.colores.slice(0, 4).map((color, i) => (
                          <span
                            key={i}
                            className="h-2 w-2 rounded-full ring-1 ring-white"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </span>
                    )}
                  </Link>
                );
              })}

              {hayLineaAhora && (
                <div
                  className="pointer-events-none absolute inset-x-0 z-20 flex -translate-y-1/2 items-center"
                  style={{ top: `${((minutosAhora - rango.inicio) / 60) * REM_POR_HORA}rem` }}
                >
                  {/* Un puntito que late y la hora exacta de ahora. */}
                  <span className="relative -ml-1 flex h-2.5 w-2.5 flex-none">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                  </span>
                  <span className="cifra ml-0.5 rounded-full bg-red-500 px-1.5 py-px text-[0.6rem] font-bold text-white shadow">
                    {horaDeMinutos(minutosAhora)}
                  </span>
                  <span className="h-0.5 flex-1 bg-red-500" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
