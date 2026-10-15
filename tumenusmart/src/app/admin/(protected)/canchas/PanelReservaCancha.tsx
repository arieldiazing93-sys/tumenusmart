"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAutorizacion } from "@/components/Autorizacion";
import { PanelLateral } from "@/components/PanelLateral";
import { Area, Campo, Entrada, MensajeError, Selector, clasesBoton } from "@/components/ui";
import { ESTADOS_CITA, diaLargo, estadoDeCita } from "@/lib/agenda";
import type { CobroDeCita, DatosCobro, EstadoCaja } from "@/lib/agenda-cita";
import { formatearTelefonoPersonal } from "@/lib/agenda-personal";
import {
  etiquetaDeDeporte,
  precioDeReserva,
  textoDuracionCancha,
  urlCanchas,
  type CanchaPublica,
  type ParametrosCanchas,
} from "@/lib/canchas";
import { formatearGuarani } from "@/lib/format";
import { aMinutos } from "@/lib/horario-trabajo";
import { imprimirComprobante } from "@/lib/impresion-comprobantes";
import { TIPOS_IDENTIFICACION_FISCAL } from "@/lib/tipo-cliente";
import { rutaParaAbrirTurno } from "@/lib/turno-requerido";
import { construirLinkWhatsapp } from "@/lib/whatsapp";
import { SeccionCobro } from "../agenda/SeccionCobro";
import { anularCobroReservaCancha, cambiarEstadoReservaCancha, cobrarReservaCancha, guardarReservaCancha } from "./actions";

/** Una reserva existente como la necesita el panel. */
export type DetalleReservaCancha = {
  id: string;
  codigo: string;
  canchaId: string;
  canchaNombre: string;
  clienteNombre: string;
  /** Internacional, solo dígitos. */
  clienteTelefono: string | null;
  clienteEmail: string | null;
  nota: string | null;
  extras: { etiqueta: string; valor: string }[];
  /** "YYYY-MM-DD" y "HH:MM" en hora de Asunción. */
  fecha: string;
  hora: string;
  duracionMin: number;
  estado: string;
  precio: number;
  /** web = la pidió el cliente desde la página; panel = la anotó el negocio. */
  origen: string;
  /** La venta de la caja con que se cobró; null = todavía sin cobrar. */
  cobro: CobroDeCita | null;
};

export type CanchaDelPanel = CanchaPublica & { activa: boolean };

/** Las duraciones que se pueden poner a mano: de media hora a ocho horas, de a media hora. */
const DURACIONES_MANUALES = Array.from({ length: 16 }, (_, i) => (i + 1) * 30);

/** Qué quedó por repetir si el horario cae fuera de lo que abre el complejo y se toca «Guardar igual». */
type Accion = "guardar" | "cobrar";

/**
 * El detalle de una reserva de cancha: un panel que entra desde la derecha al tocar una reserva del calendario (o un hueco
 * vacío, para anotar una nueva). Se edita la cancha, el día y la hora, la duración, el cliente, el precio y el estado, y —como el
 * detalle de una cita— funciona de punto de venta: cuando el cliente paga, se cobra acá y la venta entra en la caja.
 *
 * Está abierto mientras la dirección del calendario lleve `?reserva=…`; al cerrarlo se saca ese dato de la dirección (por
 * eso sobrevive a recargar la página).
 */
