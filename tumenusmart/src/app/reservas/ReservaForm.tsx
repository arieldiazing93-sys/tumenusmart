"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { crearReserva } from "./actions";
import { TURNOS, MOTIVOS_RESERVA } from "@/lib/reservas";

type Disponibilidad = {
  hora: string;
  capacidad: number | null;
  ocupado: number;
  lugaresLibres: number | null;
};

type Props = {
  horariosPorTurno: Record<string, string[]>;
  hoy: string;
  /** hora "HH:MM" del reloj de Asunción al cargar la página */
  horaActual: string;
  /** días de la semana (0 = domingo) en los que el local no abre */
  diasCerrados: number[];
  nombresDia: string[];
};

/** Día de la semana (0 = domingo) de una fecha "YYYY-MM-DD". */
function diaSemanaDe(clave: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clave);
  if (!match) return null;
  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  ).getUTCDay();
}

export function ReservaForm({
  horariosPorTurno,
  hoy,
  horaActual,
  diasCerrados,
  nombresDia,
}: Props) {
  const router = useRouter();

  const [fecha, setFecha] = useState("");
  const [personas, setPersonas] = useState(2);
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

    fetch(`/api/reservas/disponibilidad?fecha=${fecha}`)
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
  }, [fecha, diaElegidoCerrado]);

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

    if (!fecha) {
      setError("Elegí una fecha para la reserva.");
      return;
    }
    if (diaElegidoCerrado) {
      setError(`Ese día el local está cerrado. Elegí otra fecha.`);
      return;
    }
    if (!turno) {
      setError("Elegí un turno (día, tarde o noche).");
      return;
    }
    if (!horario) {
      setError("Elegí un horario.");
      return;
    }
    if (horarioYaPaso(horario)) {
      setError("Ese horario ya pasó. Elegí uno más tarde u otra fecha.");
      return;
    }
    if (sinLugar(horario)) {
      const cupo = cupoDe(horario);
      setError(
        cupo?.lugaresLibres === 0
          ? "Ese horario ya está completo. Elegí otro horario u otra fecha."
          : `En ese horario quedan ${cupo?.lugaresLibres} lugares y estás pidiendo para ${personas}.`
      );
      return;
    }
    if (!personas || personas < 1) {
      setError("La cantidad de personas no es válida.");
      return;
    }
    if (!nombre.trim() || !telefono.trim()) {
      setError("Faltan tus datos de contacto.");
      return;
    }

    setEnviando(true);
    try {
      const { reservationId } = await crearReserva({
        fecha,
        turno,
        horario,
        personas,
        motivo,
        clienteNombre: nombre,
        clienteTelefono: telefono,
        clienteEmail: correo.trim() || undefined,
      });
      router.push(`/reserva/${reservationId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar la reserva.");
      setEnviando(false);
    }
  }

  const horariosDelTurno = turno ? horariosPorTurno[turno] ?? [] : [];

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">Fecha</label>
        <input
          type="date"
          required
          min={hoy}
          value={fecha}
          onChange={(e) => {
            setFecha(e.target.value);
            // Cambiar de fecha puede dejar inválido el horario ya elegido
            // (ej: pasar a hoy y que ese horario ya haya pasado).
            setHorario("");
          }}
          className={`w-full rounded-lg border px-3 py-2 ${
            diaElegidoCerrado ? "border-red-400 bg-red-50" : "border-neutral-300"
          }`}
        />
        {diaElegidoCerrado && diaDeLaFecha != null && (
          <p className="mt-1 text-sm text-red-600">
            Los {nombresDia[diaDeLaFecha].toLowerCase()} el local está cerrado — elegí otra
            fecha.
          </p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">
          Cantidad de personas
        </label>
        <input
          type="number"
          min={1}
          required
          value={personas}
          onChange={(e) => setPersonas(parseInt(e.target.value, 10) || 1)}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">Turno</label>
        <div className="flex gap-3">
          {TURNOS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => elegirTurno(t.value)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                turno === t.value
                  ? "border-brand bg-brand-light text-brand-dark"
                  : "border-neutral-300 text-neutral-600"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {turno && (
          <div className="mt-3">
            {horariosDelTurno.length === 0 ? (
              <p className="text-sm text-neutral-500">
                Todavía no hay horarios cargados para este turno. Probá con otro turno.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
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
                        className={`rounded-full border px-3 py-1.5 text-sm ${
                          bloqueado
                            ? `cursor-not-allowed border-neutral-200 text-neutral-300 ${
                                paso ? "line-through" : ""
                              }`
                            : horario === h
                              ? "border-brand bg-brand text-white"
                              : "border-neutral-300 text-neutral-600"
                        }`}
                      >
                        {h}
                        {/* Solo se avisa cuando queda poco: mostrar "quedan 40"
                            en un salón vacío es ruido, no información. */}
                        {!paso &&
                          cupo?.lugaresLibres != null &&
                          cupo.lugaresLibres <= 10 && (
                            <span
                              className={`ml-1.5 text-[11px] ${
                                bloqueado
                                  ? "text-neutral-300"
                                  : horario === h
                                    ? "text-white/80"
                                    : "text-amber-600"
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
                  <p className="mt-2 text-xs text-neutral-400">Consultando disponibilidad...</p>
                )}

                {esHoy && horariosDelTurno.every(horarioYaPaso) && (
                  <p className="mt-2 text-sm text-amber-700">
                    Todos los horarios de este turno ya pasaron por hoy. Elegí otro turno u
                    otra fecha.
                  </p>
                )}

                {!cargandoCupos &&
                  horariosDelTurno.length > 0 &&
                  horariosDelTurno.every((h) => horarioYaPaso(h) || sinLugar(h)) &&
                  !horariosDelTurno.every(horarioYaPaso) && (
                    <p className="mt-2 text-sm text-amber-700">
                      No quedan lugares en este turno para {personas}{" "}
                      {personas === 1 ? "persona" : "personas"}. Probá otro turno, otra fecha,
                      o consultanos por WhatsApp.
                    </p>
                  )}
              </>
            )}
          </div>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">Motivo</label>
        <select
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2"
        >
          {MOTIVOS_RESERVA.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">Nombre</label>
        <input
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2"
          placeholder="Tu nombre"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">
          Teléfono (WhatsApp)
        </label>
        <input
          required
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2"
          placeholder="0981 234 567"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">
          Correo <span className="font-normal text-neutral-400">(opcional)</span>
        </label>
        <input
          type="email"
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2"
          placeholder="nombre@correo.com"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={enviando || diaElegidoCerrado}
        className="rounded-lg bg-brand px-6 py-3 font-medium text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-neutral-300"
      >
        {enviando ? "Generando reserva..." : "Reservar"}
      </button>
    </form>
  );
}
