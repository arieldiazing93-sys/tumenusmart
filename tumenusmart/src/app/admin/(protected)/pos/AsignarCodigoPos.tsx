"use client";

import { useMemo, useState, useTransition } from "react";
import { useCapa } from "@/components/capas";
import { Entrada, MensajeError, clasesBoton } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";
import { llamarAlServidor } from "@/lib/llamar-servidor";
import { asignarCodigoProducto } from "../codigos-barras/actions";

export type ProductoParaAsignar = { id: string; nombre: string; categoria: string; precio: number };

/** Sin tildes ni mayúsculas, para que «cafe» encuentre «Café». */
function sinTildes(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Un código que el lector entregó y el sistema no conoce: se elige de qué producto es y queda guardado para siempre (la próxima vez que se
 * escanee, el producto se suma solo). Es la forma de ir codificando los productos en plena venta, sin salir del punto de venta.
 *
 * Solo ofrece los productos que todavía no tienen código: así un toque equivocado no le cambia el código a uno que ya lo tenía.
 */
export function AsignarCodigoPos({
  codigo,
  productos,
  onAsignado,
  onCerrar,
}: {
  codigo: string;
  /** Los productos SIN código que se pueden elegir. */
  productos: ProductoParaAsignar[];
  /** Se asignó: el punto de venta suma ese producto a la cuenta. */
  onAsignado: (producto: ProductoParaAsignar) => void;
  onCerrar: () => void;
}) {
  const [pendiente, iniciar] = useTransition();
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState<string | null>(null);

  useCapa(onCerrar);

  const texto = sinTildes(busqueda.trim());
  const resultados = useMemo(
    () => productos.filter((p) => !texto || sinTildes(`${p.nombre} ${p.categoria}`).includes(texto)).slice(0, 40),
    [productos, texto]
  );

  function elegir(producto: ProductoParaAsignar) {
    setError(null);
    iniciar(async () => {
      const r = await llamarAlServidor(() => asignarCodigoProducto(producto.id, codigo));
      if (!r.ok) return setError(r.error);
      onAsignado(producto);
    });
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-tinta/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div role="dialog" aria-modal="true" aria-label="Asignar el código a un producto" className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border-2 border-azul/50 bg-white shadow-2xl">
        <div className="border-b border-linea p-4">
          <h2 className="text-[1.05rem] font-semibold tracking-titular text-tinta">¿De qué producto es este código?</h2>
          <p className="cifra mt-0.5 text-[1.05rem] font-semibold tracking-wider text-azul-oscuro">{codigo}</p>
          <p className="mt-1 text-[0.8rem] text-tinta-media">Tocá el producto y el código queda guardado: la próxima vez que lo escanees, se suma solo.</p>
          <div className="campos-grises mt-3">
            <Entrada
              autoFocus
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value.slice(0, 60))}
              placeholder="Buscar el producto por nombre"
              aria-label="Buscar el producto"
              autoComplete="off"
            />
          </div>
          {error && <MensajeError>{error}</MensajeError>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {resultados.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-tinta-suave">
              {productos.length === 0 ? "Todos los productos ya tienen código." : "Ningún producto sin código coincide."}
            </p>
          ) : (
            <ul>
              {resultados.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={pendiente}
                    onClick={() => elegir(p)}
                    className="flex w-full items-center justify-between gap-3 border-b border-linea-fina px-4 py-3 text-left text-[0.9rem] transition-colors hover:bg-brand-light disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-tinta">{p.nombre}</span>
                      <span className="block text-[0.74rem] text-tinta-suave">{p.categoria}</span>
                    </span>
                    <span className="cifra flex-none text-[0.85rem] text-tinta-media">{formatearGuarani(p.precio)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end border-t border-linea p-3">
          <button type="button" onClick={onCerrar} className={clasesBoton("peligro", "md")}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
