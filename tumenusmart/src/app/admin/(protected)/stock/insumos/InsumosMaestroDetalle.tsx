"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Tarjeta, Selector, clasesBoton } from "@/components/ui";
import { etiquetaUnidadMedida } from "@/lib/unidad-medida";
import { formatearGuarani } from "@/lib/format";
import { CrearInsumoForm } from "./CrearInsumoForm";
import { InsumoPanel, type InsumoDatos } from "./InsumoPanel";

type Categoria = { id: string; nombre: string };
type Almacen = { id: string; nombre: string };

/** "" = todas las categorías, "sin" = los que no tienen, o el id de una. */
const TODAS = "";
const SIN_CATEGORIA = "sin";

/**
 * La pantalla de Insumos en dos paneles: a la izquierda se elige una
 * categoría y abajo aparecen sus insumos; con doble clic en uno, a la derecha
 * se abren sus datos. Todo el filtrado se hace acá, en el navegador — el
 * servidor solo entrega la lista completa.
 */
export function InsumosMaestroDetalle({
  insumos,
  categorias,
  almacenes,
}: {
  insumos: InsumoDatos[];
  categorias: Categoria[];
  /** Para elegir dónde queda el stock inicial de un insumo nuevo. */
  almacenes: Almacen[];
}) {
  const router = useRouter();
  const [categoriaFiltro, setCategoriaFiltro] = useState(TODAS);
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const conteoPorCategoria = useMemo(() => {
    const conteo = new Map<string, number>();
    let sinCategoria = 0;
    for (const i of insumos) {
      if (i.categoriaId) conteo.set(i.categoriaId, (conteo.get(i.categoriaId) ?? 0) + 1);
      else sinCategoria++;
    }
    return { conteo, sinCategoria };
  }, [insumos]);

  const visibles = useMemo(
    () =>
      insumos.filter((i) =>
        categoriaFiltro === TODAS
          ? true
          : categoriaFiltro === SIN_CATEGORIA
            ? i.categoriaId === null
            : i.categoriaId === categoriaFiltro
      ),
    [insumos, categoriaFiltro]
  );

  const abierto = abiertoId ? (insumos.find((i) => i.id === abiertoId) ?? null) : null;

  // El reporte respeta la categoría elegida arriba de la lista ("" = todas).
  const consultaReporte = categoriaFiltro !== TODAS ? `?categoria=${encodeURIComponent(categoriaFiltro)}` : "";

  // En pantalla angosta el panel queda debajo de la lista: se lo trae a la
  // vista, si no el doble clic parecería no hacer nada.
  useEffect(() => {
    if (!abiertoId && !creando) return;
    if (window.matchMedia("(max-width: 1023px)").matches) {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [abiertoId, creando]);

  function abrir(id: string) {
    setCreando(false);
    setAbiertoId(id);
  }

  function nuevo() {
    setAbiertoId(null);
    setCreando(true);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={nuevo} className={clasesBoton("principal")}>
          + Nuevo insumo
        </button>
        <span className="text-xs text-tinta-suave">
          {insumos.length} {insumos.length === 1 ? "insumo" : "insumos"} en total
        </span>
        {/* Reporte de existencias: sale con la categoría que esté elegida en la lista. */}
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <a href={`/admin/stock/insumos/exportar${consultaReporte}`} className={clasesBoton("suave", "sm")}>
            Descargar Excel
          </a>
          <a
            href={`/admin/stock/insumos/imprimir${consultaReporte}`}
            target="_blank"
            rel="noopener noreferrer"
            className={clasesBoton("navegar", "sm")}
          >
            Ver reporte / PDF
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[26rem_minmax(0,1fr)]">
        {/* ---------------- izquierda: categoría + lista ---------------- */}
        <Tarjeta padding={false} className="flex flex-col overflow-hidden">
          <div className="flex flex-col gap-2 border-b border-linea p-3">
            <Selector
              aria-label="Categoría"
              value={categoriaFiltro}
              onChange={(e) => setCategoriaFiltro(e.target.value)}
            >
              <option value={TODAS}>Todas las categorías ({insumos.length})</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} ({conteoPorCategoria.conteo.get(c.id) ?? 0})
                </option>
              ))}
              {conteoPorCategoria.sinCategoria > 0 && (
                <option value={SIN_CATEGORIA}>Sin categoría ({conteoPorCategoria.sinCategoria})</option>
              )}
            </Selector>
          </div>

          <div className="max-h-[32rem] overflow-y-auto">
            {visibles.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-tinta-suave">
                {insumos.length === 0
                  ? "Todavía no cargaste ningún insumo."
                  : "No hay insumos en esta categoría."}
              </p>
            ) : (
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 bg-superficie">
                  <tr className="border-b border-linea text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
                    <th scope="col" className="px-3 py-2">
                      Descripción
                    </th>
                    <th scope="col" className="px-3 py-2 text-right">
                      Costo
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Unidad
                    </th>
                    <th scope="col" className="px-2 py-2">
                      <span className="sr-only">Ver</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((i) => {
                    const alerta =
                      i.stockActual < 0
                        ? "Stock negativo"
                        : i.stockMinimo != null && i.stockActual < i.stockMinimo
                          ? "Stock bajo el mínimo"
                          : null;
                    return (
                      <tr
                        key={i.id}
                        tabIndex={0}
                        title="Doble clic para ver los datos"
                        onDoubleClick={() => abrir(i.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") abrir(i.id);
                        }}
                        className={`cursor-pointer border-b border-linea-fina text-[0.84rem] outline-none transition-colors focus-visible:bg-papel-hundido ${
                          abiertoId === i.id ? "bg-brand-light text-brand-texto" : "hover:bg-papel-suave"
                        } ${i.activo ? "" : "opacity-60"}`}
                      >
                        <td className="px-3 py-2 font-medium">
                          {i.nombre}
                          {alerta && (
                            <span
                              role="img"
                              aria-label={alerta}
                              title={alerta}
                              className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-peligro align-middle"
                            />
                          )}
                        </td>
                        <td className="cifra px-3 py-2 text-right">
                          {i.costoUnitario != null ? formatearGuarani(i.costoUnitario) : "—"}
                        </td>
                        <td className="px-3 py-2">{etiquetaUnidadMedida(i.unidadMedida)}</td>
                        <td className="px-2 py-1 text-right">
                          <button type="button" onClick={() => abrir(i.id)} className={clasesBoton("suave", "sm")}>
                            Ver
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <p className="border-t border-linea px-3 py-2 text-[0.74rem] text-tinta-suave">
            Doble clic en un insumo, o el botón Ver, para abrir sus datos.
          </p>
        </Tarjeta>

        {/* ---------------- derecha: datos del insumo ---------------- */}
        <div ref={panelRef}>
          {creando ? (
            <CrearInsumoForm
              categorias={categorias}
              almacenes={almacenes}
              categoriaInicialId={
                categoriaFiltro !== TODAS && categoriaFiltro !== SIN_CATEGORIA ? categoriaFiltro : undefined
              }
              onCreado={(id) => {
                setCreando(false);
                setAbiertoId(id);
                setCategoriaFiltro(TODAS);
              }}
            />
          ) : abierto ? (
            <InsumoPanel
              key={abierto.id}
              insumo={abierto}
              categorias={categorias}
              onGuardado={() => router.refresh()}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-linea bg-papel-suave px-6 py-14 text-center">
              <p className="text-[0.95rem] font-semibold tracking-titular text-tinta">
                {abiertoId ? "Abriendo el insumo…" : "Ningún insumo abierto"}
              </p>
              {!abiertoId && (
                <p className="mx-auto mt-1.5 max-w-sm text-[0.85rem] leading-snug text-tinta-media">
                  Elegí una categoría, hacé doble clic en un insumo de la lista para ver y editar sus
                  datos, o creá uno nuevo con el botón de arriba.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
