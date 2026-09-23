"use client";

import { useState } from "react";
import { clasesBoton } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";
import { etiquetaIva } from "@/lib/iva";
import { buscarInsumosParaCompra, type InsumoParaCompra } from "../actions";

/**
 * Agregar una línea a la compra es BUSCAR el insumo por nombre y elegirlo de
 * la lista — no hay un desplegable con todos, porque con un catálogo grande
 * no se encuentra nada. Mismo criterio que la receta de un producto.
 *
 * No guarda nada: solo le avisa al formulario cuál se eligió, que arma la
 * línea. La compra se guarda entera al final.
 */
export function BuscarInsumoParaCompra({
  onElegir,
}: {
  onElegir: (insumo: InsumoParaCompra) => void;
}) {
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<InsumoParaCompra[]>([]);
  const [buscando, setBuscando] = useState(false);

  async function buscar(texto: string) {
    setQuery(texto);
    if (!texto.trim()) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    const r = await buscarInsumosParaCompra(texto);
    setBuscando(false);
    setResultados(r);
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        value={query}
        onChange={(e) => buscar(e.target.value)}
        placeholder="Buscar un insumo por nombre para agregarlo (ej: carne)"
        className="rounded-lg border border-linea bg-superficie px-3 py-2.5 text-[0.88rem] focus:border-brand focus:outline-none"
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
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-linea bg-superficie px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium">{i.nombre}</p>
                <p className="text-xs text-tinta-suave">
                  {i.categoriaNombre} · {i.unidadMedida} · {etiquetaIva(i.iva)}
                  {i.costoUnitario != null && ` · último costo ${formatearGuarani(i.costoUnitario)}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onElegir(i);
                  setQuery("");
                  setResultados([]);
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
