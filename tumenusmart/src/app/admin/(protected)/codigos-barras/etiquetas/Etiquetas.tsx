"use client";

import { useEffect, useMemo, useState } from "react";
import { Aviso, Entrada, Selector, Tarjeta, clasesBoton } from "@/components/ui";
import { BarrasSvg } from "@/components/BarrasSvg";
import { formatearGuarani } from "@/lib/format";
import { tipoDeBarrasDe, disenarEtiqueta, FORMATOS_DE_ETIQUETA, RESOLUCIONES_DE_IMPRESORA, repartirEnPaginas, etiquetasPorHoja } from "@/lib/etiqueta-barras";
import type { DisenoDeEtiqueta, FormatoDeEtiqueta } from "@/lib/etiqueta-barras";
import type { TipoBarras } from "@/lib/codigo-barras";

type ProductoEtiqueta = { id: string; nombre: string; categoryId: string; precio: number; codigo: string };
type Categoria = { id: string; nombre: string };

/** Una etiqueta de prueba (no es un producto real): un EAN-13 válido que ningún producto tiene, para probar la impresora y el lector. */
const ID_PRUEBA = "__prueba__";
const PRODUCTO_PRUEBA: ProductoEtiqueta = { id: ID_PRUEBA, nombre: "Etiqueta de prueba", categoryId: "", precio: 25000, codigo: "2000000000008" };

/** El máximo de etiquetas por impresión (más que eso tarda y casi seguro es un error de copias). */
const MAXIMO_DE_ETIQUETAS = 3000;
const ID_OTRO_TAMANO = "otro";
const CLAVE_CONFIG = "tumenusmart:etiquetas:config";

