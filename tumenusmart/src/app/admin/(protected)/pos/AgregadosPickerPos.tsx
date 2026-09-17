"use client";

import { useState } from "react";
import { Boton } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";

type Agregado = { id: string; nombre: string; precioExtra: number };

/**
 * Elegir los agregados de un producto antes de agregarlo a la cuenta.
 *
 * Solo agregados (variantes e ingredientes-a-sacar siguen siendo del menú
 * online, no del mostrador) — es lo que de verdad hace perder tiempo al
 * cajero si no está a mano: "con queso extra", "sin límite de aderezo", etc.
 */
export function AgregadosPickerPos({
  nombre,
  precioBase,
  agregados,
  onCerrar,
  onAgregar,
}: {
  nombre: string;
  precioBase: number;
  agregados: Agregado[];
  onCerrar: () => void;
  onAgregar: (agregadoIds: string[], cantidad: number) => void;
}) {
  const [seleccionados, setSeleccionados] = useState<string[]>([]);
  const [cantidad, setCantidad] = useState(1);

  const elegidos = agregados.filter((a) => seleccionados.includes(a.id));
  const unitario = precioBase + elegidos.reduce((s, a) => s + a.precioExtra, 0);

  function toggle(id: string) {
    setSeleccionados((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4"
      onClick={onCerrar}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[1rem] font-semibold tracking-titular text-tinta">{nombre}</h3>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-tinta-suave hover:bg-papel-suave"
          >
            ✕
          </button>
        </div>

        <div className="mt-3 max-h-[50vh] overflow-y-auto">
          <p className="mb-1 text-[0.75rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
            Agregados
          </p>
          {agregados.map((a) => (
            <label
              key={a.id}
              className="flex items-center gap-2.5 border-b border-linea-fina py-2.5 text-[0.88rem]"
            >
              <input
                type="checkbox"
                checked={seleccionados.includes(a.id)}
                onChange={() => toggle(a.id)}
                className="h-[17px] w-[17px] flex-none accent-brand"
              />
              {a.nombre}
              {a.precioExtra > 0 && (
                <span className="cifra ml-auto text-[0.8rem] text-tinta-media">
                  + {formatearGuarani(a.precioExtra)}
                </span>
              )}
            </label>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex flex-none items-center rounded-lg border border-linea">
            <button
              type="button"
              onClick={() => setCantidad((c) => Math.max(1, c - 1))}
              aria-label="Restar cantidad"
              className="h-9 w-9 text-lg text-tinta"
            >
              −
            </button>
            <span className="min-w-[22px] text-center text-[0.9rem] font-semibold">{cantidad}</span>
            <button
              type="button"
              onClick={() => setCantidad((c) => c + 1)}
              aria-label="Sumar cantidad"
              className="h-9 w-9 text-lg text-tinta"
            >
              +
            </button>
          </div>

          <Boton
            onClick={() => onAgregar(seleccionados, cantidad)}
            tam="md"
            className="flex flex-1 items-center justify-between"
          >
            <span>Agregar</span>
            <span className="cifra">{formatearGuarani(unitario * cantidad)}</span>
          </Boton>
        </div>
      </div>
    </div>
  );
}
