"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Area, Campo, Entrada, MensajeError, Selector, clasesBoton } from "@/components/ui";
import { ESTADOS_CITA, estadoDeCita, urlAgenda, type ParametrosAgenda } from "@/lib/agenda";
import {
  duracionDeServicios,
  horaFinDeCita,
  resumirDescuento,
  subtotalServicios,
  textoFuente,
  type DatosCita,
  type DatosCobro,
  type DetalleCita,
  type EstadoCaja,
  type LineaServicioCita,
  type PersonalDeCita,
  type ServicioOpcion,
} from "@/lib/agenda-cita";
import { formatearTelefonoPersonal } from "@/lib/agenda-personal";
import { formatearGuarani } from "@/lib/format";
import { imprimirComprobante } from "@/lib/impresion-comprobantes";
import { TIPOS_IDENTIFICACION_FISCAL } from "@/lib/tipo-cliente";
import { anularCobroCita, cobrarCita, crearCita, eliminarCita, guardarCita } from "./actions";
import { BloqueCita, Conmutador } from "./BloqueCita";
import { IconoCalendarioHora, IconoPersona, IconoTijera } from "./IconosAgenda";
import { SeccionCobro } from "./SeccionCobro";
import { ServiciosCita } from "./ServiciosCita";

/**
 * El detalle de una cita, adentro del panel lateral: la ficha del turno y, a la vez, el
 * punto de venta para cobrarlo.
 *
 * Se cambian el estado, el cliente, el día y la hora, quién atiende, los servicios y sus
 * precios, y se aplica un descuento. "Guardar" deja todo tal cual sin cobrar. Cuando la
 * cita pasa a Finalizada, el botón se convierte en "Cobrar": registra la venta en el
 * turno de caja abierto y la cita queda cobrada (y aparece en Citas). Una cita cobrada
 * queda bloqueada: para tocarla hay que anular el cobro.
 */
