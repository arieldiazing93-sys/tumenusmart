"use client";

import { useRef, useState } from "react";
import { clasesBoton } from "@/components/ui";
import { buscarClientesParaCotizacion, type ClienteParaCotizacion } from "./actions";

/**
 * Completa los datos del cliente con uno ya cargado (los del punto de venta),
 * buscándolo por nombre, teléfono o RUC/cédula. Es opcional: los datos también
 * se pueden escribir a mano, y un cliente nuevo no se da de alta por acá.
 */
export function BuscarClienteParaCotizacion({
  onElegir,
}: {
  onElegir: (cliente: ClienteParaCotizacion) => void;
}) {
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<ClienteParaCotizacion[]>([]);
  const [buscando, setBuscando] = useState(false);
  const ultimaBusqueda = useRef(0);

  async function buscar(texto: string) {
    setQuery(texto);
    const numero = ++ultimaBusqueda.current;
    if (!texto.trim()) {
      setResultados([]);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    const r = await buscarClientesParaCotizacion(texto);
    if (numero !== ultimaBusqueda.current) return;
    setBuscando(false);
    setResultados(r);
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        value={query}
        onChange={(e) => buscar(e.target.value)}
        placeholder="Buscar un cliente ya cargado por nombre, teléfono o RUC (opcional)"
        className="rounded-lg border border-linea bg-superficie px-3 py-2.5 text-[0.88rem] focus:border-brand focus:outline-none"
      />
      {buscando && <p className="text-xs text-tinta-suave">Buscando…</p>}
      {!buscando && query.trim() && resultados.length === 0 && (
        <p className="text-xs text-tinta-suave">No encontré ningún cliente: escribí sus datos acá abajo.</p>
      )}
      {resultados.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {resultados.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-linea bg-superficie px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium">{c.nombre}</p>
                <p className="text-xs text-tinta-suave">
                  {[c.identificacion, c.telefono, c.email].filter(Boolean).join(" · ") || "Sin más datos"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onElegir(c);
                  setQuery("");
                  setResultados([]);
                  ultimaBusqueda.current++;
                }}
                className={clasesBoton("suave", "sm")}
              >
                Usar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
