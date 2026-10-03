"use client";

import { useState, useTransition } from "react";
import { renombrarArea, alternarActivaArea } from "./actions";
import { Entrada, Pastilla, clasesBoton } from "@/components/ui";

export function AreaFila({
  id,
  nombre,
  activa,
  cantidadProductos,
}: {
  id: string;
  nombre: string;
  activa: boolean;
  cantidadProductos: number;
}) {
  const [pending, startTransition] = useTransition();
  const [editando, setEditando] = useState(false);
  const [nombreEditado, setNombreEditado] = useState(nombre);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  function guardarNombre() {
    setError(null);
    startTransition(async () => {
      const resultado = await renombrarArea(id, nombreEditado);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setEditando(false);
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2000);
    });
  }

  return (
    // Una área desactivada se resalta en amarillo (en vez de apagarse): no se puede elegir en Estaciones, y si se
    // pasa de largo se pierde un buen rato buscando por qué no aparece.
    <div
      className={`rounded-lg border-2 px-4 py-3 ${
        activa ? "border-azul/50 bg-white" : "border-aviso/50 bg-aviso-luz/40"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {editando ? (
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <Entrada
              autoFocus
              value={nombreEditado}
              onChange={(e) => setNombreEditado(e.target.value)}
              className="min-w-[10rem] flex-1"
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
              className={clasesBoton("peligro", "sm")}
            >
              Cancelar
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-tinta">{nombre}</span>
            {activa ? (
              <Pastilla color="exito" punto>
                Activa
              </Pastilla>
            ) : (
              <Pastilla color="aviso" punto>
                Desactivada
              </Pastilla>
            )}
            {guardado && <span className="text-xs font-medium text-exito">✓ Guardado</span>}
          </div>
        )}

        {!editando && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-tinta-media">{cantidadProductos} producto(s)</span>
            <button type="button" onClick={() => setEditando(true)} className={clasesBoton("navegar", "sm")}>
              Renombrar
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => alternarActivaArea(id, !activa))}
              className={clasesBoton(activa ? "peligro" : "nuevo", "sm")}
            >
              {activa ? "Desactivar" : "Reactivar"}
            </button>
          </div>
        )}
      </div>
      {!activa && !editando && (
        <p className="mt-2 text-[0.78rem] text-aviso">
          Desactivada: no se puede elegir en Estaciones (ni como área del ticket ni para asignarle una impresora).
          Tocá &ldquo;Reactivar&rdquo; para volver a usarla.
        </p>
      )}
      {error && <p className="mt-1 text-xs text-peligro">{error}</p>}
    </div>
  );
}
