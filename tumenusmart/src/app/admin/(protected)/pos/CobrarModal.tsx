"use client";

import { useState } from "react";
import { Boton } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";
import { FORMAS_PAGO_POS, type FormaPagoPos } from "@/lib/turno-pos";

/**
 * El paso de cobro, separado de "armar el pedido".
 *
 * Recién acá se pregunta cómo paga — antes solo se está cargando el
 * carrito. Para efectivo se pide con cuánto paga y se calcula el vuelto:
 * es la cuenta que el cajero necesita para dar el cambio, no un dato
 * de negocio (no se guarda en la venta).
 */
export function CobrarModal({
  clienteNombre,
  cantidadItems,
  total,
  cobrando,
  error,
  onCerrar,
  onCobrar,
}: {
  clienteNombre: string;
  cantidadItems: number;
  total: number;
  cobrando: boolean;
  error: string | null;
  onCerrar: () => void;
  onCobrar: (formaPago: FormaPagoPos) => void;
}) {
  const [formaPago, setFormaPago] = useState<FormaPagoPos>("efectivo");
  const [montoRecibido, setMontoRecibido] = useState(String(Math.round(total)));

  const vuelto = formaPago === "efectivo" ? (parseFloat(montoRecibido) || 0) - total : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4"
      onClick={onCerrar}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.7rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
              Cobrar
            </p>
            <p className="truncate text-[0.85rem] text-tinta-media">
              {clienteNombre.trim() || "Cliente sin nombre"} · {cantidadItems}{" "}
              {cantidadItems === 1 ? "producto" : "productos"}
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-tinta-suave hover:bg-papel-suave"
          >
            ✕
          </button>
        </div>

        <p className="cifra mt-2 text-[2rem] font-bold leading-none text-brand-texto">
          {formatearGuarani(total)}
        </p>

        <p className="mb-2 mt-5 text-[0.75rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
          ¿Cómo paga?
        </p>
        <div className="grid grid-cols-2 gap-2">
          {FORMAS_PAGO_POS.map((f) => (
            <button
              key={f.valor}
              type="button"
              onClick={() => setFormaPago(f.valor)}
              className={`rounded-lg border px-3 py-2.5 text-left text-[0.85rem] font-medium transition-colors ${
                formaPago === f.valor
                  ? "border-brand bg-brand-light text-brand-texto"
                  : "border-linea text-tinta-media hover:border-brand/40"
              }`}
            >
              {f.etiqueta}
            </button>
          ))}
        </div>

        {formaPago === "efectivo" && (
          <div className="mt-4 rounded-xl border border-linea bg-papel-suave p-3">
            <p className="mb-1.5 text-[0.75rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
              Paga con
            </p>
            <input
              type="number"
              min={0}
              step={1000}
              value={montoRecibido}
              onChange={(e) => setMontoRecibido(e.target.value)}
              onWheel={(e) => e.currentTarget.blur()}
              className="w-full rounded-lg border border-linea px-3 py-2 text-center text-[1.1rem] font-semibold text-tinta"
            />
            <button
              type="button"
              onClick={() => setMontoRecibido(String(Math.round(total)))}
              className="mt-2 rounded-full border border-linea px-3 py-1 text-[0.78rem] font-medium text-tinta-media hover:border-brand hover:text-brand"
            >
              Justo
            </button>
            {vuelto > 0 && (
              <p className="mt-2 text-[0.85rem] text-tinta">
                Vuelto: <strong className="text-exito">{formatearGuarani(vuelto)}</strong>
              </p>
            )}
          </div>
        )}

        {error && <p className="mt-3 text-[0.82rem] font-medium text-peligro">{error}</p>}

        <div className="mt-5 flex gap-2">
          <Boton tono="fantasma" tam="md" onClick={onCerrar} className="flex-1">
            Volver
          </Boton>
          <Boton tam="md" onClick={() => onCobrar(formaPago)} disabled={cobrando} className="flex-1">
            {cobrando ? "Cobrando…" : `Cobrar ${formatearGuarani(total)}`}
          </Boton>
        </div>
      </div>
    </div>
  );
}
