"use client";

import { useEffect, useState } from "react";
import { Boton } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";
import { FORMAS_PAGO_POS, type FormaPagoPos } from "@/lib/turno-pos";

const ICONOS_FORMA: Record<FormaPagoPos, string> = {
  efectivo: "💵",
  transferencia: "🏦",
  tarjeta_debito: "💳",
  tarjeta_credito: "💳",
};

/**
 * El paso de cobro, separado de "armar el pedido".
 *
 * Recién acá se pregunta cómo paga — antes solo se está cargando el
 * carrito. Para efectivo se pide con cuánto paga y se calcula el vuelto:
 * es la cuenta que el cajero necesita para dar el cambio, no un dato
 * de negocio (no se guarda en la venta).
 *
 * En el celular sube como una hoja desde abajo (mismo patrón que
 * FichaProducto.tsx en el menú público); en pantallas más anchas es un
 * cuadro centrado — el pulgar del cajero queda cerca de los botones en
 * los dos casos.
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

  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [onCerrar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-tinta/45 sm:items-center sm:p-4"
      onClick={onCerrar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cobrar"
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-white p-5 shadow-alta animate-[subirHoja_0.28s_cubic-bezier(0.22,0.7,0.3,1)] sm:max-w-sm sm:animate-[subir_0.22s_ease-out] sm:rounded-xl"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom, 0px))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto mb-3 block h-1 w-10 flex-none rounded-full bg-linea sm:hidden" />

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
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-tinta-suave transition-colors hover:bg-papel-suave hover:text-tinta"
          >
            ✕
          </button>
        </div>

        <p className="cifra mt-3 text-[2.1rem] font-bold leading-none text-tinta">
          {formatearGuarani(total)}
        </p>

        <p className="mb-2 mt-6 text-[0.75rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
          ¿Cómo paga?
        </p>
        <div className="grid grid-cols-2 gap-2">
          {FORMAS_PAGO_POS.map((f) => (
            <button
              key={f.valor}
              type="button"
              onClick={() => setFormaPago(f.valor)}
              aria-pressed={formaPago === f.valor}
              className={`flex items-center gap-2 rounded-lg border px-3 py-3 text-left text-[0.85rem] font-medium transition-all active:scale-[0.97] ${
                formaPago === f.valor
                  ? "border-brand bg-brand-light text-brand-texto shadow-sm"
                  : "border-linea text-tinta-media hover:border-brand/40 hover:bg-papel-suave"
              }`}
            >
              <span aria-hidden="true" className="text-base leading-none">
                {ICONOS_FORMA[f.valor]}
              </span>
              {f.etiqueta}
            </button>
          ))}
        </div>

        {formaPago === "efectivo" && (
          <div className="mt-4 rounded-lg border border-linea bg-papel-suave p-3.5 animate-[subir_0.25s_ease-out]">
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
              className="w-full rounded-lg border border-linea bg-white px-3 py-2.5 text-center text-[1.15rem] font-semibold text-tinta transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setMontoRecibido(String(Math.round(total)))}
                className="rounded-full border border-linea bg-white px-3 py-1 text-[0.78rem] font-medium text-tinta-media transition-colors hover:border-brand hover:text-brand"
              >
                Justo
              </button>
              {vuelto > 0 && (
                <p className="text-[0.85rem] text-tinta">
                  Vuelto: <strong className="cifra text-exito">{formatearGuarani(vuelto)}</strong>
                </p>
              )}
            </div>
          </div>
        )}

        {error && (
          <p className="mt-3 rounded-lg bg-peligro-luz px-3 py-2 text-[0.82rem] font-medium text-peligro">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <div className="flex-1">
            <Boton tono="fantasma" tam="lg" onClick={onCerrar} className="w-full">
              Volver
            </Boton>
          </div>
          <div className="flex-[2]">
            <Boton tam="lg" onClick={() => onCobrar(formaPago)} disabled={cobrando} className="w-full">
              {cobrando ? "Cobrando…" : `Cobrar ${formatearGuarani(total)}`}
            </Boton>
          </div>
        </div>
      </div>
    </div>
  );
}
