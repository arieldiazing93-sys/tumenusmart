"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { llamarAlServidor, MENSAJE_SIN_RED } from "@/lib/llamar-servidor";
import { buscarInsumosParaReceta, asignarInsumoAProducto, type InsumoParaReceta } from "../actions";

/**
 * Agregar un insumo a la receta de un producto: se busca por nombre entre
 * los insumos ya cargados en /admin/stock/insumos (no se tipea uno nuevo
 * acá) y se le pone la cantidad que consume UNA unidad vendida de este
 * producto. Mismo espíritu que BuscarProductoParaGrupo, con el agregado de
 * la cantidad — acá no alcanza con "sí/no", hace falta el número.
 */
export function BuscarInsumoParaReceta({ productId }: { productId: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<InsumoParaReceta[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [agregando, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [agregadoId, setAgregadoId] = useState<string | null>(null);

  // Si se escribe rápido, la respuesta de una búsqueda vieja no pisa a la nueva (se cargaría un insumo equivocado en la receta).
  const ultimaBusqueda = useRef(0);

  async function buscar(texto: string) {
    setQuery(texto);
    setAgregadoId(null);
    setError(null);
    const numero = ++ultimaBusqueda.current;
    if (!texto.trim()) {
      setResultados([]);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    let r: InsumoParaReceta[];
    try {
      r = await buscarInsumosParaReceta(productId, texto);
    } catch {
      // Sin internet: se frena el «Buscando…» y se avisa (no se muestra «sin resultados», que sería mentira).
      if (numero === ultimaBusqueda.current) {
        setBuscando(false);
        setError(MENSAJE_SIN_RED);
      }
      return;
    }
    if (numero !== ultimaBusqueda.current) return;
    setBuscando(false);
    setResultados(r);
  }

  function agregar(insumoId: string) {
    setError(null);
    const cantidad = Number(cantidades[insumoId] ?? "");
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      setError("Cargá una cantidad mayor a cero antes de agregar.");
      return;
    }
    iniciar(async () => {
      const r = await llamarAlServidor(() => asignarInsumoAProducto(productId, insumoId, cantidad));
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setResultados((prev) => prev.filter((i) => i.id !== insumoId));
      setAgregadoId(insumoId);
      setTimeout(() => setAgregadoId(null), 2000);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        value={query}
        onChange={(e) => buscar(e.target.value)}
        placeholder="Buscar un insumo por nombre (ej: carne)"
        className="rounded-lg border border-linea px-3 py-2 text-sm"
      />
      {buscando && <p className="text-xs text-tinta-suave">Buscando…</p>}
      {!buscando && query.trim() && resultados.length === 0 && (
        <p className="text-xs text-tinta-suave">
          No encontré ningún insumo con ese nombre — creálo primero en Insumos.
        </p>
      )}
      {resultados.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {resultados.map((i) => (
            <div
              key={i.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-linea bg-white px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium">{i.nombre}</p>
                <p className="text-xs text-tinta-suave">{i.categoriaNombre}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="Cant."
                  value={cantidades[i.id] ?? ""}
                  onChange={(e) => setCantidades((c) => ({ ...c, [i.id]: e.target.value }))}
                  className="w-20 rounded border border-linea px-2 py-1 text-xs"
                />
                <span className="text-xs text-tinta-suave">{i.unidadMedida}</span>
                <button
                  type="button"
                  disabled={agregando}
                  onClick={() => agregar(i.id)}
                  className="rounded bg-brand px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-dark disabled:opacity-50"
                >
                  Agregar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-xs font-medium text-peligro">{error}</p>}
      {agregadoId && <p className="text-xs font-medium text-exito">✓ Agregado a la receta</p>}
    </div>
  );
}
