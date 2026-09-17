"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { renombrarEstacion, alternarActivaEstacion, vincularEstacion, asignarPuntoExpedicion } from "./actions";
import { Boton, clasesBoton } from "@/components/ui";

type PuntoExpedicionOpcion = {
  id: string;
  nombre: string;
  establecimiento: string;
  puntoExpedicion: string;
};

export function EstacionFila({
  id,
  nombre,
  activa,
  cantidadTurnos,
  esEstaComputadora,
  puntoExpedicionId,
  puntosExpedicion,
}: {
  id: string;
  nombre: string;
  activa: boolean;
  cantidadTurnos: number;
  /** Si la cookie de ESTE navegador ya apunta a esta estación. */
  esEstaComputadora: boolean;
  puntoExpedicionId: string | null;
  /** Puntos de expedición activos del local, para elegir a cuál queda atada. */
  puntosExpedicion: PuntoExpedicionOpcion[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editando, setEditando] = useState(false);
  const [nombreEditado, setNombreEditado] = useState(nombre);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [vinculando, setVinculando] = useState(false);
  const [asignando, setAsignando] = useState(false);

  async function cambiarPuntoExpedicion(valor: string) {
    setAsignando(true);
    setError(null);
    const resultado = await asignarPuntoExpedicion(id, valor || null);
    setAsignando(false);
    if (!resultado.ok) setError(resultado.error);
  }

  function guardarNombre() {
    setError(null);
    startTransition(async () => {
      const resultado = await renombrarEstacion(id, nombreEditado);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setEditando(false);
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2000);
    });
  }

  async function vincular() {
    if (
      !confirm(
        `¿Vincular ESTA computadora a "${nombre}"? De ahora en más, cualquier cajero que use este navegador va a operar bajo esta estación.`
      )
    ) {
      return;
    }
    setVinculando(true);
    setError(null);
    const resultado = await vincularEstacion(id);
    setVinculando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    router.refresh();
  }

  return (
    <div
      className={`rounded-lg border bg-white px-4 py-3 ${
        activa ? "border-linea" : "border-linea opacity-60"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {editando ? (
          <div className="flex flex-1 items-center gap-2">
            <input
              autoFocus
              value={nombreEditado}
              onChange={(e) => setNombreEditado(e.target.value)}
              className="flex-1 rounded-lg border border-linea px-2 py-1 text-sm"
            />
            <button
              type="button"
              disabled={pending}
              onClick={guardarNombre}
              className={clasesBoton("principal", "sm")}
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => {
                setNombreEditado(nombre);
                setEditando(false);
                setError(null);
              }}
              className="text-sm text-tinta-media hover:underline"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <span className="font-medium">
            {nombre}
            {!activa && <span className="ml-2 text-xs font-normal text-tinta-suave">(desactivada)</span>}
            {esEstaComputadora && (
              <span className="ml-2 text-xs font-semibold text-exito">✓ Esta computadora</span>
            )}
            {guardado && <span className="ml-2 text-xs font-normal text-exito">✓ Guardado</span>}
          </span>
        )}

        {!editando && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-tinta-media">{cantidadTurnos} turno(s)</span>
            <label className="flex items-center gap-1.5 text-tinta-media">
              Punto de expedición
              <select
                value={puntoExpedicionId ?? ""}
                disabled={asignando}
                onChange={(e) => cambiarPuntoExpedicion(e.target.value)}
                className="rounded-lg border border-linea px-2 py-1 text-sm text-tinta"
              >
                <option value="">Sin asignar — solo tickets</option>
                {puntosExpedicion.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} ({p.establecimiento}-{p.puntoExpedicion})
                  </option>
                ))}
              </select>
            </label>
            {activa && !esEstaComputadora && (
              <Boton tono="navegar" tam="sm" onClick={vincular} disabled={vinculando}>
                {vinculando ? "Vinculando…" : "Vincular esta computadora"}
              </Boton>
            )}
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="text-tinta-media hover:underline"
            >
              Renombrar
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => alternarActivaEstacion(id, !activa))}
              className="text-tinta-media hover:underline disabled:opacity-50"
            >
              {activa ? "Desactivar" : "Reactivar"}
            </button>
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-peligro">{error}</p>}
    </div>
  );
}
