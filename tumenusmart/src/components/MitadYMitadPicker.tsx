"use client";

import { useMemo, useState } from "react";
import { useCart } from "./CartProvider";
import { formatearGuarani } from "@/lib/format";
import { calcularPrecioMitadYMitad } from "@/lib/mitad-mitad";

type Opcion = {
  id: string;
  nombre: string;
  tipo: string;
  precioExtra: number;
};

type ProductoBase = {
  id: string;
  nombre: string;
  precio: number;
  mitadYMitadModo: string;
  opciones: Opcion[];
};

type Props = {
  grupoNombre: string;
  productos: ProductoBase[];
};

export function MitadYMitadPicker({ grupoNombre, productos }: Props) {
  const { agregarItem } = useCart();
  const [idA, setIdA] = useState<string>("");
  const [idB, setIdB] = useState<string>("");
  const [agregadosIds, setAgregadosIds] = useState<string[]>([]);
  const [cantidad, setCantidad] = useState(1);
  const [agregado, setAgregado] = useState(false);

  const productoA = productos.find((p) => p.id === idA);
  const productoB = productos.find((p) => p.id === idB);

  // El modo de precio lo define la "Mitad 1" elegida (debería ser el mismo
  // en todos los productos del grupo, configurado así por el admin).
  const modo = productoA?.mitadYMitadModo === "proporcional" ? "proporcional" : "mayor";

  const agregadosDisponibles = useMemo(() => {
    if (!productoA || !productoB) return [];
    const vistos = new Set<string>();
    const lista: Opcion[] = [];
    for (const p of [productoA, productoB]) {
      for (const o of p.opciones) {
        if (o.tipo !== "agregado") continue;
        const clave = o.nombre.toLowerCase();
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        lista.push(o);
      }
    }
    return lista;
  }, [productoA, productoB]);

  const agregadosSeleccionados = agregadosDisponibles.filter((o) =>
    agregadosIds.includes(o.id)
  );

  const precioBase = useMemo(() => {
    if (!productoA || !productoB) return null;
    return calcularPrecioMitadYMitad(productoA.precio, productoB.precio, modo);
  }, [productoA, productoB, modo]);

  const precioTotal =
    precioBase != null
      ? precioBase + agregadosSeleccionados.reduce((s, o) => s + o.precioExtra, 0)
      : null;

  const mismoDoble = !!idA && idA === idB;
  const listo = !!productoA && !!productoB && !mismoDoble;

  function toggleAgregado(id: string) {
    setAgregadosIds((actuales) =>
      actuales.includes(id) ? actuales.filter((x) => x !== id) : [...actuales, id]
    );
  }

  function handleAgregar() {
    if (!listo || !productoA || !productoB || precioBase == null) return;
    const parIds = [productoA.id, productoB.id].sort();
    agregarItem({
      key: `mitad::${parIds.join("+")}::${[...agregadosIds].sort().join(",")}`,
      productId: `combo:${parIds.join("+")}`,
      nombreProducto: `Mitad ${productoA.nombre} / Mitad ${productoB.nombre}`,
      precioBase,
      opciones: agregadosSeleccionados,
      mitadYMitad: {
        productIdA: productoA.id,
        nombreA: productoA.nombre,
        productIdB: productoB.id,
        nombreB: productoB.nombre,
        modo,
      },
      cantidad,
      imagenUrl: null,
    });
    setAgregado(true);
    setCantidad(1);
    setIdA("");
    setIdB("");
    setAgregadosIds([]);
    setTimeout(() => setAgregado(false), 1500);
  }

  // Azul y no naranja: este cuadro es una forma DISTINTA de armar el pedido,
  // no un producto más de la lista. En naranja parecía otro destacado; el azul
  // lo separa de un vistazo sin gritar.
  return (
    <div className="rounded-xl border border-azul/35 bg-azul-luz p-4">
      <h4 className="mb-1 text-[0.95rem] font-semibold tracking-titular text-azul-oscuro">
        Armá tu mitad y mitad — {grupoNombre}
      </h4>
      <p className="mb-3 text-[0.78rem] leading-snug text-tinta-media">
        {modo === "mayor"
          ? "Se cobra el precio del sabor más caro de los dos."
          : "Se cobra la mitad del precio de cada sabor, sumadas."}
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={idA}
          onChange={(e) => {
            setIdA(e.target.value);
            setAgregadosIds([]);
          }}
          className="flex-1 rounded-lg border border-linea bg-white px-3 py-2 text-[0.88rem] focus:border-brand focus:outline-none"
        >
          <option value="">Mitad 1...</option>
          {productos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre} ({formatearGuarani(p.precio)})
            </option>
          ))}
        </select>
        <select
          value={idB}
          onChange={(e) => {
            setIdB(e.target.value);
            setAgregadosIds([]);
          }}
          className="flex-1 rounded-lg border border-linea bg-white px-3 py-2 text-[0.88rem] focus:border-brand focus:outline-none"
        >
          <option value="">Mitad 2...</option>
          {productos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre} ({formatearGuarani(p.precio)})
            </option>
          ))}
        </select>
      </div>

      {mismoDoble && (
        <p className="mt-2 text-[0.78rem] text-aviso">Elegí dos sabores distintos.</p>
      )}

      {agregadosDisponibles.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {agregadosDisponibles.map((a) => (
            <label
              key={a.id}
              className={`cursor-pointer rounded-full border bg-white px-3 py-1.5 text-[0.82rem] ${
                agregadosIds.includes(a.id)
                  ? "border-brand bg-brand-light text-brand-dark"
                  : "border-linea text-tinta-media"
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

      <div className="mt-3 flex items-center justify-between">
        <span className="cifra font-semibold">
          {precioTotal != null ? formatearGuarani(precioTotal) : "—"}
        </span>

        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-lg border border-linea bg-white">
            <button
              type="button"
              className="px-2.5 py-1 text-tinta-media"
              onClick={() => setCantidad((c) => Math.max(1, c - 1))}
              aria-label="Restar cantidad"
            >
              −
            </button>
            <span className="cifra w-6 text-center text-[0.85rem]">{cantidad}</span>
            <button
              type="button"
              className="px-2.5 py-1 text-tinta-media"
              onClick={() => setCantidad((c) => c + 1)}
              aria-label="Sumar cantidad"
            >
              +
            </button>
          </div>

          <button
            type="button"
            onClick={handleAgregar}
            disabled={!listo}
            className="rounded-lg bg-brand px-3.5 py-2 text-[0.85rem] font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-linea disabled:text-tinta-suave"
          >
            {agregado ? (
              <>
                Agregado{" "}
                <span className="inline-block animate-[entradaExito_0.32s_ease]">✓</span>
              </>
            ) : (
              "Agregar"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
