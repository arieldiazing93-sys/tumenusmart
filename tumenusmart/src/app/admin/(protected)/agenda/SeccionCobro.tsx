"use client";

import { useState } from "react";
import Link from "next/link";
import { Campo, Entrada, Selector, clasesBoton } from "@/components/ui";
import type { DatosCobro, EstadoCaja } from "@/lib/agenda-cita";
import { formatearGuarani } from "@/lib/format";
import { TIPOS_IDENTIFICACION_FISCAL } from "@/lib/tipo-cliente";
import { FORMAS_PAGO_POS, type FormaPagoPos } from "@/lib/turno-pos";
import { buscarClientePorIdentificacion } from "../pos/actions";
import { EntradaConLupa } from "../pos/EntradaConLupa";
import { BloqueCita, Conmutador } from "./BloqueCita";
import { IconoBillete } from "./IconosAgenda";

const ICONOS_FORMA: Record<FormaPagoPos, string> = {
  efectivo: "💵",
  transferencia: "🏦",
  tarjeta_debito: "💳",
  tarjeta_credito: "💳",
};

/**
 * El cobro dentro del detalle de la cita: cómo paga el cliente y qué comprobante
 * se emite (ticket o factura). Lo que se cobra entra en el turno de caja abierto
 * de esta computadora, igual que en el punto de venta.
 *
 * No cobra por su cuenta: solo junta los datos. Cobra el botón principal del pie
 * del panel, una vez que se eligió cómo paga.
 */
export function SeccionCobro({
  valor,
  onCambio,
  caja,
  total,
  cobrando,
  porAdelantado,
  retraso = 0,
}: {
  valor: DatosCobro;
  onCambio: (cambios: Partial<DatosCobro>) => void;
  caja: EstadoCaja;
  total: number;
  /** Si ya se eligió cobrar (el botón del pie dice "Cobrar"). */
  cobrando: boolean;
  /** Si el turno todavía no llegó: se cobra por adelantado, el pago entra hoy y la cita queda confirmada. */
  porAdelantado: boolean;
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
    <BloqueCita titulo="Cobro en caja" icono={<IconoBillete />} retraso={retraso}>
      <p className="-mt-1 text-[0.78rem] leading-snug text-tinta-suave">
        {cobrando
          ? porAdelantado
            ? "Al tocar Cobrar, el pago entra hoy en el turno de caja y la cita queda confirmada para su día."
            : "Al tocar Cobrar, el pago entra en el turno de caja y la cita queda finalizada."
          : "Elegí cómo paga para cobrar. Si el turno es de otro día, el pago entra hoy en caja y la cita queda confirmada."}
      </p>

      {/* ---------- la caja ---------- */}
      {caja.listo ? (
        <p className="flex items-center gap-2 rounded-lg bg-exito-luz px-3 py-2 text-[0.8rem] font-medium text-exito">
          <span aria-hidden="true" className="h-2 w-2 flex-none rounded-full bg-exito" />
          Caja {caja.estacion} · turno abierto
        </p>
      ) : (
        <div className="rounded-lg border border-aviso/30 bg-aviso-luz p-3">
          <p className="text-[0.84rem] font-semibold text-aviso">
            {caja.motivo === "sin_estacion"
              ? "Esta computadora no está vinculada a una caja"
              : "No hay un turno de caja abierto"}
          </p>
          <p className="mt-1 text-[0.8rem] leading-snug text-tinta-media">
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
        <p className="mb-1.5 text-[0.82rem] font-semibold text-tinta">Método de pago</p>
        <div className="grid grid-cols-2 gap-2">
          {FORMAS_PAGO_POS.map((f) => (
            <button
              key={f.valor}
              type="button"
              onClick={() => onCambio({ forma: f.valor })}
              aria-pressed={valor.forma === f.valor}
              className={`flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-[0.85rem] font-medium leading-tight transition-colors active:scale-[0.98] ${
                valor.forma === f.valor
                  ? "border-azul bg-azul-luz text-azul-oscuro"
                  : "border-linea text-tinta-media hover:border-azul/40 hover:bg-papel-suave"
              }`}
            >
              <span aria-hidden="true" className="text-base leading-none">
                {ICONOS_FORMA[f.valor]}
              </span>
              {f.etiqueta}
            </button>
          ))}
        </div>

        {valor.forma === "efectivo" && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2.5 rounded-lg border border-linea bg-superficie px-3 py-2">
            <label htmlFor="cita-paga-con" className="text-[0.75rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
              Paga con
            </label>
            {/* Arranca vacío y en blanco, sin ningún monto de ejemplo: lo que se ve ahí lo escribió el cajero.
                El fondo va en línea porque `campos-grises` pinta todos los campos de gris con una regla más fuerte. */}
            <input
              id="cita-paga-con"
              type="number"
              min={0}
              step={1000}
              inputMode="numeric"
              autoComplete="off"
              value={pagaCon}
              onChange={(e) => setPagaCon(e.target.value)}
              onWheel={(e) => e.currentTarget.blur()}
              aria-label="Con cuánto paga el cliente"
              style={{ backgroundColor: "rgb(var(--superficie))" }}
              className="w-32 rounded-lg border border-linea px-2.5 py-1.5 text-center text-[0.95rem] font-semibold text-tinta focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/15"
            />
            {vuelto > 0 && (
              <p className="ml-auto text-[0.88rem] text-tinta">
                Vuelto: <strong className="cifra text-exito">{formatearGuarani(vuelto)}</strong>
              </p>
            )}
          </div>
        )}
      </div>

      {/* ---------- comprobante ---------- */}
      <div>
        <p className="mb-1.5 text-[0.82rem] font-semibold text-tinta">Comprobante</p>
        {!caja.listo ? (
          <p className="rounded-lg bg-papel-suave px-3 py-2 text-[0.78rem] text-tinta-media">
            Se elige al tener la caja lista.
          </p>
        ) : caja.facturaObligatoria ? (
          <p className="rounded-lg bg-papel-suave px-3 py-2 text-[0.78rem] text-tinta-media">
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
          <div className="mt-2.5 flex flex-col gap-2.5 rounded-lg border border-linea bg-papel-suave p-3">
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
