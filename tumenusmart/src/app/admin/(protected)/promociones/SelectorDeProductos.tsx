"use client";

import { useMemo, useState } from "react";
import { Entrada, Selector, clasesBoton } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";

export type CategoriaConProductos = {
  id: string;
  nombre: string;
  productos: { id: string; nombre: string; precio: number }[];
};

const TODAS = "";

function sinTildes(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Los productos de una promoción. Se puede traer toda una categoría de un solo toque ("Agregar todos") o elegir de a uno, y se puede
 * buscar por nombre. A la derecha de cada uno, el botón para quitarlo. Lo elegido queda a la vista, con su precio.
 */
export function SelectorDeProductos({
  categorias,
  seleccion,
  onChange,
  nombreDeCategoriaSeleccionada,
}: {
  categorias: CategoriaConProductos[];
  seleccion: string[];
  onChange: (ids: string[]) => void;
  /** Para mostrar en la lista de elegidos de qué categoría es cada uno. */
  nombreDeCategoriaSeleccionada?: boolean;
}) {
  const [categoriaId, setCategoriaId] = useState<string>(TODAS);
  const [busqueda, setBusqueda] = useState("");

  const productoPorId = useMemo(() => {
    const mapa = new Map<string, { id: string; nombre: string; precio: number; categoria: string }>();
    for (const c of categorias) for (const p of c.productos) mapa.set(p.id, { ...p, categoria: c.nombre });
    return mapa;
  }, [categorias]);

  const elegidos = useMemo(() => new Set(seleccion), [seleccion]);
  const texto = sinTildes(busqueda.trim());

  // Los que se pueden agregar: los de la categoría elegida (o todas) que coinciden con la búsqueda y todavía no están.
  const disponibles = useMemo(() => {
    const lista: { id: string; nombre: string; precio: number; categoria: string }[] = [];
    for (const c of categorias) {
      if (categoriaId !== TODAS && c.id !== categoriaId) continue;
      for (const p of c.productos) {
        if (elegidos.has(p.id)) continue;
        if (texto && !sinTildes(p.nombre).includes(texto)) continue;
        lista.push({ ...p, categoria: c.nombre });
      }
    }
    return lista;
  }, [categorias, categoriaId, texto, elegidos]);

  function agregar(ids: string[]) {
    onChange([...seleccion, ...ids.filter((id) => !elegidos.has(id))]);
  }

  function quitar(id: string) {
    onChange(seleccion.filter((x) => x !== id));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="campos-grises flex flex-col gap-2 rounded-xl border border-azul/30 bg-azul-luz p-3.5">
        <p className="rotulo text-[0.78rem] font-bold text-azul-oscuro">Agregar productos</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Selector aria-label="Categoría" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value={TODAS}>Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} ({c.productos.length})
              </option>
            ))}
          </Selector>
          <Entrada
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar un producto por nombre…"
            aria-label="Buscar un producto"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[0.8rem] text-tinta-media">
            {disponibles.length === 0 ? "No hay productos para agregar con ese filtro." : `${disponibles.length} para agregar`}
          </span>
          <button
            type="button"
            disabled={disponibles.length === 0}
            onClick={() => agregar(disponibles.map((p) => p.id))}
            className={`${clasesBoton("nuevo", "sm")} disabled:opacity-50`}
          >
            Agregar todos ({disponibles.length})
          </button>
        </div>
        {disponibles.length > 0 && (
          <ul className="flex max-h-56 flex-col divide-y divide-linea-fina overflow-y-auto rounded-lg border border-linea bg-white">
            {disponibles.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-[0.84rem]">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{p.nombre}</span>
                  {categoriaId === TODAS && <span className="ml-1.5 text-[0.72rem] text-tinta-suave">{p.categoria}</span>}
                </span>
                <span className="flex flex-none items-center gap-2">
                  <span className="cifra text-[0.78rem] text-tinta-media">{formatearGuarani(p.precio)}</span>
                  <button type="button" onClick={() => agregar([p.id])} className={clasesBoton("nuevo", "sm")} aria-label={`Agregar ${p.nombre}`}>
                    +
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="rotulo text-[0.78rem] font-bold">Productos de la promoción ({seleccion.length})</p>
          {seleccion.length > 0 && (
            <button type="button" onClick={() => onChange([])} className={clasesBoton("peligro", "sm")}>
              Quitar todos
            </button>
          )}
        </div>
        {seleccion.length === 0 ? (
          <p className="rounded-lg border border-dashed border-linea px-3 py-4 text-center text-[0.84rem] text-tinta-suave">
            Todavía no agregaste ningún producto: traé toda una categoría o elegí de a uno.
          </p>
        ) : (
          <ul className="flex max-h-72 flex-col divide-y divide-linea-fina overflow-y-auto rounded-lg border border-linea bg-white">
            {seleccion.map((id) => {
              const p = productoPorId.get(id);
              return (
                <li key={id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-[0.84rem]">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{p?.nombre ?? "Producto que ya no existe"}</span>
                    {nombreDeCategoriaSeleccionada && p && <span className="ml-1.5 text-[0.72rem] text-tinta-suave">{p.categoria}</span>}
                  </span>
                  <span className="flex flex-none items-center gap-2">
                    {p && <span className="cifra text-[0.78rem] text-tinta-media">{formatearGuarani(p.precio)}</span>}
                    <button type="button" onClick={() => quitar(id)} className={clasesBoton("peligro", "sm")} aria-label={`Quitar ${p?.nombre ?? "producto"}`}>
                      Quitar
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
