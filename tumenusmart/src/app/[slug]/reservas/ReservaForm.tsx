"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { crearReserva } from "./actions";
import { TURNOS, MOTIVOS_RESERVA } from "@/lib/reservas";
import { Campo, Entrada, Selector } from "@/components/ui";
import { Segmentado } from "@/components/Segmentado";
import { BotonEnviar } from "@/components/BotonEnviar";

type Disponibilidad = {
  hora: string;
  capacidad: number | null;
  ocupado: number;
  lugaresLibres: number | null;
};

type Props = {
  /** nombre del local en la URL — viaja al servidor al confirmar la reserva */
  slug: string;
  horariosPorTurno: Record<string, string[]>;
  hoy: string;
  /** hora "HH:MM" del reloj de Asunción al cargar la página */
  horaActual: string;
  /** días de la semana (0 = domingo) en los que el local no abre */
  diasCerrados: number[];
  nombresDia: string[];
};

/** Cada bloque del formulario: blanco, esquinas amplias y sombra suave (el título va aparte, grande). */
const BLOQUE = "flex flex-col gap-4 rounded-2xl bg-superficie p-4 shadow-sm ring-1 ring-linea";
const TITULO = "text-[1.15rem] font-semibold tracking-titular text-tinta";

/** Día de la semana (0 = domingo) de una fecha "YYYY-MM-DD". */
function diaSemanaDe(clave: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clave);
  if (!match) return null;
  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  ).getUTCDay();
}

