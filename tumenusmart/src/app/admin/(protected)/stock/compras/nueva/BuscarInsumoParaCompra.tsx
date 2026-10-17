"use client";

import { useRef, useState } from "react";
import { clasesBoton } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";
import { etiquetaIva } from "@/lib/iva";
import { MENSAJE_SIN_RED } from "@/lib/llamar-servidor";
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
  const [sinRed, setSinRed] = useState(false);
  // Si se escribe rápido, la respuesta de una búsqueda vieja no pisa a la nueva (se agregaría un insumo equivocado a la compra).
  const ultimaBusqueda = useRef(0);

  async function buscar(texto: string) {
    setQuery(texto);
    const numero = ++ultimaBusqueda.current;
    if (!texto.trim()) {
      setResultados([]);
      setBuscando(false);
      setSinRed(false);
      return;
    }
    setBuscando(true);
    setSinRed(false);
    let r: InsumoParaCompra[];
    try {
      r = await buscarInsumosParaCompra(texto);
    } catch {
      // Sin internet: se frena el «Buscando…» y se avisa (no se dice «no encontré ningún insumo», que sería mentira).
      if (numero === ultimaBusqueda.current) {
        setBuscando(false);
        setSinRed(true);
      }
      return;
    }
    if (numero !== ultimaBusqueda.current) return;
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
      {sinRed && <p className="text-xs font-medium text-peligro">{MENSAJE_SIN_RED}</p>}
      {!buscando && !sinRed && query.trim() && resultados.length === 0 && (
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
                  {i.rendimiento !== 1 && ` · rendimiento ${i.rendimiento}`}
                  {i.ultimoCostoPorCompra != null && ` · último costo ${formatearGuarani(i.ultimoCostoPorCompra)}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onElegir(i);
                  setQuery("");
                  setResultados([]);
                }}
                className={clasesBoton("nuevo", "sm")}
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
