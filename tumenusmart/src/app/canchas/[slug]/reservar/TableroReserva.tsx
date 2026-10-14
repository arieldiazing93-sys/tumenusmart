"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { diaCorto, diaLargo, horaDeMinutos, numeroDeDia } from "@/lib/agenda";
import { claveSumarDias, NOMBRES_MES } from "@/lib/calendario";
import {
  etiquetaDeDeporte,
  precioDeReserva,
  textoDuracionCancha,
  type CanchaPublica,
  type DisponibilidadPorDia,
  type ReservaCreada,
} from "@/lib/canchas";
import { DIAS_ADELANTE } from "@/lib/disponibilidad";
import { formatearGuarani } from "@/lib/format";
import type { CampoFormulario } from "@/lib/pagina-reservas";
import { DATOS_CLIENTE_VACIOS, validarDatosCliente, type DatosCliente } from "@/lib/reserva-cliente";
import { IconoAtras } from "@/app/turnos/[slug]/Iconos";
import { crearReservaCanchaPublica, tableroDeCanchas } from "../actions";
import { PasoDatosCancha } from "./PasoDatosCancha";
import { ReservaConfirmada } from "./ReservaConfirmada";

type Seleccion = { dia: string; canchaId: string; hora: number };
type Vista = "tablero" | "datos";

const BOTON =
  "flex h-14 w-full items-center justify-center rounded-2xl bg-brand text-[1rem] font-semibold text-white shadow-alta " +
  "transition-all hover:bg-brand-dark active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none";
const BOTON_VOLVER =
  "flex h-10 w-10 flex-none items-center justify-center rounded-full bg-papel-hundido text-tinta transition-all hover:bg-brand-light active:scale-90";

/**
 * La reserva de una cancha, en un solo tablero. En vez de ir de pantalla en pantalla, se ve todo junto:
 *
 *   1. arriba, la tira de días (los que no tienen horarios quedan apagados);
 *   2. debajo, cuánto tiempo van a jugar (1 hora, 1 h 30, 2 horas…) y, si el complejo tiene de más de un deporte, el tipo;
 *   3. y una tarjeta por cancha con SUS horarios libres de ese día: lo que otra persona ya reservó no aparece.
 *
 * Tocar un horario lo elige y abajo aparece la reserva armada con su precio. Así se contesta de una la pregunta con que la
 * gente llega ("el viernes a las 21, por hora y media: ¿qué cancha está libre?") sin elegir antes una cancha a ciegas.
 *
 * Después se piden los datos y se confirma; la reserva queda tomada y el aviso por WhatsApp va al complejo.
 */
