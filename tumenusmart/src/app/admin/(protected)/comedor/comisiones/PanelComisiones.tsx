"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Campo, Entrada, MensajeError, Tarjeta, Vacio, clasesBoton, clasesDeCampo } from "@/components/ui";
import { EntradaMonto } from "@/components/EntradaMonto";
import { useAutorizacion } from "@/components/Autorizacion";
import { formatearGuarani } from "@/lib/format";
import { imprimirComprobante, type ResultadoImpresion } from "@/lib/impresion-comprobantes";
import { deshacerPagoDeComision, pagarComisionDeMozo, type ResultadoComision } from "./actions";

export type MozoConComision = {
  mozoId: string;
  nombre: string;
  activo: boolean;
  /** El % de comisión que tiene hoy (null = sin comisión configurada). */
  porcentaje: number | null;
  ganada: number;
  pagada: number;
  pendiente: number;
};

export type PagoDeComisionFila = {
  id: string;
  /** El retiro de caja con el que se pagó: con él se imprime el comprobante. */
  movimientoId: string;
  mozo: string;
  monto: number;
  /** "del 01/10/2026 al 07/10/2026" o "". */
  periodo: string;
  nota: string | null;
  fecha: string;
  pagadoPor: string;
  /** Solo mientras el turno en el que se pagó sigue abierto. */
  sePuedeDeshacer: boolean;
};

const ROTULO = "text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave";

/** Lo que se le dice a la persona sobre el comprobante del pago (que sale solo en la impresora del ticket de esta estación). */
function textoDelComprobante(r: ResultadoImpresion): string {
  if (r.ok) return "El comprobante salió en la impresora para que el mozo firme.";
  if (r.motivo === "sin_impresora") {
    return "Esta estación no tiene impresora asignada al ticket, así que no se imprimió el comprobante (se puede reimprimir desde “Pagos hechos”).";
  }
  if (r.motivo === "sin_qz") {
    return "No se pudo imprimir el comprobante: QZ Tray no está conectado en esta computadora (se puede reimprimir desde “Pagos hechos”).";
  }
  return "No se pudo imprimir el comprobante (se puede reimprimir desde “Pagos hechos”).";
}

const urlDelComprobante = (movimientoId: string) => `/admin/comedor/comisiones/pago/${movimientoId}/crudo`;

/**
 * Las comisiones de los mozos: lo ganado, lo pagado y lo que se les debe, el formulario para pagarles (monto, período opcional y nota;
 * sale como retiro de caja del turno abierto), los pagos ya hechos (con su comprobante y, mientras el turno siga abierto, deshacer).
 */
