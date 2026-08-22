"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearReserva } from "./actions";
import { TURNOS, MOTIVOS_RESERVA } from "@/lib/reservas";

type Props = {
  horariosPorTurno: Record<string, string[]>;
  hoy: string;
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

export function ReservaForm({ horariosPorTurno, hoy, diasCerrados, nombresDia }: Props) {
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

  // Día de la semana de la fecha elegida, para avisar si cae en un día
  // en que el local no abre.
  const diaDeLaFecha = fecha ? diaSemanaDe(fecha) : null;
  const diaElegidoCerrado = diaDeLaFecha != null && diasCerrados.includes(diaDeLaFecha);

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
          onChange={(e) => setFecha(e.target.value)}
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
              <div className="flex flex-wrap gap-2">
                {horariosDelTurno.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHorario(h)}
                    className={`rounded-full border px-3 py-1.5 text-sm ${
                      horario === h
                        ? "border-brand bg-brand text-white"
                        : "border-neutral-300 text-neutral-600"
                    }`}
                  >
                    {h}
                  </button>
                ))}
              </div>
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
