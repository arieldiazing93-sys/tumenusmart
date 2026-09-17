"use client";

import { useState } from "react";
import { formatearGuarani } from "@/lib/format";
import { calcularPrecioMitadYMitad } from "@/lib/mitad-mitad";

type ProductoMitad = { id: string; nombre: string; precio: number; mitadYMitadModo: string };

/**
 * Armar un combo mitad y mitad en el mostrador.
 *
 * Calcado del selector del menú público (MitadYMitadPicker.tsx), sin
 * agregados: el POS no ofrece variantes/agregados en ningún producto, así
 * que tampoco acá. El precio que se ve es solo para mostrar en el momento —
 * el que vale es el que recalcula el servidor en registrarVenta, con la
 * misma función `armarPedido` que usa el checkout público.
 */
export function MitadYMitadPickerPos({
  grupoNombre,
  productos,
  onAgregar,
}: {
  grupoNombre: string;
  productos: ProductoMitad[];
  onAgregar: (a: ProductoMitad, b: ProductoMitad, precio: number, cantidad: number) => void;
}) {
  const [idA, setIdA] = useState("");
  const [idB, setIdB] = useState("");
  const [cantidad, setCantidad] = useState(1);

  const productoA = productos.find((p) => p.id === idA);
  const productoB = productos.find((p) => p.id === idB);
  const modo = productoA?.mitadYMitadModo === "proporcional" ? "proporcional" : "mayor";
  const precio =
    productoA && productoB ? calcularPrecioMitadYMitad(productoA.precio, productoB.precio, modo) : null;
  const mismoDoble = !!idA && idA === idB;
  const listo = !!productoA && !!productoB && !mismoDoble;

  function agregar() {
    if (!listo || !productoA || !productoB || precio == null) return;
    onAgregar(productoA, productoB, precio, cantidad);
    setIdA("");
    setIdB("");
    setCantidad(1);
  }

  return (
    <div className="mb-3 rounded-xl border border-azul/35 bg-azul-luz p-3">
      <h4 className="mb-1 text-[0.88rem] font-semibold tracking-titular text-azul-oscuro">
        Armá mitad y mitad — {grupoNombre}
      </h4>
      <p className="mb-2 text-[0.74rem] leading-snug text-tinta-media">
        {modo === "mayor"
          ? "Se cobra el precio del sabor más caro de los dos."
          : "Se cobra la mitad del precio de cada sabor, sumadas."}
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={idA}
          onChange={(e) => setIdA(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-linea bg-white px-2.5 py-1.5 text-[0.82rem] focus:border-brand focus:outline-none"
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
          className="min-w-0 flex-1 rounded-lg border border-linea bg-white px-2.5 py-1.5 text-[0.82rem] focus:border-brand focus:outline-none"
        >
          <option value="">Mitad 2...</option>
          {productos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre} ({formatearGuarani(p.precio)})
            </option>
          ))}
        </select>
      </div>

      {mismoDoble && <p className="mt-1.5 text-[0.74rem] text-aviso">Elegí dos sabores distintos.</p>}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        {precio != null ? (
          <span className="cifra text-[0.9rem] font-semibold text-tinta">{formatearGuarani(precio)}</span>
        ) : (
          <span className="text-[0.76rem] text-tinta-suave">Elegí las dos mitades</span>
        )}

        <div className="flex flex-none items-center gap-2">
          <div className="flex items-center rounded-lg border border-linea bg-white">
            <button
              type="button"
              className="px-2 py-1 text-tinta-media"
              onClick={() => setCantidad((c) => Math.max(1, c - 1))}
              aria-label="Restar cantidad"
            >
              −
            </button>
            <span className="cifra w-5 text-center text-[0.82rem]">{cantidad}</span>
            <button
              type="button"
              className="px-2 py-1 text-tinta-media"
              onClick={() => setCantidad((c) => c + 1)}
              aria-label="Sumar cantidad"
            >
              +
            </button>
          </div>

          <button
            type="button"
            onClick={agregar}
            disabled={!listo}
            className="rounded-lg bg-brand px-3 py-1.5 text-[0.82rem] font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-linea disabled:text-tinta-suave"
          >
            Agregar
          </button>
        </div>
      </div>
    </div>
  );
}
