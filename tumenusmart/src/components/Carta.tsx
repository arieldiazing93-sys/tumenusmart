"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCart } from "./CartProvider";
import { construirKey } from "@/lib/cart-types";
import { formatearGuarani } from "@/lib/format";
import { MitadYMitadPicker } from "./MitadYMitadPicker";
import { FichaProducto } from "./FichaProducto";
import { IconoFoto } from "./iconos";
import {
  barraDeCarta,
  filtrarCarta,
  necesitaFicha,
  type CategoriaCarta,
  type ProductoCarta,
} from "@/lib/carta";

export type { CategoriaCarta } from "@/lib/carta";

/**
 * La carta del cliente.
 *
 * Todo lo interactivo vive acá: el buscador, las categorías que se siguen solas
 * al desplazarse, y la ficha del producto. El servidor solo entrega los datos
 * ya listos.
 */
export function Carta({
  categorias,
  estilo,
}: {
  categorias: CategoriaCarta[];
  /** "tarjetas" para locales con fotos profesionales; "lista" para el resto. */
  estilo: string;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState<ProductoCarta | null>(null);
  const [categoriaActiva, setCategoriaActiva] = useState(categorias[0]?.id ?? "");
  const refsSecciones = useRef<Record<string, HTMLElement | null>>({});
  // La barra de arriba (buscador + chips) se mide de verdad en vez de
  // escribir su alto a mano: cambia según haya buscador, haya chips o se esté
  // buscando. Un número fijo dejaría la banda de la categoría flotando o
  // tapada en cuanto alguna de esas tres cosas cambie.
  const refBarra = useRef<HTMLDivElement | null>(null);
  const [altoBarra, setAltoBarra] = useState(0);
  const tarjetas = estilo === "tarjetas";

  const { hayBuscador, hayBarra } = barraDeCarta(categorias);
  const buscando = hayBuscador && busqueda.trim().length > 0;
  const filtradas = useMemo(
    () => (hayBuscador ? filtrarCarta(categorias, busqueda) : categorias),
    [categorias, busqueda, hayBuscador]
  );

  // La categoría del chip se sigue sola mientras se baja por la carta.
  useEffect(() => {
    if (buscando) return;
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) setCategoriaActiva(e.target.id.replace("cat-", ""));
        }
      },
      { rootMargin: "-120px 0px -68% 0px" }
    );
    for (const el of Object.values(refsSecciones.current)) {
      if (el) observador.observe(el);
    }
    return () => observador.disconnect();
  }, [categorias, buscando]);

  useEffect(() => {
    const el = refBarra.current;
    if (!el) {
      setAltoBarra(0);
      return;
    }
    const medir = () => setAltoBarra(el.getBoundingClientRect().height);
    medir();
    // ResizeObserver y no un solo `medir()`: la barra se achica cuando se
    // empieza a buscar (se ocultan los chips) y crece al volver.
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hayBarra]);

  function irA(id: string) {
    refsSecciones.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const hayResultados = filtradas.some((c) => c.productos.length > 0);

  return (
    <>
      {/* buscador y categorías, pegados arriba */}
      {hayBarra && (
      <div
        ref={refBarra}
        className="sticky top-0 z-20 -mx-4 border-b border-linea bg-papel/95 px-4 backdrop-blur"
      >
        {hayBuscador && (
        <div className="relative py-2.5">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tinta-suave"
          >
            ⌕
          </span>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar en la carta"
            aria-label="Buscar en la carta"
            className="w-full rounded-lg border border-linea bg-papel-suave py-2.5 pl-8 pr-3 text-[0.9rem] focus:border-brand focus:bg-white focus:outline-none"
          />
        </div>
        )}

        {!buscando && categorias.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto pb-2.5 pt-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {categorias.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => irA(c.id)}
                aria-current={categoriaActiva === c.id}
                className={`flex-none whitespace-nowrap rounded-full border px-3 py-1.5 text-[0.82rem] font-medium transition-colors ${
                  categoriaActiva === c.id
                    ? "border-tinta bg-tinta text-white"
                    : "border-linea bg-white text-tinta-media"
                }`}
              >
                {c.nombre}
              </button>
            ))}
          </div>
        )}
      </div>
      )}

      {!hayResultados && (
        <p className="py-14 text-center text-[0.9rem] text-tinta-suave">
          No encontré nada con eso.
        </p>
      )}

      <div className="flex flex-col">
        {filtradas.map((c) => (
          <section
            key={c.id}
            id={`cat-${c.id}`}
            ref={(el) => {
              refsSecciones.current[c.id] = el;
            }}
            className="scroll-mt-28 pt-6"
          >
            {/*
              La cabecera es una tarjeta redondeada, no un título suelto — con
              el título solo, dos categorías seguidas se leían como una lista
              corrida. Ya no va de borde a borde (dejó de usar -mx-4): con las
              esquinas redondeadas se lee como una pieza aparte, separada del
              contenido, en vez de una franja pegada a la pantalla.

              Queda pegada arriba mientras se baja: con seis productos en
              pantalla, para el tercero ya no se sabe en qué grupo se está. El
              `top` sale de medir la barra de chips, y el z-10 la deja pasar por
              DEBAJO de esa barra (que es z-20) en vez de chocar con ella.

              El fondo es opaco a propósito. Con transparencia, los productos se
              verían pasar por atrás al desplazarse.
            */}
            <div
              style={{ top: altoBarra }}
              className="sticky z-10 rounded-xl bg-brand-tinte px-4 py-2.5"
            >
              <h2 className="font-mono text-[1.05rem] font-bold tracking-titular text-tinta">
                {c.nombre}
              </h2>
              <p className="text-[0.75rem] text-brand-texto">
                {c.productos.length} {c.productos.length === 1 ? "opción" : "opciones"}
              </p>
            </div>

            <div className={tarjetas ? "mt-4 flex flex-col gap-6" : "mt-2"}>
              {c.productos.map((p) => (
                <FilaProducto
                  key={p.id}
                  producto={p}
                  tarjetas={tarjetas}
                  onAbrir={() => setAbierto(p)}
                />
              ))}
            </div>

            {c.grupos.map((g) => (
              <div key={g.clave} className="mt-4">
                <MitadYMitadPicker grupoNombre={g.nombreVisible} productos={g.productos} />
              </div>
            ))}
          </section>
        ))}
      </div>

      <FichaProducto producto={abierto} onCerrar={() => setAbierto(null)} />
    </>
  );
}

