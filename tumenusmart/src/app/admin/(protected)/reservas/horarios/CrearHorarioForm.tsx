"use client";

import { useTransition } from "react";
import { clasesBoton } from "@/components/ui";
import { crearHorario } from "../actions";

export function CrearHorarioForm({ turno, turnoLabel }: { turno: string; turnoLabel: string }) {
  const [pendiente, iniciar] = useTransition();

  function alCrear(formData: FormData) {
    iniciar(async () => {
      const resultado = await crearHorario(formData);
      if (!resultado.ok) alert(resultado.error);
    });
  }

  return (
    <form
      action={alCrear}
      className="flex flex-wrap items-center gap-2 bg-papel-suave/60 px-4 py-3"
    >
      <input type="hidden" name="turno" value={turno} />
      <input
        type="time"
        name="hora"
        required
        aria-label={`Nuevo horario de ${turnoLabel}`}
        className="w-28 rounded-lg border border-linea px-2 py-1.5 text-sm"
      />
      <input
        type="number"
        name="capacidadPersonas"
        min={1}
        placeholder="Cupo (opcional)"
        aria-label="Cupo de personas del nuevo horario"
        className="w-36 rounded-lg border border-linea px-2 py-1.5 text-sm"
      />
      <button type="submit" disabled={pendiente} className={clasesBoton("principal", "sm")}>
        Agregar horario
      </button>
    </form>
  );
}
