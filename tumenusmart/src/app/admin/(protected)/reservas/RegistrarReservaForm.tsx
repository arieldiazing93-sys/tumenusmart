"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearReservaManual, type ResultadoReservaManual } from "./actions";
import { TURNOS, MOTIVOS_RESERVA } from "@/lib/reservas";
import { Campo, Entrada, Selector, Area, clasesBoton } from "@/components/ui";
import { Segmentado } from "@/components/Segmentado";

export function RegistrarReservaForm({ diaSugerido }: { diaSugerido: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [resultado, setResultado] = useState<ResultadoReservaManual | null>(null);
  const [turno, setTurno] = useState<string>(TURNOS[0].value);
  const formRef = useRef<HTMLFormElement>(null);

  function enviar(datos: FormData) {
    datos.set("turno", turno);
    setResultado(null);
    iniciar(async () => {
      const r = await crearReservaManual(datos);
      setResultado(r);
      if (r.ok) {
        formRef.current?.reset();
        setTurno(TURNOS[0].value);
        router.refresh();
      }
    });
  }

  return (
    <form ref={formRef} action={enviar} className="flex flex-col gap-4">
      {resultado && !resultado.ok && (
        <p className="rounded-lg bg-peligro-luz px-3 py-2 text-sm text-peligro">
          {resultado.error}
        </p>
      )}
      {resultado?.ok && (
        <p className="rounded-lg bg-exito-luz px-3 py-2 text-sm text-exito">
          Reserva cargada. Ya aparece en el calendario.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Fecha">
          <Entrada type="date" name="fecha" required defaultValue={diaSugerido} />
        </Campo>
        <Campo etiqueta="Cantidad de personas">
          <Entrada type="number" name="personas" min={1} max={999} required defaultValue={2} />
        </Campo>
      </div>

      <Campo etiqueta="Turno">
        <Segmentado
          opciones={TURNOS.map((t) => ({ value: t.value, label: t.label }))}
          valor={turno}
          onChange={setTurno}
        />
      </Campo>

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Horario">
          <Entrada type="time" name="horario" required />
        </Campo>
        <Campo etiqueta="Motivo">
          <Selector name="motivo" defaultValue={MOTIVOS_RESERVA[0].value}>
            {MOTIVOS_RESERVA.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Selector>
        </Campo>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Nombre del cliente">
          <Entrada name="clienteNombre" required placeholder="Nombre y apellido" />
        </Campo>
        <Campo etiqueta="Teléfono">
          <Entrada name="clienteTelefono" required placeholder="0981 234 567" />
        </Campo>
      </div>

      <Campo etiqueta="Correo" ayuda="Opcional">
        <Entrada type="email" name="clienteEmail" placeholder="nombre@correo.com" />
      </Campo>

      <Campo
        etiqueta="Nota interna"
        ayuda="Opcional — para dejar registro de cómo se hizo (llamada, mostrador, etc.). No la ve el cliente."
      >
        <Area name="nota" rows={2} placeholder="Ej: reservó por teléfono a las 18:40" />
      </Campo>

      <div>
        <button type="submit" disabled={pendiente} className={clasesBoton("principal")}>
          {pendiente ? "Guardando..." : "Registrar reserva"}
        </button>
      </div>
    </form>
  );
}
