"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { clasesBoton, Entrada, Pastilla } from "@/components/ui";
import { Segmentado } from "@/components/Segmentado";
import { formatearGuarani } from "@/lib/format";
import {
  eliminarMovimientoCaja,
  listarMovimientosCaja,
  registrarMovimientoCaja,
  type MovimientoCajaFila,
  type TipoMovimientoCaja,
} from "./actions";

/**
 * El botón "Caja" del Punto de Venta: abre un cuadro para anotar la plata que
 * entra a la caja o sale de ella en efectivo durante el turno (cambio que se
 * repone, un gasto pagado del cajón, un retiro del dueño…). Lo anotado suma o
 * resta al efectivo que tendría que haber al cerrar, así el corte cuadra.
 */
export function MovimientosCajaBoton({ turnoId }: { turnoId: string }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className={clasesBoton("navegar", "sm")}>
        💰 Caja: ingresos y retiros
      </button>
      {abierto && <ModalCaja turnoId={turnoId} onCerrar={() => setAbierto(false)} />}
    </>
  );
}

function horaCorta(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function ModalCaja({ turnoId, onCerrar }: { turnoId: string; onCerrar: () => void }) {
  const [pendiente, iniciar] = useTransition();
  const [tipo, setTipo] = useState<TipoMovimientoCaja>("retiro");
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [movimientos, setMovimientos] = useState<MovimientoCajaFila[]>([]);
  const [totales, setTotales] = useState({ ingresos: 0, retiros: 0, neto: 0 });

  const cargar = useCallback(async () => {
    const r = await listarMovimientosCaja(turnoId);
    setCargando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setMovimientos(r.movimientos);
    setTotales({ ingresos: r.ingresos, retiros: r.retiros, neto: r.neto });
  }, [turnoId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      if (e.key === "Escape" && !pendiente) onCerrar();
    }
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [onCerrar, pendiente]);

  function registrar() {
    setError(null);
    const valor = Number(monto);
    if (!Number.isFinite(valor) || valor <= 0) {
      setError("Escribí el monto.");
      return;
    }
    if (!concepto.trim()) {
      setError("Escribí para qué es: queda en el historial del turno.");
      return;
    }
    iniciar(async () => {
      const r = await registrarMovimientoCaja(turnoId, { tipo, monto: valor, concepto });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setMonto("");
      setConcepto("");
      await cargar();
    });
  }

  function eliminar(id: string) {
    if (!confirm("¿Eliminar este movimiento de caja?")) return;
    setError(null);
    iniciar(async () => {
      const r = await eliminarMovimientoCaja(id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      await cargar();
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
        aria-label="Movimientos de caja"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-alta animate-[subir_0.22s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[1.05rem] font-semibold text-tinta">Caja: ingresos y retiros</p>
            <p className="text-[0.82rem] text-tinta-media">
              Solo plata en efectivo. Suma o resta al efectivo que tendría que haber al cerrar el turno.
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

        <div className="cifra mt-4 grid grid-cols-3 gap-2 text-center text-[0.82rem]">
          <div className="rounded-lg bg-papel-suave px-2 py-2">
            <p className="text-tinta-media">Ingresos</p>
            <p className="font-semibold text-exito">+ {formatearGuarani(totales.ingresos)}</p>
          </div>
          <div className="rounded-lg bg-papel-suave px-2 py-2">
            <p className="text-tinta-media">Retiros</p>
            <p className="font-semibold text-peligro">− {formatearGuarani(totales.retiros)}</p>
          </div>
          <div className="rounded-lg bg-papel-suave px-2 py-2">
            <p className="text-tinta-media">Neto</p>
            <p className="font-semibold text-tinta">{formatearGuarani(totales.neto)}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2.5 rounded-lg border border-linea p-3">
          <Segmentado
            opciones={[
              { value: "retiro", label: "− Retiro (sale plata)" },
              { value: "ingreso", label: "+ Ingreso (entra plata)" },
            ]}
            valor={tipo}
            onChange={setTipo}
            color="tinta"
          />
          <Entrada
            type="number"
            min="0"
            step="any"
            inputMode="numeric"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="Monto en Gs."
          />
          <Entrada
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            maxLength={200}
            placeholder={
              tipo === "retiro"
                ? "Para qué: pago a proveedor, retiro del dueño, cambio…"
                : "Para qué: reposición de cambio, aporte, cobro de cuenta…"
            }
          />
          <div>
            <button type="button" disabled={pendiente} onClick={registrar} className={clasesBoton("principal", "sm")}>
              {pendiente ? "Guardando…" : tipo === "retiro" ? "Registrar retiro" : "Registrar ingreso"}
            </button>
          </div>
        </div>

        {error && <p className="mt-3 text-sm font-medium text-peligro">{error}</p>}

        <div className="mt-4">
          <p className="mb-1.5 text-[0.75rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
            Movimientos de este turno
          </p>
          {cargando ? (
            <p className="text-sm text-tinta-suave">Cargando…</p>
          ) : movimientos.length === 0 ? (
            <p className="rounded-lg border border-dashed border-linea px-3 py-4 text-center text-sm text-tinta-suave">
              Todavía no anotaste ningún movimiento en este turno.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-linea rounded-lg border border-linea">
              {movimientos.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[0.88rem] font-medium text-tinta">{m.concepto}</p>
                    <p className="text-xs text-tinta-suave">
                      {horaCorta(m.creadoEn)} · {m.registradoPor}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Pastilla color={m.tipo === "retiro" ? "peligro" : "exito"}>
                      {m.tipo === "retiro" ? "−" : "+"} {formatearGuarani(m.monto)}
                    </Pastilla>
                    {!m.esCobro && (
                      <button
                        type="button"
                        disabled={pendiente}
                        onClick={() => eliminar(m.id)}
                        className={clasesBoton("peligro", "sm")}
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
