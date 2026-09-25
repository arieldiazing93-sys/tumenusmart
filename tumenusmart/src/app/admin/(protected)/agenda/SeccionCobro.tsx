"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Campo, Entrada, Selector, clasesBoton } from "@/components/ui";
import type { DatosCobro, EstadoCaja } from "@/lib/agenda-cita";
import { formatearGuarani } from "@/lib/format";
import { TIPOS_IDENTIFICACION_FISCAL } from "@/lib/tipo-cliente";
import { FORMAS_PAGO_POS, type FormaPagoPos } from "@/lib/turno-pos";
import { buscarClientePorIdentificacion } from "../pos/actions";
import { EntradaConLupa } from "../pos/EntradaConLupa";
import { BloqueCita, Conmutador } from "./BloqueCita";
import { IconoBanco, IconoBillete, IconoRecibo, IconoTarjeta, IconoTilde } from "./IconosAgenda";

/**
 * Cada forma de pago con su color: el efectivo en verde, la transferencia en azul, el
 * débito en violeta y el crédito en rosa. En reposo es una tarjeta suave del color; al
 * elegirla se llena de degradado, con una tilde que aparece con un saltito.
 */
const ESTILO_FORMA: Record<
  FormaPagoPos,
  { icono: ReactNode; reposo: string; activa: string; tilde: string }
> = {
  efectivo: {
    icono: <IconoBillete tam={18} />,
    reposo: "border-emerald-200 bg-emerald-50/70 text-emerald-900 hover:border-emerald-400 hover:bg-emerald-50",
    activa:
      "border-transparent bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-600/30 ring-2 ring-emerald-300",
    tilde: "text-emerald-600",
  },
  transferencia: {
    icono: <IconoBanco tam={18} />,
    reposo: "border-sky-200 bg-sky-50/70 text-sky-900 hover:border-sky-400 hover:bg-sky-50",
    activa:
      "border-transparent bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-lg shadow-blue-600/30 ring-2 ring-sky-300",
    tilde: "text-blue-600",
  },
  tarjeta_debito: {
    icono: <IconoTarjeta tam={18} />,
    reposo: "border-violet-200 bg-violet-50/70 text-violet-900 hover:border-violet-400 hover:bg-violet-50",
    activa:
      "border-transparent bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-lg shadow-purple-600/30 ring-2 ring-violet-300",
    tilde: "text-purple-600",
  },
  tarjeta_credito: {
    icono: <IconoTarjeta tam={18} />,
    reposo: "border-pink-200 bg-pink-50/70 text-pink-900 hover:border-pink-400 hover:bg-pink-50",
    activa:
      "border-transparent bg-gradient-to-br from-pink-500 to-rose-600 text-white shadow-lg shadow-rose-600/30 ring-2 ring-pink-300",
    tilde: "text-rose-600",
  },
};

/**
 * El cobro dentro del detalle de la cita: cómo paga el cliente y qué comprobante
 * se emite (ticket o factura). Lo que se cobra entra en el turno de caja abierto
 * de esta computadora, igual que en el punto de venta.
 *
 * No cobra por su cuenta: solo junta los datos. Cobra el botón principal del pie
 * del panel, cuando la cita está en estado Finalizada.
 */