export function TableroReserva({
  slug,
  negocio,
  canchas,
  campos,
  hoy,
  inicial,
}: {
  slug: string;
  negocio: string;
  canchas: CanchaPublica[];
  campos: CampoFormulario[];
  /** "YYYY-MM-DD" de hoy en Asunción. */
  hoy: string;
  /** Lo que ya venía elegido (desde la portada): el día, la cancha y la hora tocados. */
  inicial: { dia: string | null; canchaId: string | null; hora: number | null };
}) {
  const ultimoReservable = claveSumarDias(hoy, DIAS_ADELANTE - 1);

  const [dias, setDias] = useState<DisponibilidadPorDia>({});
  const [cubierto, setCubierto] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [dia, setDia] = useState(inicial.dia && inicial.dia >= hoy && inicial.dia <= ultimoReservable ? inicial.dia : hoy);
  const [tipo, setTipo] = useState("todas");
  const [duracionElegida, setDuracionElegida] = useState<number | null>(null);
  const [sel, setSel] = useState<Seleccion | null>(null);

  const [vista, setVista] = useState<Vista>("tablero");
  const [cliente, setCliente] = useState<DatosCliente>(DATOS_CLIENTE_VACIOS);
  const [error, setError] = useState<string | null>(null);
  const [horarioOcupado, setHorarioOcupado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [reserva, setReserva] = useState<ReservaCreada | null>(null);

  // Lo último cargado, para que las cargas que se encadenan no lean valores viejos.
  const diasRef = useRef<DisponibilidadPorDia>({});
  const cubiertoRef = useRef<string | null>(null);
  const yaPreseleccionado = useRef(false);

  // ---------- la carga de horarios, por ventanas de días ----------

  const cargarHasta = useCallback(
    async (destino: string, desdeCero: boolean) => {
      setCargando(true);
      setErrorCarga(null);
      const acumulado: DisponibilidadPorDia = desdeCero ? {} : { ...diasRef.current };
      let ultimo: string | null = desdeCero ? null : cubiertoRef.current;
      let siguiente = ultimo ? claveSumarDias(ultimo, 1) : hoy;
      try {
        while (siguiente <= destino && siguiente <= ultimoReservable) {
          const r = await tableroDeCanchas(slug, siguiente);
          if (!r.ok) {
            setErrorCarga(r.error);
            break;
          }
          Object.assign(acumulado, r.dias);
          ultimo = r.hasta;
          siguiente = claveSumarDias(r.hasta, 1);
        }
      } catch {
        setErrorCarga("No se pudieron cargar los horarios. Revisá tu conexión e intentá de nuevo.");
      }
      diasRef.current = acumulado;
      cubiertoRef.current = ultimo;
      setDias(acumulado);
      setCubierto(ultimo);
      setCargando(false);
    },
    [slug, hoy, ultimoReservable]
  );

  // Al entrar: lo de las próximas dos semanas (o hasta el día que venía tocado desde la portada).
  useEffect(() => {
    void cargarHasta(claveSumarDias(hoy, 13) > dia ? claveSumarDias(hoy, 13) : dia, true);
    // Solo al entrar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- lo que se ve ----------

  const delTipo = useMemo(
    () => (tipo === "todas" ? canchas : canchas.filter((c) => c.deporte === tipo)),
    [canchas, tipo]
  );
  const tipos = useMemo(() => {
    const vistos: string[] = [];
    for (const c of canchas) if (!vistos.includes(c.deporte)) vistos.push(c.deporte);
    return vistos;
  }, [canchas]);
  const duraciones = useMemo(
    () => [...new Set(delTipo.flatMap((c) => c.duraciones))].sort((a, b) => a - b),
    [delTipo]
  );
  const duracion = duracionElegida !== null && duraciones.includes(duracionElegida) ? duracionElegida : (duraciones[0] ?? 60);

  const horasDe = useCallback(
    (d: string, canchaId: string, minutos: number): number[] => dias[d]?.[canchaId]?.[minutos] ?? [],
    [dias]
  );

  /** ¿Ese día tiene algún horario libre (con la duración que se mira, si `conDuracion`)? */
  const diaConHoras = useCallback(
    (d: string, conDuracion: boolean) =>
      delTipo.some((c) =>
        conDuracion ? horasDe(d, c.id, duracion).length > 0 : c.duraciones.some((m) => horasDe(d, c.id, m).length > 0)
      ),
    [delTipo, horasDe, duracion]
  );

  // Los días que se muestran en la tira: de hoy hasta lo que ya se cargó.
  const listaDeDias = useMemo(() => {
    const salida: string[] = [];
    const fin = cubierto ?? claveSumarDias(hoy, 13);
    for (let d = hoy; d <= fin && salida.length < DIAS_ADELANTE; d = claveSumarDias(d, 1)) salida.push(d);
    return salida;
  }, [cubierto, hoy]);

  // La selección deja de valer si el horario ya no está libre (cambió la duración, el tipo o se recargó).
  useEffect(() => {
    if (!sel) return;
    if (sel.dia !== dia || !horasDe(sel.dia, sel.canchaId, duracion).includes(sel.hora)) setSel(null);
  }, [sel, dia, duracion, horasDe]);

  // Si venía una cancha y una hora tocadas desde la portada, se deja elegida (una sola vez, cuando ya hay datos).
  useEffect(() => {
    if (yaPreseleccionado.current || cargando || inicial.canchaId === null || inicial.hora === null) return;
    yaPreseleccionado.current = true;
    const cancha = canchas.find((c) => c.id === inicial.canchaId);
    if (!cancha) return;
    const objetivo = inicial.dia && inicial.dia >= hoy ? inicial.dia : hoy;
    // La duración más corta de esa cancha que tenga ese horario libre.
    const minutos = [...cancha.duraciones].sort((a, b) => a - b).find((m) => horasDe(objetivo, cancha.id, m).includes(inicial.hora as number));
    if (minutos === undefined) return;
    setTipo("todas");
    setDia(objetivo);
    setDuracionElegida(minutos);
    setSel({ dia: objetivo, canchaId: cancha.id, hora: inicial.hora as number });
  }, [cargando, canchas, horasDe, hoy, inicial]);

  // La tira lleva el día elegido a la vista.
  useEffect(() => {
    document.getElementById(`dia-${dia}`)?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [dia, listaDeDias.length]);

  const cancha = sel ? (canchas.find((c) => c.id === sel.canchaId) ?? null) : null;
  const total = cancha && sel ? precioDeReserva(cancha, sel.hora, duracion) : null;
  const siguienteConHoras = listaDeDias.find((d) => d > dia && diaConHoras(d, true)) ?? null;
  const puedeCargarMas = cubierto !== null && cubierto < ultimoReservable;

  // ---------- confirmar ----------

  async function confirmar() {
    if (!sel || !cancha) return;
    // La misma revisión que hace el servidor, para avisar al toque.
    const revision = validarDatosCliente(campos, cliente);
    if (!revision.ok) {
      setError(revision.error);
      return;
    }
    setError(null);
    setHorarioOcupado(false);
    setEnviando(true);
    try {
      const resultado = await crearReservaCanchaPublica(slug, {
        canchaId: sel.canchaId,
        duracion,
        fecha: sel.dia,
        hora: horaDeMinutos(sel.hora),
        cliente,
      });
      if (!resultado.ok) {
        setError(resultado.error);
        setHorarioOcupado(resultado.horarioOcupado === true);
        return;
      }
      setReserva(resultado.reserva);
      window.scrollTo({ top: 0 });
    } catch {
      setError("No se pudo crear la reserva. Revisá tu conexión e intentá de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  function elegirOtraHora() {
    setSel(null);
    setHorarioOcupado(false);
    setError(null);
    setVista("tablero");
    window.scrollTo({ top: 0 });
    // Lo que se acaba de ocupar tiene que desaparecer del tablero.
    void cargarHasta(cubiertoRef.current ?? claveSumarDias(hoy, 13), true);
  }

  // ---------- pantalla final ----------

  if (reserva) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col bg-papel px-4 pb-10 pt-6 sm:border-x sm:border-linea">
        <ReservaConfirmada slug={slug} negocio={negocio} reserva={reserva} />
      </div>
    );
  }

  // ---------- datos del cliente ----------

  if (vista === "datos" && sel && cancha && total !== null) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col bg-papel sm:shadow-alta">
        <header className="sticky top-0 z-20 flex items-center gap-3 bg-papel/95 px-4 py-3 backdrop-blur">
          <button type="button" onClick={() => setVista("tablero")} aria-label="Volver al tablero" className={BOTON_VOLVER}>
            <IconoAtras />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.7rem] font-semibold uppercase tracking-rotulo text-tinta-suave">{negocio}</p>
            <h1 className="truncate text-[1.2rem] font-semibold leading-tight tracking-titular text-tinta">Tus datos</h1>
          </div>
        </header>

        <main className="flex-1 px-4 pb-56 pt-3">
          <PasoDatosCancha
            resumen={{
              cancha,
              fechaTexto: diaLargo(sel.dia),
              horaInicio: horaDeMinutos(sel.hora),
              horaFin: horaDeMinutos(sel.hora + duracion),
              duracionMin: duracion,
              total,
            }}
            campos={campos}
            datos={cliente}
            onCambiar={(parche) => {
              setCliente((c) => ({ ...c, ...parche }));
              setError(null);
            }}
          />
        </main>

        <footer className="pointer-events-none fixed bottom-0 left-1/2 z-20 w-full max-w-xl -translate-x-1/2">
          <div aria-hidden="true" className="h-8 bg-gradient-to-t from-papel to-transparent" />
          <div className="pointer-events-auto bg-papel px-4 pb-4">
            {error && (
              <div role="alert" className="mb-2.5 rounded-xl bg-peligro-luz px-3.5 py-2.5 text-[0.86rem] font-medium text-peligro">
                {error}
                {horarioOcupado && (
                  <button type="button" onClick={elegirOtraHora} className="ml-2 font-semibold underline">
                    Elegir otra hora
                  </button>
                )}
              </div>
            )}
            <p className="mb-2.5 text-center text-[0.72rem] leading-snug text-tinta-suave">
              Al confirmar la reserva, aceptás que {negocio} use tus datos para gestionarla.
            </p>
            <button type="button" onClick={confirmar} disabled={enviando} className={BOTON}>
              {enviando ? "Creando tu reserva…" : "Confirmar reserva"}
            </button>
          </div>
        </footer>
      </div>
    );
  }

  // ---------- el tablero ----------

  const hayAlgo = delTipo.length > 0;
  const [anioDia, mesDia] = dia.split("-").map(Number);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col bg-papel sm:shadow-alta">
      <header className="sticky top-0 z-20 bg-papel/95 pb-2 pt-3 backdrop-blur">
        <div className="flex items-center gap-3 px-4">
          <Link href={`/canchas/${slug}`} aria-label="Volver a la página" className={BOTON_VOLVER}>
            <IconoAtras />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.7rem] font-semibold uppercase tracking-rotulo text-tinta-suave">{negocio}</p>
            <h1 className="truncate text-[1.2rem] font-semibold leading-tight tracking-titular text-tinta">Reservá tu cancha</h1>
          </div>
          <span className="rounded-xl bg-brand-light px-3 py-1.5 text-[0.8rem] font-semibold text-brand-texto">
            {NOMBRES_MES[mesDia - 1]} {anioDia}
          </span>
        </div>

        {/* ---------- la tira de días ---------- */}
        <div className="mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="tablist" aria-label="Día">
          {listaDeDias.map((d) => {
            const hay = diaConHoras(d, false);
            const elegido = d === dia;
            return (
              <button
                key={d}
                id={`dia-${d}`}
                type="button"
                role="tab"
                aria-selected={elegido}
                disabled={!hay && !elegido}
                onClick={() => setDia(d)}
                className={`flex w-14 flex-none flex-col items-center gap-0.5 rounded-2xl px-1 py-2 transition-all ${
                  elegido
                    ? "bg-brand text-white shadow-media"
                    : hay
                      ? "bg-superficie text-tinta ring-1 ring-linea hover:ring-brand/60 active:scale-95"
                      : "bg-papel-hundido/60 text-tinta-suave/60"
                }`}
              >
                <span className={`text-[0.64rem] font-semibold uppercase ${elegido ? "text-white/80" : "text-tinta-suave"}`}>
                  {d === hoy ? "Hoy" : diaCorto(d)}
                </span>
                <span className="cifra text-[1.15rem] font-bold leading-tight">{numeroDeDia(d)}</span>
              </button>
            );
          })}
          {puedeCargarMas && (
            <button
              type="button"
              disabled={cargando}
              onClick={() => void cargarHasta(claveSumarDias(cubierto as string, 14), false)}
              className="flex w-14 flex-none flex-col items-center justify-center rounded-2xl bg-brand-light px-1 py-2 text-[0.7rem] font-semibold text-brand-texto transition-all active:scale-95 disabled:opacity-50"
            >
              Más días ›
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 px-4 pb-48 pt-3">
        {/* ---------- cuánto tiempo y qué tipo ---------- */}
        <section aria-label="Duración" className="mb-1">
          <h2 className="mb-2 text-[0.9rem] font-semibold text-tinta">¿Cuánto tiempo van a jugar?</h2>
          <div role="radiogroup" aria-label="Duración" className="flex gap-2 overflow-x-auto pb-1">
            {duraciones.map((m) => {
              const activa = m === duracion;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={activa}
                  onClick={() => setDuracionElegida(m)}
                  className={`flex-none rounded-full px-5 py-2.5 text-[0.92rem] font-semibold transition-all active:scale-95 ${
                    activa ? "bg-brand text-white shadow-media" : "bg-superficie text-tinta ring-1 ring-linea hover:ring-brand/60"
                  }`}
                >
                  {textoDuracionCancha(m)}
                </button>
              );
            })}
          </div>
        </section>

        {tipos.length > 1 && (
          <section aria-label="Tipo de cancha" className="mt-3">
            <div role="tablist" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              {["todas", ...tipos].map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tipo === t}
                  onClick={() => setTipo(t)}
                  className={`flex-none rounded-full px-3.5 py-1.5 text-[0.82rem] font-semibold transition-all ${
                    tipo === t ? "bg-tinta text-papel" : "bg-papel-hundido text-tinta-media"
                  }`}
                >
                  {t === "todas" ? "Todas" : etiquetaDeDeporte(t)}
                </button>
              ))}
            </div>
          </section>
        )}

        <p className="mb-3 mt-4 text-[0.82rem] capitalize text-tinta-media">{diaLargo(dia)}</p>

        {errorCarga && <p className="mb-3 rounded-xl bg-peligro-luz p-3.5 text-[0.88rem] text-peligro">{errorCarga}</p>}

        {/* ---------- una tarjeta por cancha, con sus horarios libres ---------- */}
        {!hayAlgo ? (
          <p className="rounded-2xl border border-dashed border-linea bg-papel-suave px-5 py-10 text-center text-[0.9rem] text-tinta-media">
            Este complejo todavía no tiene canchas para reservar.
          </p>
        ) : cargando && Object.keys(dias).length === 0 ? (
          <ul className="flex flex-col gap-3" aria-busy="true" aria-label="Buscando horarios">
            {delTipo.map((c) => (
              <li key={c.id} className="h-40 animate-pulse rounded-2xl bg-papel-hundido" />
            ))}
          </ul>
        ) : !diaConHoras(dia, true) ? (
          <div className="rounded-2xl border border-dashed border-linea bg-papel-suave px-5 py-9 text-center">
            <p className="text-[0.95rem] font-semibold text-tinta">No quedan horarios de {textoDuracionCancha(duracion)} este día</p>
            {diaConHoras(dia, false) ? (
              <p className="mt-1 text-[0.84rem] text-tinta-media">Probá con otra duración: hay horarios más cortos.</p>
            ) : siguienteConHoras ? (
              <button
                type="button"
                onClick={() => setDia(siguienteConHoras)}
                className="mt-3 rounded-full bg-brand px-5 py-2.5 text-[0.88rem] font-semibold text-white active:scale-95"
              >
                Ver el {diaLargo(siguienteConHoras)}
              </button>
            ) : (
              <p className="mt-1 text-[0.84rem] text-tinta-media">Probá con otro día.</p>
            )}
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {delTipo
              .filter((c) => c.duraciones.includes(duracion))
              .map((c) => {
                const horas = horasDe(dia, c.id, duracion);
                const otrasDuraciones = c.duraciones.filter((m) => m !== duracion && horasDe(dia, c.id, m).length > 0);
                return (
                  <li key={c.id} className="rounded-2xl bg-superficie p-3.5 shadow-sm ring-1 ring-linea">
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="flex h-14 w-14 flex-none items-center justify-center overflow-hidden rounded-xl bg-brand-light text-[1.4rem]"
                      >
                        {c.fotoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.fotoUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          "⚽"
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[1.02rem] font-semibold tracking-titular text-tinta">{c.nombre}</p>
                        <p className="truncate text-[0.8rem] text-tinta-media">
                          {[etiquetaDeDeporte(c.deporte), c.superficie, c.techada ? "Techada" : null].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <p className="cifra flex-none text-right text-[0.84rem] font-semibold text-tinta">
                        {formatearGuarani(c.precioHora)}
                        <span className="block text-[0.68rem] font-normal text-tinta-suave">por hora</span>
                      </p>
                    </div>

                    {horas.length > 0 ? (
                      <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-5">
                        {horas.map((h) => {
                          const marcada = sel?.dia === dia && sel.canchaId === c.id && sel.hora === h;
                          return (
                            <button
                              key={h}
                              type="button"
                              aria-pressed={marcada}
                              onClick={() => {
                                setSel({ dia, canchaId: c.id, hora: h });
                                setError(null);
                              }}
                              className={`flex flex-col items-center rounded-xl px-1 py-2 transition-all active:scale-95 ${
                                marcada
                                  ? "bg-brand text-white shadow-media"
                                  : "bg-papel-suave text-tinta ring-1 ring-linea hover:ring-brand/60"
                              }`}
                            >
                              <span className="cifra text-[0.95rem] font-bold leading-tight">{horaDeMinutos(h)}</span>
                              <span className={`cifra text-[0.64rem] ${marcada ? "text-white/80" : "text-tinta-suave"}`}>
                                a {horaDeMinutos(h + duracion)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="mt-3 rounded-xl bg-papel-hundido/60 px-3 py-2.5 text-[0.82rem] text-tinta-media">
                        Sin horarios de {textoDuracionCancha(duracion)} este día.
                        {otrasDuraciones.length > 0 && (
                          <>
                            {" "}
                            <button
                              type="button"
                              onClick={() => setDuracionElegida(otrasDuraciones[0])}
                              className="font-semibold text-brand-texto underline"
                            >
                              Ver {textoDuracionCancha(otrasDuraciones[0])}
                            </button>
                          </>
                        )}
                      </p>
                    )}

                    {c.precioNocturnoHora !== null && horas.length > 0 && (
                      <p className="mt-2.5 text-[0.72rem] text-tinta-suave">
                        Desde las {c.nocheDesde} la hora cuesta {formatearGuarani(c.precioNocturnoHora)}.
                      </p>
                    )}
                  </li>
                );
              })}
          </ul>
        )}

        <p className="mt-6 text-center text-[0.72rem] text-tinta-suave">
          La zona horaria del complejo es (GMT-03:00) Asunción, Paraguay
        </p>
      </main>

      {/* ---------- abajo: la reserva armada, con su precio ---------- */}
      <footer className="pointer-events-none fixed bottom-0 left-1/2 z-20 w-full max-w-xl -translate-x-1/2">
        <div aria-hidden="true" className="h-8 bg-gradient-to-t from-papel to-transparent" />
        <div className="pointer-events-auto bg-papel px-4 pb-4">
          {sel && cancha && total !== null ? (
            <>
              <div className="mb-2 flex items-center justify-between gap-3 rounded-2xl bg-superficie px-4 py-3 shadow-media ring-1 ring-linea">
                <div className="min-w-0">
                  <p className="truncate text-[0.92rem] font-semibold text-tinta">{cancha.nombre}</p>
                  <p className="cifra truncate text-[0.78rem] capitalize text-tinta-media">
                    {diaLargo(sel.dia)} · {horaDeMinutos(sel.hora)} a {horaDeMinutos(sel.hora + duracion)} ·{" "}
                    {textoDuracionCancha(duracion)}
                  </p>
                </div>
                <span className="cifra flex-none text-[1.1rem] font-bold text-tinta">{formatearGuarani(total)}</span>
              </div>
              <button type="button" onClick={() => setVista("datos")} className={BOTON}>
                Continuar
              </button>
            </>
          ) : (
            <p className="rounded-2xl bg-papel-hundido px-4 py-3.5 text-center text-[0.88rem] font-medium text-tinta-media">
              Tocá un horario para elegir tu cancha
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}
