"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { asignarInsumoAProducto } from "../actions";
import { BuscarInsumoParaReceta } from "./BuscarInsumoParaReceta";
import { QuitarInsumoDeRecetaBoton } from "./QuitarInsumoDeRecetaBoton";

type ItemReceta = { insumoId: string; nombre: string; cantidad: number; unidadMedida: string };

/**
 * Todo el flujo de la receta vive acá, en la ficha del producto — mismo
 * criterio que Grupos de agregados: buscar, agregar y corregir cantidades
 * sin salir de esta pantalla. Un "extra" (agregado de grupo) es también un
 * Product, así que su propia ficha usa esta misma tarjeta sin ningún caso
 * especial.
 */
export function RecetaProducto({ productId, receta }: { productId: string; receta: ItemReceta[] }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [editando, setEditando] = useState<string | null>(null);
  const [cantidadEditada, setCantidadEditada] = useState("");
  const [error, setError] = useState<string | null>(null);

  function guardarCantidad(insumoId: string) {
    setError(null);
    const cantidad = Number(cantidadEditada);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      setError("La cantidad tiene que ser mayor a cero.");
      return;
    }
    iniciar(async () => {
      const r = await asignarInsumoAProducto(productId, insumoId, cantidad);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setEditando(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {receta.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {receta.map((r) => (
            <div
              key={r.insumoId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-linea bg-white px-3 py-2 text-sm"
            >
              <p className="font-medium">{r.nombre}</p>
              {editando === r.insumoId ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    autoFocus
                    value={cantidadEditada}
                    onChange={(e) => setCantidadEditada(e.target.value)}
                    className="w-20 rounded border border-linea px-2 py-1 text-xs"
                  />
                  <span className="text-xs text-tinta-suave">{r.unidadMedida}</span>
                  <button
                    type="button"
                    disabled={pendiente}
                    onClick={() => guardarCantidad(r.insumoId)}
                    className="rounded bg-brand px-2 py-1 text-xs font-medium text-white hover:bg-brand-dark disabled:opacity-50"
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditando(null);
                      setError(null);
                    }}
                    className="text-xs text-tinta-media hover:underline"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditando(r.insumoId);
                      setCantidadEditada(String(r.cantidad));
                      setError(null);
                    }}
                    className="text-xs text-tinta-media hover:underline"
                    title="Cambiar la cantidad"
                  >
                    {r.cantidad} {r.unidadMedida}
                  </button>
                  <QuitarInsumoDeRecetaBoton productId={productId} insumoId={r.insumoId} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-xs font-medium text-peligro">{error}</p>}
      <BuscarInsumoParaReceta productId={productId} />
    </div>
  );
}
