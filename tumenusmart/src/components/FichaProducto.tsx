"use client";

import { useEffect, useMemo, useState } from "react";
import { useCart } from "./CartProvider";
import { construirKey } from "@/lib/cart-types";
import { formatearGuarani } from "@/lib/format";
import type { OpcionCarta, ProductoCarta } from "@/lib/carta";

// Se re-exportan para no romper a quien ya los importaba desde acá.
// OJO: hay que IMPORTARLOS además de re-exportarlos. Un `export ... from`
// reenvía el nombre hacia afuera pero NO lo trae a este archivo, así que si
// solo se re-exporta, usar OpcionCarta más abajo no compila.
export type { OpcionCarta, ProductoCarta };
export { necesitaFicha } from "@/lib/carta";

/**
 * La ficha del producto, como hoja que sube desde abajo.
 *
 * Antes cada producto mostraba TODAS sus opciones desplegadas dentro de la
 * carta. Con veinte productos eso volvía la carta larguísima y lenta de
 * recorrer. Ahora la carta muestra filas cortas y las opciones aparecen recién
 * cuando el cliente toca ese producto.
 *
 * Sube desde abajo y no navega a otra pantalla por una razón práctica: el
 * pulgar queda cerca de los controles y no se pierde el lugar del menú.
 */
