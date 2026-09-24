"use client";

import { useRef, useState } from "react";
import { clasesBoton } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";
import { etiquetaIva } from "@/lib/iva";
import { buscarProductosParaCotizacion, type ProductoParaCotizacion } from "./actions";

/**
 * Agregar una línea al presupuesto es BUSCAR el producto o servicio por nombre
 * y elegirlo de la lista — no hay un desplegable con todos, porque con un
 * catálogo grande no se encuentra nada.
 *
 * No guarda nada: solo le avisa al formulario cuál se eligió, que arma la línea.
 */
export function BuscarProductoParaCotizacion({
  onElegir,
}: {
  onElegir: (producto: ProductoParaCotizacion) => void;
}) {
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<ProductoParaCotizacion[]>([]);
  const [buscando, setBuscando] = useState(false);
  // Si se escribe rápido, la respuesta de una búsqueda vieja no pisa a la nueva.
  const ultimaBusqueda = useRef(0);

  async function buscar(texto: string) {
    setQuery(texto);
    const numero = ++ultimaBusqueda.current;
    if (!texto.trim()) {
      setResultados([]);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    const r = await buscarProductosParaCotizacion(texto);
    if (numero !== ultimaBusqueda.current) return;
    setBuscando(false);
    setResultados(r);
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        value={query}
        onChange={(e) => buscar(e.target.value)}
        placeholder="Buscá un producto o servicio por nombre para agregarlo"
        className="rounded-lg border border-linea bg-superficie px-3 py-2.5 text-[0.88rem] focus:border-brand focus:outline-none"
      />
      {buscando && <p className="text-xs text-tinta-suave">Buscando…</p>}
      {!buscando && query.trim() && resultados.length === 0 && (
        <p className="text-xs text-tinta-suave">
          No encontré nada con ese nombre. Si no está en tu catálogo, agregalo como línea libre.
        </p>
      )}
      {resultados.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {resultados.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-linea bg-superficie px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium">{p.nombre}</p>
                <p className="text-xs text-tinta-suave">
                  {p.categoriaNombre} · {formatearGuarani(p.precio)} · {etiquetaIva(p.iva)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onElegir(p);
                  setQuery("");
                  setResultados([]);
                  ultimaBusqueda.current++;
                }}
                className={clasesBoton("principal", "sm")}
              >
                Agregar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
