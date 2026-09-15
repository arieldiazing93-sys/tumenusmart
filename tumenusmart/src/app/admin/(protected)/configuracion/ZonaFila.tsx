"use client";

import { useState, useTransition } from "react";
import { formatearGuarani } from "@/lib/format";
import { clasesBoton } from "@/components/ui";
import { eliminarZona, alternarActivaZona, actualizarZona } from "./actions";

/** Mismo patrón de "editar inline" que ya usa CategoriaFila.tsx — un click
 * abre los campos en el lugar, sin ir a otra pantalla ni perder de vista el
 * resto de la lista. Acá se editan los tres datos de la zona juntos: nombre,
 * radio y precio, porque son los mismos tres que pide el alta. */
export function ZonaFila({
  id,
  nombre,
  radioKm,
  costoEnvio,
  activo,
}: {
  id: string;
  nombre: string;
  radioKm: number;
  costoEnvio: number;
  activo: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [editando, setEditando] = useState(false);
  const [nombreEditado, setNombreEditado] = useState(nombre);
  const [radioEditado, setRadioEditado] = useState(String(radioKm));
  const [costoEditado, setCostoEditado] = useState(String(costoEnvio));
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  function cancelar() {
    setNombreEditado(nombre);
    setRadioEditado(String(radioKm));
    setCostoEditado(String(costoEnvio));
    setEditando(false);
    setError(null);
  }

  function guardar() {
    setError(null);
    startTransition(async () => {
      const datos = new FormData();
      datos.set("nombre", nombreEditado);
      datos.set("radioKm", radioEditado);
      datos.set("costoEnvio", costoEditado);
      const resultado = await actualizarZona(id, datos);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setEditando(false);
      setGuardado(true);
      setTimeout(() => setGuardado(false), 3000);
    });
  }

  function borrar() {
    if (!confirm("¿Borrar esta zona? No se puede deshacer.")) return;
    startTransition(async () => {
      // alert() y no un texto en pantalla: el mensaje explica por qué no se
      // pudo borrar y qué hacer en su lugar, y es demasiado largo para un
      // texto chico al lado del botón.
      const resultado = await eliminarZona(id);
      if (!resultado.ok) alert(resultado.error);
    });
  }

  if (editando) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-brand/40 bg-brand-light/40 px-4 py-3">
        <div className="flex flex-wrap gap-2">
          <input
            autoFocus
            value={nombreEditado}
            onChange={(e) => setNombreEditado(e.target.value)}
            placeholder="Nombre"
            className="min-w-[140px] flex-1 rounded-lg border border-linea px-2 py-1.5 text-sm"
          />
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.1"
              min="0.1"
              value={radioEditado}
              onChange={(e) => setRadioEditado(e.target.value)}
              onWheel={(e) => e.currentTarget.blur()}
              placeholder="Radio (km)"
              className="w-24 rounded-lg border border-linea px-2 py-1.5 text-sm"
            />
            <span className="text-xs text-tinta-suave">km</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-tinta-suave">Gs.</span>
            <input
              type="number"
              step="1"
              min="0"
              value={costoEditado}
              onChange={(e) => setCostoEditado(e.target.value)}
              onWheel={(e) => e.currentTarget.blur()}
              placeholder="Costo (Gs.)"
              className="w-28 rounded-lg border border-linea px-2 py-1.5 text-sm"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={guardar}
            className={clasesBoton("principal", "sm")}
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={cancelar}
            className="text-sm text-tinta-media hover:underline"
          >
            Cancelar
          </button>
        </div>
        {error && <p className="text-xs text-peligro">{error}</p>}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border border-linea bg-white px-4 py-2 sm:flex-row sm:items-center sm:justify-between ${
        activo ? "" : "opacity-60"
      }`}
    >
      <span>
        {nombre} <span className="text-tinta-suave">— hasta {radioKm} km</span>
        {!activo && (
          <span className="ml-2 text-xs font-normal text-tinta-suave">(inactiva)</span>
        )}
      </span>

      <div className="flex items-center gap-4">
        {guardado && <span className="text-xs font-medium text-exito">✓ Guardado</span>}
        <span className="text-sm text-tinta-media">{formatearGuarani(costoEnvio)}</span>
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="text-sm text-tinta-media hover:underline"
        >
          Editar
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => alternarActivaZona(id, !activo))}
          className="text-sm text-tinta-media hover:underline disabled:opacity-50"
        >
          {activo ? "Desactivar" : "Activar"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={borrar}
          className="text-sm text-peligro hover:underline disabled:opacity-50"
        >
          Borrar
        </button>
      </div>
    </div>
  );
}
