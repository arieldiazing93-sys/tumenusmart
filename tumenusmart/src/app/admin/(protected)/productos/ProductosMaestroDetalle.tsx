"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Tarjeta, Selector, clasesBoton } from "@/components/ui";
import { BotonesMover } from "@/components/BotonesMover";
import { formatearGuarani } from "@/lib/format";
import { moverProducto } from "./actions";
import { DisponibleToggle } from "./DisponibleToggle";
import { CrearProductoForm } from "./CrearProductoForm";

export type ProductoFila = {
  id: string;
  nombre: string;
  categoryId: string;
  precio: number;
  disponible: boolean;
  destacado: boolean;
};

type Categoria = { id: string; nombre: string };
type AreaImpresion = { id: string; nombre: string };
type Almacen = { id: string; nombre: string };

/** "" = todas las categorías. */
const TODAS = "";

/**
 * La pantalla de Productos en dos paneles, igual que Insumos: a la izquierda se
 * elige una categoría y abajo aparecen sus productos; con doble clic en uno, a
 * la derecha se abre toda su información (datos, precio, foto, agregados,
 * receta…).
 *
 * El filtro de categoría se hace acá, en el navegador. La ficha de la derecha
 * es de servidor (trae el costo, la receta, los grupos): al abrir un producto se
 * pone su id en la dirección (`?producto=`) y el servidor manda la ficha lista
 * en `detalle`.
 */