export function SeccionCobro({
  valor,
  onCambio,
  caja,
  total,
  cobrando,
  retraso = 0,
}: {
  valor: DatosCobro;
  onCambio: (cambios: Partial<DatosCobro>) => void;
  caja: EstadoCaja;
  total: number;
  /** Si el estado de la cita ya está en Finalizada (se cobra al guardar). */
  cobrando: boolean;
  /** Milisegundos que espera para entrar (las tarjetas del detalle entran una tras otra). */
  retraso?: number;
}) {
  const [pagaCon, setPagaCon] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [avisoBusqueda, setAvisoBusqueda] = useState<string | null>(null);

  const esFactura = valor.comprobanteTipo === "factura";
  const vuelto = valor.forma === "efectivo" ? (parseFloat(pagaCon) || 0) - total : 0;

  async function buscarCliente() {
    const numero = valor.numeroIdentificacion.trim();
    if (!numero) return;
    setBuscando(true);
    setAvisoBusqueda(null);
    try {
      const r = await buscarClientePorIdentificacion(numero);
      if (r.ok) {
        onCambio({ razonSocial: r.nombre, tipoIdentificacion: r.tipoIdentificacion });
        setAvisoBusqueda("Cliente encontrado.");
      } else {
        setAvisoBusqueda("No hay un cliente con ese número: completá los datos y se guarda al cobrar.");
      }
    } catch {
      setAvisoBusqueda("No se pudo buscar. Completá los datos a mano.");
    }
    setBuscando(false);
  }

  return (
    <BloqueCita titulo="Cobro en caja" icono={<IconoBillete tam={17} />} tono="esmeralda" retraso={retraso}>
      <p
        className={`-mt-1 rounded-lg px-3 py-2 text-[0.8rem] leading-snug ${
          cobrando ? "bg-emerald-100 font-medium text-emerald-800" : "bg-papel-suave text-tinta-suave"
        }`}
      >
        {cobrando
          ? "Al tocar Cobrar, el pago entra en el turno de caja y la cita queda finalizada."
          : "Elegí cómo paga para cobrar y finalizar la cita."}
      </p>

      {/* ---------- la caja ---------- */}
      {caja.listo ? (
        <p className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[0.82rem] font-semibold text-emerald-800">
          {/* Un puntito verde que late: hay un turno abierto y listo para cobrar. */}
          <span className="relative flex h-2.5 w-2.5 flex-none">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          Caja {caja.estacion} · turno abierto
        </p>
      ) : (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p className="text-[0.86rem] font-semibold text-amber-900">
            {caja.motivo === "sin_estacion"
              ? "Esta computadora no está vinculada a una caja"
              : "No hay un turno de caja abierto"}
          </p>
          <p className="mt-1 text-[0.8rem] leading-snug text-amber-800">
            {caja.motivo === "sin_estacion"
              ? "Para cobrar, la computadora tiene que estar vinculada a una caja en Punto de venta → Estaciones (lo hace el dueño)."
              : "Abrí el turno de caja para poder cobrar: lo que se cobra acá entra en esa caja."}
          </p>
          <div className="mt-2.5">
            <Link
              href={caja.motivo === "sin_estacion" ? "/admin/pos/estaciones" : "/admin/pos/abrir"}
              className={clasesBoton("navegar", "sm")}
            >
              {caja.motivo === "sin_estacion" ? "Ir a Estaciones" : "Abrir turno de caja"}
            </Link>
          </div>
        </div>
      )}

      {/* ---------- forma de pago ---------- */}
      <div>
        <p className="mb-2 text-[0.82rem] font-semibold text-tinta">Método de pago</p>
        <div className="grid grid-cols-2 gap-2.5">
          {FORMAS_PAGO_POS.map((f) => {
            const estilo = ESTILO_FORMA[f.valor];
            const elegida = valor.forma === f.valor;
            return (
              <button
                key={f.valor}
                type="button"
                onClick={() => onCambio({ forma: f.valor })}
                aria-pressed={elegida}
                className={`relative flex min-h-[3.4rem] min-w-0 items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 text-left text-[0.86rem] font-semibold leading-tight transition-all duration-200 hover:-translate-y-0.5 active:scale-95 ${
                  elegida ? estilo.activa : estilo.reposo
                }`}
              >
                <span
                  className={`flex h-9 w-9 flex-none items-center justify-center rounded-full transition-colors ${
                    elegida ? "bg-white/25" : "bg-white"
                  }`}
                >
                  {estilo.icono}
                </span>
                <span className="min-w-0">{f.etiqueta}</span>
                {elegida && (
                  <span
                    aria-hidden="true"
                    className={`absolute right-1.5 top-1.5 flex h-5 w-5 animate-pop items-center justify-center rounded-full bg-white shadow ${estilo.tilde}`}
                  >
                    <IconoTilde tam={12} />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {valor.forma === "efectivo" && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5">
            <label htmlFor="cita-paga-con" className="text-[0.75rem] font-semibold uppercase tracking-rotulo text-emerald-800">
              Paga con
            </label>
            <input
              id="cita-paga-con"
              type="number"
              min={0}
              step={1000}
              inputMode="numeric"
              value={pagaCon}
              onChange={(e) => setPagaCon(e.target.value)}
              onWheel={(e) => e.currentTarget.blur()}
              placeholder={String(Math.round(total))}
              className="w-32 rounded-lg border border-emerald-200 bg-superficie px-2.5 py-1.5 text-center text-[0.95rem] font-semibold text-tinta focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
            {vuelto > 0 && (
              <p className="ml-auto text-[0.88rem] text-tinta">
                Vuelto: <strong key={vuelto} className="cifra inline-block animate-pop text-emerald-700">{formatearGuarani(vuelto)}</strong>
              </p>
            )}
          </div>
        )}
      </div>

      {/* ---------- comprobante ---------- */}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[0.82rem] font-semibold text-tinta">
          <span className="text-indigo-500">
            <IconoRecibo tam={15} />
          </span>
          Comprobante
        </p>
        {!caja.listo ? (
          <p className="rounded-lg bg-papel-suave px-3 py-2 text-[0.78rem] text-tinta-media">
            Se elige al tener la caja lista.
          </p>
        ) : caja.facturaObligatoria ? (
          <p
            className={`rounded-lg px-3 py-2 text-[0.78rem] ${
              caja.puedeFacturar ? "bg-indigo-50 font-medium text-indigo-800" : "bg-red-50 font-medium text-red-700"
            }`}
          >
            {caja.puedeFacturar
              ? "Este local factura todas las ventas: se emite factura."
              : "Este local exige facturar y esta caja no tiene un punto de expedición vigente: no se puede cobrar acá."}
          </p>
        ) : caja.puedeFacturar ? (
          <Conmutador
            etiqueta="Tipo de comprobante"
            opciones={[
              { value: "ticket" as const, label: "Ticket" },
              { value: "factura" as const, label: "Factura" },
            ]}
            valor={valor.comprobanteTipo}
            onChange={(v) => onCambio({ comprobanteTipo: v })}
          />
        ) : (
          <p className="rounded-lg bg-papel-suave px-3 py-2 text-[0.78rem] text-tinta-media">
            Esta caja no tiene un punto de expedición vigente: se emite ticket.
          </p>
        )}

        {caja.listo && caja.puedeFacturar && esFactura && (
          <div className="mt-2.5 flex animate-deslizar flex-col gap-2.5 rounded-xl border border-indigo-200 bg-indigo-50/50 p-3">
            <Conmutador
              etiqueta="Registro fiscal"
              opciones={[
                { value: "con" as const, label: "Con registro fiscal" },
                { value: "sin" as const, label: "Sin registro fiscal" },
              ]}
              valor={valor.registroFiscal}
              onChange={(v) => onCambio({ registroFiscal: v })}
            />
            {valor.registroFiscal === "sin" ? (
              <p className="text-[0.8rem] text-tinta-media">Se factura a Consumidor Final (Sin Nombre).</p>
            ) : (
              <>
                <Campo etiqueta="N° de RUC / Cédula">
                  <EntradaConLupa
                    value={valor.numeroIdentificacion}
                    onChange={(e) => {
                      onCambio({ numeroIdentificacion: e.target.value });
                      setAvisoBusqueda(null);
                    }}
                    onBuscar={buscarCliente}
                    buscando={buscando}
                    etiquetaBoton="Buscar cliente por RUC o cédula"
                    placeholder="80012345-6"
                  />
                </Campo>
                {avisoBusqueda && <p className="-mt-1 text-[0.76rem] text-tinta-media">{avisoBusqueda}</p>}
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <Campo etiqueta="Tipo">
                    <Selector
                      value={valor.tipoIdentificacion}
                      onChange={(e) => onCambio({ tipoIdentificacion: e.target.value })}
                    >
                      {TIPOS_IDENTIFICACION_FISCAL.map((t) => (
                        <option key={t.valor} value={t.valor}>
                          {t.etiqueta}
                        </option>
                      ))}
                    </Selector>
                  </Campo>
                  <Campo etiqueta="Correo (opcional)">
                    <Entrada
                      type="email"
                      value={valor.email}
                      onChange={(e) => onCambio({ email: e.target.value })}
                      placeholder="cliente@correo.com"
                    />
                  </Campo>
                </div>
                <Campo etiqueta="Nombre / Razón social">
                  <Entrada
                    value={valor.razonSocial}
                    onChange={(e) => onCambio({ razonSocial: e.target.value })}
                    placeholder="Nombre de la empresa o del titular"
                  />
                </Campo>
              </>
            )}
          </div>
        )}
      </div>
    </BloqueCita>
  );
}