export function FormularioCita({
  cita,
  inicial,
  servicios,
  personal,
  caja,
  parametros,
  hoy,
  onCerrar,
  onReservarDeNuevo,
}: {
  /** La cita que se está viendo; null si es una cita nueva. */
  cita: DetalleCita | null;
  /** Con qué se llenan los campos: la propia cita, una copia (Reservar de nuevo) o nada. */
  inicial: DetalleCita | null;
  servicios: ServicioOpcion[];
  personal: PersonalDeCita[];
  caja: EstadoCaja;
  parametros: ParametrosAgenda;
  hoy: string;
  onCerrar: () => void;
  onReservarDeNuevo: (c: DetalleCita) => void;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [choque, setChoque] = useState<string | null>(null);

  // ---------- lo que se edita ----------
  const [estado, setEstado] = useState<string>(cita ? cita.estado : "proxima");
  const [nombre, setNombre] = useState(inicial?.clienteNombre ?? "");
  const [telefono, setTelefono] = useState(
    inicial?.clienteTelefono ? formatearTelefonoPersonal(inicial.clienteTelefono) : ""
  );
  const [email, setEmail] = useState(inicial?.clienteEmail ?? "");
  const [nota, setNota] = useState(inicial?.nota ?? "");
  const [fecha, setFecha] = useState(inicial?.fecha ?? (parametros.fecha < hoy ? hoy : parametros.fecha));
  const [hora, setHora] = useState(inicial?.hora ?? "09:00");
  const [personalId, setPersonalId] = useState(inicial?.personalId ?? parametros.personal ?? personal[0]?.id ?? "");
  const [lineas, setLineas] = useState<LineaServicioCita[]>(inicial?.servicios ?? []);

  // El descuento: se tilda "Editar" y se escribe un porcentaje o un monto (como texto, para poder tipear "12,5").
  const [conDescuento, setConDescuento] = useState((inicial?.descuentoMonto ?? 0) > 0);
  const [tipoDescuento, setTipoDescuento] = useState<"porcentaje" | "monto">(
    inicial?.descuentoPorcentaje != null ? "porcentaje" : "monto"
  );
  const [valorDescuento, setValorDescuento] = useState(
    inicial?.descuentoPorcentaje != null
      ? String(inicial.descuentoPorcentaje)
      : inicial && inicial.descuentoMonto > 0
        ? String(Math.round(inicial.descuentoMonto))
        : ""
  );

  // ---------- el cobro ----------
  // Preseleccionada la transferencia: en los salones es lo que más se usa para confirmar el pago.
  const [datosCobro, setDatosCobro] = useState<DatosCobro>({
    forma: "transferencia",
    comprobanteTipo: caja.listo && caja.facturaObligatoria && caja.puedeFacturar ? "factura" : "ticket",
    registroFiscal: "con",
    tipoIdentificacion: TIPOS_IDENTIFICACION_FISCAL[0].valor,
    numeroIdentificacion: "",
    razonSocial: "",
    email: inicial?.clienteEmail ?? "",
  });
  const [cobradoAhora, setCobradoAhora] = useState<{ ventaId: string } | null>(null);
  const [avisoImpresion, setAvisoImpresion] = useState<string | null>(null);

  // ---------- eliminar y anular el cobro ----------
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [motivoAnulacion, setMotivoAnulacion] = useState("");
  const [copiado, setCopiado] = useState(false);

  const esNueva = cita === null;
  const cobro = cita?.cobro ?? null;
  const cobrada = !!cobro || !!cobradoAhora;
  const ventaCobradaId = cobro?.ventaId ?? cobradoAhora?.ventaId ?? null;

  // ---------- cuentas ----------
  const subtotal = subtotalServicios(lineas);
  const valorNumero = parseFloat(valorDescuento.replace(",", ".")) || 0;
  const pedidoDescuento = conDescuento && valorNumero > 0 ? { tipo: tipoDescuento, valor: valorNumero } : null;
  const resumen = resumirDescuento(subtotal, pedidoDescuento);
  const total = resumen.ok ? resumen.total : subtotal;
  const descuentoMonto = resumen.ok ? resumen.monto : 0;
  const duracion = duracionDeServicios(lineas);
  const horaValida = /^\d{2}:\d{2}$/.test(hora);
  const horaFin = horaValida ? horaFinDeCita(hora, duracion) : "--:--";

  const cobrando = !esNueva && !cobrada && estado === "finalizada";
  // Qué comprobante sale de verdad: el local puede exigir factura, o la caja no poder emitirla.
  const comprobanteFinal: "ticket" | "factura" = !caja.listo
    ? "ticket"
    : caja.facturaObligatoria
      ? "factura"
      : caja.puedeFacturar
        ? datosCobro.comprobanteTipo
        : "ticket";
  const cajaImpide = cobrando && (!caja.listo || (caja.facturaObligatoria && !caja.puedeFacturar));

  // ¿Se eligió a alguien que no realiza alguno de los servicios? Solo se avisa: el dueño manda.
  const catalogoPorId = new Map(servicios.map((s) => [s.id, s] as const));
  const noRealiza = lineas
    .filter((l) => {
      const s = l.servicioId ? catalogoPorId.get(l.servicioId) : undefined;
      return !!s && !!personalId && !s.personalIds.includes(personalId);
    })
    .map((l) => l.nombre);

  const estadosOfrecidos = esNueva
    ? ESTADOS_CITA.filter((e) => e.valor === "pendiente" || e.valor === "proxima")
    : ESTADOS_CITA;

  function cambiarCobro(cambios: Partial<DatosCobro>) {
    setDatosCobro((previo) => ({ ...previo, ...cambios }));
    // Elegir cómo paga es querer cobrar: la cita pasa a Finalizada sola.
    if (cambios.forma && !esNueva && !cobrada && caja.listo) setEstado("finalizada");
  }

  function armarDatos(forzar: boolean): DatosCita {
    return {
      estado,
      clienteNombre: nombre,
      clienteTelefono: telefono,
      clienteEmail: email,
      nota,
      personalId,
      fecha,
      hora,
      servicios: lineas.map((l) => ({ servicioId: l.servicioId, citaServicioId: l.citaServicioId, precio: l.precio })),
      descuento: pedidoDescuento,
      forzar,
    };
  }

  function errorLocal(): string | null {
    if (!nombre.trim()) return "Escribí el nombre del cliente";
    if (!personalId) return "Elegí quién atiende";
    if (!fecha || !horaValida) return "Elegí el día y la hora";
    if (lineas.length === 0) return "Agregá al menos un servicio";
    if (!resumen.ok) return resumen.error;
    if (cobrando) {
      if (!caja.listo) return "No se puede cobrar: falta la caja (mirá el aviso de Cobro en caja).";
      if (caja.facturaObligatoria && !caja.puedeFacturar) {
        return "Este local exige facturar y esta caja no tiene un punto de expedición vigente.";
      }
      if (total <= 0) return "El total tiene que ser mayor a cero para cobrar.";
      if (
        comprobanteFinal === "factura" &&
        datosCobro.registroFiscal === "con" &&
        (!datosCobro.numeroIdentificacion.trim() || !datosCobro.razonSocial.trim())
      ) {
        return "Para la factura con registro fiscal hacen falta el número y la razón social.";
      }
    }
    return null;
  }

  function enviar(forzar: boolean) {
    setError(null);
    setChoque(null);
    const mensaje = errorLocal();
    if (mensaje) {
      setError(mensaje);
      return;
    }
    iniciar(async () => {
      try {
        if (!cita) {
          const r = await crearCita(armarDatos(forzar));
          if (!r.ok) {
            if (r.conflicto) setChoque(r.error);
            else setError(r.error);
            return;
          }
          router.replace(urlAgenda(parametros, { fecha }), { scroll: false });
          return;
        }

        if (cobrando) {
          const r = await cobrarCita(cita.id, armarDatos(forzar), { ...datosCobro, comprobanteTipo: comprobanteFinal });
          if (!r.ok) {
            setError(r.error);
            return;
          }
          setCobradoAhora({ ventaId: r.ventaId });
          router.refresh();
          // El ticket sale solo si esta caja tiene impresora configurada; si no, queda el botón.
          if (caja.listo) {
            const impresion = await imprimirComprobante(
              `/admin/pos/venta/${r.ventaId}/ticket/crudo`,
              caja.nombreImpresoraTicket
            );
            if (!impresion.ok && impresion.motivo !== "sin_impresora") {
              setAvisoImpresion("El ticket no salió solo. Tocá “Imprimir comprobante”.");
            }
          }
          return;
        }

        const r = await guardarCita(cita.id, armarDatos(forzar));
        if (!r.ok) {
          if (r.conflicto) setChoque(r.error);
          else setError(r.error);
          return;
        }
        router.replace(urlAgenda(parametros, { fecha }), { scroll: false });
      } catch {
        setError("No se pudo completar la acción. Revisá la conexión y probá de nuevo.");
      }
    });
  }

  function eliminar() {
    if (!cita) return;
    const id = cita.id;
    setError(null);
    iniciar(async () => {
      try {
        const r = await eliminarCita(id);
        if (!r.ok) {
          setError(r.error);
          setConfirmandoEliminar(false);
          return;
        }
        router.replace(urlAgenda(parametros), { scroll: false });
      } catch {
        setError("No se pudo eliminar la cita. Probá de nuevo.");
        setConfirmandoEliminar(false);
      }
    });
  }

  function anularCobro() {
    if (!cita) return;
    const id = cita.id;
    setError(null);
    iniciar(async () => {
      try {
        const r = await anularCobroCita(id, motivoAnulacion);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setCobradoAhora(null);
        setAnulando(false);
        setMotivoAnulacion("");
        setEstado("proxima");
        router.refresh();
      } catch {
        setError("No se pudo anular el cobro. Probá de nuevo.");
      }
    });
  }

  async function copiarCodigo() {
    if (!cita) return;
    try {
      await navigator.clipboard.writeText(cita.codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // Sin permiso para copiar: no pasa nada, el código se puede leer igual.
    }
  }

  const textoBotonPrincipal = pendiente
    ? esNueva
      ? "Creando…"
      : cobrando
        ? "Cobrando…"
        : "Guardando…"
    : esNueva
      ? "Crear cita"
      : cobrando
        ? `Cobrar ${formatearGuarani(total)}`
        : "Guardar";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!cobrada) enviar(false);
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="campos-grises flex flex-1 flex-col gap-4 overflow-y-auto bg-papel-suave px-5 py-5">
        {/* ---------- ya cobrada ---------- */}
        {cobrada && (
          <div className="rounded-xl border border-exito/30 bg-exito-luz p-3.5">
            <p className="flex items-center gap-2 text-[0.92rem] font-semibold text-exito">
              <svg
                viewBox="0 0 24 24"
                width={18}
                height={18}
                fill="none"
                stroke="currentColor"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
              Cobrada en caja
            </p>
            <p className="mt-1 text-[0.82rem] leading-snug text-tinta-media">
              {cobro
                ? `Cuenta ${cobro.numero} · ${cobro.pagoTexto} · ${formatearGuarani(cobro.total)}`
                : "El cobro ya quedó registrado en la caja."}
            </p>
            {cobro?.comprobanteTipo === "factura" && cobro.facturaNumero && (
              <p className="mt-0.5 text-[0.8rem] text-tinta-media">
                Factura {cobro.facturaNumero}
                {cobro.facturaAnulada ? " (anulada)" : ""}
              </p>
            )}
            {avisoImpresion && <p className="mt-1.5 text-[0.8rem] font-medium text-aviso">{avisoImpresion}</p>}

            <div className="mt-3 flex flex-wrap gap-2">
              {ventaCobradaId && (
                <a
                  href={`/admin/pos/venta/${ventaCobradaId}/ticket`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={clasesBoton("navegar", "sm")}
                >
                  Imprimir comprobante
                </a>
              )}
              {cobro && !anulando && (
                <button type="button" onClick={() => setAnulando(true)} className={clasesBoton("peligro", "sm")}>
                  Anular cobro
                </button>
              )}
            </div>

            {cobro && anulando && (
              <div className="mt-3 rounded-lg border border-peligro/25 bg-superficie p-3">
                <p className="text-[0.8rem] leading-snug text-tinta-media">
                  Se cancela la venta en la caja (solo mientras el turno siga abierto) y la cita vuelve a quedar sin cobrar.
                  Si tenía factura, también se anula.
                </p>
                <Area
                  rows={2}
                  value={motivoAnulacion}
                  onChange={(e) => setMotivoAnulacion(e.target.value)}
                  placeholder="¿Por qué se anula el cobro?"
                  maxLength={200}
                  className="mt-2"
                />
                <div className="mt-2 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAnulando(false);
                      setMotivoAnulacion("");
                    }}
                    className={clasesBoton("suave", "sm")}
                  >
                    No, dejarlo
                  </button>
                  <button
                    type="button"
                    onClick={anularCobro}
                    disabled={pendiente || motivoAnulacion.trim().length < 3}
                    className={clasesBoton("peligro", "sm")}
                  >
                    {pendiente ? "Anulando…" : "Sí, anular el cobro"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Todo lo editable: una cita cobrada queda bloqueada (fieldset disabled apaga todos sus campos a la vez). */}
        <fieldset disabled={cobrada} className="flex min-w-0 flex-col gap-4">
          {/* ---------- id, fuente y estado ---------- */}
          <div className="animate-deslizar flex items-start justify-between gap-3 rounded-xl border border-linea bg-superficie p-4 shadow-sm">
            {cita ? (
              <div className="min-w-0 text-[0.84rem] leading-relaxed text-tinta-media">
                <p className="flex items-center gap-1.5">
                  <span className="font-semibold text-tinta">Id</span> – <span className="cifra">{cita.codigo}</span>
                  <button
                    type="button"
                    onClick={copiarCodigo}
                    aria-label="Copiar el código de la cita"
                    title="Copiar"
                    className="flex h-6 w-6 items-center justify-center rounded text-tinta-suave transition-colors hover:bg-papel-hundido hover:text-tinta"
                  >
                    {copiado ? (
                      <span className="text-[0.7rem] font-semibold text-exito">✓</span>
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        width={14}
                        height={14}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <rect x="9" y="9" width="11" height="11" rx="2" />
                        <path d="M5 15V6a2 2 0 0 1 2-2h9" />
                      </svg>
                    )}
                  </button>
                </p>
                <p>
                  <span className="font-semibold text-tinta">Fuente</span> – {textoFuente(cita.origen)}
                </p>
              </div>
            ) : (
              <p className="text-[0.84rem] leading-snug text-tinta-media">Anotá un turno a mano.</p>
            )}

            <label className="block w-40 flex-none">
              <span className="mb-1.5 block text-[0.82rem] font-semibold text-tinta">Estado</span>
              <span className="relative block">
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full ${estadoDeCita(estado).punto}`}
                />
                <Selector value={estado} onChange={(e) => setEstado(e.target.value)} style={{ paddingLeft: "2rem" }}>
                  {estadosOfrecidos.map((e) => (
                    <option key={e.valor} value={e.valor}>
                      {e.etiqueta}
                    </option>
                  ))}
                </Selector>
              </span>
            </label>
          </div>

          {/* ---------- cliente ---------- */}
          <BloqueCita titulo="Cliente" icono={<IconoPersona />} retraso={50}>
            <Campo etiqueta="Nombre *">
              <Entrada
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                maxLength={80}
                placeholder="Nombre y apellido"
                autoFocus={esNueva}
              />
            </Campo>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo etiqueta="Teléfono">
                <Entrada
                  type="tel"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="0984 123 456"
                />
              </Campo>
              <Campo etiqueta="Correo">
                <Entrada
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={120}
                  placeholder="cliente@correo.com"
                />
              </Campo>
            </div>
            {cita && cita.extras.length > 0 && (
              <dl className="rounded-lg bg-papel-suave px-3 py-2.5 text-[0.8rem]">
                {cita.extras.map((x) => (
                  <div key={x.etiqueta} className="flex gap-2 py-0.5">
                    <dt className="flex-none font-semibold text-tinta">{x.etiqueta}:</dt>
                    <dd className="min-w-0 break-words text-tinta-media">{x.valor}</dd>
                  </div>
                ))}
              </dl>
            )}
            <Campo etiqueta="Nota">
              <Area
                rows={2}
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                maxLength={300}
                placeholder="Algo para tener en cuenta (opcional)"
              />
            </Campo>
          </BloqueCita>

          {/* ---------- cuándo y con quién ---------- */}
          <BloqueCita titulo="Día y hora" icono={<IconoCalendarioHora />} retraso={100}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo etiqueta="Fecha *">
                <Entrada
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  min={esNueva ? hoy : undefined}
                  required
                />
              </Campo>
              <div>
                <span className="mb-1.5 block text-[0.82rem] font-semibold text-tinta">Hora de inicio *</span>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <Entrada
                      type="time"
                      step={300}
                      value={hora}
                      onChange={(e) => setHora(e.target.value)}
                      aria-label="Hora de inicio"
                      required
                    />
                  </div>
                  <span aria-hidden="true" className="text-tinta-suave">
                    →
                  </span>
                  <span
                    className="cifra flex-none rounded-lg bg-papel-hundido px-2.5 py-2.5 text-[0.88rem] font-medium text-tinta-media"
                    title="Hora en que termina, según lo que dura cada servicio"
                  >
                    {horaFin}
                  </span>
                </div>
              </div>
            </div>

            <Campo etiqueta="Personal *">
              <Selector value={personalId} onChange={(e) => setPersonalId(e.target.value)} required>
                {personal.length === 0 && <option value="">No hay personal cargado</option>}
                {personal.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </Selector>
            </Campo>
            {noRealiza.length > 0 && (
              <p className="rounded-lg bg-aviso-luz px-3 py-2 text-[0.8rem] leading-snug text-aviso">
                Esta persona no tiene asignado: {noRealiza.join(", ")}. Igual podés dejarlo así.
              </p>
            )}
          </BloqueCita>

          {/* ---------- servicios, descuento y total ---------- */}
          <BloqueCita titulo="Servicios *" icono={<IconoTijera />} retraso={150}>
            <ServiciosCita lineas={lineas} catalogo={servicios} onCambio={setLineas} />

            <div className="rounded-lg border border-linea bg-superficie">
              <div className="flex items-center justify-between gap-2 px-3 pt-3">
                <p className="text-[0.9rem] font-semibold text-tinta">Descuento</p>
                <button
                  type="button"
                  onClick={() => {
                    if (conDescuento) setValorDescuento("");
                    setConDescuento(!conDescuento);
                  }}
                  className="text-[0.8rem] font-semibold text-azul-oscuro hover:underline"
                >
                  {conDescuento ? "Quitar" : "Editar"}
                </button>
              </div>

              {conDescuento ? (
                <div className="px-3 pb-3 pt-2">
                  <div className="flex items-center gap-2">
                    <div className="w-28 flex-none">
                      <Conmutador
                        etiqueta="Tipo de descuento"
                        opciones={[
                          { value: "porcentaje" as const, label: "%" },
                          { value: "monto" as const, label: "Gs." },
                        ]}
                        valor={tipoDescuento}
                        onChange={setTipoDescuento}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Entrada
                        type="number"
                        min={0}
                        step={tipoDescuento === "porcentaje" ? 0.5 : 1000}
                        inputMode="decimal"
                        value={valorDescuento}
                        onChange={(e) => setValorDescuento(e.target.value)}
                        placeholder={tipoDescuento === "porcentaje" ? "Ej.: 10" : "Ej.: 5000"}
                        aria-label="Valor del descuento"
                      />
                    </div>
                  </div>
                  {!resumen.ok && <MensajeError>{resumen.error}</MensajeError>}
                </div>
              ) : (
                <p className="px-3 pb-3 pt-1 text-[0.85rem] text-tinta-suave">Sin descuento</p>
              )}

              {descuentoMonto > 0 && (
                <div className="flex items-center justify-between gap-2 border-t border-linea px-3 py-2 text-[0.82rem] text-tinta-media">
                  <span>Subtotal</span>
                  <span className="cifra">{formatearGuarani(subtotal)}</span>
                </div>
              )}
              {descuentoMonto > 0 && (
                <div className="flex items-center justify-between gap-2 px-3 pb-2 text-[0.82rem] text-tinta-media">
                  <span>
                    Descuento
                    {resumen.ok && resumen.porcentaje != null ? ` (${String(resumen.porcentaje).replace(".", ",")}%)` : ""}
                  </span>
                  <span className="cifra text-exito">− {formatearGuarani(descuentoMonto)}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-2 border-t border-linea px-3 py-3">
                <span className="text-[0.9rem] font-semibold text-tinta">Precio total</span>
                <span className="cifra text-[1.15rem] font-bold text-tinta">{formatearGuarani(total)}</span>
              </div>
            </div>
          </BloqueCita>
        </fieldset>

        {/* ---------- cobro (solo de una cita ya creada y todavía sin cobrar) ---------- */}
        {!esNueva && !cobrada && (
          <SeccionCobro
            valor={datosCobro}
            onCambio={cambiarCobro}
            caja={caja}
            total={total}
            cobrando={cobrando}
            retraso={200}
          />
        )}
      </div>

      {/* ---------- pie fijo ---------- */}
      <div className="flex flex-none flex-col gap-2.5 border-t border-linea bg-superficie px-5 py-3.5">
        {error && <MensajeError>{error}</MensajeError>}

        {choque && (
          <div className="rounded-lg border border-aviso/30 bg-aviso-luz p-3">
            <p className="text-[0.82rem] leading-snug text-aviso">{choque}</p>
            <div className="mt-2 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setChoque(null)} className={clasesBoton("suave", "sm")}>
                Cambiar el horario
              </button>
              <button
                type="button"
                onClick={() => enviar(true)}
                disabled={pendiente}
                className={clasesBoton("principal", "sm")}
              >
                Guardar igual
              </button>
            </div>
          </div>
        )}

        {confirmandoEliminar ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[0.86rem] font-medium text-tinta">¿Eliminar esta cita? No se puede deshacer.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmandoEliminar(false)} className={clasesBoton("suave", "md")}>
                No
              </button>
              <button type="button" onClick={eliminar} disabled={pendiente} className={clasesBoton("peligro", "md")}>
                {pendiente ? "Eliminando…" : "Sí, eliminar"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {!esNueva && !cobrada && (
              <button
                type="button"
                onClick={() => setConfirmandoEliminar(true)}
                className="inline-flex h-10 items-center rounded-lg px-2 text-[0.88rem] font-semibold text-peligro transition-colors hover:bg-peligro-luz"
              >
                Eliminar
              </button>
            )}
            {cita && (
              <button type="button" onClick={() => onReservarDeNuevo(cita)} className={clasesBoton("navegar", "md")}>
                Reservar de nuevo
              </button>
            )}
            <span className="hidden flex-1 sm:block" />
            <button type="button" onClick={onCerrar} className={clasesBoton("suave", "md")}>
              {cobrada ? "Cerrar" : "Cancelar"}
            </button>
            {!cobrada && (
              <button
                type="submit"
                disabled={pendiente || cajaImpide || (cobrando && total <= 0)}
                className={clasesBoton("principal", "md")}
              >
                {textoBotonPrincipal}
              </button>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
