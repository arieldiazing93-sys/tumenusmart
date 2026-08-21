"use client";

import { useMemo, useState } from "react";
import { useCart } from "./CartProvider";
import { construirKey } from "@/lib/cart-types";
import { formatearGuarani } from "@/lib/format";

type Opcion = {
  id: string;
  nombre: string;
  tipo: string;
  precioExtra: number;
};

type Props = {
  producto: {
    id: string;
    nombre: string;
    descripcion: string | null;
    precio: number;
    imagenUrl: string | null;
    ingredientes: string[];
    opciones: Opcion[];
  };
};

export function ProductCard({ producto }: Props) {
  const { agregarItem } = useCart();
  const variantes = producto.opciones.filter((o) => o.tipo === "variante");
  const agregados = producto.opciones.filter((o) => o.tipo === "agregado");

  const [varianteId, setVarianteId] = useState<string | undefined>(undefined);
  const [agregadosIds, setAgregadosIds] = useState<string[]>([]);
  const [ingredientesQuitados, setIngredientesQuitados] = useState<string[]>([]);
  const [cantidad, setCantidad] = useState(1);
  const [agregado, setAgregado] = useState(false);

  const opcionesSeleccionadas = useMemo(() => {
    const seleccion: Opcion[] = [];
    const v = variantes.find((o) => o.id === varianteId);
    if (v) seleccion.push(v);
    for (const id of agregadosIds) {
      const a = agregados.find((o) => o.id === id);
      if (a) seleccion.push(a);
    }
    return seleccion;
  }, [varianteId, agregadosIds, variantes, agregados]);

  const precioUnitarioMostrado =
    producto.precio + opcionesSeleccionadas.reduce((s, o) => s + o.precioExtra, 0);

  function toggleAgregado(id: string) {
    setAgregadosIds((actuales) =>
      actuales.includes(id) ? actuales.filter((x) => x !== id) : [...actuales, id]
    );
  }

  function toggleIngrediente(nombre: string) {
    setIngredientesQuitados((actuales) =>
      actuales.includes(nombre) ? actuales.filter((x) => x !== nombre) : [...actuales, nombre]
    );
  }

  const faltaElegirVariante = variantes.length > 0 && !varianteId;

  function handleAgregar() {
    if (faltaElegirVariante) return;
    agregarItem({
      key: construirKey(
        producto.id,
        opcionesSeleccionadas.map((o) => o.id),
        ingredientesQuitados
      ),
      productId: producto.id,
      nombreProducto: producto.nombre,
      precioBase: producto.precio,
      opciones: opcionesSeleccionadas,
      ingredientesQuitados: ingredientesQuitados.length > 0 ? ingredientesQuitados : undefined,
      cantidad,
      imagenUrl: producto.imagenUrl,
    });
    setAgregado(true);
    setCantidad(1);
    setIngredientesQuitados([]);
    setTimeout(() => setAgregado(false), 1500);
  }

  return (
    <div className="flex gap-4 rounded-xl border border-neutral-200 bg-white p-4">
      {producto.imagenUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={producto.imagenUrl}
          alt={producto.nombre}
          className="h-24 w-24 flex-none rounded-lg object-cover"
        />
      )}
      <div className="flex flex-1 flex-col gap-2">
        <div>
          <h3 className="font-semibold text-neutral-900">{producto.nombre}</h3>
          {producto.descripcion && (
            <p className="text-sm text-neutral-500">{producto.descripcion}</p>
          )}
        </div>

        {producto.ingredientes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {producto.ingredientes.map((ing) => {
              const quitado = ingredientesQuitados.includes(ing);
              return (
                <button
                  key={ing}
                  type="button"
                  onClick={() => toggleIngrediente(ing)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs transition ${
                    quitado
                      ? "border-neutral-200 text-neutral-400 line-through"
                      : "border-neutral-300 text-neutral-600 hover:border-red-300 hover:text-red-500"
                  }`}
                  title={quitado ? "Volver a incluir" : "Sacar este ingrediente"}
                >
                  {quitado ? "+ " : "× "}
                  {ing}
                </button>
              );
            })}
          </div>
        )}

        {variantes.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {variantes.map((v) => (
              <label
                key={v.id}
                className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${
                  varianteId === v.id
                    ? "border-brand bg-brand-light text-brand-dark"
                    : "border-neutral-300 text-neutral-600"
                }`}
              >
                <input
                  type="radio"
                  name={`variante-${producto.id}`}
                  className="hidden"
                  checked={varianteId === v.id}
                  onChange={() => setVarianteId(v.id)}
                />
                {v.nombre}
                {v.precioExtra > 0 && ` (+${formatearGuarani(v.precioExtra)})`}
              </label>
            ))}
            {faltaElegirVariante && (
              <span className="text-xs text-amber-600">Elegí una opción</span>
            )}
          </div>
        )}

        {agregados.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {agregados.map((a) => (
              <label
                key={a.id}
                className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${
                  agregadosIds.includes(a.id)
                    ? "border-brand bg-brand-light text-brand-dark"
                    : "border-neutral-300 text-neutral-600"
                }`}
              >
                <input
                  type="checkbox"
                  className="hidden"
                  checked={agregadosIds.includes(a.id)}
                  onChange={() => toggleAgregado(a.id)}
                />
                + {a.nombre} ({formatearGuarani(a.precioExtra)})
              </label>
            ))}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="font-semibold text-neutral-900">
            {formatearGuarani(precioUnitarioMostrado)}
          </span>

          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-lg border border-neutral-300">
              <button
                type="button"
                className="px-2 py-1 text-neutral-600"
                onClick={() => setCantidad((c) => Math.max(1, c - 1))}
                aria-label="Restar cantidad"
              >
                −
              </button>
              <span className="w-6 text-center text-sm">{cantidad}</span>
              <button
                type="button"
                className="px-2 py-1 text-neutral-600"
                onClick={() => setCantidad((c) => c + 1)}
                aria-label="Sumar cantidad"
              >
                +
              </button>
            </div>

            <button
              type="button"
              onClick={handleAgregar}
              disabled={faltaElegirVariante}
              className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              {agregado ? "Agregado ✓" : "Agregar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
