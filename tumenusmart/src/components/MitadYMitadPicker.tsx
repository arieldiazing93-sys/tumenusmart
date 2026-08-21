"use client";

import { useMemo, useState } from "react";
import { useCart } from "./CartProvider";
import { formatearGuarani } from "@/lib/format";
import { calcularPrecioMitadYMitad, ModoPrecioMitad } from "@/lib/mitad-mitad";

type ProductoBase = {
  id: string;
  nombre: string;
  precio: number;
};

type Props = {
  categoriaNombre: string;
  modo: ModoPrecioMitad;
  productos: ProductoBase[];
};

export function MitadYMitadPicker({ categoriaNombre, modo, productos }: Props) {
  const { agregarItem } = useCart();
  const [idA, setIdA] = useState<string>("");
  const [idB, setIdB] = useState<string>("");
  const [cantidad, setCantidad] = useState(1);
  const [agregado, setAgregado] = useState(false);

  const productoA = productos.find((p) => p.id === idA);
  const productoB = productos.find((p) => p.id === idB);

  const precioCombo = useMemo(() => {
    if (!productoA || !productoB) return null;
    return calcularPrecioMitadYMitad(productoA.precio, productoB.precio, modo);
  }, [productoA, productoB, modo]);

  const mismoDoble = !!idA && idA === idB;
  const listo = !!productoA && !!productoB && !mismoDoble;

  function handleAgregar() {
    if (!listo || !productoA || !productoB || precioCombo == null) return;
    const parIds = [productoA.id, productoB.id].sort();
    agregarItem({
      key: `mitad::${parIds.join("+")}`,
      productId: `combo:${parIds.join("+")}`,
      nombreProducto: `Mitad ${productoA.nombre} / Mitad ${productoB.nombre}`,
      precioBase: precioCombo,
      opciones: [],
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
    setTimeout(() => setAgregado(false), 1500);
  }

  return (
    <div className="rounded-xl border border-dashed border-brand bg-brand-light/30 p-4">
      <h4 className="mb-1 font-semibold text-neutral-900">
        Armá tu mitad y mitad — {categoriaNombre}
      </h4>
      <p className="mb-3 text-xs text-neutral-500">
        {modo === "mayor"
          ? "Se cobra el precio del sabor más caro de los dos."
          : "Se cobra la mitad del precio de cada sabor, sumadas."}
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={idA}
          onChange={(e) => setIdA(e.target.value)}
          className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
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
          onChange={(e) => setIdB(e.target.value)}
          className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
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
        <p className="mt-2 text-xs text-amber-600">Elegí dos sabores distintos.</p>
      )}

      <div className="mt-3 flex items-center justify-between">
        <span className="font-semibold text-neutral-900">
          {precioCombo != null ? formatearGuarani(precioCombo) : "—"}
        </span>

        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-lg border border-neutral-300 bg-white">
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
            disabled={!listo}
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            {agregado ? "Agregado ✓" : "Agregar"}
          </button>
        </div>
      </div>
    </div>
  );
}
