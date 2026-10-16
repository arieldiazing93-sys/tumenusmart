"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Tarjeta, Selector, clasesBoton } from "@/components/ui";
import { etiquetaUnidadMedida } from "@/lib/unidad-medida";
import { formatearGuarani, formatearCantidad } from "@/lib/format";
import { estadoDeStock, tieneAlertaDeStock, type EstadoStock } from "@/lib/alerta-stock";
import { CrearInsumoForm } from "./CrearInsumoForm";
import { InsumoPanel, type InsumoDatos } from "./InsumoPanel";

type Categoria = { id: string; nombre: string };
type Almacen = { id: string; nombre: string };

/** "" = todas las categorías, "sin" = los que no tienen, o el id de una. */
const TODAS = "";
const SIN_CATEGORIA = "sin";

/** Un campo de fecha de la misma altura que los botones chicos de al lado. */
const CAMPO_FECHA =
  "h-8 rounded-lg border border-linea bg-superficie px-2 text-[0.82rem] text-tinta " +
  "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15";

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
  // El filtro «Stock bajo»: deja en la lista solo los insumos negativos o bajo su mínimo (se combina con la categoría elegida).
  const [soloBajo, setSoloBajo] = useState(false);
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  // Qué se está creando en el panel de la derecha: un insumo comprado o una
  // preparación (salsa, masa…) que se arma con otros insumos.
  const [creando, setCreando] = useState<"insumo" | "preparacion" | null>(null);
  // Rango del reporte, por calendario. Vacío = el mes actual.
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
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

  // La alerta de cada insumo (la misma regla de la ficha y del reporte: src/lib/alerta-stock.ts). Una preparación nunca avisa.
  const estados = useMemo(() => {
    const mapa = new Map<string, EstadoStock>();
    for (const i of insumos) mapa.set(i.id, estadoDeStock(i.stockActual, i.stockMinimo, i.esElaborado));
    return mapa;
  }, [insumos]);

  // Cuántos hay con stock bajo en TODO el local (el número del botón no cambia al cambiar de categoría: avisa de lo que hay en total).
  const cantidadBajos = useMemo(
    () => insumos.filter((i) => tieneAlertaDeStock(estados.get(i.id) ?? "ok")).length,
    [insumos, estados]
  );

  const visibles = useMemo(() => {
    const lista = insumos.filter((i) => {
      if (soloBajo && !tieneAlertaDeStock(estados.get(i.id) ?? "ok")) return false;
      return categoriaFiltro === TODAS
        ? true
        : categoriaFiltro === SIN_CATEGORIA
          ? i.categoriaId === null
          : i.categoriaId === categoriaFiltro;
    });
    // Con el filtro puesto, lo más urgente arriba: primero los negativos y después los que están bajo el mínimo (cada grupo por nombre).
    if (soloBajo) {
      const peso = (i: InsumoDatos) => (estados.get(i.id) === "negativo" ? 0 : 1);
      lista.sort((a, b) => peso(a) - peso(b) || a.nombre.localeCompare(b.nombre, "es"));
    }
    return lista;
  }, [insumos, categoriaFiltro, soloBajo, estados]);

  const abierto = abiertoId ? (insumos.find((i) => i.id === abiertoId) ?? null) : null;

  // El reporte respeta la categoría elegida arriba de la lista ("" = todas) y el
  // rango de fechas del calendario (sin fechas, el servidor toma el mes actual).
  const consultaReporte = (() => {
    const params = new URLSearchParams();
    if (categoriaFiltro !== TODAS) params.set("categoria", categoriaFiltro);
    if (soloBajo) params.set("solo", "bajo");
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    const texto = params.toString();
    return texto ? `?${texto}` : "";
  })();

  // En pantalla angosta el panel queda debajo de la lista: se lo trae a la
  // vista, si no el doble clic parecería no hacer nada.
  useEffect(() => {
    if (!abiertoId && !creando) return;
    if (window.matchMedia("(max-width: 1023px)").matches) {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [abiertoId, creando]);

  function abrir(id: string) {
    setCreando(null);
    setAbiertoId(id);
  }

  function nuevo(tipo: "insumo" | "preparacion") {
    setAbiertoId(null);
    setCreando(tipo);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => nuevo("insumo")} className={clasesBoton("nuevo")}>
          + Nuevo insumo
        </button>
        <button type="button" onClick={() => nuevo("preparacion")} className={clasesBoton("suave")}>
          + Nueva preparación
        </button>
        <span className="text-xs text-tinta-suave">
          {insumos.length} {insumos.length === 1 ? "insumo" : "insumos"} en total
        </span>
        {/* Reporte de insumos: sale con la categoría que esté elegida en la lista y
            el rango de fechas de acá. Sin fechas, toma el mes actual. */}
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <label className="flex items-center gap-1.5 text-[0.78rem] text-tinta-suave">
            Desde
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className={CAMPO_FECHA}
            />
          </label>
          <label className="flex items-center gap-1.5 text-[0.78rem] text-tinta-suave">
            Hasta
            <input
              type="date"
              value={hasta}
              min={desde || undefined}
              onChange={(e) => setHasta(e.target.value)}
              className={CAMPO_FECHA}
            />
          </label>
          <a href={`/admin/stock/insumos/exportar${consultaReporte}`} className={clasesBoton("suave", "sm")}>
            Descargar Excel{soloBajo ? " (solo stock bajo)" : ""}
          </a>
          <a
            href={`/admin/stock/insumos/imprimir${consultaReporte}`}
            target="_blank"
            rel="noopener noreferrer"
            className={clasesBoton("navegar", "sm")}
          >
            Ver reporte / PDF{soloBajo ? " (solo stock bajo)" : ""}
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[26rem_minmax(0,1fr)]">
        {/* ---------------- izquierda: categoría + lista ---------------- */}
        <Tarjeta padding={false} className="!border-2 !border-azul/50 flex flex-col overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-linea p-3">
            <div className="min-w-[11rem] flex-1">
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
            {/* «Stock bajo»: trae solo lo negativo o bajo el mínimo. El número es el de todo el local. Si no hay nada que avisar (y el
                filtro está apagado) no es un botón sino una confirmación: no hay qué filtrar. */}
            {cantidadBajos > 0 || soloBajo ? (
              <button
                type="button"
                aria-pressed={soloBajo}
                onClick={() => setSoloBajo((v) => !v)}
                title={soloBajo ? "Volver a ver todos los insumos" : "Ver solo los insumos con stock negativo o bajo el mínimo"}
                className={`inline-flex h-10 flex-none items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-[0.85rem] font-semibold transition-colors ${
                  soloBajo
                    ? "border-aviso bg-aviso text-white hover:opacity-90"
                    : "border-aviso/40 bg-aviso-luz text-aviso hover:border-aviso"
                }`}
              >
                <span aria-hidden>{soloBajo ? "✕" : "⚠"}</span>
                Stock bajo
                <span
                  className={`rounded-full px-1.5 text-[0.72rem] ${soloBajo ? "bg-white/25 text-white" : "bg-aviso/15 text-aviso"}`}
                >
                  {cantidadBajos}
                </span>
              </button>
            ) : (
              <span className="inline-flex h-10 flex-none items-center gap-1 whitespace-nowrap text-[0.8rem] font-semibold text-exito">
                <span aria-hidden>✓</span> Sin stock bajo
              </span>
            )}
          </div>

          <div className="max-h-[32rem] overflow-y-auto">
            {visibles.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-tinta-suave">
                {insumos.length === 0
                  ? "Todavía no cargaste ningún insumo."
                  : soloBajo
                    ? categoriaFiltro === TODAS
                      ? "Ningún insumo con stock bajo ni negativo."
                      : "En esta categoría no hay insumos con stock bajo ni negativo."
                    : "No hay insumos en esta categoría."}
              </p>
            ) : (
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 bg-superficie">
                  <tr className="border-b border-linea text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
                    <th scope="col" className="px-2 py-2 sm:px-3">
                      Descripción
                    </th>
                    <th scope="col" className="px-2 py-2 sm:px-3 text-right">
                      {soloBajo ? "Stock / mínimo" : "Costo"}
                    </th>
                    <th scope="col" className="px-2 py-2 sm:px-3">
                      Unidad
                    </th>
                    <th scope="col" className="px-2 py-2">
                      <span className="sr-only">Ver</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((i) => {
                    // Una preparación no lleva stock propio: no hay nada que avisar (el estado ya lo resuelve).
                    const estado = estados.get(i.id) ?? "ok";
                    const alerta =
                      estado === "negativo" ? "Stock negativo" : estado === "bajo" ? "Stock bajo el mínimo" : null;
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
                        <td className="px-2 py-2 sm:px-3 font-medium">
                          {i.nombre}
                          {i.esElaborado && (
                            <span className="ml-1.5 rounded-full bg-azul-luz px-1.5 py-0.5 align-middle text-[0.66rem] font-semibold text-azul-oscuro">
                              Preparación
                            </span>
                          )}
                          {alerta && (
                            <span
                              role="img"
                              aria-label={alerta}
                              title={alerta}
                              className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-peligro align-middle"
                            />
                          )}
                        </td>
                        {soloBajo ? (
                          // Con el filtro: cuánto queda y cuál era el mínimo (rojo si ya está en negativo, mostaza si está bajo el mínimo).
                          <td className="cifra px-2 py-2 sm:px-3 text-right whitespace-nowrap">
                            <span className={`font-semibold ${estado === "negativo" ? "text-peligro" : "text-aviso"}`}>
                              {formatearCantidad(i.stockActual)}
                            </span>
                            <span className="text-tinta-suave">
                              {" / "}
                              {i.stockMinimo != null ? formatearCantidad(i.stockMinimo) : "—"}
                            </span>
                          </td>
                        ) : (
                          <td className="cifra px-2 py-2 sm:px-3 text-right">
                            {i.costoUnitario != null ? formatearGuarani(i.costoUnitario) : "—"}
                          </td>
                        )}
                        <td className="px-2 py-2 sm:px-3">{etiquetaUnidadMedida(i.unidadMedida)}</td>
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
              key={creando}
              esPreparacion={creando === "preparacion"}
              categorias={categorias}
              almacenes={almacenes}
              categoriaInicialId={
                categoriaFiltro !== TODAS && categoriaFiltro !== SIN_CATEGORIA ? categoriaFiltro : undefined
              }
              onCreado={(id) => {
                setCreando(null);
                setAbiertoId(id);
                setCategoriaFiltro(TODAS);
                setSoloBajo(false);
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
