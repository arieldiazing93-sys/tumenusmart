"use client";

import { useMemo, useState } from "react";
import { formatearGuarani } from "@/lib/format";
import { calcularPrecioMitadYMitad } from "@/lib/mitad-mitad";

type Agregado = { id: string; nombre: string; precioExtra: number };
type ProductoMitad = { id: string; nombre: string; precio: number; mitadYMitadModo: string; agregados: Agregado[] };

/**
 * Armar un combo mitad y mitad en el mostrador.
 *
 * Calcado del selector del menú público (MitadYMitadPicker.tsx), agregados
 * incluidos: los de las dos mitades elegidas se juntan sin repetir nombre
 * (mismo criterio que `agregadosDeCombo` en precio-pedido.ts), así que un
 * "Queso extra" que esté en las dos mitades aparece una sola vez. El precio
 * que se ve es solo para mostrar en el momento — el que vale es el que
 * recalcula el servidor en registrarVenta, con la misma función
 * `armarPedido` que usa el checkout público.
 */
export function MitadYMitadPickerPos({
  grupoNombre,
  productos,
  onAgregar,
}: {
  grupoNombre: string;
  productos: ProductoMitad[];
  onAgregar: (
    a: ProductoMitad,
    b: ProductoMitad,
    agregadosElegidos: Agregado[],
    precioTotal: number,
    cantidad: number
  ) => void;
}) {
  const [idA, setIdA] = useState("");
  const [idB, setIdB] = useState("");
  const [agregadosIds, setAgregadosIds] = useState<string[]>([]);
  const [cantidad, setCantidad] = useState(1);

  const productoA = productos.find((p) => p.id === idA);
  const productoB = productos.find((p) => p.id === idB);
  const modo = productoA?.mitadYMitadModo === "proporcional" ? "proporcional" : "mayor";

  const agregadosDisponibles = useMemo(() => {
    if (!productoA || !productoB) return [];
    const vistos = new Set<string>();
    const lista: Agregado[] = [];
    for (const p of [productoA, productoB]) {
      for (const a of p.agregados) {
        const clave = a.nombre.trim().toLowerCase();
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        lista.push(a);
      }
    }
    return lista;
  }, [productoA, productoB]);

  const agregadosElegidos = agregadosDisponibles.filter((a) => agregadosIds.includes(a.id));

  const precioBase =
    productoA && productoB ? calcularPrecioMitadYMitad(productoA.precio, productoB.precio, modo) : null;
  const precioTotal =
    precioBase != null ? precioBase + agregadosElegidos.reduce((s, a) => s + a.precioExtra, 0) : null;

  const mismoDoble = !!idA && idA === idB;
  const listo = !!productoA && !!productoB && !mismoDoble;

  function toggleAgregado(id: string) {
    setAgregadosIds((actuales) =>
      actuales.includes(id) ? actuales.filter((x) => x !== id) : [...actuales, id]
    );
  }

  function agregar() {
    if (!listo || !productoA || !productoB || precioTotal == null) return;
    onAgregar(productoA, productoB, agregadosElegidos, precioTotal, cantidad);
    setIdA("");
    setIdB("");
    setAgregadosIds([]);
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
          onChange={(e) => {
            setIdA(e.target.value);
            setAgregadosIds([]);
          }}
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
          onChange={(e) => {
            setIdB(e.target.value);
            setAgregadosIds([]);
          }}
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

      {agregadosDisponibles.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {agregadosDisponibles.map((a) => (
            <label
              key={a.id}
              className={`cursor-pointer rounded-full border bg-white px-2.5 py-1 text-[0.78rem] ${
                agregadosIds.includes(a.id)
                  ? "border-brand bg-brand-light text-brand-texto"
                  : "border-linea text-tinta-media"
              }`}
            >
              <input
                type="checkbox"
                className="hidden"
                checked={agregadosIds.includes(a.id)}
                onChange={() => toggleAgregado(a.id)}
              />
              + {a.nombre}
              {a.precioExtra > 0 && ` (${formatearGuarani(a.precioExtra)})`}
            </label>
          ))}
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        {precioTotal != null ? (
          <span className="cifra text-[0.9rem] font-semibold text-tinta">{formatearGuarani(precioTotal)}</span>
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