export function ProductosMaestroDetalle({
  productos,
  categorias,
  areasImpresion,
  almacenes,
  puedeEditar,
  categoriaInicial,
  abiertoId,
  detalle,
}: {
  productos: ProductoFila[];
  categorias: Categoria[];
  areasImpresion: AreaImpresion[];
  /** Solo los activos, el más antiguo primero (queda elegido de entrada en un producto nuevo). */
  almacenes: Almacen[];
  /** Quien solo puede ver la carta (y marcar agotados) no abre la ficha ni crea ni reordena. */
  puedeEditar: boolean;
  /** La categoría que viene en la dirección ("" = todas). */
  categoriaInicial: string;
  /** El producto que viene en la dirección, ya comprobado en el servidor. */
  abiertoId: string | null;
  /** La ficha completa del producto abierto, armada en el servidor. */
  detalle: ReactNode;
}) {
  const router = useRouter();
  const [abriendo, iniciarApertura] = useTransition();
  const [categoriaFiltro, setCategoriaFiltro] = useState(categoriaInicial);
  const [creando, setCreando] = useState(false);
  // El producto al que se le hizo doble clic y todavía está llegando del servidor.
  const [esperandoId, setEsperandoId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Si la dirección cambia de categoría (por ejemplo al guardar un producto que
  // se pasó a otra), la lista la sigue.
  useEffect(() => {
    setCategoriaFiltro(categoriaInicial);
  }, [categoriaInicial]);

  // Llegó la ficha pedida (o falló el pedido): ya no hay nada esperando. Y si se
  // abrió un producto desde la dirección (recién creado o guardado), se cierra
  // el formulario de "Nuevo producto".
  useEffect(() => {
    if (!abriendo) setEsperandoId(null);
  }, [abriendo, abiertoId]);
  useEffect(() => {
    if (abiertoId) setCreando(false);
  }, [abiertoId]);

  const indiceDeCategoria = useMemo(() => new Map(categorias.map((c, i) => [c.id, i])), [categorias]);
  const nombreDeCategoria = useMemo(() => new Map(categorias.map((c) => [c.id, c.nombre])), [categorias]);

  const conteoPorCategoria = useMemo(() => {
    const conteo = new Map<string, number>();
    for (const p of productos) conteo.set(p.categoryId, (conteo.get(p.categoryId) ?? 0) + 1);
    return conteo;
  }, [productos]);

  const visibles = useMemo(() => {
    if (categoriaFiltro !== TODAS) return productos.filter((p) => p.categoryId === categoriaFiltro);
    // En "todas", agrupados por categoría y en el orden de la carta (el orden
    // de adentro de cada una ya viene del servidor; el sort es estable).
    return [...productos].sort(
      (a, b) => (indiceDeCategoria.get(a.categoryId) ?? 0) - (indiceDeCategoria.get(b.categoryId) ?? 0)
    );
  }, [productos, categoriaFiltro, indiceDeCategoria]);

  // Las flechas solo tienen sentido dentro de UNA categoría: el orden es el de
  // la carta pública de esa categoría.
  const conFlechas = puedeEditar && categoriaFiltro !== TODAS && visibles.length > 1;

  const resaltadoId = esperandoId ?? abiertoId;

  // En pantalla angosta el panel queda debajo de la lista: se lo trae a la
  // vista, si no el doble clic parecería no hacer nada.
  useEffect(() => {
    if (!abiertoId && !creando) return;
    if (window.matchMedia("(max-width: 1279px)").matches) {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [abiertoId, creando]);

  function abrir(id: string) {
    if (!puedeEditar) return;
    if (id === abiertoId) {
      setCreando(false);
      return;
    }
    setCreando(false);
    setEsperandoId(id);
    const params = new URLSearchParams();
    params.set("categoria", categoriaFiltro === TODAS ? "todas" : categoriaFiltro);
    params.set("producto", id);
    iniciarApertura(() => {
      router.push(`/admin/productos?${params.toString()}`, { scroll: false });
    });
  }

  const lista = (
    <Tarjeta padding={false} className="!border-2 !border-azul/50 flex flex-col overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-linea p-3">
        <Selector
          aria-label="Categoría"
          value={categoriaFiltro}
          onChange={(e) => setCategoriaFiltro(e.target.value)}
        >
          <option value={TODAS}>Todas las categorías ({productos.length})</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre} ({conteoPorCategoria.get(c.id) ?? 0})
            </option>
          ))}
        </Selector>
        {conFlechas && (
          <p className="text-[0.76rem] leading-snug text-tinta-media">
            Este es el orden en que tu cliente ve los productos de esta categoría. Movelos con las flechas.
          </p>
        )}
      </div>

      <div className="max-h-[32rem] overflow-y-auto">
        {visibles.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-tinta-suave">
            {productos.length === 0 ? "Todavía no cargaste ningún producto." : "No hay productos en esta categoría."}
          </p>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 bg-superficie">
              <tr className="border-b border-linea text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
                {conFlechas && (
                  <th scope="col" className="px-2 py-2">
                    <span className="sr-only">Orden</span>
                  </th>
                )}
                <th scope="col" className="px-3 py-2">
                  Descripción
                </th>
                <th scope="col" className="hidden px-2 py-2 text-right sm:table-cell">
                  Precio
                </th>
                <th scope="col" className="px-2 py-2">
                  <span className="sr-only">Disponible</span>
                </th>
                {puedeEditar && (
                  <th scope="col" className="px-2 py-2">
                    <span className="sr-only">Ver</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {visibles.map((p, i) => (
                <tr
                  key={p.id}
                  tabIndex={puedeEditar ? 0 : undefined}
                  title={puedeEditar ? "Doble clic para ver todos los datos" : undefined}
                  onDoubleClick={puedeEditar ? () => abrir(p.id) : undefined}
                  onKeyDown={
                    puedeEditar
                      ? (e) => {
                          if (e.key === "Enter" && e.target === e.currentTarget) abrir(p.id);
                        }
                      : undefined
                  }
                  className={`border-b border-linea-fina text-[0.84rem] outline-none transition-colors focus-visible:bg-papel-hundido ${
                    puedeEditar ? "cursor-pointer" : ""
                  } ${resaltadoId === p.id ? "bg-brand-light text-brand-texto" : puedeEditar ? "hover:bg-papel-suave" : ""} ${
                    p.disponible ? "" : "opacity-70"
                  }`}
                >
                  {conFlechas && (
                    // Doble clic sobre las flechas o el interruptor no abre la ficha.
                    <td className="px-2 py-1.5" onDoubleClick={(e) => e.stopPropagation()}>
                      <BotonesMover
                        id={p.id}
                        accion={moverProducto}
                        esPrimero={i === 0}
                        esUltimo={i === visibles.length - 1}
                        etiqueta={p.nombre}
                      />
                    </td>
                  )}
                  <td className="px-3 py-2 font-medium">
                    <span className="break-words">
                      {p.destacado && <span title="Destacado">⭐ </span>}
                      {p.nombre}
                    </span>
                    {categoriaFiltro === TODAS && (
                      <span className="block text-[0.72rem] font-normal text-tinta-suave">
                        {nombreDeCategoria.get(p.categoryId) ?? ""}
                      </span>
                    )}
                    {/* En el celular no hay lugar para la columna del precio: va debajo del nombre. */}
                    <span className="cifra block text-[0.76rem] font-normal text-tinta-media sm:hidden">
                      {formatearGuarani(p.precio)}
                    </span>
                  </td>
                  <td className="cifra hidden whitespace-nowrap px-2 py-2 text-right sm:table-cell">
                    {formatearGuarani(p.precio)}
                  </td>
                  <td className="px-2 py-1.5" onDoubleClick={(e) => e.stopPropagation()}>
                    <DisponibleToggle id={p.id} disponible={p.disponible} nombre={p.nombre} />
                  </td>
                  {puedeEditar && (
                    <td className="px-2 py-1 text-right">
                      <button type="button" onClick={() => abrir(p.id)} className={clasesBoton("suave", "sm")}>
                        Ver
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {puedeEditar && (
        <p className="border-t border-linea px-3 py-2 text-[0.74rem] text-tinta-suave">
          Doble clic en un producto, o el botón Ver, para abrir todos sus datos.
        </p>
      )}
    </Tarjeta>
  );

  // Quien no puede editar solo ve la lista (y el interruptor de "Se acabó").
  if (!puedeEditar) return <div className="max-w-3xl">{lista}</div>;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setCreando(true)}
          className={clasesBoton("nuevo")}
        >
          + Nuevo producto
        </button>
        <span className="text-xs text-tinta-suave">
          {productos.length} {productos.length === 1 ? "producto" : "productos"} en total
        </span>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[28rem_minmax(0,1fr)]">
        {/* ---------------- izquierda: categoría + lista ---------------- */}
        {lista}

        {/* ---------------- derecha: toda la información del producto ---------------- */}
        <div ref={panelRef} className="min-w-0">
          {creando ? (
            <Tarjeta className="!border-2 !border-azul/50 flex flex-col gap-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[1.1rem] font-semibold tracking-titular text-tinta">Nuevo producto</h2>
                <button type="button" onClick={() => setCreando(false)} className={clasesBoton("peligro", "sm")}>
                  Cancelar
                </button>
              </div>
              <CrearProductoForm
                categorias={categorias}
                categoriaActivaId={categoriaFiltro !== TODAS ? categoriaFiltro : undefined}
                areasImpresion={areasImpresion}
                almacenes={almacenes}
              />
            </Tarjeta>
          ) : esperandoId && esperandoId !== abiertoId ? (
            <div className="rounded-xl border border-dashed border-linea bg-papel-suave px-6 py-14 text-center">
              <p className="text-[0.95rem] font-semibold tracking-titular text-tinta">Abriendo el producto…</p>
            </div>
          ) : abiertoId && detalle ? (
            detalle
          ) : (
            <div className="rounded-xl border border-dashed border-linea bg-papel-suave px-6 py-14 text-center">
              <p className="text-[0.95rem] font-semibold tracking-titular text-tinta">Ningún producto abierto</p>
              <p className="mx-auto mt-1.5 max-w-sm text-[0.85rem] leading-snug text-tinta-media">
                Elegí una categoría, hacé doble clic en un producto de la lista para ver y editar todos sus
                datos (precio, foto, agregados, receta…), o creá uno nuevo con el botón de arriba.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
