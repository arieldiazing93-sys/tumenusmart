"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatearGuarani } from "@/lib/format";
import { llamarAlServidor, MENSAJE_SIN_RED } from "@/lib/llamar-servidor";
import { clasesBoton } from "@/components/ui";
import {
  buscarProductosParaGrupo,
  agregarProductoAGrupo,
  type ProductoParaGrupo,
} from "@/app/admin/(protected)/grupos-agregados/actions";

/**
 * Agregar un modificador a un grupo es elegir un Producto ya existente del
 * catálogo (ej: "Salsa Pesto", cargado en /admin/productos con su propio
 * precio/IVA/unidad) — no se tipea un nombre/precio nuevo acá. Mismo
 * espíritu que SoftRestaurant: el modificador ES el producto.
 *
 * Se usa desde dos lugares: el panel de un grupo (a la derecha de la lista
 * de Grupos de agregados) y directo en la tarjeta "Grupos de
 * agregados" de un producto — por eso vive en components/, no adentro de
 * ninguna de las dos rutas.
 */
export function BuscarProductoParaGrupo({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<ProductoParaGrupo[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [agregando, iniciar] = useTransition();
  const [agregadoId, setAgregadoId] = useState<string | null>(null);
  const [sinRed, setSinRed] = useState(false);
  // Si se escribe rápido, la respuesta de una búsqueda vieja no pisa a la nueva (se sumaría un producto equivocado al grupo).
  const ultimaBusqueda = useRef(0);

  async function buscar(texto: string) {
    setQuery(texto);
    setAgregadoId(null);
    const numero = ++ultimaBusqueda.current;
    if (!texto.trim()) {
      setResultados([]);
      setBuscando(false);
      setSinRed(false);
      return;
    }
    setBuscando(true);
    setSinRed(false);
    let r: ProductoParaGrupo[];
    try {
      r = await buscarProductosParaGrupo(groupId, texto);
    } catch {
      // Sin internet: se frena el «Buscando…» y se avisa (no se dice «no encontré ningún producto», que sería mentira).
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

  function agregar(productId: string) {
    iniciar(async () => {
      const r = await llamarAlServidor(() => agregarProductoAGrupo(groupId, productId));
      if (!r.ok) {
        alert(r.error);
        return;
      }
      setResultados((prev) => prev.filter((p) => p.id !== productId));
      setAgregadoId(productId);
      setTimeout(() => setAgregadoId(null), 2000);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        value={query}
        onChange={(e) => buscar(e.target.value)}
        placeholder="Buscar un producto por nombre (ej: salsa pesto)"
        className="rounded-lg border border-linea px-3 py-2 text-sm"
      />
      {buscando && <p className="text-xs text-tinta-suave">Buscando…</p>}
      {sinRed && <p className="text-xs font-medium text-peligro">{MENSAJE_SIN_RED}</p>}
      {!buscando && !sinRed && query.trim() && resultados.length === 0 && (
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
                className={clasesBoton("nuevo", "sm")}
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
