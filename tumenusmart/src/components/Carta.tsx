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
  const [abiertoElegido, setAbierto] = useState<ProductoCarta | null>(null);
  const [categoriaActiva, setCategoriaActiva] = useState(categorias[0]?.id ?? "");
  // La ficha abierta, con los datos de AHORA: si el precio cambia (empieza o termina una promoción) con la ficha abierta, la ficha lo sigue.
  const abierto = useMemo(
    () =>
      abiertoElegido
        ? (categorias.flatMap((c) => c.productos).find((p) => p.id === abiertoElegido.id) ?? abiertoElegido)
        : null,
    [abiertoElegido, categorias]
  );
  // Qué categorías ya se mostraron alguna vez: cada bloque entra con una
  // animación suave la PRIMERA vez que aparece en pantalla al bajar por la
  // carta, y se queda así — no vuelve a jugar la animación si el cliente
  // sube y baja de nuevo. Es por categoría completa, no producto por
  // producto: animar cada tarjeta por separado en una carta con muchos
  // productos se siente lento en vez de prolijo.
  const [revelados, setRevelados] = useState<Set<string>>(new Set());
  const refsSecciones = useRef<Record<string, HTMLElement | null>>({});
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

  // La entrada animada de cada categoría, la primera vez que se cruza con
  // la pantalla. Un observador aparte del de arriba porque este es "de un
  // solo tiro" (se desconecta de cada sección apenas la revela) — el de
  // arriba en cambio sigue mirando todo el tiempo, para saber en qué
  // categoría está el cliente.
  useEffect(() => {
    if (buscando) return;
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (!e.isIntersecting) continue;
          const id = e.target.id.replace("cat-", "");
          setRevelados((previos) => {
            if (previos.has(id)) return previos;
            return new Set(previos).add(id);
          });
          observador.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px" }
    );
    for (const el of Object.values(refsSecciones.current)) {
      if (el) observador.observe(el);
    }
    return () => observador.disconnect();
  }, [categorias, buscando]);

  function irA(id: string) {
    refsSecciones.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const hayResultados = filtradas.some((c) => c.productos.length > 0);

  return (
    <>
      {/* buscador y categorías, pegados arriba */}
      {hayBarra && (
        <div className="sticky top-0 z-20 -mx-4 border-b border-linea/60 bg-papel-suave/95 px-4 backdrop-blur">
          {hayBuscador && (
            <div className="relative mt-3">
              <IconoBuscarCarta className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-tinta-suave" />
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar en la carta"
                aria-label="Buscar en la carta"
                className="h-12 w-full rounded-2xl bg-superficie pr-4 text-[0.95rem] text-tinta shadow-sm ring-1 ring-linea placeholder:text-tinta-suave focus:outline-none focus:ring-2 focus:ring-brand"
                style={{ paddingLeft: "2.75rem" }}
              />
            </div>
          )}

          {!buscando && categorias.length > 1 && (
            <div className="flex gap-2 overflow-x-auto py-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {categorias.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => irA(c.id)}
                  aria-current={categoriaActiva === c.id}
                  className={`h-10 flex-none whitespace-nowrap rounded-full px-4 text-[0.88rem] font-semibold transition-all active:scale-95 ${
                    categoriaActiva === c.id
                      ? "bg-brand text-white shadow-sm"
                      : "bg-superficie text-tinta-media ring-1 ring-linea hover:text-brand-texto hover:ring-brand/50"
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
            className={`scroll-mt-28 pt-7 ${
              buscando || revelados.has(c.id)
                ? // Sin fill-mode: no deja un `transform` colgado después de terminar (mismo motivo documentado en
                  // `entrarPanel`, tailwind.config.ts).
                  "animate-[subir_0.5s_cubic-bezier(0.22,0.7,0.3,1)]"
                : "opacity-0"
            }`}
          >
            {/* El título de cada categoría: grande y limpio. Cuál es la actual se ve en la barra de chips de arriba. */}
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[1.4rem] font-semibold tracking-titular text-tinta">{c.nombre}</h2>
              <span className="flex-none text-[0.8rem] text-tinta-suave">
                {c.productos.length} {c.productos.length === 1 ? "opción" : "opciones"}
              </span>
            </div>

            <div className={tarjetas ? "mt-4 flex flex-col gap-5" : "mt-3 flex flex-col gap-3"}>
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

/** La lupa del buscador (trazo del resto de los íconos, sin librería). */
function IconoBuscarCarta({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

/**
 * Una fila de la carta, como tarjeta.
 *
 * Si el producto no tiene opciones ni ingredientes, el "+" lo agrega de un
 * toque. Si los tiene, abre la ficha. Esa distinción le saca varios toques a
 * cada pedido, y cada toque de menos es gente que no abandona a mitad de camino.
 *
 * Con foto, va a la derecha y el "+" se apoya en su esquina; sin foto, el texto ocupa todo el ancho y el "+" queda abajo a la
 * derecha. Cuando el cliente ya tiene ese producto en el pedido, la fila lo dice.
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
  const { agregarItem, items } = useCart();
  const [late, setLate] = useState(false);
  const conFicha = necesitaFicha(producto);
  const enPedido = items.reduce((suma, i) => (i.productId === producto.id ? suma + i.cantidad : suma), 0);

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

  // El "+": un círculo del color del local. Lo agrega de un toque (sin opciones) o, si hay ficha, solo acompaña: el toque lo recibe la fila.
  const mas = conFicha ? null : (
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
      className={`flex flex-none items-center justify-center rounded-full bg-brand text-white shadow-media transition-transform active:scale-90 ${
        tarjetas ? "h-11 w-11 text-2xl" : "h-9 w-9 text-xl"
      } leading-none ${late ? "animate-[latir_0.45s_ease]" : ""}`}
    >
      +
    </span>
  );

  const foto = producto.imagenUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={producto.imagenUrl}
      alt={producto.nombre}
      loading="lazy"
      decoding="async"
      className={tarjetas ? "h-52 w-full object-cover" : "h-24 w-24 rounded-xl object-cover"}
    />
  ) : tarjetas ? (
    <span aria-hidden="true" className="flex h-40 w-full items-center justify-center bg-papel-hundido text-tinta-suave/35">
      <IconoFoto />
    </span>
  ) : null;

  const precio = (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className={`cifra font-bold text-brand-texto ${tarjetas ? "text-[1.05rem]" : "text-[0.98rem]"}`}>
        {formatearGuarani(producto.precio)}
      </span>
      {/* Precio de promoción: se ve el precio normal tachado y que ahora rige la promoción. */}
      {producto.enPromocion && (
        <span className="cifra text-[0.76rem] text-tinta-suave line-through">
          {formatearGuarani(producto.precioNormal ?? producto.precio)}
        </span>
      )}
      {(producto.enPromocion || producto.etiquetaPromo) && (
        <span className="rounded-full bg-exito-luz px-2 py-0.5 text-[0.64rem] font-bold uppercase tracking-rotulo text-exito">
          {producto.etiquetaPromo ?? "Promo"}
        </span>
      )}
      {enPedido > 0 && (
        <span className="rounded-full bg-brand-light px-2 py-0.5 text-[0.68rem] font-bold text-brand-texto">
          {enPedido} en tu pedido
        </span>
      )}
    </span>
  );

  // Con opciones: un botón de verdad (no un comentario gris al pie), para quien no ve bien.
  const elegir = conFicha ? (
    <span className="inline-flex h-9 flex-none items-center whitespace-nowrap rounded-full bg-brand-light px-4 text-[0.82rem] font-semibold text-brand-texto transition-transform active:scale-95">
      Elegir agregados
    </span>
  ) : null;

  const texto = (
    <>
      <span className={`block font-semibold leading-tight tracking-titular text-tinta ${tarjetas ? "text-[1.08rem]" : "text-[1rem]"}`}>
        {producto.nombre}
      </span>
      {producto.descripcion && (
        <span className={`mt-1 line-clamp-2 block leading-snug text-tinta-suave ${tarjetas ? "text-[0.88rem]" : "text-[0.82rem]"}`}>
          {producto.descripcion}
        </span>
      )}
    </>
  );

  if (tarjetas) {
    return (
      <button
        type="button"
        id={`producto-${producto.id}`}
        onClick={conFicha ? onAbrir : undefined}
        className="block w-full scroll-mt-40 overflow-hidden rounded-2xl bg-superficie text-left shadow-sm ring-1 ring-linea transition-transform active:scale-[0.99]"
      >
        <span className="relative block">
          {foto}
          {mas && <span className="absolute bottom-3 right-3 flex">{mas}</span>}
        </span>
        <span className="block p-4">
          {texto}
          <span className="mt-2.5 flex items-center justify-between gap-3">
            {precio}
            {elegir}
          </span>
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      id={`producto-${producto.id}`}
      onClick={conFicha ? onAbrir : undefined}
      className="flex w-full scroll-mt-40 items-start gap-3 rounded-2xl bg-superficie p-3.5 text-left shadow-sm ring-1 ring-linea transition-transform active:scale-[0.99]"
    >
      <span className="block min-w-0 flex-1 self-stretch">
        {texto}
        <span className="mt-2.5 flex flex-col items-start gap-2">
          {precio}
          {elegir}
        </span>
      </span>
      {foto ? (
        <span className="relative flex-none pb-2 pr-2">
          {foto}
          {mas && <span className="absolute bottom-0 right-0 flex">{mas}</span>}
        </span>
      ) : (
        mas && <span className="flex flex-none items-end self-end">{mas}</span>
      )}
    </button>
  );
}
