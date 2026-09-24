"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Campo, Entrada, Selector, clasesBoton } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";
import { FORMAS_PAGO_PROVEEDOR } from "@/lib/pagos-compra";
import { registrarPagoCompra } from "./actions";

/** El día de hoy en la zona del navegador (toISOString daría el de UTC, y de noche ya es "mañana"). */
function hoyLocal(): string {
  return new Date().toLocaleDateString("en-CA");
}

/**
 * El botón "Registrar pago" de una compra a crédito: abre un modal centrado
 * para anotar cuánto se le pagó al proveedor, cuándo y cómo. El monto arranca
 * en lo que falta pagar (el caso más común: pagar todo de una vez) y se puede
 * bajar para un pago parcial.
 */
export function RegistrarPagoBoton({
  compraId,
  saldo,
  descripcion,
  tam = "sm",
}: {
  compraId: string;
  /** Lo que falta pagar de la compra. */
  saldo: number;
  /** "Proveedor — folio", para que el modal diga a qué compra se le está pagando. */
  descripcion: string;
  tam?: "sm" | "md";
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className={clasesBoton("principal", tam)}>
        Registrar pago
      </button>
      {abierto && (
        <ModalPago compraId={compraId} saldo={saldo} descripcion={descripcion} onCerrar={() => setAbierto(false)} />
      )}
    </>
  );
}

function ModalPago({
  compraId,
  saldo,
  descripcion,
  onCerrar,
}: {
  compraId: string;
  saldo: number;
  descripcion: string;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [monto, setMonto] = useState(String(saldo));
  const [fecha, setFecha] = useState(hoyLocal);
  const [formaPago, setFormaPago] = useState<string>("efectivo");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      if (e.key === "Escape" && !pendiente) onCerrar();
    }
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [onCerrar, pendiente]);

  function guardar() {
    setError(null);
    const valor = Number(monto);
    if (!Number.isFinite(valor) || valor <= 0) {
      setError("Escribí cuánto se pagó.");
      return;
    }
    iniciar(async () => {
      const resultado = await registrarPagoCompra(compraId, {
        monto: valor,
        fecha,
        formaPago,
        notas: notas.trim() || null,
      });
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      onCerrar();
      router.refresh();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/45 p-4"
      onClick={() => {
        if (!pendiente) onCerrar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Registrar pago"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-superficie p-5 shadow-alta animate-[subir_0.22s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[1.05rem] font-semibold text-tinta">Registrar pago</p>
        <p className="mt-0.5 text-[0.85rem] text-tinta-media">{descripcion}</p>
        <p className="cifra mt-3 rounded-lg bg-papel-suave px-3 py-2 text-[0.88rem] text-tinta">
          Falta pagar: <span className="font-semibold">{formatearGuarani(saldo)}</span>
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo etiqueta="Monto pagado (Gs.)">
            <Entrada
              type="number"
              step="any"
              min="0"
              autoFocus
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
          </Campo>
          <Campo etiqueta="Fecha del pago">
            <Entrada type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Campo>
          <Campo etiqueta="Forma de pago">
            <Selector value={formaPago} onChange={(e) => setFormaPago(e.target.value)}>
              {FORMAS_PAGO_PROVEEDOR.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.etiqueta}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Nota (opcional)">
            <Entrada
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ej: N° de transferencia"
            />
          </Campo>
        </div>

        {error && <p className="mt-3 text-sm font-medium text-peligro">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={pendiente} onClick={onCerrar} className={clasesBoton("suave")}>
            Cancelar
          </button>
          <button type="button" disabled={pendiente} onClick={guardar} className={clasesBoton("principal")}>
            {pendiente ? "Guardando…" : "Guardar pago"}
          </button>
        </div>
      </div>
    </div>
  );
}