export function FichaProducto({
  producto,
  onCerrar,
}: {
  producto: ProductoCarta | null;
  onCerrar: () => void;
}) {
  const { agregarItem } = useCart();

  const [varianteId, setVarianteId] = useState<string | undefined>(undefined);
  const [agregadosIds, setAgregadosIds] = useState<string[]>([]);
  const [quitados, setQuitados] = useState<string[]>([]);
  const [cantidad, setCantidad] = useState(1);

  // Cada vez que se abre otro producto, la ficha arranca limpia.
  useEffect(() => {
    setVarianteId(undefined);
    setAgregadosIds([]);
    setQuitados([]);
    setCantidad(1);
  }, [producto?.id]);

  // Con la ficha abierta el fondo no debe desplazarse.
  useEffect(() => {
    if (!producto) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const alEscapar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    window.addEventListener("keydown", alEscapar);
    return () => {
      document.body.style.overflow = previo;
      window.removeEventListener("keydown", alEscapar);
    };
  }, [producto, onCerrar]);

  const variantes = producto?.opciones.filter((o) => o.tipo === "variante") ?? [];
  const agregados = producto?.opciones.filter((o) => o.tipo === "agregado") ?? [];

  const elegidas = useMemo(() => {
    if (!producto) return [];
    const salida: OpcionCarta[] = [];
    const v = variantes.find((o) => o.id === varianteId);
    if (v) salida.push(v);
    for (const id of agregadosIds) {
      const a = agregados.find((o) => o.id === id);
      if (a) salida.push(a);
    }
    return salida;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [producto, varianteId, agregadosIds]);

  if (!producto) return null;

  const unitario = producto.precio + elegidas.reduce((s, o) => s + o.precioExtra, 0);

  function confirmar() {
    if (!producto) return;
    agregarItem({
      key: construirKey(producto.id, elegidas.map((o) => o.id), quitados),
      productId: producto.id,
      nombreProducto: producto.nombre,
      precioBase: producto.precio,
      opciones: elegidas,
      ingredientesQuitados: quitados.length > 0 ? quitados : undefined,
      cantidad,
      imagenUrl: producto.imagenUrl,
    });
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(8);
    onCerrar();
  }

  return (
    <>
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onCerrar}
        className="fixed inset-0 z-40 bg-tinta/45 animate-[subir_0.2s_ease]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={producto.nombre}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88vh] max-w-2xl flex-col rounded-t-2xl bg-white shadow-alta animate-[subirHoja_0.34s_cubic-bezier(0.22,0.7,0.3,1)]"
      >
        <span className="mx-auto mt-2.5 h-1 w-10 flex-none rounded-full bg-linea" />

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-2">
          {producto.imagenUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={producto.imagenUrl}
              alt={producto.nombre}
              className="h-40 w-full rounded-xl object-cover"
              decoding="async"
            />
          )}

          <h2 className="mt-4 text-xl font-semibold tracking-titular">{producto.nombre}</h2>
          {producto.descripcion && (
            <p className="mt-1 text-[0.9rem] leading-relaxed text-tinta-media">
              {producto.descripcion}
            </p>
          )}

          {variantes.length > 0 && (
            <div className="mt-5">
              <p className="text-[0.85rem] font-semibold">Elegí una opción</p>
              <div className="mt-1">
                {variantes.map((o) => (
                  <label
                    key={o.id}
                    className="flex items-center gap-2.5 border-b border-linea-fina py-2.5 text-[0.9rem] last:border-0"
                  >
                    <input
                      type="radio"
                      name="variante"
                      checked={varianteId === o.id}
                      onChange={() => setVarianteId(o.id)}
                      className="h-[17px] w-[17px] flex-none accent-brand"
                    />
                    {o.nombre}
                    {o.precioExtra > 0 && (
                      <span className="cifra ml-auto text-[0.82rem] text-tinta-media">
                        + {formatearGuarani(o.precioExtra)}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}

          {agregados.length > 0 && (
            <div className="mt-5">
              <p className="text-[0.85rem] font-semibold">Agregados</p>
              <p className="text-[0.76rem] text-tinta-suave">Opcional. Se suman al precio.</p>
              <div className="mt-1">
                {agregados.map((o) => (
                  <label
                    key={o.id}
                    className="flex items-center gap-2.5 border-b border-linea-fina py-2.5 text-[0.9rem] last:border-0"
                  >
                    <input
                      type="checkbox"
                      checked={agregadosIds.includes(o.id)}
                      onChange={() =>
                        setAgregadosIds((a) =>
                          a.includes(o.id) ? a.filter((x) => x !== o.id) : [...a, o.id]
                        )
                      }
                      className="h-[17px] w-[17px] flex-none accent-brand"
                    />
                    {o.nombre}
                    {o.precioExtra > 0 && (
                      <span className="cifra ml-auto text-[0.82rem] text-tinta-media">
                        + {formatearGuarani(o.precioExtra)}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}

          {producto.ingredientes.length > 0 && (
            <div className="mt-5">
              <p className="text-[0.85rem] font-semibold">¿Le sacamos algo?</p>
              <p className="text-[0.76rem] text-tinta-suave">
                Tocá lo que no querés que lleve.
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {producto.ingredientes.map((ing) => {
                  const fuera = quitados.includes(ing);
                  return (
                    <button
                      key={ing}
                      type="button"
                      aria-pressed={fuera}
                      onClick={() =>
                        setQuitados((q) =>
                          q.includes(ing) ? q.filter((x) => x !== ing) : [...q, ing]
                        )
                      }
                      className={`rounded-full border px-3 py-1 text-[0.8rem] transition-colors ${
                        fuera
                          ? "border-linea bg-papel-hundido text-tinta-suave line-through"
                          : "border-linea bg-white text-tinta"
                      }`}
                    >
                      {ing}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-none items-center gap-3 border-t border-linea px-5 pb-5 pt-3">
          <div className="flex items-center rounded-lg border border-linea">
            <button
              type="button"
              onClick={() => setCantidad((c) => Math.max(1, c - 1))}
              aria-label="Quitar uno"
              className="h-9 w-9 text-lg text-tinta disabled:opacity-40"
              disabled={cantidad <= 1}
            >
              −
            </button>
            <span className="min-w-[22px] text-center text-[0.9rem] font-semibold">
              {cantidad}
            </span>
            <button
              type="button"
              onClick={() => setCantidad((c) => c + 1)}
              aria-label="Sumar uno"
              className="h-9 w-9 text-lg text-tinta"
            >
              +
            </button>
          </div>

          <button
            type="button"
            onClick={confirmar}
            className="flex flex-1 items-center justify-between rounded-lg bg-brand px-4 py-2.5 text-[0.9rem] font-semibold text-white hover:bg-brand-dark"
          >
            <span>Agregar</span>
            <span className="cifra">{formatearGuarani(unitario * cantidad)}</span>
          </button>
        </div>
      </div>
    </>
  );
}
