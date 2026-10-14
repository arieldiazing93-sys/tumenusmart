import Link from "next/link";
import { formatearGuarani } from "@/lib/format";
import { franjasDelDiaDeVarios, rangoDelHorario, type HorarioDia } from "@/lib/horario-trabajo";
import { estadoDeCita, horaDeMinutos, partesLocales, rangoDeHoras, repartirCarriles } from "@/lib/agenda";
import { textoDuracionCancha, urlReservaCancha, type ParametrosCanchas } from "@/lib/canchas";
import { DesplazarAlIniciar } from "../agenda/DesplazarAlIniciar";

/** Cuánto mide una hora en pantalla. */
const REM_POR_HORA = 5;
/** El ancho de la columna de las horas, a la izquierda. */
const ANCHO_HORAS = "3.25rem";
/** El ancho mínimo de cada cancha: con muchas canchas la grilla se desliza de costado en el celular. */
const REM_CANCHA = 9.5;
/** El alto mínimo de una reserva, para poder tocarla. */
const REM_MINIMO_RESERVA = 1.5;
/** De cuánto en cuánto se puede tocar un hueco para anotar una reserva. */
const PASO_HUECO_MIN = 30;
/** Las rayas diagonales de lo que queda fuera del horario del complejo. */
const RAYADO = {
  backgroundImage:
    "repeating-linear-gradient(135deg, rgb(var(--linea)) 0, rgb(var(--linea)) 1px, transparent 1px, transparent 7px)",
};

export type ColumnaCancha = { id: string; nombre: string; tipo: string; activa: boolean };

export type ReservaGrilla = {
  id: string;
  canchaId: string;
  clienteNombre: string;
  inicio: Date;
  fin: Date;
  estado: string;
  precio: number;
  duracionMin: number;
  /** web = la pidió el cliente desde la página; panel = la anotó el negocio. */
  origen: string;
  /** true si ya se cobró en la caja (se marca con una tilde). */
  cobrada: boolean;
};

/**
 * El calendario de un día: las horas a la izquierda y una columna por cancha. Cada reserva es un bloque del alto de lo
 * que dura; tocarlo abre su detalle. Tocar un hueco vacío abre una reserva nueva con esa cancha y esa hora ya elegidas.
 *
 * La cabecera con las canchas queda fija arriba y la columna de las horas fija a la izquierda mientras se desliza, así
 * en el celular nunca se pierde de vista qué cancha y qué hora se está mirando. Lo que queda fuera del horario del
 * complejo se ve rayado, y una línea roja marca el momento de ahora.
 */
