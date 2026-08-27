"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { actualizarCapacidadHorario } from "../actions";

/**
 * Cupo de personas de un horario. Se guarda al salir del campo (blur), sin
 * botón aparte: son muchos horarios en pantalla y un botón por cada uno
 * sería ruido. Vacío = sin límite.
 */
export function CapacidadField({
  id,
  capacidad,
}: {
  id: string;
  capacidad: number | null;
}) {
  const router = useRouter();
  const [valor, setValor] = useState(capacidad != null ? String(capacidad) : "");
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState(false);

  async function guardar() {
    const numero = valor.trim() ? parseInt(valor.trim(), 10) : null;
    // Nada que hacer si no cambió respecto a lo que ya estaba guardado.
    if ((numero ?? null) === (capacidad ?? null)) return;

    setError(false);
    try {
      await actualizarCapacidadHorario(id, Number.isNaN(numero as number) ? null : numero);
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2000);
      router.refresh();
    } catch {
      setError(true);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        type="number"
        min={1}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onBlur={guardar}
        placeholder="Sin límite"
        aria-label="Cupo de personas"
        className={`w-24 rounded-lg border px-2 py-1 text-sm ${
          error ? "border-peligro" : "border-linea"
        }`}
      />
      {guardado && <span className="text-xs text-exito">✓</span>}
      {error && <span className="text-xs text-peligro">error</span>}
    </span>
  );
}
