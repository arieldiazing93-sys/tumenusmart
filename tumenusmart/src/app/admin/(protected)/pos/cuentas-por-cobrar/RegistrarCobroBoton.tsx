"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Campo, Entrada, Selector, clasesBoton } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";
import { FORMAS_PAGO_POS } from "@/lib/turno-pos";
import { registrarCobroVenta } from "./actions";

/** El día de hoy en la zona del navegador (toISOString daría el de UTC, y de noche ya es "mañana"). */
function hoyLocal(): string {
  return new Date().toLocaleDateString("en-CA");
}

/**
 * El botón "Registrar cobro" de una venta a crédito: abre un cuadro centrado
 * para anotar cuánto pagó el cliente, cuándo y cómo. El monto arranca en lo que
 * falta cobrar y se puede bajar para un cobro parcial. Si paga en efectivo, la
 * plata entra a la caja del turno abierto (y se anota como ingreso de caja).
 */
export function RegistrarCobroBoton({
  ventaId,
  saldo,
  descripcion,
  tam = "sm",
}: {
  ventaId: string;
  /** Lo que falta cobrar de la venta. */
  saldo: number;
  /** "Venta #0007 — cliente", para que el cuadro diga a qué venta se le está cobrando. */
  descripcion: string;
  tam?: "sm" | "md";
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className={clasesBoton("principal", tam)}>
        Registrar cobro
      </button>
      {abierto && (
        <ModalCobro ventaId={ventaId} saldo={saldo} descripcion={descripcion} onCerrar={() => setAbierto(false)} />
      )}
    </>
  );
}

function ModalCobro({
  ventaId,
  saldo,
  descripcion,
  onCerrar,
}: {
  ventaId: string;
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
      setError("Escribí cuánto pagó.");
      return;
    }
    iniciar(async () => {
      const resultado = await registrarCobroVenta(ventaId, {
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
        aria-label="Registrar cobro"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-alta animate-[subir_0.22s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[1.05rem] font-semibold text-tinta">Registrar cobro</p>
        <p className="mt-0.5 text-[0.85rem] text-tinta-media">{descripcion}</p>
        <p className="cifra mt-3 rounded-lg bg-papel-suave px-3 py-2 text-[0.88rem] text-tinta">
          Falta cobrar: <span className="font-semibold">{formatearGuarani(saldo)}</span>
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo etiqueta="Monto cobrado (Gs.)">
            <Entrada
              type="number"
              step="any"
              min="0"
              autoFocus
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
            />
          </Campo>
          <Campo etiqueta="Fecha del cobro">
            <Entrada type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Campo>
          <Campo etiqueta="Forma de pago">
            <Selector value={formaPago} onChange={(e) => setFormaPago(e.target.value)}>
              {FORMAS_PAGO_POS.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.etiqueta}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Nota (opcional)">
            <Entrada value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej: N° de transferencia" />
          </Campo>
        </div>

        {formaPago === "efectivo" && (
          <p className="mt-3 rounded-lg bg-papel-suave px-3 py-2 text-[0.8rem] text-tinta-media">
            En efectivo: la plata entra a la caja del turno abierto y queda anotada como ingreso de caja.
          </p>
        )}

        {error && <p className="mt-3 text-sm font-medium text-peligro">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={pendiente} onClick={onCerrar} className={clasesBoton("suave")}>
            Cancelar
          </button>
          <button type="button" disabled={pendiente} onClick={guardar} className={clasesBoton("principal")}>
            {pendiente ? "Guardando…" : "Guardar cobro"}
          </button>
        </div>
      </div>
    </div>
  );
}
