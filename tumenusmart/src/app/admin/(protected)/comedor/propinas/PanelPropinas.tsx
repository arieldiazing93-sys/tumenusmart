"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Entrada, MensajeError, Pastilla, Tarjeta, Vacio, clasesBoton } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";
import { etiquetaFormaPropina } from "@/lib/propinas";
import { imprimirComprobante, type ResultadoImpresion } from "@/lib/impresion-comprobantes";
import { anularPropina, deshacerPagoDePropinas, pagarPropinasDeMozo, type ResultadoPropina } from "./actions";

export type MozoConPropinas = { mozoId: string; nombre: string; cantidad: number; total: number };

export type PropinaFila = {
  id: string;
  mozo: string;
  /** "Mesa 3 · Cuenta #0005" (la cuenta con la que se cobró), si se la encuentra. */
  cuenta: string | null;
  monto: number;
  forma: string;
  /** "pendiente" | "pagada" | "anulada" */
  estado: string;
  fecha: string;
  registradoPor: string;
  motivoAnulacion: string | null;
};

export type PagoDePropinas = {
  movimientoId: string;
  mozo: string;
  total: number;
  cantidad: number;
  fecha: string;
  pagadoPor: string;
  /** Solo mientras el turno en el que se pagó sigue abierto. */
  sePuedeDeshacer: boolean;
};

const ESTADO: Record<string, { texto: string; color: "amarillo" | "exito" | "peligro" }> = {
  pendiente: { texto: "Pendiente de pagar", color: "amarillo" },
  pagada: { texto: "Pagada", color: "exito" },
  anulada: { texto: "Anulada", color: "peligro" },
};

const ROTULO = "text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave";

/** Lo que se le dice a la persona sobre el comprobante del pago (que sale solo en la impresora del ticket de esta estación). */
function textoDelComprobante(r: ResultadoImpresion): string {
  if (r.ok) return "El comprobante salió en la impresora para que el mozo firme.";
  if (r.motivo === "sin_impresora") {
    return "Esta estación no tiene impresora asignada al ticket, así que no se imprimió el comprobante (se puede reimprimir desde “Pagos a los mozos”).";
  }
  if (r.motivo === "sin_qz") {
    return "No se pudo imprimir el comprobante: QZ Tray no está conectado en esta computadora (se puede reimprimir desde “Pagos a los mozos”).";
  }
  return "No se pudo imprimir el comprobante (se puede reimprimir desde “Pagos a los mozos”).";
}

const urlDelComprobante = (movimientoId: string) => `/admin/comedor/propinas/pago/${movimientoId}/crudo`;

/**
 * Las propinas de los mozos: lo que se le debe a cada uno (con tarjeta o transferencia; la de efectivo no se carga), el botón para
 * pagárselas desde la caja (queda como retiro de caja en el turno abierto), los pagos ya hechos (que se pueden deshacer mientras el
 * turno siga abierto) y el detalle de cada propina cargada.
 */