/**
 * Una fila de la carta.
 *
 * Si el producto no tiene opciones ni ingredientes, el "+" lo agrega de un
 * toque. Si los tiene, abre la ficha. Esa distinción le saca varios toques a
 * cada pedido, y cada toque de menos es gente que no abandona a mitad de camino.
 */
function FilaProducto({
  producto,
  tarjetas,
  onAbrir,
}: {
  producto: ProductoCarta;
  tarjetas: boolean;
  onAbrir: () => void;
}) {
  const { agregarItem } = useCart();
  const [late, setLate] = useState(false);
  const conFicha = necesitaFicha(producto);

  function agregarDirecto(e: React.MouseEvent) {
    e.stopPropagation();
    agregarItem({
      key: construirKey(producto.id, [], []),
      productId: producto.id,
      nombreProducto: producto.nombre,
      precioBase: producto.precio,
      opciones: [],
      cantidad: 1,
      imagenUrl: producto.imagenUrl,
    });
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(8);
    setLate(true);
    window.setTimeout(() => setLate(false), 450);
  }

  const foto = producto.imagenUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={producto.imagenUrl}
      alt={producto.nombre}
      loading="lazy"
      decoding="async"
      className={
        tarjetas
          ? "h-44 w-full rounded-xl object-cover"
          : "h-16 w-16 flex-none rounded-lg object-cover"
      }
    />
  ) : (
    <span
      aria-hidden="true"
      className={`flex items-center justify-center text-tinta-suave/35 ${
        tarjetas
          ? "h-44 w-full rounded-xl bg-papel-hundido"
          : "h-16 w-16 flex-none rounded-lg bg-papel-hundido"
      }`}
    >
      <IconoFoto />
    </span>
  );

  return (
    <button
      type="button"
      onClick={conFicha ? onAbrir : undefined}
      className={`w-full text-left ${
        tarjetas
          ? "flex flex-col"
          : "flex items-start gap-3 border-b border-linea-fina py-3.5 last:border-0"
      }`}
    >
      {foto}

      <span className={tarjetas ? "block w-full pt-2.5" : "block min-w-0 flex-1"}>
        <span
          className={`block font-semibold leading-tight tracking-titular ${
            tarjetas ? "text-base" : "text-[0.9rem]"
          }`}
        >
          {producto.nombre}
        </span>
        {producto.descripcion && (
          <span
            className={`mt-0.5 block leading-snug text-tinta-suave ${
              tarjetas ? "text-[0.82rem]" : "text-[0.78rem]"
            }`}
          >
            {producto.descripcion}
          </span>
        )}

        <span className="mt-1.5 flex items-center justify-between gap-2">
          <span className={`cifra font-semibold ${tarjetas ? "text-[0.98rem]" : "text-[0.88rem]"}`}>
            {formatearGuarani(producto.precio)}
          </span>

          {conFicha ? (
            // Antes esto era texto gris de 0.72rem con una flechita: se leía
            // como un comentario al pie y no como algo que se puede tocar.
            // Ahora es un botón de verdad, del mismo alto que el "+", con
            // fondo y sin flecha. Quien no ve bien tiene que poder distinguir
            // qué se toca sin forzar la vista.
            <span className="flex h-9 flex-none items-center whitespace-nowrap rounded-lg border border-brand/40 bg-brand-light px-3.5 text-[0.82rem] font-semibold text-brand-texto transition-transform active:scale-95">
              Elegir agregados
            </span>
          ) : (
            <span
              role="button"
              tabIndex={0}
              aria-label={`Agregar ${producto.nombre}`}
              onClick={agregarDirecto}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  agregarDirecto(e as unknown as React.MouseEvent);
                }
              }}
              className={`flex h-9 w-9 flex-none items-center justify-center rounded-lg border text-xl leading-none transition-transform active:scale-90 ${
                late
                  ? "animate-[latir_0.45s_ease] border-brand bg-brand text-white"
                  : "border-brand/40 bg-brand-light text-brand-texto"
              }`}
            >
              +
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