export function PanelReservaCancha({
  reserva,
  canchas,
  precarga,
  parametros,
  negocio,
  caja: cajaRecibida,
}: {
  /** La reserva abierta, o null para una nueva. */
  reserva: DetalleReservaCancha | null;
  canchas: CanchaDelPanel[];
  /** Para una reserva nueva: lo que ya venía elegido (el hueco que se tocó). */
  precarga: { canchaId: string | null; hora: string | null; fecha: string };
  parametros: ParametrosCanchas;
  /** El nombre del negocio, para el mensaje de WhatsApp al cliente. */
  negocio: string;
  /** Si se puede cobrar desde esta computadora (vinculada a una caja con el turno abierto). Una reserva nueva no se cobra. */
  caja?: EstadoCaja;
}) {
  const router = useRouter();
  const [montado, setMontado] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fueraDeHorario, setFueraDeHorario] = useState<Accion | null>(null);
  // El cuadro que pide la contraseña de un usuario autorizado cuando anular el cobro está protegido (Ajustes → Seguridad).
  const { autorizar, dialogo: dialogoClave } = useAutorizacion();
  const caja: EstadoCaja = cajaRecibida ?? { listo: false, motivo: "sin_turno" };

  // El panel se dibuja recién en el navegador (va en un portal): así la primera pantalla que llega del servidor y la
  // del navegador coinciden siempre.
  useEffect(() => {
    setMontado(true);
  }, []);

  const esNueva = reserva === null;
  const canchaInicial =
    canchas.find((c) => c.id === (reserva?.canchaId ?? precarga.canchaId)) ?? canchas.find((c) => c.activa) ?? canchas[0];

  const [canchaId, setCanchaId] = useState(canchaInicial?.id ?? "");
  const [fecha, setFecha] = useState(reserva?.fecha ?? precarga.fecha);
  const [hora, setHora] = useState(reserva?.hora ?? precarga.hora ?? "18:00");
  const [duracion, setDuracion] = useState(reserva?.duracionMin ?? Math.min(...(canchaInicial?.duraciones ?? [60])));
  const [clienteNombre, setClienteNombre] = useState(reserva?.clienteNombre ?? "");
  const [clienteTelefono, setClienteTelefono] = useState(formatearTelefonoPersonal(reserva?.clienteTelefono));
  const [nota, setNota] = useState(reserva?.nota ?? "");
  const [estado, setEstado] = useState(reserva?.estado ?? "proxima");
  // El precio de una reserva que ya existe se respeta tal cual; el de una nueva sigue a la tarifa hasta que se lo toca.
  const [precio, setPrecio] = useState(reserva ? String(reserva.precio) : "");
  const [precioManual, setPrecioManual] = useState(!esNueva);

  // ---------- el cobro ----------
  const [datosCobro, setDatosCobro] = useState<DatosCobro>({
    forma: "efectivo",
    comprobanteTipo: caja.listo && caja.facturaObligatoria && caja.puedeFacturar ? "factura" : "ticket",
    registroFiscal: "con",
    tipoIdentificacion: TIPOS_IDENTIFICACION_FISCAL[0].valor,
    numeroIdentificacion: "",
    razonSocial: "",
    email: reserva?.clienteEmail ?? "",
    telefono: "",
  });
  const [cobradoAhora, setCobradoAhora] = useState<{ ventaId: string } | null>(null);
  const [avisoImpresion, setAvisoImpresion] = useState<string | null>(null);
  const [anulando, setAnulando] = useState(false);
  const [motivoAnulacion, setMotivoAnulacion] = useState("");

  const cancha = canchas.find((c) => c.id === canchaId) ?? null;
  const calculado = useMemo(
    () =>
      cancha && /^\d{2}:\d{2}$/.test(hora)
        ? precioDeReserva(cancha, aMinutos(hora), duracion, /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : undefined)
        : null,
    [cancha, hora, duracion, fecha]
  );
  const precioMostrado = precioManual ? precio : calculado === null ? "" : String(calculado);
  const precioNumero = Number(String(precioMostrado).replace(/[\s.]/g, "")) || 0;

  const cobro = reserva?.cobro ?? null;
  const cobrada = !!cobro || !!cobradoAhora;
  const ventaCobradaId = cobro?.ventaId ?? cobradoAhora?.ventaId ?? null;
  const sePuedeCobrar = !!reserva && !cobrada && estado !== "cancelada" && estado !== "no_asistio";

  // Qué comprobante sale de verdad: el local puede exigir factura, o la caja no poder emitirla.
  const comprobanteFinal: "ticket" | "factura" = !caja.listo
    ? "ticket"
    : caja.facturaObligatoria
      ? "factura"
      : caja.puedeFacturar
        ? datosCobro.comprobanteTipo
        : "ticket";
  const cajaImpide = !caja.listo || (caja.facturaObligatoria && !caja.puedeFacturar);
  // Lo único que falta es abrir el turno de caja: «Cobrar» lleva directo a abrirlo y, al abrirlo, se vuelve a esta reserva
  // (ver src/lib/turno-requerido.ts).
  const faltaSoloElTurno = !caja.listo && caja.motivo === "sin_turno";

  const cerrar = useCallback(() => {
    router.replace(urlCanchas(parametros), { scroll: false });
  }, [router, parametros]);

  if (!montado) return null;

  function irAAbrirTurno() {
    router.push(rutaParaAbrirTurno(`${window.location.pathname}${window.location.search}`));
  }

  function cambiarCobro(cambios: Partial<DatosCobro>) {
    setDatosCobro((previo) => ({ ...previo, ...cambios }));
  }

  function datos(forzar: boolean) {
    return {
      canchaId,
      fecha,
      hora,
      duracion,
      clienteNombre,
      clienteTelefono,
      nota,
      precio: precioNumero,
      estado,
      forzar,
    };
  }

  function guardar(forzar = false) {
    setError(null);
    setFueraDeHorario(null);
    iniciar(async () => {
      const resultado = await guardarReservaCancha(reserva?.id ?? null, datos(forzar));
      if (!resultado.ok) {
        setError(resultado.error);
        setFueraDeHorario(resultado.fueraDeHorario === true ? "guardar" : null);
        return;
      }
      router.refresh();
      cerrar();
    });
  }

  /** Lo que el servidor también revisa, para avisar al toque. */
  function errorAntesDeCobrar(): string | null {
    if (!caja.listo) return "No se puede cobrar: falta la caja (mirá el aviso de Cobro en caja).";
    if (caja.facturaObligatoria && !caja.puedeFacturar) {
      return "Este local exige facturar y esta caja no tiene un punto de expedición vigente.";
    }
    if (precioNumero <= 0) return "El precio tiene que ser mayor a cero para cobrar.";
    if (!clienteNombre.trim()) return "Escribí el nombre del cliente.";
    if (
      comprobanteFinal === "factura" &&
      datosCobro.registroFiscal === "con" &&
      (!datosCobro.numeroIdentificacion.trim() || !datosCobro.razonSocial.trim())
    ) {
      return "Para la factura con registro fiscal hacen falta el número y la razón social.";
    }
    if (comprobanteFinal === "factura" && datosCobro.registroFiscal === "con" && datosCobro.rucBloqueado) {
      return datosCobro.rucBloqueado;
    }
    return null;
  }

  function cobrar(forzar = false) {
    if (!reserva) return;
    setError(null);
    setFueraDeHorario(null);
    if (faltaSoloElTurno) {
      irAAbrirTurno();
      return;
    }
    const mensaje = errorAntesDeCobrar();
    if (mensaje) {
      setError(mensaje);
      return;
    }
    const id = reserva.id;
    iniciar(async () => {
      try {
        // Primero se guarda lo que se cambió en el panel, para que lo cobrado sea exactamente lo que se ve.
        const guardada = await guardarReservaCancha(id, datos(forzar));
        if (!guardada.ok) {
          setError(guardada.error);
          setFueraDeHorario(guardada.fueraDeHorario === true ? "cobrar" : null);
          return;
        }
        const r = await cobrarReservaCancha(id, { ...datosCobro, comprobanteTipo: comprobanteFinal });
        if (!r.ok) {
          // El turno se cerró mientras tanto: sin turno no se cobra, se va a abrir uno.
          if (r.sinTurno) irAAbrirTurno();
          else setError(r.error);
          return;
        }
        setCobradoAhora({ ventaId: r.ventaId });
        router.refresh();
        // El ticket sale solo si esta caja tiene impresora configurada; si no, queda el botón.
        if (caja.listo) {
          const impresion = await imprimirComprobante(`/admin/pos/venta/${r.ventaId}/ticket/crudo`, caja.nombreImpresoraTicket);
          if (!impresion.ok && impresion.motivo !== "sin_impresora") {
            setAvisoImpresion("El ticket no salió solo. Tocá “Imprimir comprobante”.");
          }
        }
      } catch {
        setError("No se pudo completar el cobro. Revisá la conexión y probá de nuevo.");
      }
    });
  }

  function anularCobro() {
    if (!reserva) return;
    const id = reserva.id;
    setError(null);
    iniciar(async () => {
      try {
        const r = await autorizar((clave) => anularCobroReservaCancha(id, motivoAnulacion, clave));
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setCobradoAhora(null);
        setAnulando(false);
        setMotivoAnulacion("");
        router.refresh();
      } catch {
        setError("No se pudo anular el cobro. Probá de nuevo.");
      }
    });
  }

  function cambiarEstado(nuevo: string) {
    if (!reserva) return;
    setError(null);
    iniciar(async () => {
      const resultado = await cambiarEstadoReservaCancha(reserva.id, nuevo);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      router.refresh();
      cerrar();
    });
  }

  const enlaceWhatsapp =
    reserva && reserva.clienteTelefono
      ? construirLinkWhatsapp(
          reserva.clienteTelefono,
          `Hola ${reserva.clienteNombre}, te escribimos de ${negocio} por tu reserva de ${reserva.canchaNombre} el ${diaLargo(reserva.fecha)} a las ${reserva.hora}.`
        )
      : null;

  const estadoActual = reserva ? estadoDeCita(reserva.estado) : null;
  const reservaPorLlegar = (() => {
    const [a, m, d] = fecha.split("-").map(Number);
    const [hh, mm] = hora.split(":").map(Number);
    if (!a || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return false;
    return new Date(a, m - 1, d, hh, mm).getTime() > Date.now();
  })();

  return (
    <PanelLateral titulo={reserva ? `Reserva ${reserva.codigo}` : "Nueva reserva"} onCerrar={cerrar}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!cobrada) guardar(false);
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
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
              <p className="mt-0.5 text-[0.78rem] text-tinta-suave">
                La venta está en Día a día → Historial de cuentas.
              </p>
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
                    Se cancela la venta en la caja (solo mientras el turno siga abierto) y la reserva vuelve a quedar sin cobrar.
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

          {/* ---------- el estado y lo que se hace con un toque ---------- */}
          {reserva && estadoActual && !cobrada && (
            <div className="rounded-xl border-2 border-azul/50 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={`rounded-full border px-3 py-1 text-[0.8rem] font-semibold ${estadoActual.bloque}`}>
                  {estadoActual.etiqueta}
                </span>
                {reserva.origen === "web" && <span className="text-[0.76rem] text-tinta-suave">La pidió desde la página</span>}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {reserva.estado !== "proxima" && reserva.estado !== "finalizada" && (
                  <button type="button" disabled={pendiente} onClick={() => cambiarEstado("proxima")} className={clasesBoton("navegar", "sm")}>
                    Confirmar
                  </button>
                )}
                {reserva.estado !== "no_asistio" && (
                  <button type="button" disabled={pendiente} onClick={() => cambiarEstado("no_asistio")} className={clasesBoton("suave", "sm")}>
                    No vino
                  </button>
                )}
                {reserva.estado !== "cancelada" && (
                  <button type="button" disabled={pendiente} onClick={() => cambiarEstado("cancelada")} className={clasesBoton("peligro", "sm")}>
                    Cancelar reserva
                  </button>
                )}
                {enlaceWhatsapp && (
                  <a href={enlaceWhatsapp} target="_blank" rel="noopener noreferrer" className={clasesBoton("whatsapp", "sm")}>
                    Escribirle por WhatsApp
                  </a>
                )}
              </div>
            </div>
          )}

          {reserva && cobrada && enlaceWhatsapp && (
            <a href={enlaceWhatsapp} target="_blank" rel="noopener noreferrer" className={`${clasesBoton("whatsapp", "sm")} self-start`}>
              Escribirle por WhatsApp
            </a>
          )}

          {/* Una reserva cobrada queda bloqueada: es una venta de la caja. Para tocarla hay que anular el cobro. */}
          <fieldset disabled={cobrada} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
            {/* ---------- cancha, día, hora y duración ---------- */}
            <Campo etiqueta="Cancha">
              <Selector value={canchaId} onChange={(e) => setCanchaId(e.target.value)} required>
                {canchas
                  .filter((c) => c.activa || c.id === reserva?.canchaId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} · {etiquetaDeDeporte(c.deporte)}
                      {c.activa ? "" : " (inactiva)"}
                    </option>
                  ))}
              </Selector>
            </Campo>

            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Día">
                <Entrada type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} className="cifra" />
              </Campo>
              <Campo etiqueta="Hora de inicio">
                <Entrada type="time" required step={900} value={hora} onChange={(e) => setHora(e.target.value)} className="cifra" />
              </Campo>
            </div>

            <Campo etiqueta="Cuánto tiempo">
              <Selector value={duracion} onChange={(e) => setDuracion(Number(e.target.value))}>
                {DURACIONES_MANUALES.map((d) => (
                  <option key={d} value={d}>
                    {textoDuracionCancha(d)}
                  </option>
                ))}
              </Selector>
            </Campo>

            {/* ---------- el cliente ---------- */}
            <Campo etiqueta="Nombre del cliente">
              <Entrada
                required
                maxLength={80}
                value={clienteNombre}
                onChange={(e) => setClienteNombre(e.target.value)}
                placeholder="Quién reserva"
              />
            </Campo>

            <Campo etiqueta="Teléfono (opcional)" ayuda="Para avisarle por WhatsApp. Ejemplo: 0984 123 456">
              <Entrada
                type="tel"
                inputMode="tel"
                autoComplete="off"
                value={clienteTelefono}
                onChange={(e) => setClienteTelefono(e.target.value)}
                placeholder="0984 123 456"
              />
            </Campo>

            {reserva && reserva.extras.length > 0 && (
              <div className="rounded-lg border border-linea bg-papel-suave px-3 py-2.5">
                <p className="mb-1 text-[0.74rem] font-semibold uppercase tracking-rotulo text-tinta-suave">Lo que completó</p>
                <ul className="flex flex-col gap-0.5 text-[0.84rem] text-tinta-media">
                  {reserva.extras.map((e, i) => (
                    <li key={i}>
                      <span className="font-semibold text-tinta">{e.etiqueta}:</span> {e.valor}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Campo etiqueta="Nota (opcional)">
              <Area
                rows={2}
                maxLength={300}
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Ej: viene con 10 personas, pidió pelotas"
              />
            </Campo>

            {/* ---------- precio y estado ---------- */}
            <div className="rounded-xl border-2 border-azul/50 p-3.5">
              <Campo
                etiqueta="Precio (Gs.)"
                ayuda={
                  calculado !== null
                    ? `Según la tarifa de la cancha: ${formatearGuarani(calculado)}.`
                    : "Elegí la cancha y la hora para calcularlo."
                }
              >
                <Entrada
                  inputMode="numeric"
                  value={precioManual ? precio : precioMostrado}
                  onChange={(e) => {
                    setPrecioManual(true);
                    setPrecio(e.target.value);
                  }}
                  className="cifra"
                />
              </Campo>
              {!cobrada && precioManual && calculado !== null && String(calculado) !== String(precio).replace(/[\s.]/g, "") && (
                <button
                  type="button"
                  onClick={() => setPrecioManual(false)}
                  className="mt-2 text-[0.8rem] font-semibold text-azul hover:underline"
                >
                  Usar el precio de la tarifa ({formatearGuarani(calculado)})
                </button>
              )}

              <div className="mt-3.5">
                <Campo etiqueta="Estado">
                  <Selector value={estado} onChange={(e) => setEstado(e.target.value)}>
                    {ESTADOS_CITA.map((s) => (
                      <option key={s.valor} value={s.valor}>
                        {s.etiqueta}
                      </option>
                    ))}
                  </Selector>
                </Campo>
              </div>
            </div>
          </fieldset>

          {/* ---------- cobro (solo de una reserva ya creada y todavía sin cobrar) ---------- */}
          {sePuedeCobrar && (
            <SeccionCobro
              objeto="reserva"
              valor={datosCobro}
              onCambio={cambiarCobro}
              caja={caja}
              total={precioNumero}
              cobrando
              porAdelantado={reservaPorLlegar}
              // El teléfono de la reserva: el cuadro «Nuevo cliente» lo sugiere para dejarlo también en la ficha fiscal.
              telefonoCita={clienteTelefono}
            />
          )}
        </div>

        {/* ---------- pie fijo ---------- */}
        <div className="flex flex-none flex-col gap-2 border-t border-linea bg-superficie px-5 py-4">
          {error && <MensajeError>{error}</MensajeError>}
          <div className="flex flex-col gap-2">
            {sePuedeCobrar && (
              <button
                type="button"
                onClick={() => cobrar(false)}
                disabled={pendiente || (cajaImpide && !faltaSoloElTurno) || precioNumero <= 0}
                className={`${clasesBoton("exito", "md")} w-full`}
              >
                {pendiente
                  ? "Cobrando…"
                  : faltaSoloElTurno
                    ? "Abrir el turno de caja para cobrar"
                    : `Cobrar ${formatearGuarani(precioNumero)}`}
              </button>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              {fueraDeHorario && (
                <button
                  type="button"
                  disabled={pendiente}
                  onClick={() => (fueraDeHorario === "cobrar" ? cobrar(true) : guardar(true))}
                  className={clasesBoton("navegar", "md")}
                >
                  {fueraDeHorario === "cobrar" ? "Cobrar igual" : "Guardar igual"}
                </button>
              )}
              {cobrada ? (
                <button type="button" onClick={cerrar} className={clasesBoton("peligro", "md")}>
                  Cerrar
                </button>
              ) : (
                <>
                  <button type="button" onClick={cerrar} className={clasesBoton("peligro", "md")}>
                    Cancelar
                  </button>
                  <button type="submit" disabled={pendiente} className={clasesBoton(esNueva ? "nuevo" : "navegar", "md")}>
                    {pendiente ? "Guardando…" : esNueva ? "Crear reserva" : "Guardar"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        {dialogoClave}
      </form>
    </PanelLateral>
  );
}
