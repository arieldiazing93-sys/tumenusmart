"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Boton, Campo, clasesBoton } from "@/components/ui";
import type { DatosCobro, EstadoCaja } from "@/lib/agenda-cita";
import { formatearGuarani } from "@/lib/format";
import { rutaParaAbrirTurno } from "@/lib/turno-requerido";
import { etiquetaCortaTipoIdentificacion } from "@/lib/tipo-cliente";
import { FORMAS_PAGO_POS, type FormaPagoPos } from "@/lib/turno-pos";
import { pareceRucConDigito } from "@/lib/sifen/ruc";
import { buscarClientePorIdentificacion } from "../pos/actions";
import { AvisoRucDnit, useVerificacionRuc } from "../pos/AvisoRucDnit";
import { ClienteFiscalModal, type DatosClienteFiscal } from "../pos/ClienteFiscalModal";
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
  telefonoCita = "",
  objeto = "cita",
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
  /** El teléfono del cliente de la cita: el cuadro «Nuevo cliente» lo sugiere para dejarlo también en la ficha fiscal. */
  telefonoCita?: string;
  /** Qué se cobra: una cita de la agenda o una reserva de cancha (cambia solo el texto de ayuda). */
  objeto?: "cita" | "reserva";
  /** Milisegundos que espera para entrar (las tarjetas del detalle entran una tras otra). */
  retraso?: number;
}) {
  const router = useRouter();
  const [pagaCon, setPagaCon] = useState("");
  const [buscando, setBuscando] = useState(false);
  // Resultado de la búsqueda por RUC/cédula: ya es cliente, o no existe y se lo crea con el cuadro «Nuevo cliente» (el mismo del
  // mostrador, del comedor y del delivery).
  const [encontrado, setEncontrado] = useState(false);
  const [esNuevo, setEsNuevo] = useState(false);
  const [modalCliente, setModalCliente] = useState(false);
  // El RUC del cliente contra la DNIT (existe / razón social / estado): una ayuda que solo frena si la DNIT lo va a rechazar.
  const { verificacion: verifRuc, verificando: verificandoRuc, verificar: verificarRuc, limpiar: limpiarVerifRuc } = useVerificacionRuc();

  const esFactura = valor.comprobanteTipo === "factura";
  const vuelto = valor.forma === "efectivo" ? (parseFloat(pagaCon) || 0) - total : 0;

  async function buscarCliente() {
    const numero = valor.numeroIdentificacion.trim();
    if (!numero) return;
    setBuscando(true);
    setEncontrado(false);
    setEsNuevo(false);
    try {
      const r = await buscarClientePorIdentificacion(numero);
      // Aunque ya sea cliente, se vuelve a mirar en la DNIT: su RUC pudo suspenderse desde la última vez. No espera ni frena la búsqueda.
      if (pareceRucConDigito(numero) && (!r.ok || r.tipoIdentificacion === "ruc")) {
        void verificarRuc(numero).then((v) => onCambio({ rucBloqueado: v?.bloquea ? (v.mensaje ?? "La DNIT no acepta facturas a ese RUC.") : null }));
      } else {
        limpiarVerifRuc();
      }
      if (r.ok) {
        onCambio({ razonSocial: r.nombre, tipoIdentificacion: r.tipoIdentificacion, telefono: "" });
        setEncontrado(true);
      } else {
        onCambio({ razonSocial: "", telefono: "" });
        setEsNuevo(true);
      }
    } catch {
      // No se pudo buscar: se puede crear igual con el cuadro y completar los datos a mano.
      setEsNuevo(true);
    }
    setBuscando(false);
  }

  /** Lo que se cargó en el cuadro «Nuevo cliente» pasa a los datos del cobro. */
  function guardarClienteNuevo(datos: DatosClienteFiscal) {
    onCambio({
      numeroIdentificacion: datos.numeroIdentificacion,
      tipoIdentificacion: datos.tipoIdentificacion,
      razonSocial: datos.razonSocial,
      email: datos.email,
      telefono: datos.telefono,
      rucBloqueado: null,
    });
    // El cuadro ya lo verificó (la respuesta quedó guardada unos minutos): acá se vuelve a mostrar el resultado bajo el campo.
    limpiarVerifRuc();
    if (datos.tipoIdentificacion === "ruc" && pareceRucConDigito(datos.numeroIdentificacion)) {
      void verificarRuc(datos.numeroIdentificacion).then((v) =>
        onCambio({ rucBloqueado: v?.bloquea ? (v.mensaje ?? "La DNIT no acepta facturas a ese RUC.") : null })
      );
    }
    setEsNuevo(true);
    setEncontrado(false);
    setModalCliente(false);
  }

  return (
    <BloqueCita titulo="Cobro en caja" icono={<IconoBillete />} retraso={retraso}>
      <p className="-mt-1 text-[0.78rem] leading-snug text-tinta-suave">
        {objeto === "reserva"
          ? porAdelantado
            ? "Al tocar Cobrar, el pago entra hoy en el turno de caja y la reserva queda confirmada y paga para su día."
            : "Al tocar Cobrar, el pago entra en el turno de caja y la reserva queda cobrada (Finalizada)."
          : cobrando
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
            {caja.motivo === "sin_estacion" ? (
              <Link href="/admin/pos/estaciones" className={clasesBoton("navegar", "sm")}>
                Ir a Estaciones
              </Link>
            ) : (
              // Al abrir el turno se vuelve a esta misma cita (ver src/lib/turno-requerido.ts).
              <button
                type="button"
                onClick={() => router.push(rutaParaAbrirTurno(`${window.location.pathname}${window.location.search}`))}
                className={clasesBoton("navegar", "sm")}
              >
                Abrir turno de caja
              </button>
            )}
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
                <Campo etiqueta="N° de RUC / Cédula / etc.">
                  <EntradaConLupa
                    value={valor.numeroIdentificacion}
                    onChange={(e) => {
                      // Un número nuevo es otro cliente: lo que se había cargado del anterior no se arrastra.
                      onCambio({ numeroIdentificacion: e.target.value, rucBloqueado: null, razonSocial: "", telefono: "" });
                      setEncontrado(false);
                      setEsNuevo(false);
                      limpiarVerifRuc();
                    }}
                    onBuscar={buscarCliente}
                    buscando={buscando}
                    etiquetaBoton="Buscar cliente por RUC o cédula"
                    placeholder="80012345-0"
                  />
                </Campo>
                <AvisoRucDnit verificacion={verifRuc} verificando={verificandoRuc} />
                {encontrado ? (
                  <div className="flex flex-col items-start gap-1 rounded-lg bg-white px-3 py-2">
                    <DatoDelCliente etiqueta="Razón social" valor={valor.razonSocial} />
                    <DatoDelCliente
                      etiqueta={etiquetaCortaTipoIdentificacion(valor.tipoIdentificacion)}
                      valor={valor.numeroIdentificacion.trim()}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setEncontrado(false);
                        setEsNuevo(true);
                      }}
                      className="text-[0.76rem] font-medium text-brand-texto underline"
                    >
                      ¿No es este cliente?
                    </button>
                  </div>
                ) : buscando ? (
                  <p className="text-[0.74rem] text-tinta-suave">Buscando…</p>
                ) : esNuevo ? (
                  valor.razonSocial.trim() ? (
                    <div className="flex flex-col items-start gap-1 rounded-lg bg-white px-3 py-2">
                      <DatoDelCliente etiqueta="Razón social" valor={valor.razonSocial} />
                      <DatoDelCliente
                        etiqueta={etiquetaCortaTipoIdentificacion(valor.tipoIdentificacion)}
                        valor={valor.numeroIdentificacion.trim()}
                      />
                      {valor.email && <DatoDelCliente etiqueta="Correo" valor={valor.email} />}
                      {valor.telefono && <DatoDelCliente etiqueta="Teléfono" valor={valor.telefono} />}
                      <button
                        type="button"
                        onClick={() => setModalCliente(true)}
                        className="text-[0.76rem] font-medium text-brand-texto underline"
                      >
                        Editar datos
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="text-[0.74rem] font-medium text-aviso">No existe ningún cliente con ese número.</p>
                      <Boton tono="nuevo" tam="sm" onClick={() => setModalCliente(true)}>
                        Crear cliente
                      </Boton>
                    </>
                  )
                ) : (
                  <p className="text-[0.74rem] text-tinta-suave">
                    Tocá la lupa (o Enter) para completar los datos si ya es cliente.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* El mismo cuadro «Nuevo cliente» del mostrador, el comedor y el delivery (se dibuja aparte, sobre toda la pantalla). */}
      {modalCliente && (
        <ClienteFiscalModal
          numeroInicial={valor.numeroIdentificacion}
          tipoInicial={valor.tipoIdentificacion}
          razonSocialInicial={valor.razonSocial}
          emailInicial={valor.email}
          // Si el cliente ya dejó su teléfono en la cita, se sugiere el mismo, así no hay que volver a tipearlo.
          telefonoInicial={valor.telefono || telefonoCita}
          onCerrar={() => setModalCliente(false)}
          onGuardar={guardarClienteNuevo}
        />
      )}
    </BloqueCita>
  );
}

/** Una línea "Etiqueta: dato" del cliente, con la etiqueta apagada y el dato resaltado. */
function DatoDelCliente({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <p className="text-[0.85rem] text-tinta">
      <span className="text-tinta-suave">{etiqueta}:</span> <span className="font-medium">{valor}</span>
    </p>
  );
}