export function GrillaCanchas({
  canchas,
  reservas,
  dia,
  hoy,
  ahora,
  horario,
  parametros,
}: {
  canchas: ColumnaCancha[];
  reservas: ReservaGrilla[];
  /** "YYYY-MM-DD" del día que se mira. */
  dia: string;
  /** "YYYY-MM-DD" de hoy en Asunción. */
  hoy: string;
  ahora: Date;
  /** El horario del complejo ese día (null si todavía no se configuró nada: no se sombrea). */
  horario: HorarioDia | null;
  parametros: ParametrosCanchas;
}) {
  // Cada reserva con sus minutos en hora de Asunción.
  const locales = reservas.map((r) => {
    const i = partesLocales(r.inicio);
    const f = partesLocales(r.fin);
    const hasta = f.dia === i.dia ? f.minutos : 24 * 60;
    return { ...r, desde: i.minutos, hasta: Math.max(hasta, i.minutos + 15) };
  });

  // La grilla dibuja el tramo en que se abre (y se amplía si alguna reserva cae afuera).
  const rango = rangoDeHoras(locales, horario ? rangoDelHorario([horario]) : null);
  // Un cierre a las 23:59 es la medianoche: sin esto quedaría un minuto rayado al final de la grilla.
  const horarioDeFranjas = horario && horario.fin === "23:59" ? { ...horario, fin: "24:00" } : horario;
  const franjas = franjasDelDiaDeVarios(horarioDeFranjas ? [horarioDeFranjas] : [], rango);
  const horasEnteras = (rango.fin - rango.inicio) / 60;
  const alto = horasEnteras * REM_POR_HORA;
  const { minutos: minutosAhora } = partesLocales(ahora);
  const esHoy = dia === hoy;

  // Lo ya pasado, apenas más apagado: el día entero si es anterior a hoy, o hasta ahora si es hoy.
  const remPasado =
    dia < hoy
      ? alto
      : esHoy
        ? Math.min(alto, Math.max(0, ((minutosAhora - rango.inicio) / 60) * REM_POR_HORA))
        : 0;
  const hayLineaAhora = esHoy && minutosAhora >= rango.inicio && minutosAhora <= rango.fin;

  // Las líneas de las horas (marcadas) y de las medias horas (suaves): sin ellas cuesta ver a qué hora cae cada reserva.
  const LINEAS_DE_HORAS = {
    backgroundImage:
      `repeating-linear-gradient(to bottom, rgb(var(--linea)) 0, rgb(var(--linea)) 1px, transparent 1px, transparent ${REM_POR_HORA}rem), ` +
      `repeating-linear-gradient(to bottom, transparent 0, transparent ${REM_POR_HORA / 2}rem, rgb(var(--linea-fina)) ${REM_POR_HORA / 2}rem, rgb(var(--linea-fina)) calc(${REM_POR_HORA / 2}rem + 1px), transparent calc(${REM_POR_HORA / 2}rem + 1px), transparent ${REM_POR_HORA}rem)`,
  };

  // A dónde dejar corrido el calendario al abrirlo: una hora antes de ahora si se mira hoy; si no, la primera reserva.
  let enfocar = 0;
  if (esHoy && minutosAhora >= rango.inicio) enfocar = minutosAhora - 60;
  else if (locales.length > 0) enfocar = Math.min(...locales.map((r) => r.desde)) - 30;
  const remInicial = Math.max(0, ((enfocar - rango.inicio) / 60) * REM_POR_HORA);

  // Los huecos donde se puede tocar para anotar una reserva.
  const huecos: number[] = [];
  for (let m = rango.inicio; m + PASO_HUECO_MIN <= rango.fin; m += PASO_HUECO_MIN) huecos.push(m);

  return (
    <div data-scroll-agenda className="max-h-[calc(100dvh-16rem)] min-h-[24rem] overflow-auto overscroll-contain">
      <DesplazarAlIniciar rem={remInicial} />
      <div
        className="grid"
        style={{
          gridTemplateColumns: `${ANCHO_HORAS} repeat(${canchas.length}, minmax(${REM_CANCHA}rem, 1fr))`,
          minWidth: `calc(${ANCHO_HORAS} + ${canchas.length * REM_CANCHA}rem)`,
        }}
      >
        {/* ---------- cabecera: queda fija arriba al deslizar ---------- */}
        <div className="sticky left-0 top-0 z-40 border-b border-linea bg-superficie" />
        {canchas.map((c) => (
          <div
            key={c.id}
            className={`sticky top-0 z-30 flex flex-col items-center justify-center border-b border-l border-linea bg-superficie px-1 py-2 text-center ${
              c.activa ? "" : "opacity-60"
            }`}
          >
            <p className="max-w-full truncate text-[0.9rem] font-semibold text-tinta">{c.nombre}</p>
            <p className="max-w-full truncate text-[0.7rem] text-tinta-suave">
              {c.tipo}
              {c.activa ? "" : " · inactiva"}
            </p>
          </div>
        ))}

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

        {/* ---------- una cancha por columna ---------- */}
        {canchas.map((c) => {
          const delaCancha = repartirCarriles(locales.filter((r) => r.canchaId === c.id));
          return (
            <div
              key={c.id}
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
                />
              ))}

              {/* Los huecos: tocar uno anota una reserva en esa cancha a esa hora. */}
              {c.activa &&
                huecos.map((m) => (
                  <Link
                    key={m}
                    href={urlReservaCancha(parametros, "nueva", { cancha: c.id, hora: horaDeMinutos(m) })}
                    scroll={false}
                    aria-label={`Anotar una reserva en ${c.nombre} a las ${horaDeMinutos(m)}`}
                    title={`Anotar reserva · ${c.nombre} · ${horaDeMinutos(m)}`}
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

              {delaCancha.map((r, indice) => {
                const estado = estadoDeCita(r.estado);
                // La reserva mide lo que dura (con un mínimo para poder tocarla). Cuanto más alta, más datos muestra.
                const remAlto = Math.max(((r.hasta - r.desde) / 60) * REM_POR_HORA, REM_MINIMO_RESERVA);
                const nivel = remAlto < 2.2 ? 1 : remAlto < 3.4 ? 2 : remAlto < 4.6 ? 3 : 4;
                const textoHoras = `${horaDeMinutos(r.desde)} – ${horaDeMinutos(r.hasta)}`;
                const izquierda = (r.carril / r.carriles) * 100;
                return (
                  <Link
                    key={r.id}
                    href={urlReservaCancha(parametros, r.id)}
                    scroll={false}
                    aria-label={`Abrir la reserva de ${r.clienteNombre}`}
                    title={[
                      r.clienteNombre,
                      c.nombre,
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
                      // Las reservas entran apenas escalonadas al abrir el calendario.
                      animationDelay: `${Math.min(indice, 8) * 30}ms`,
                    }}
                  >
                    {r.cobrada && (
                      <span aria-label="Cobrada" title="Cobrada en caja" className="absolute right-1 top-0.5 text-[0.78rem] font-bold leading-none">
                        ✓
                      </span>
                    )}
                    {/* Primero quién es (lo que se busca con la vista), después la hora y el resto, según cuánto lugar haya. */}
                    <p className="truncate text-[0.78rem] font-semibold">
                      {nivel === 1 ? `${horaDeMinutos(r.desde)} · ${r.clienteNombre}` : r.clienteNombre}
                    </p>
                    {nivel >= 2 && <p className="truncate tabular-nums opacity-90">{textoHoras}</p>}
                    {nivel >= 3 && (
                      <p className="truncate opacity-90">
                        {textoDuracionCancha(r.duracionMin)}
                        {r.origen === "web" ? " · web" : ""}
                      </p>
                    )}
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