export function PanelPropinas({
  mozos,
  propinas,
  pagos,
  puedePagar,
  motivoNoPuede,
  nombreImpresoraTicket,
}: {
  mozos: MozoConPropinas[];
  propinas: PropinaFila[];
  pagos: PagoDePropinas[];
  /** Si desde esta computadora se puede pagar (estación con turno abierto y permiso de vender). */
  puedePagar: boolean;
  motivoNoPuede: string | null;
  /** La impresora del ticket de esta estación (donde sale el comprobante del pago), o null si no tiene. */
  nombreImpresoraTicket: string | null;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [anulandoId, setAnulandoId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");

  /** Corre una acción y, si salió bien, actualiza la pantalla. Un fallo inesperado se explica igual. */
  function ejecutar(accion: () => Promise<ResultadoPropina>, alTerminar?: () => void) {
    setError(null);
    setAviso(null);
    iniciar(async () => {
      try {
        const r = await accion();
        if (!r.ok) {
          setError(r.error);
          return;
        }
        if (r.mensaje) setAviso(r.mensaje);
        alTerminar?.();
        router.refresh();
      } catch {
        setError("No se pudo completar la acción. Revisá la conexión y probá de nuevo.");
      }
    });
  }

  /** Le paga al mozo y, si salió bien, imprime el comprobante para que firme (si esta estación tiene impresora del ticket). */
  function pagar(mozoId: string, totalMostrado: number) {
    setError(null);
    setAviso(null);
    iniciar(async () => {
      try {
        const r = await pagarPropinasDeMozo(mozoId, totalMostrado);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        let texto = r.mensaje ?? "";
        if (r.movimientoId) {
          const impresion = await imprimirComprobante(urlDelComprobante(r.movimientoId), nombreImpresoraTicket);
          texto = `${texto} ${textoDelComprobante(impresion)}`.trim();
        }
        setAviso(texto);
        router.refresh();
      } catch {
        setError("No se pudo completar la acción. Revisá la conexión y probá de nuevo.");
      }
    });
  }

  /** Vuelve a imprimir el comprobante de un pago ya hecho. */
  function reimprimir(movimientoId: string) {
    setError(null);
    setAviso(null);
    iniciar(async () => {
      const impresion = await imprimirComprobante(urlDelComprobante(movimientoId), nombreImpresoraTicket);
      if (impresion.ok) setAviso("El comprobante salió en la impresora.");
      else setError(textoDelComprobante(impresion));
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {aviso &&<p className="rounded-lg bg-exito-luz px-3 py-2 text-[0.84rem] font-medium text-exito">{aviso}</p>}
      {error && <MensajeError>{error}</MensajeError>}

      {/* ------------------------------------------------------------------- lo que se le debe a cada mozo */}
      <section className="flex flex-col gap-2">
        <p className={ROTULO}>Pendientes de pagar</p>
        {!puedePagar && motivoNoPuede && (
          <p className="rounded-lg border border-amarillo/60 bg-amarillo-luz px-3 py-2 text-[0.8rem] text-amarillo-oscuro">
            {motivoNoPuede}
          </p>
        )}
        {mozos.length === 0 ? (
          <Vacio titulo="No hay propinas pendientes" detalle="Cuando un cliente deje propina con tarjeta o transferencia al pagar una cuenta, aparece acá a nombre del mozo." />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {mozos.map((m) => (
              <li key={m.mozoId} className="flex flex-col gap-2 rounded-xl border-2 border-azul/50 bg-superficie p-3.5">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-[1rem] font-semibold text-tinta">{m.nombre}</p>
                  <p className="cifra flex-none text-[1.2rem] font-bold text-tinta">{formatearGuarani(m.total)}</p>
                </div>
                <p className="text-[0.78rem] text-tinta-suave">
                  {m.cantidad} {m.cantidad === 1 ? "propina" : "propinas"} pendientes
                </p>
                <button
                  type="button"
                  disabled={pendiente || !puedePagar}
                  onClick={() => {
                    if (
                      !confirm(
                        `¿Pagarle ${formatearGuarani(m.total)} a ${m.nombre} en efectivo? Sale de la caja del turno abierto y queda como un retiro de caja.`
                      )
                    ) {
                      return;
                    }
                    // Se paga todo lo pendiente; el monto que se vio viaja para que el servidor avise si cambió.
                    pagar(m.mozoId, m.total);
                  }}
                  className={clasesBoton("principal", "md")}
                >
                  Pagar propinas
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------------------------------------------------------------- los pagos ya hechos */}
      {pagos.length > 0 && (
        <section className="flex flex-col gap-2">
          <p className={ROTULO}>Pagos a los mozos</p>
          <ul className="flex flex-col gap-1.5">
            {pagos.map((p) => (
              <li
                key={p.movimientoId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-linea bg-superficie px-3 py-2"
              >
                <p className="min-w-0 text-[0.84rem] text-tinta">
                  <strong className="font-semibold">{p.mozo}</strong> · {formatearGuarani(p.total)} · {p.cantidad}{" "}
                  {p.cantidad === 1 ? "propina" : "propinas"}
                  <span className="block text-[0.74rem] text-tinta-suave">
                    {p.fecha} · pagó {p.pagadoPor} · retiro de caja
                  </span>
                </p>
                <div className="flex flex-none flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={pendiente}
                    onClick={() => reimprimir(p.movimientoId)}
                    className={clasesBoton("navegar", "sm")}
                  >
                    Imprimir comprobante
                  </button>
                {p.sePuedeDeshacer && (
                  <button
                    type="button"
                    disabled={pendiente}
                    onClick={() => {
                      if (
                        !confirm(
                          "¿Deshacer este pago? Las propinas vuelven a quedar pendientes y se borra el retiro de la caja (solo se puede mientras el turno sigue abierto)."
                        )
                      ) {
                        return;
                      }
                      ejecutar(() => deshacerPagoDePropinas(p.movimientoId));
                    }}
                    className={clasesBoton("peligro", "sm")}
                  >
                    Deshacer pago
                  </button>
                )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* --------------------------------------------------------------------------- cada propina cargada */}
      {propinas.length > 0 && (
        <section className="flex flex-col gap-2">
          <p className={ROTULO}>Propinas cargadas (las últimas {propinas.length})</p>
          <Tarjeta padding={false} className="overflow-hidden">
            <ul className="divide-y divide-linea-fina">
              {propinas.map((p) => {
                const estado = ESTADO[p.estado] ?? { texto: p.estado, color: "amarillo" as const };
                return (
                  <li key={p.id} className="flex flex-col gap-1.5 px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="min-w-0 text-[0.86rem] text-tinta">
                        <strong className="font-semibold">{p.mozo}</strong> ·{" "}
                        <span className="cifra font-semibold">{formatearGuarani(p.monto)}</span> ·{" "}
                        {etiquetaFormaPropina(p.forma)}
                        <span className="block text-[0.74rem] text-tinta-suave">
                          {p.fecha}
                          {p.cuenta ? ` · ${p.cuenta}` : ""} · la cargó {p.registradoPor}
                        </span>
                      </p>
                      <div className="flex flex-none items-center gap-2">
                        <Pastilla color={estado.color}>{estado.texto}</Pastilla>
                        {p.estado === "pendiente" && anulandoId !== p.id && (
                          <button
                            type="button"
                            disabled={pendiente}
                            onClick={() => {
                              setAnulandoId(p.id);
                              setMotivo("");
                              setError(null);
                            }}
                            className={clasesBoton("peligro", "sm")}
                          >
                            Anular
                          </button>
                        )}
                      </div>
                    </div>
                    {p.estado === "anulada" && p.motivoAnulacion && (
                      <p className="text-[0.74rem] text-peligro">Motivo: {p.motivoAnulacion}</p>
                    )}
                    {anulandoId === p.id && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Entrada
                          autoFocus
                          value={motivo}
                          onChange={(e) => setMotivo(e.target.value)}
                          maxLength={200}
                          placeholder="Motivo de la anulación"
                          aria-label="Motivo de la anulación"
                          className="min-w-[12rem] flex-1"
                        />
                        <button
                          type="button"
                          disabled={pendiente || motivo.trim().length < 3}
                          onClick={() => ejecutar(() => anularPropina(p.id, motivo), () => setAnulandoId(null))}
                          className={clasesBoton("peligro", "sm")}
                        >
                          Anular propina
                        </button>
                        <button type="button" onClick={() => setAnulandoId(null)} className={clasesBoton("peligro", "sm")}>
                          Cancelar
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Tarjeta>
        </section>
      )}
    </div>
  );
}