export function PanelComisiones({
  mozos,
  pagos,
  puedePagar,
  motivoNoPuede,
  nombreImpresoraTicket,
}: {
  mozos: MozoConComision[];
  pagos: PagoDeComisionFila[];
  /** Si desde esta computadora se puede pagar (estación con turno abierto y permiso de vender). */
  puedePagar: boolean;
  motivoNoPuede: string | null;
  /** La impresora del ticket de esta estación (donde sale el comprobante del pago), o null si no tiene. */
  nombreImpresoraTicket: string | null;
}) {
  const router = useRouter();
  const { autorizar, dialogo } = useAutorizacion();
  const [enCurso, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // El mozo al que se le está cargando un pago y lo que se escribió.
  const [pagandoId, setPagandoId] = useState<string | null>(null);
  const [monto, setMonto] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [nota, setNota] = useState("");

  function abrirPago(m: MozoConComision) {
    setPagandoId(m.mozoId);
    setMonto(String(Math.round(m.pendiente)));
    setDesde("");
    setHasta("");
    setNota("");
    setError(null);
    setAviso(null);
  }

  /** Registra el pago y, si salió bien, imprime el comprobante para que firme (si esta estación tiene impresora del ticket). */
  function pagar(m: MozoConComision) {
    const importe = Number(monto);
    setError(null);
    setAviso(null);
    iniciar(async () => {
      try {
        const r = await autorizar((clave) =>
          pagarComisionDeMozo({ mozoId: m.mozoId, monto: importe, desde: desde || null, hasta: hasta || null, nota: nota || null }, clave)
        );
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
        setPagandoId(null);
        router.refresh();
      } catch {
        setError("No se pudo completar la acción. Revisá la conexión y probá de nuevo.");
      }
    });
  }

  function deshacer(pagoId: string) {
    setError(null);
    setAviso(null);
    iniciar(async () => {
      try {
        const r: ResultadoComision = await autorizar((clave) => deshacerPagoDeComision(pagoId, clave));
        if (!r.ok) {
          setError(r.error);
          return;
        }
        if (r.mensaje) setAviso(r.mensaje);
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
      {aviso && <p className="rounded-lg bg-exito-luz px-3 py-2 text-[0.84rem] font-medium text-exito">{aviso}</p>}
      {error && <MensajeError>{error}</MensajeError>}

      {/* ------------------------------------------------------------------- lo que se le debe a cada mozo */}
      <section className="flex flex-col gap-2">
        <p className={ROTULO}>Comisión de cada mozo</p>
        {!puedePagar && motivoNoPuede && (
          <p className="rounded-lg border border-amarillo/60 bg-amarillo-luz px-3 py-2 text-[0.8rem] text-amarillo-oscuro">
            {motivoNoPuede}
          </p>
        )}
        {mozos.length === 0 ? (
          <Vacio
            titulo="Todavía no hay comisiones"
            detalle="Cargá el % de comisión de un mozo en Ajustes → Mozos. Desde ese momento, cada cuenta que cobre le suma comisión y se acumula acá."
          />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {mozos.map((m) => {
              const abierto = pagandoId === m.mozoId;
              const importe = Number(monto);
              const montoInvalido = !Number.isFinite(importe) || importe <= 0 || importe > m.pendiente;
              const periodoAlReves = desde !== "" && hasta !== "" && desde > hasta;
              return (
                <li key={m.mozoId} className="flex flex-col gap-2.5 rounded-xl border-2 border-azul/50 bg-superficie p-3.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[1rem] font-semibold text-tinta">
                      {m.nombre}
                      {!m.activo && <span className="ml-1.5 text-[0.72rem] font-medium text-tinta-suave">(inactivo)</span>}
                    </p>
                    <p className="flex-none text-[0.74rem] text-tinta-suave">
                      {m.porcentaje != null && m.porcentaje > 0 ? `${String(m.porcentaje).replace(".", ",")} % de comisión` : "Sin comisión configurada"}
                    </p>
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-papel-suave px-1.5 py-1.5">
                      <dt className="text-[0.68rem] font-semibold uppercase tracking-rotulo text-tinta-suave">Ganó</dt>
                      <dd className="cifra text-[0.9rem] font-semibold text-tinta">{formatearGuarani(m.ganada)}</dd>
                    </div>
                    <div className="rounded-lg bg-papel-suave px-1.5 py-1.5">
                      <dt className="text-[0.68rem] font-semibold uppercase tracking-rotulo text-tinta-suave">Se le pagó</dt>
                      <dd className="cifra text-[0.9rem] font-semibold text-tinta">{formatearGuarani(m.pagada)}</dd>
                    </div>
                    <div className="rounded-lg bg-amarillo-luz px-1.5 py-1.5">
                      <dt className="text-[0.68rem] font-semibold uppercase tracking-rotulo text-amarillo-oscuro">Se le debe</dt>
                      <dd className="cifra text-[0.95rem] font-bold text-tinta">{formatearGuarani(m.pendiente)}</dd>
                    </div>
                  </dl>

                  {!abierto && (
                    <button
                      type="button"
                      disabled={enCurso || !puedePagar || m.pendiente <= 0}
                      onClick={() => abrirPago(m)}
                      className={clasesBoton("nuevo", "md")}
                    >
                      Registrar pago
                    </button>
                  )}

                  {abierto && (
                    <div className="flex flex-col gap-2.5 rounded-lg border border-linea bg-papel-suave p-3">
                      <Campo etiqueta="Monto a pagar *" ayuda={`Hasta ${formatearGuarani(m.pendiente)}. Podés pagar solo una parte.`}>
                        <EntradaMonto
                          autoFocus
                          value={monto}
                          onChange={setMonto}
                          className={`${clasesDeCampo(monto !== "" && montoInvalido)} cifra`}
                        />
                      </Campo>
                      <div className="grid grid-cols-2 gap-2">
                        <Campo etiqueta="Ventas desde" ayuda="Opcional">
                          <Entrada type="date" value={desde} onChange={(e) => setDesde(e.target.value)} invalido={periodoAlReves} />
                        </Campo>
                        <Campo etiqueta="Ventas hasta" ayuda="Opcional">
                          <Entrada type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} invalido={periodoAlReves} />
                        </Campo>
                      </div>
                      {periodoAlReves && <MensajeError>«Desde» tiene que ser antes que «hasta».</MensajeError>}
                      <Campo etiqueta="Nota" ayuda="Opcional: por ejemplo, “quincena del 1 al 15”.">
                        <Entrada value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} />
                      </Campo>
                      <p className="text-[0.76rem] text-tinta-suave">
                        Sale en efectivo de la caja del turno abierto y queda como un retiro de caja con el nombre del mozo.
                      </p>
                      <div className="flex flex-wrap justify-end gap-2">
                        <button type="button" disabled={enCurso} onClick={() => setPagandoId(null)} className={clasesBoton("peligro", "md")}>
                          Cancelar
                        </button>
                        <button
                          type="button"
                          disabled={enCurso || montoInvalido || periodoAlReves}
                          onClick={() => {
                            if (
                              !confirm(
                                `¿Pagarle ${formatearGuarani(importe)} a ${m.nombre} en efectivo? Sale de la caja del turno abierto y queda como un retiro de caja.`
                              )
                            ) {
                              return;
                            }
                            pagar(m);
                          }}
                          className={clasesBoton("principal", "md")}
                        >
                          {enCurso ? "Pagando…" : "Pagar comisión"}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ------------------------------------------------------------------------------- los pagos ya hechos */}
      {pagos.length > 0 && (
        <section className="flex flex-col gap-2">
          <p className={ROTULO}>Pagos hechos (los últimos {pagos.length})</p>
          <Tarjeta padding={false} className="overflow-hidden">
            <ul className="divide-y divide-linea-fina">
              {pagos.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                  <p className="min-w-0 text-[0.86rem] text-tinta">
                    <strong className="font-semibold">{p.mozo}</strong> ·{" "}
                    <span className="cifra font-semibold">{formatearGuarani(p.monto)}</span>
                    {p.periodo && <span className="text-tinta-media"> · ventas {p.periodo}</span>}
                    <span className="block text-[0.74rem] text-tinta-suave">
                      {p.fecha} · pagó {p.pagadoPor} · retiro de caja{p.nota ? ` · ${p.nota}` : ""}
                    </span>
                  </p>
                  <div className="flex flex-none flex-wrap items-center gap-2">
                    <button type="button" disabled={enCurso} onClick={() => reimprimir(p.movimientoId)} className={clasesBoton("navegar", "sm")}>
                      Imprimir comprobante
                    </button>
                    {p.sePuedeDeshacer && (
                      <button
                        type="button"
                        disabled={enCurso}
                        onClick={() => {
                          if (
                            !confirm(
                              "¿Deshacer este pago? Se borra el retiro de la caja y lo que se le debe al mozo vuelve a subir (solo se puede mientras el turno sigue abierto)."
                            )
                          ) {
                            return;
                          }
                          deshacer(p.id);
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
          </Tarjeta>
        </section>
      )}
      {dialogo}
    </div>
  );
}