function sinTildes(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Elegir qué etiquetas imprimir, con qué tamaño de papel y en qué impresora, ver cómo queda y mandarlas a imprimir.
 *
 * Lo que se ve en la «Vista previa» es del tamaño REAL de la etiqueta (ampliado dos veces para mirarlo). Al imprimir, la página solo lleva las
 * etiquetas: en un rollo, cada una es una hoja del tamaño de la etiqueta; en una hoja A4, entran varias por hoja.
 */
export function Etiquetas({
  productos,
  categorias,
  sinCodigo,
  inicialId,
  prueba,
}: {
  productos: ProductoEtiqueta[];
  categorias: Categoria[];
  /** Cuántos productos todavía no tienen código (no se pueden imprimir). */
  sinCodigo: number;
  inicialId: string | null;
  prueba: boolean;
}) {
  const lista = useMemo(() => (prueba ? [PRODUCTO_PRUEBA, ...productos] : productos), [prueba, productos]);

  // Qué productos y cuántas copias de cada uno.
  const [seleccion, setSeleccion] = useState<Record<string, number>>(() =>
    prueba ? { [ID_PRUEBA]: 1 } : inicialId ? { [inicialId]: 1 } : {}
  );
  const [copiasPorDefecto, setCopiasPorDefecto] = useState("1");
  const [categoriaFiltro, setCategoriaFiltro] = useState("");
  const [busqueda, setBusqueda] = useState("");

  // El papel y la impresora (se recuerdan en este navegador: casi siempre se imprime con lo mismo).
  const [formatoId, setFormatoId] = useState("rollo-50x30");
  const [anchoOtro, setAnchoOtro] = useState("50");
  const [altoOtro, setAltoOtro] = useState("30");
  const [dpi, setDpi] = useState(203);
  const [verNombre, setVerNombre] = useState(true);
  const [verPrecio, setVerPrecio] = useState(true);
  const [verNumeros, setVerNumeros] = useState(true);
  const [empezarEn, setEmpezarEn] = useState("1");
  const [configLeida, setConfigLeida] = useState(false);

  useEffect(() => {
    try {
      const guardada = JSON.parse(localStorage.getItem(CLAVE_CONFIG) ?? "null");
      if (guardada && typeof guardada === "object") {
        if (typeof guardada.formatoId === "string" && (guardada.formatoId === ID_OTRO_TAMANO || FORMATOS_DE_ETIQUETA.some((f) => f.id === guardada.formatoId)))
          setFormatoId(guardada.formatoId);
        if (typeof guardada.anchoOtro === "string") setAnchoOtro(guardada.anchoOtro.slice(0, 5));
        if (typeof guardada.altoOtro === "string") setAltoOtro(guardada.altoOtro.slice(0, 5));
        if (RESOLUCIONES_DE_IMPRESORA.some((r) => r.dpi === guardada.dpi)) setDpi(guardada.dpi);
        if (typeof guardada.verNombre === "boolean") setVerNombre(guardada.verNombre);
        if (typeof guardada.verPrecio === "boolean") setVerPrecio(guardada.verPrecio);
        if (typeof guardada.verNumeros === "boolean") setVerNumeros(guardada.verNumeros);
      }
    } catch {
      // Sin memoria del navegador: queda lo de siempre.
    }
    setConfigLeida(true);
  }, []);

  useEffect(() => {
    if (!configLeida) return;
    try {
      localStorage.setItem(CLAVE_CONFIG, JSON.stringify({ formatoId, anchoOtro, altoOtro, dpi, verNombre, verPrecio, verNumeros }));
    } catch {
      // Igual que arriba.
    }
  }, [configLeida, formatoId, anchoOtro, altoOtro, dpi, verNombre, verPrecio, verNumeros]);

  const formato: FormatoDeEtiqueta =
    FORMATOS_DE_ETIQUETA.find((f) => f.id === formatoId) ?? {
      id: ID_OTRO_TAMANO,
      nombre: "Otro tamaño",
      ancho: Number(anchoOtro.replace(",", ".")),
      alto: Number(altoOtro.replace(",", ".")),
      tipo: "rollo",
    };

  // ---- la lista de productos ----
  const textoBuscado = sinTildes(busqueda.trim());
  const visibles = useMemo(
    () =>
      lista.filter((p) => {
        if (categoriaFiltro && p.categoryId !== categoriaFiltro) return false;
        if (textoBuscado && !sinTildes(`${p.nombre} ${p.codigo}`).includes(textoBuscado)) return false;
        return true;
      }),
    [lista, categoriaFiltro, textoBuscado]
  );

  function copiasIniciales(): number {
    const n = Math.floor(Number(copiasPorDefecto));
    return Number.isFinite(n) ? Math.min(99, Math.max(1, n)) : 1;
  }
  function alternar(id: string) {
    setSeleccion((s) => {
      const nueva = { ...s };
      if (nueva[id]) delete nueva[id];
      else nueva[id] = copiasIniciales();
      return nueva;
    });
  }
  function ponerCopias(id: string, texto: string) {
    const n = Math.floor(Number(texto));
    setSeleccion((s) => ({ ...s, [id]: Number.isFinite(n) ? Math.min(99, Math.max(1, n)) : 1 }));
  }
  // Solo se pueden imprimir los códigos EAN/UPC (los demás se guardan y se escanean, pero no hay cómo dibujarlos).
  const imprimiblesVisibles = visibles.filter((p) => tipoDeBarrasDe(p.codigo) !== null);
  function marcarVisibles() {
    setSeleccion((s) => {
      const nueva = { ...s };
      for (const p of imprimiblesVisibles) if (!nueva[p.id]) nueva[p.id] = copiasIniciales();
      return nueva;
    });
  }

  // ---- lo que se va a imprimir ----
  const elegidos = lista.filter((p) => (seleccion[p.id] ?? 0) > 0 && tipoDeBarrasDe(p.codigo) !== null);
  const cantidadDeEtiquetas = elegidos.reduce((s, p) => s + (seleccion[p.id] ?? 0), 0);
  const etiquetas = useMemo(
    () => elegidos.flatMap((p) => Array.from({ length: seleccion[p.id] ?? 0 }, () => p)).slice(0, MAXIMO_DE_ETIQUETAS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lista, seleccion]
  );

  // El diseño según el tipo de barras de cada código (un EAN-13 y un EAN-8 miden distinto).
  const tiposPresentes = useMemo(() => {
    const tipos = new Set<TipoBarras>();
    for (const p of elegidos) {
      const t = tipoDeBarrasDe(p.codigo);
      if (t) tipos.add(t);
    }
    if (tipos.size === 0) tipos.add("ean13");
    return [...tipos];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista, seleccion]);

  const disenos = useMemo(() => {
    const mapa = new Map<TipoBarras, DisenoDeEtiqueta>();
    for (const t of ["ean13", "ean8"] as const) {
      mapa.set(t, disenarEtiqueta({ ancho: formato.ancho, alto: formato.alto, dpi, verNombre, verPrecio, verNumeros, tipoBarras: t }));
    }
    return mapa;
  }, [formato.ancho, formato.alto, dpi, verNombre, verPrecio, verNumeros]);

  const errores = [...new Set(tiposPresentes.flatMap((t) => { const d = disenos.get(t); return d && !d.ok ? [d.error] : []; }))];
  const advertencias = [...new Set(tiposPresentes.flatMap((t) => { const d = disenos.get(t); return d && d.ok ? d.advertencias : []; }))];
  const sePuedeImprimir = etiquetas.length > 0 && errores.length === 0;

  const empezar = Math.floor(Number(empezarEn)) || 1;
  const paginas = useMemo(
    () => repartirEnPaginas(etiquetas, formato, empezar),
    // `formato` se arma en cada vuelta: se mira por sus datos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [etiquetas, formato.tipo, formato.columnas, formato.filas, empezar]
  );

  // La vista previa: la primera etiqueta elegida (o, si no se eligió ninguna, el primer producto de la lista para ver cómo quedaría).
  const productoPrevia = elegidos[0] ?? visibles[0] ?? lista[0] ?? null;
  const tipoPrevia = productoPrevia ? (tipoDeBarrasDe(productoPrevia.codigo) ?? "ean13") : "ean13";
  const disenoPrevia = disenos.get(tipoPrevia);
  const zoom = formato.ancho <= 60 ? 2 : formato.ancho <= 100 ? 1.5 : 1;

  return (
    <div className="flex flex-col gap-4">
      {/* Al imprimir se oculta todo esto y queda solo la zona de etiquetas de más abajo. */}
      <div className="flex flex-col gap-4 print:hidden">
        {prueba && (
          <Aviso titulo="Etiqueta de prueba" color="azul">
            Imprimila, pegala en cualquier cosa y escanealá con tu lector (en «Probar lector»). Si se lee, tu impresora y tu lector están listos.
            Esta etiqueta no es de un producto: su código no se vende.
          </Aviso>
        )}
        {sinCodigo > 0 && !prueba && (
          <Aviso titulo={`${sinCodigo} ${sinCodigo === 1 ? "producto no tiene" : "productos no tienen"} código todavía`} color="aviso">
            No aparecen en esta lista porque no hay qué imprimir. Generales el código en{" "}
            <a href="/admin/codigos-barras" className="font-semibold underline">
              Códigos de barras
            </a>
            .
          </Aviso>
        )}

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[28rem_minmax(0,1fr)]">
          {/* ---------------- izquierda: qué productos ---------------- */}
          <Tarjeta padding={false} className="!border-2 !border-azul/50 flex flex-col overflow-hidden">
            <div className="campos-grises flex flex-col gap-2 border-b border-linea p-3">
              <Entrada
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value.slice(0, 60))}
                placeholder="Buscar por nombre o código"
                aria-label="Buscar producto"
                autoComplete="off"
              />
              <Selector aria-label="Grupo" value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)}>
                <option value="">Todos los grupos</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Selector>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={marcarVisibles} disabled={imprimiblesVisibles.length === 0} className={clasesBoton("navegar", "sm")}>
                  Marcar los {imprimiblesVisibles.length} de la lista
                </button>
                <button type="button" onClick={() => setSeleccion({})} disabled={elegidos.length === 0} className={clasesBoton("suave", "sm")}>
                  Desmarcar todos
                </button>
                <label className="ml-auto flex items-center gap-1.5 text-[0.78rem] text-tinta-suave">
                  Copias
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={copiasPorDefecto}
                    onChange={(e) => setCopiasPorDefecto(e.target.value.slice(0, 2))}
                    className="h-8 w-14 rounded-lg border border-linea bg-superficie px-2 text-center text-[0.85rem] text-tinta"
                    aria-label="Copias de cada etiqueta al marcar"
                  />
                </label>
              </div>
            </div>

            <div className="max-h-[32rem] overflow-y-auto">
              {visibles.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-tinta-suave">
                  {lista.length === 0 ? "Todavía no hay productos con código para imprimir." : "Ningún producto coincide con lo elegido."}
                </p>
              ) : (
                <ul>
                  {visibles.map((p) => {
                    const copias = seleccion[p.id] ?? 0;
                    const imprimible = tipoDeBarrasDe(p.codigo) !== null;
                    return (
                      <li key={p.id} className={`flex items-center gap-2 border-b border-linea-fina px-3 py-2 text-[0.84rem] ${copias > 0 ? "bg-brand-light" : ""}`}>
                        <input
                          type="checkbox"
                          id={`etiqueta-${p.id}`}
                          checked={copias > 0}
                          disabled={!imprimible}
                          onChange={() => alternar(p.id)}
                          className="h-4 w-4 flex-none accent-azul"
                        />
                        <label htmlFor={`etiqueta-${p.id}`} className={`min-w-0 flex-1 cursor-pointer ${imprimible ? "" : "opacity-60"}`}>
                          <span className="block font-medium">{p.nombre}</span>
                          <span className="cifra block text-[0.72rem] text-tinta-suave">
                            {p.codigo}
                            {!imprimible && " · no es un EAN/UPC: no se imprime"}
                          </span>
                        </label>
                        {copias > 0 && (
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={copias}
                            onChange={(e) => ponerCopias(p.id, e.target.value)}
                            className="h-8 w-14 flex-none rounded-lg border border-linea bg-superficie px-2 text-center text-[0.85rem] text-tinta"
                            aria-label={`Copias de ${p.nombre}`}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Tarjeta>

          {/* ---------------- derecha: papel, vista previa e imprimir ---------------- */}
          <div className="flex flex-col gap-4">
            <Tarjeta className="campos-grises flex flex-col gap-3 !border-2 !border-azul/50">
              <p className="rotulo text-[0.8rem] font-bold">Papel e impresora</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-[0.8rem] font-medium text-tinta-media">
                  Tamaño de la etiqueta
                  <Selector value={formatoId} onChange={(e) => setFormatoId(e.target.value)} aria-label="Tamaño de la etiqueta">
                    {FORMATOS_DE_ETIQUETA.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nombre}
                      </option>
                    ))}
                    <option value={ID_OTRO_TAMANO}>Otro tamaño (rollo)…</option>
                  </Selector>
                </label>
                <label className="flex flex-col gap-1 text-[0.8rem] font-medium text-tinta-media">
                  Resolución de la impresora
                  <Selector value={dpi} onChange={(e) => setDpi(Number(e.target.value))} aria-label="Resolución de la impresora">
                    {RESOLUCIONES_DE_IMPRESORA.map((r) => (
                      <option key={r.dpi} value={r.dpi}>
                        {r.nombre}
                      </option>
                    ))}
                  </Selector>
                </label>
              </div>
              {formatoId === ID_OTRO_TAMANO && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-[0.8rem] font-medium text-tinta-media">
                    Ancho (mm)
                    <Entrada inputMode="decimal" value={anchoOtro} onChange={(e) => setAnchoOtro(e.target.value.replace(/[^\d.,]/g, "").slice(0, 5))} />
                  </label>
                  <label className="flex flex-col gap-1 text-[0.8rem] font-medium text-tinta-media">
                    Alto (mm)
                    <Entrada inputMode="decimal" value={altoOtro} onChange={(e) => setAltoOtro(e.target.value.replace(/[^\d.,]/g, "").slice(0, 5))} />
                  </label>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.84rem] text-tinta">
                <span className="text-[0.8rem] font-medium text-tinta-media">Qué lleva:</span>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input type="checkbox" checked={verNombre} onChange={(e) => setVerNombre(e.target.checked)} className="h-4 w-4 accent-azul" /> Nombre
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input type="checkbox" checked={verPrecio} onChange={(e) => setVerPrecio(e.target.checked)} className="h-4 w-4 accent-azul" /> Precio
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input type="checkbox" checked={verNumeros} onChange={(e) => setVerNumeros(e.target.checked)} className="h-4 w-4 accent-azul" /> Números del código
                </label>
              </div>
              {formato.tipo === "hoja" && (
                <label className="flex items-center gap-2 text-[0.8rem] font-medium text-tinta-media">
                  Empezar en la etiqueta N°
                  <input
                    type="number"
                    min={1}
                    max={etiquetasPorHoja(formato)}
                    value={empezarEn}
                    onChange={(e) => setEmpezarEn(e.target.value.slice(0, 3))}
                    className="h-8 w-16 rounded-lg border border-linea bg-superficie px-2 text-center text-[0.85rem] text-tinta"
                  />
                  <span className="font-normal text-tinta-suave">(para aprovechar una hoja que ya usaste en parte; hay {etiquetasPorHoja(formato)} por hoja)</span>
                </label>
              )}
            </Tarjeta>

            <Tarjeta className="flex flex-col gap-3 !border-2 !border-azul/50">
              <p className="rotulo text-[0.8rem] font-bold">Vista previa (tamaño real, ampliada {zoom} veces)</p>
              {productoPrevia && disenoPrevia?.ok ? (
                <div className="overflow-x-auto rounded-lg bg-papel-hundido p-3">
                  <div style={{ width: `${formato.ancho * zoom}mm`, height: `${formato.alto * zoom}mm` }}>
                    <div
                      style={{ transform: `scale(${zoom})`, transformOrigin: "top left", width: `${formato.ancho}mm`, height: `${formato.alto}mm`, boxShadow: "0 0 0 0.3mm #9ca3af" }}
                    >
                      <EtiquetaDeProducto producto={productoPrevia} formato={formato} diseno={disenoPrevia} verNombre={verNombre} verPrecio={verPrecio} />
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-[0.85rem] text-tinta-suave">
                  {errores[0] ?? (disenoPrevia && !disenoPrevia.ok ? disenoPrevia.error : "Elegí un producto para ver cómo queda su etiqueta.")}
                </p>
              )}

              {disenoPrevia?.ok && (
                <p className="text-[0.78rem] text-tinta-suave">
                  Cada barra fina ocupa {disenoPrevia.puntosPorModulo} puntos de la impresora ({disenoPrevia.moduloMm.toFixed(2).replace(".", ",")} mm).
                </p>
              )}
              {errores.map((e) => (
                <p key={e} role="alert" className="text-[0.84rem] font-medium text-peligro">
                  {e}
                </p>
              ))}
              {advertencias.map((a) => (
                <p key={a} className="text-[0.82rem] font-medium text-aviso">
                  ⚠ {a}
                </p>
              ))}

              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => window.print()} disabled={!sePuedeImprimir} className={clasesBoton("principal", "md")}>
                  🖨 Imprimir {etiquetas.length === 1 ? "la etiqueta" : `${etiquetas.length} etiquetas`}
                </button>
                <span className="text-[0.8rem] text-tinta-suave">
                  {elegidos.length} {elegidos.length === 1 ? "producto" : "productos"}
                  {formato.tipo === "hoja" && paginas.length > 0 && ` · ${paginas.length} ${paginas.length === 1 ? "hoja" : "hojas"}`}
                </span>
                {cantidadDeEtiquetas > MAXIMO_DE_ETIQUETAS && (
                  <span className="text-[0.8rem] font-medium text-peligro">Son demasiadas: se imprimen las primeras {MAXIMO_DE_ETIQUETAS}.</span>
                )}
              </div>

              <div className="rounded-lg border border-linea bg-papel-suave p-3 text-[0.8rem] leading-relaxed text-tinta-media">
                <p className="font-semibold text-tinta">Para imprimir en la térmica</p>
                <ol className="mt-1 list-decimal pl-5">
                  <li>
                    En la ventana de impresión elegí tu impresora de etiquetas y el tamaño de papel de la etiqueta (la página ya lo pide: {formato.tipo === "hoja" ? "A4" : `${formato.ancho} × ${formato.alto} mm`}).
                  </li>
                  <li>Márgenes: «Ninguno». Escala: 100 % (sin «ajustar a la página»).</li>
                  <li>Imprimí una sola etiqueta primero, pegala y escanealá antes de imprimir las demás.</li>
                </ol>
              </div>
            </Tarjeta>
          </div>
        </div>
      </div>

      {/* ---- Lo único que sale en el papel: las etiquetas ---- */}
      <style>{`@media print { @page { size: ${formato.tipo === "hoja" ? "A4" : `${formato.ancho}mm ${formato.alto}mm`}; margin: 0; } html, body { margin: 0 !important; background: #ffffff !important; } }`}</style>
      <div className="hidden print:block" aria-hidden>
        {sePuedeImprimir &&
          paginas.map((pagina, i) => {
            const ultima = i === paginas.length - 1;
            if (formato.tipo === "rollo") {
              const p = pagina[0];
              const d = p ? disenos.get(tipoDeBarrasDe(p.codigo) ?? "ean13") : null;
              if (!p || !d || !d.ok) return null;
              return (
                <div key={i} style={{ width: `${formato.ancho}mm`, height: `${formato.alto}mm`, overflow: "hidden", breakAfter: ultima ? "auto" : "page" }}>
                  <EtiquetaDeProducto producto={p} formato={formato} diseno={d} verNombre={verNombre} verPrecio={verPrecio} />
                </div>
              );
            }
            return (
              <div
                key={i}
                style={{
                  width: "210mm",
                  height: "297mm",
                  display: "grid",
                  gridTemplateColumns: `repeat(${formato.columnas}, ${formato.ancho}mm)`,
                  gridAutoRows: `${formato.alto}mm`,
                  alignContent: "start",
                  overflow: "hidden",
                  breakAfter: ultima ? "auto" : "page",
                }}
              >
                {pagina.map((p, j) => {
                  const d = p ? disenos.get(tipoDeBarrasDe(p.codigo) ?? "ean13") : null;
                  return (
                    <div key={j} style={{ width: `${formato.ancho}mm`, height: `${formato.alto}mm`, overflow: "hidden" }}>
                      {p && d && d.ok && <EtiquetaDeProducto producto={p} formato={formato} diseno={d} verNombre={verNombre} verPrecio={verPrecio} />}
                    </div>
                  );
                })}
              </div>
            );
          })}
      </div>
    </div>
  );
}

/** Una etiqueta: el nombre, el código de barras con sus números y el precio, centrados, en el tamaño exacto del papel. */
function EtiquetaDeProducto({
  producto,
  formato,
  diseno,
  verNombre,
  verPrecio,
}: {
  producto: ProductoEtiqueta;
  formato: FormatoDeEtiqueta;
  diseno: Extract<DisenoDeEtiqueta, { ok: true }>;
  verNombre: boolean;
  verPrecio: boolean;
}) {
  return (
    <div
      style={{
        width: `${formato.ancho}mm`,
        height: `${formato.alto}mm`,
        padding: `${diseno.margenVerticalMm}mm ${diseno.margenLateralMm}mm`,
        boxSizing: "border-box",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.4mm",
        background: "#ffffff",
        color: "#000000",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      {verNombre && (
        <div
          style={{
            width: "100%",
            textAlign: "center",
            fontWeight: 700,
            fontSize: `${diseno.tamNombreMm}mm`,
            lineHeight: 1.15,
            maxHeight: `${diseno.tamNombreMm * 1.15 * diseno.lineasNombre}mm`,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: diseno.lineasNombre,
            WebkitBoxOrient: "vertical",
          }}
        >
          {producto.nombre}
        </div>
      )}
      <BarrasSvg codigo={producto.codigo} moduloMm={diseno.moduloMm} altoBarrasMm={diseno.altoBarrasMm} altoNumerosMm={diseno.altoNumerosMm} />
      {verPrecio && <div style={{ fontWeight: 800, fontSize: `${diseno.tamPrecioMm}mm`, lineHeight: 1.2 }}>{formatearGuarani(producto.precio)}</div>}
    </div>
  );
}
