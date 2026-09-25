"use client";

import { useEffect, useState } from "react";
import { Boton } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";

type Agregado = { id: string; nombre: string; precioExtra: number };

/**
 * Elegir los agregados de un producto antes de agregarlo a la cuenta.
 *
 * Solo agregados (variantes e ingredientes-a-sacar siguen siendo del menú
 * online, no del mostrador) — es lo que de verdad hace perder tiempo al
 * cajero si no está a mano: "con queso extra", "sin límite de aderezo", etc.
 *
 * Hoja desde abajo en el celular, cuadro centrado en pantallas más anchas.
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

  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [onCerrar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-tinta/45 sm:items-center sm:p-4"
      onClick={onCerrar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={nombre}
        className="flex max-h-[88vh] w-full flex-col rounded-t-xl bg-white shadow-alta animate-[subirHoja_0.28s_cubic-bezier(0.22,0.7,0.3,1)] sm:max-w-sm sm:animate-[subir_0.22s_ease-out] sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-none px-5 pt-5">
          <span className="mx-auto mb-3 block h-1 w-10 flex-none rounded-full bg-linea sm:hidden" />
          <div className="flex items-start justify-between gap-3 border-b border-linea pb-3">
            <h3 className="text-[1.05rem] font-semibold tracking-titular text-tinta">{nombre}</h3>
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar"
              className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-tinta-suave transition-colors hover:bg-papel-suave hover:text-tinta"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5">
          <p className="mb-1 mt-3 text-[0.75rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
            Agregados
          </p>
          <p className="mb-1 text-[0.76rem] text-tinta-suave">Opcional. Se suman al precio.</p>
          {agregados.map((a) => (
            <label
              key={a.id}
              className="flex cursor-pointer items-center gap-2.5 border-b border-linea-fina py-3 text-[0.9rem] last:border-0"
            >
              <input
                type="checkbox"
                checked={seleccionados.includes(a.id)}
                onChange={() => toggle(a.id)}
                className="h-[18px] w-[18px] flex-none accent-brand"
              />
              <span className="text-tinta">{a.nombre}</span>
              {a.precioExtra > 0 && (
                <span className="cifra ml-auto flex-none text-[0.82rem] text-tinta-media">
                  + {formatearGuarani(a.precioExtra)}
                </span>
              )}
            </label>
          ))}
        </div>

        <div
          className="flex-none border-t border-linea px-5 pb-5 pt-3.5"
          style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="flex items-center gap-3">
            <div className="flex flex-none items-center rounded-lg border border-linea">
              <button
                type="button"
                onClick={() => setCantidad((c) => Math.max(1, c - 1))}
                aria-label="Restar cantidad"
                className="flex h-10 w-10 items-center justify-center text-lg text-tinta-media transition-colors hover:text-brand"
              >
                −
              </button>
              <span className="cifra min-w-[24px] text-center text-[0.92rem] font-semibold text-tinta">
                {cantidad}
              </span>
              <button
                type="button"
                onClick={() => setCantidad((c) => c + 1)}
                aria-label="Sumar cantidad"
                className="flex h-10 w-10 items-center justify-center text-lg text-tinta-media transition-colors hover:text-brand"
              >
                +
              </button>
            </div>

            <div className="flex-1">
              <Boton onClick={() => onAgregar(seleccionados, cantidad)} tam="lg" className="w-full">
                <span>Agregar</span>
                <span className="cifra ml-auto">{formatearGuarani(unitario * cantidad)}</span>
              </Boton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