export function ReservaForm({
  slug,
  horariosPorTurno,
  hoy,
  horaActual,
  diasCerrados,
  nombresDia,
}: Props) {
  const router = useRouter();

  const [fecha, setFecha] = useState("");
  // Se guarda como texto, no como número: si fuera número, borrar el campo
  // en el celular lo devolvería a 1 al instante y no se podría escribir otra
  // cantidad. El número real se deriva abajo.
  const [personasTexto, setPersonasTexto] = useState("2");
  const [turno, setTurno] = useState<string | null>(null);
  const [horario, setHorario] = useState("");
  const [motivo, setMotivo] = useState<string>(MOTIVOS_RESERVA[0].value);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [correo, setCorreo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disponibilidad, setDisponibilidad] = useState<Disponibilidad[] | null>(null);
  const [cargandoCupos, setCargandoCupos] = useState(false);
  // Qué campo disparó el último error, para resaltarlo.
  const [campoInvalido, setCampoInvalido] = useState<"fecha" | "turno" | "horario" | null>(null);
  const [intento, setIntento] = useState(0);

  function fallar(mensaje: string, campo?: "fecha" | "turno" | "horario") {
    setError(mensaje);
    setCampoInvalido(campo ?? null);
    setIntento((n) => n + 1);
  }

  // Cantidad real de personas: el campo vacío cuenta como 1 para los
  // cálculos, pero en pantalla se lo deja vacío mientras el cliente escribe.
  const personas = Math.max(1, parseInt(personasTexto, 10) || 1);

  function cambiarPersonas(nuevo: number) {
    setPersonasTexto(String(Math.max(1, nuevo)));
  }

  // Día de la semana de la fecha elegida, para avisar si cae en un día
  // en que el local no abre.
  const diaDeLaFecha = fecha ? diaSemanaDe(fecha) : null;
  const diaElegidoCerrado = diaDeLaFecha != null && diasCerrados.includes(diaDeLaFecha);

  // Reservar para hoy solo tiene sentido a futuro: un horario que ya pasó
  // no se puede elegir. Para otros días, todos los horarios están libres.
  const esHoy = fecha === hoy;
  function horarioYaPaso(hora: string): boolean {
    return esHoy && hora <= horaActual;
  }

  // Los cupos dependen de la fecha, así que se consultan cada vez que
  // cambia. Sin fecha (o en un día cerrado) no hay nada que consultar.
  useEffect(() => {
    if (!fecha || diaElegidoCerrado) {
      setDisponibilidad(null);
      return;
    }

    let cancelado = false;
    setCargandoCupos(true);

    fetch(`/api/reservas/disponibilidad?local=${slug}&fecha=${fecha}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((datos: { disponibilidad: Disponibilidad[] } | null) => {
        if (cancelado) return;
        setDisponibilidad(datos?.disponibilidad ?? null);
      })
      .catch(() => {
        // Si no se pudo consultar, no se bloquea nada: el servidor vuelve a
        // verificar el cupo al confirmar la reserva.
        if (!cancelado) setDisponibilidad(null);
      })
      .finally(() => {
        if (!cancelado) setCargandoCupos(false);
      });

    return () => {
      cancelado = true;
    };
  }, [fecha, diaElegidoCerrado, slug]);

  function cupoDe(hora: string): Disponibilidad | null {
    return disponibilidad?.find((d) => d.hora === hora) ?? null;
  }

  /** true si en ese horario no entra la cantidad de personas pedida. */
  function sinLugar(hora: string): boolean {
    const cupo = cupoDe(hora);
    if (!cupo || cupo.lugaresLibres == null) return false;
    return cupo.lugaresLibres < personas;
  }

  function elegirTurno(t: string) {
    setTurno(t);
    setHorario("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCampoInvalido(null);

    if (!fecha) {
      fallar("Elegí una fecha para la reserva.", "fecha");
      return;
    }
    if (diaElegidoCerrado) {
      fallar("Ese día el local está cerrado. Elegí otra fecha.", "fecha");
      return;
    }
    if (!turno) {
      fallar("Elegí un turno (día, tarde o noche).", "turno");
      return;
    }
    if (!horario) {
      fallar("Elegí un horario.", "horario");
      return;
    }
    if (horarioYaPaso(horario)) {
      fallar("Ese horario ya pasó. Elegí uno más tarde u otra fecha.", "horario");
      return;
    }
    if (sinLugar(horario)) {
      const cupo = cupoDe(horario);
      fallar(
        cupo?.lugaresLibres === 0
          ? "Ese horario ya está completo. Elegí otro horario u otra fecha."
          : `En ese horario quedan ${cupo?.lugaresLibres} lugares y estás pidiendo para ${personas}.`,
        "horario"
      );
      return;
    }
    // Si quedó el campo vacío (se puede enviar sin que dispare el blur en el
    // celular), se toma la cantidad derivada y se refleja en pantalla.
    if (personasTexto !== String(personas)) setPersonasTexto(String(personas));
    if (!nombre.trim() || !telefono.trim()) {
      fallar("Faltan tus datos de contacto.");
      return;
    }

    setEnviando(true);
    try {
      const resultado = await crearReserva({
        slug,
        fecha,
        turno,
        horario,
        personas,
        motivo,
        clienteNombre: nombre,
        clienteTelefono: telefono,
        clienteEmail: correo.trim() || undefined,
      });
      if (!resultado.ok) {
        fallar(resultado.error);
        setEnviando(false);
        return;
      }
      router.push(`/${slug}/reserva/${resultado.reservationId}`);
    } catch (err) {
      fallar(err instanceof Error ? err.message : "No se pudo generar la reserva.");
      setEnviando(false);
    }
  }

  const horariosDelTurno = turno ? horariosPorTurno[turno] ?? [] : [];

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <fieldset disabled={enviando} className="flex flex-col gap-5">
        <section className={BLOQUE}>
          <h2 className={TITULO}>¿Cuándo?</h2>

          <Campo etiqueta="Fecha">
            <Entrada
              type="date"
              required
              min={hoy}
              value={fecha}
              invalido={campoInvalido === "fecha"}
              key={campoInvalido === "fecha" ? `sac-${intento}` : "fecha"}
              className={`!h-12 !rounded-xl ${campoInvalido === "fecha" ? "animate-[sacudir_0.32s_ease]" : ""}`}
              onChange={(e) => {
                setFecha(e.target.value);
                // Cambiar de fecha puede dejar inválido el horario ya elegido
                // (ej: pasar a hoy y que ese horario ya haya pasado).
                setHorario("");
              }}
            />
            {diaElegidoCerrado && diaDeLaFecha != null && (
              <p className="mt-1.5 text-[0.82rem] font-medium text-peligro">
                Los {nombresDia[diaDeLaFecha].toLowerCase()} el local está cerrado — elegí otra
                fecha.
              </p>
            )}
          </Campo>

          <Campo etiqueta="Cantidad de personas">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => cambiarPersonas(personas - 1)}
                disabled={personas <= 1}
                aria-label="Menos personas"
                className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-papel-hundido text-2xl font-semibold text-tinta transition-all hover:bg-brand-light active:scale-90 disabled:opacity-40"
              >
                −
              </button>

              {/* Se guarda como texto para que en el celular se pueda borrar y
                  escribir de nuevo; recién al salir del campo se normaliza. */}
              <Entrada
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                required
                value={personasTexto}
                onChange={(e) => {
                  const soloDigitos = e.target.value.replace(/[^\d]/g, "");
                  setPersonasTexto(soloDigitos.slice(0, 3));
                }}
                onBlur={() => {
                  if (!personasTexto || Number(personasTexto) < 1) setPersonasTexto("1");
                }}
                onFocus={(e) => e.target.select()}
                aria-label="Cantidad de personas"
                className="!h-12 !rounded-xl text-center !text-xl font-bold"
              />

              <button
                type="button"
                onClick={() => cambiarPersonas(personas + 1)}
                aria-label="Más personas"
                className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-brand text-2xl font-semibold text-white shadow-sm transition-all hover:bg-brand-dark active:scale-90"
              >
                +
              </button>
            </div>
          </Campo>
        </section>

        <section className={BLOQUE}>
          <h2 className={TITULO}>Turno y horario</h2>
          <div
            key={campoInvalido === "turno" ? `sac-${intento}` : "turno"}
            className={campoInvalido === "turno" ? "animate-[sacudir_0.32s_ease]" : ""}
          >
            <Segmentado
              opciones={TURNOS.map((t) => ({ value: t.value, label: t.label }))}
              valor={turno ?? ""}
              onChange={elegirTurno}
              uniforme
            />
          </div>

          {turno && (
            <div className="animate-[subir_0.4s_cubic-bezier(0.22,0.7,0.3,1)]">
              {horariosDelTurno.length === 0 ? (
                <p className="text-[0.88rem] text-tinta-suave">
                  Todavía no hay horarios cargados para este turno. Probá con otro turno.
                </p>
              ) : (
                <>
                  <div
                    key={campoInvalido === "horario" ? `sac-${intento}` : "horarios"}
                    className={`grid grid-cols-3 gap-2.5 sm:grid-cols-4 ${
                      campoInvalido === "horario" ? "animate-[sacudir_0.32s_ease]" : ""
                    }`}
                  >
                    {horariosDelTurno.map((h) => {
                      const paso = horarioYaPaso(h);
                      const completo = sinLugar(h);
                      const bloqueado = paso || completo;
                      const cupo = cupoDe(h);
                      return (
                        <button
                          key={h}
                          type="button"
                          disabled={bloqueado}
                          title={
                            paso
                              ? "Ese horario ya pasó"
                              : completo
                                ? "No quedan lugares para esa cantidad de personas"
                                : undefined
                          }
                          onClick={() => setHorario(h)}
                          className={`cifra flex min-h-[3rem] flex-col items-center justify-center rounded-xl px-1 text-[0.95rem] font-semibold leading-tight transition-all duration-150 ${
                            bloqueado
                              ? `cursor-not-allowed bg-papel-hundido/60 text-tinta-suave/60 ${paso ? "line-through" : ""}`
                              : horario === h
                                ? "bg-brand text-white shadow-media"
                                : "bg-superficie text-tinta ring-1 ring-linea hover:ring-brand/60 active:scale-95"
                          }`}
                        >
                          {h}
                          {/* Solo se avisa cuando queda poco: mostrar "quedan 40"
                              en un salón vacío es ruido, no información. */}
                          {!paso &&
                            cupo?.lugaresLibres != null &&
                            cupo.lugaresLibres <= 10 && (
                              <span
                                className={`text-[0.66rem] font-medium ${
                                  bloqueado
                                    ? "text-tinta-suave/60"
                                    : horario === h
                                      ? "text-white/85"
                                      : "text-aviso"
                                }`}
                              >
                                {cupo.lugaresLibres === 0
                                  ? "completo"
                                  : `quedan ${cupo.lugaresLibres}`}
                              </span>
                            )}
                        </button>
                      );
                    })}
                  </div>

                  {cargandoCupos && (
                    <p className="mt-2.5 text-[0.78rem] text-tinta-suave">
                      Consultando disponibilidad...
                    </p>
                  )}

                  {esHoy && horariosDelTurno.every(horarioYaPaso) && (
                    <p className="mt-2.5 text-[0.88rem] text-aviso">
                      Todos los horarios de este turno ya pasaron por hoy. Elegí otro turno u
                      otra fecha.
                    </p>
                  )}

                  {!cargandoCupos &&
                    horariosDelTurno.length > 0 &&
                    horariosDelTurno.every((h) => horarioYaPaso(h) || sinLugar(h)) &&
                    !horariosDelTurno.every(horarioYaPaso) && (
                      <p className="mt-2.5 text-[0.88rem] text-aviso">
                        No quedan lugares en este turno para {personas}{" "}
                        {personas === 1 ? "persona" : "personas"}. Probá otro turno, otra fecha,
                        o consultanos por WhatsApp.
                      </p>
                    )}
                </>
              )}
            </div>
          )}
        </section>

        <section className={BLOQUE}>
          <h2 className={TITULO}>Tus datos</h2>

          <Campo etiqueta="Motivo">
            <Selector value={motivo} onChange={(e) => setMotivo(e.target.value)} className="!h-12 !rounded-xl">
              {MOTIVOS_RESERVA.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Selector>
          </Campo>

          <Campo etiqueta="Nombre">
            <Entrada
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Tu nombre"
              className="!h-12 !rounded-xl"
            />
          </Campo>

          <Campo etiqueta="Teléfono (WhatsApp)">
            <Entrada
              required
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="0981 234 567"
              className="!h-12 !rounded-xl"
            />
          </Campo>

          <Campo etiqueta="Correo" ayuda="Opcional">
            <Entrada
              type="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder="nombre@correo.com"
              className="!h-12 !rounded-xl"
            />
          </Campo>
        </section>
      </fieldset>

      {/* Abajo, siempre a la vista: el aviso de lo que falte y el botón para reservar, sobre una base sólida con un difuminado arriba. */}
      <div className="pointer-events-none fixed bottom-0 left-1/2 z-20 w-full max-w-2xl -translate-x-1/2">
        <div aria-hidden="true" className="h-8 bg-gradient-to-t from-papel-suave to-transparent" />
        <div className="pointer-events-auto bg-papel-suave px-4 pb-4">
          {error && (
            <div role="alert" className="mb-2.5 rounded-xl bg-peligro-luz px-3.5 py-2.5 text-[0.86rem] font-medium text-peligro">
              {error}
            </div>
          )}
          <BotonEnviar
            enviando={enviando}
            disabled={diaElegidoCerrado}
            enviandoTexto="Generando reserva..."
            className="w-full !h-14 !rounded-2xl shadow-alta"
          >
            Reservar
          </BotonEnviar>
        </div>
      </div>
    </form>
  );
}
