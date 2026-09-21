"use client";

import { useState, useTransition } from "react";
import { formatearGuarani } from "@/lib/format";
import {
  buscarProductosParaGrupo,
  agregarProductoAGrupo,
  type ProductoParaGrupo,
} from "../actions";

/**
 * Agregar un modificador a este grupo es elegir un Producto ya existente
 * del catálogo (ej: "Salsa BBQ", cargado en /admin/productos con su propio
 * precio/IVA/unidad) — no se tipea un nombre/precio nuevo acá. Mismo
 * espíritu que SoftRestaurant: el modificador ES el producto.
 */
export function BuscarProductoParaGrupo({ groupId }: { groupId: string }) {
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<ProductoParaGrupo[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [agregando, iniciar] = useTransition();
  const [agregadoId, setAgregadoId] = useState<string | null>(null);

  async function buscar(texto: string) {
    setQuery(texto);
    setAgregadoId(null);
    if (!texto.trim()) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    const r = await buscarProductosParaGrupo(groupId, texto);
    setBuscando(false);
    setResultados(r);
  }

  function agregar(productId: string) {
    iniciar(async () => {
      const r = await agregarProductoAGrupo(groupId, productId);
      if (!r.ok) {
        alert(r.error);
        return;
      }
      setResultados((prev) => prev.filter((p) => p.id !== productId));
      setAgregadoId(productId);
      setTimeout(() => setAgregadoId(null), 2000);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        value={query}
        onChange={(e) => buscar(e.target.value)}
        placeholder="Buscar un producto por nombre (ej: salsa bbq)"
        className="rounded-lg border border-linea px-3 py-2 text-sm"
      />
      {buscando && <p className="text-xs text-tinta-suave">Buscando…</p>}
      {!buscando && query.trim() && resultados.length === 0 && (
        <p className="text-xs text-tinta-suave">
          No encontré ningún producto con ese nombre — creálo primero en Productos.
        </p>
      )}
      {resultados.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {resultados.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-linea bg-white px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium">{p.nombre}</p>
                <p className="text-xs text-tinta-suave">
                  {p.categoriaNombre} · {formatearGuarani(p.precio)} · {p.iva} · {p.unidadMedida}
                </p>
              </div>
              <button
                type="button"
                disabled={agregando}
                onClick={() => agregar(p.id)}
                className="rounded bg-brand px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-dark disabled:opacity-50"
              >
                Agregar
              </button>
            </div>
          ))}
        </div>
      )}
      {agregadoId && <p className="text-xs font-medium text-exito">✓ Agregado al grupo</p>}
    </div>
  );
}
