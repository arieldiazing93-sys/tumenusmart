"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Area, Campo, Entrada, MensajeError, Selector, clasesBoton } from "@/components/ui";
import {
  CABECERA_CITA_NUEVA,
  ESTADOS_CITA,
  diaLargo,
  estadoDeCita,
  iniciales,
  urlAgenda,
  type ParametrosAgenda,
} from "@/lib/agenda";
import {
  duracionDeServicios,
  horaFinDeCita,
  resumirDescuento,
  subtotalServicios,
  textoFuente,
  type ActividadCita as Movimiento,
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
import { ActividadCita } from "./ActividadCita";
import { BloqueCita, Conmutador } from "./BloqueCita";
import {
  IconoCalendarioHora,
  IconoCerrar,
  IconoEstado,
  IconoEtiqueta,
  IconoMas,
  IconoPersona,
  IconoTijera,
  IconoTilde,
} from "./IconosAgenda";
import { SeccionCobro } from "./SeccionCobro";
import { ServiciosCita } from "./ServiciosCita";

/** El botón principal cuando se cobra: verde, con degradado y un latido para que se note que es lo que sigue. */
const BOTON_COBRAR =
  "inline-flex h-11 flex-none animate-pulsoVerde items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 bg-[length:200%_100%] px-5 text-[0.92rem] font-bold text-white shadow-lg shadow-emerald-600/30 transition-all duration-200 hover:brightness-110 active:scale-95 disabled:pointer-events-none disabled:animate-none disabled:opacity-45";
/** El botón principal el resto de las veces (guardar, crear): el naranja de la marca. */
const BOTON_GUARDAR =
  "inline-flex h-11 flex-none items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-r from-brand to-brand-dark px-5 text-[0.92rem] font-bold text-white shadow-md shadow-brand/30 transition-all duration-200 hover:brightness-110 active:scale-95 disabled:pointer-events-none disabled:opacity-45";

/**
 * El detalle de una cita, adentro del panel lateral: la ficha del turno y, a la vez, el
 * punto de venta para cobrarlo.
 *
 * Arriba, una cabecera con el color del estado (ámbar pendiente, azul próxima, verde
 * finalizada, rojo cancelada, gris no asistió) que muestra en vivo quién es el cliente,
 * cuándo es y cuánto cuesta. Abajo, tarjetas de colores: el estado, el cliente, el día y
 * la hora, los servicios (cada uno con su color), el descuento, el total y el cobro.
 *
 * "Guardar" deja todo tal cual sin cobrar. Cuando la cita pasa a Finalizada, el botón se
 * convierte en "Cobrar": registra la venta en el turno de caja abierto y la cita queda
 * cobrada (y aparece en Citas). Una cita cobrada queda bloqueada: para tocarla hay que
 * anular el cobro.
 */
export function FormularioCita({
  cita,
  inicial,
  servicios,
  personal,
  caja,
  actividad,
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
  actividad: Movimiento[];
  parametros: ParametrosAgenda;
  hoy: string;
  onCerrar: () => void;
  onReservarDeNuevo: (c: DetalleCita) => void;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [choque, setChoque] = useState<string | null>(null);
  const [pestana, setPestana] = useState<"editar" | "actividad">("editar");

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

  // El descuento: se toca "Aplicar" y se escribe un porcentaje o un monto (como texto, para poder tipear "12,5").
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
  const estadoActual = estadoDeCita(estado);
  const enEditar = esNueva || pestana === "editar";

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
        if (!cobrada && enEditar) enviar(false);
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      {/* ---------- la cabecera: el color dice en qué estado está la cita ---------- */}
      <header
        className={`relative flex-none overflow-hidden bg-gradient-to-br bg-[length:200%_200%] px-4 pt-4 sm:px-5 ${
          esNueva ? "pb-4" : "pb-0"
        } animate-fluir ${esNueva ? CABECERA_CITA_NUEVA : estadoActual.cabecera}`}
      >
        {/* Dos círculos de adorno, apenas más claros que el fondo. */}
        <span aria-hidden="true" className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/15" />
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-16 left-1/4 h-36 w-36 rounded-full bg-white/10" />

        <div className="relative flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-white/25 text-[1.05rem] font-bold ring-2 ring-white/50 backdrop-blur-sm"
          >
            {nombre.trim() ? iniciales(nombre) : <IconoPersona tam={22} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-rotulo opacity-85">
              <span className="truncate">
                {cita ? `Cita ${cita.codigo} · ${textoFuente(cita.origen)}` : "Nueva cita"}
              </span>
              {cita && (
                <button
                  type="button"
                  onClick={copiarCodigo}
                  aria-label="Copiar el código de la cita"
                  title="Copiar el código"
                  className="flex h-5 w-5 flex-none items-center justify-center rounded bg-white/20 transition-colors hover:bg-white/35"
                >
                  {copiado ? (
                    <IconoTilde tam={11} />
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      width={11}
                      height={11}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.4}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <rect x="9" y="9" width="11" height="11" rx="2" />
                      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
                    </svg>
                  )}
                </button>
              )}
            </p>
            <h2 className="mt-0.5 truncate text-[1.2rem] font-bold leading-tight">
              {nombre.trim() || "Sin nombre todavía"}
            </h2>
            <p className="mt-0.5 text-[0.84rem] opacity-90">
              {fecha ? diaLargo(fecha) : "Sin fecha"} · <span className="cifra font-semibold">{hora} – {horaFin}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-white/20 transition-all hover:bg-white/35 active:scale-90"
          >
            <IconoCerrar tam={18} />
          </button>
        </div>

        <div className="relative mt-3.5 flex items-end justify-between gap-3">
          {/* Vuelve a saltar cada vez que cambia el estado o el total, para que se note. */}
          <span
            key={estado}
            className="inline-flex animate-pop items-center gap-2 rounded-full bg-white/25 py-1 pl-1 pr-3 text-[0.8rem] font-bold backdrop-blur-sm"
          >
            <span className={`flex h-6 w-6 items-center justify-center rounded-full ${estadoActual.insignia}`}>
              <IconoEstado estado={estado} tam={13} />
            </span>
            {esNueva ? "Cita nueva" : estadoActual.etiqueta}
          </span>
          <div className="text-right">
            <p className="text-[0.62rem] font-semibold uppercase tracking-rotulo opacity-80">Total</p>
            <p key={total} className="cifra animate-pop text-[1.65rem] font-bold leading-none">
              {formatearGuarani(total)}
            </p>
          </div>
        </div>

        {!esNueva && (
          <div role="tablist" aria-label="Secciones de la cita" className="relative mt-3.5 flex gap-1">
            {(
              [
                { valor: "editar", etiqueta: "Editar cita" },
                { valor: "actividad", etiqueta: "Actividad" },
              ] as const
            ).map((p) => (
              <button
                key={p.valor}
                type="button"
                role="tab"
                aria-selected={pestana === p.valor}
                onClick={() => setPestana(p.valor)}
                className={`rounded-t-xl px-4 py-2.5 text-[0.85rem] font-bold transition-all duration-200 ${
                  pestana === p.valor
                    ? "bg-papel-suave text-tinta"
                    : "opacity-85 hover:bg-white/20 hover:opacity-100"
                }`}
              >
                {p.etiqueta}
              </button>
            ))}
          </div>
        )}
      </header>

      {enEditar ? (
        <>
          <div className="campos-grises flex flex-1 flex-col gap-4 overflow-y-auto bg-papel-suave px-4 py-4 sm:px-5">
            {/* ---------- ya cobrada ---------- */}
            {cobrada && (
              <div className="animate-deslizar rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 flex-none animate-pop items-center justify-center rounded-full bg-emerald-500 text-white shadow-md shadow-emerald-500/30">
                    <IconoTilde tam={20} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[0.98rem] font-bold text-emerald-800">Cobrada en caja</p>
                    <p className="text-[0.82rem] leading-snug text-emerald-900/80">
                      {cobro
                        ? `Cuenta ${cobro.numero} · ${cobro.pagoTexto} · ${formatearGuarani(cobro.total)}`
                        : "El cobro ya quedó registrado en la caja."}
                    </p>
                  </div>
                </div>
                {cobro?.comprobanteTipo === "factura" && cobro.facturaNumero && (
                  <p className="mt-2 rounded-lg bg-white/70 px-3 py-1.5 text-[0.8rem] font-medium text-emerald-900">
                    Factura {cobro.facturaNumero}
                    {cobro.facturaAnulada ? " (anulada)" : ""}
                  </p>
                )}
                {avisoImpresion && <p className="mt-2 text-[0.8rem] font-semibold text-amber-700">{avisoImpresion}</p>}

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
                  <div className="mt-3 animate-deslizar rounded-xl border border-red-200 bg-superficie p-3">
                    <p className="text-[0.8rem] leading-snug text-tinta-media">
                      Se cancela la venta en la caja (solo mientras el turno siga abierto) y la cita vuelve a quedar sin
                      cobrar. Si tenía factura, también se anula.
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
              {/* ---------- estado: una pastilla de color por cada uno ---------- */}
              <section className="animate-deslizar rounded-2xl border border-linea bg-superficie p-4 shadow-sm">
                <h3 className="mb-2.5 text-[0.95rem] font-semibold tracking-titular text-tinta">Estado</h3>
                <div role="radiogroup" aria-label="Estado de la cita" className="flex flex-wrap gap-2">
                  {estadosOfrecidos.map((e) => {
                    const elegido = e.valor === estado;
                    return (
                      <button
                        key={e.valor}
                        type="button"
                        role="radio"
                        aria-checked={elegido}
                        onClick={() => setEstado(e.valor)}
                        className={`inline-flex items-center gap-1.5 rounded-full border-2 py-1 pl-1 pr-3 text-[0.8rem] font-semibold transition-all duration-200 active:scale-95 disabled:pointer-events-none disabled:opacity-60 ${
                          elegido ? `${e.elegida} scale-[1.04]` : e.pastilla
                        }`}
                      >
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full ${
                            elegido ? "bg-white/30" : e.insignia
                          }`}
                        >
                          <IconoEstado estado={e.valor} tam={12} />
                        </span>
                        {e.etiqueta}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* ---------- cliente ---------- */}
              <BloqueCita titulo="Cliente" icono={<IconoPersona tam={17} />} tono="violeta" retraso={60}>
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
                  <dl className="rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-2.5 text-[0.8rem]">
                    {cita.extras.map((x) => (
                      <div key={x.etiqueta} className="flex gap-2 py-0.5">
                        <dt className="flex-none font-semibold text-violet-800">{x.etiqueta}:</dt>
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
              <BloqueCita titulo="Día, hora y personal" icono={<IconoCalendarioHora tam={17} />} tono="cielo" retraso={120}>
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
                      <span aria-hidden="true" className="text-sky-400">
                        →
                      </span>
                      <span
                        key={horaFin}
                        className="cifra flex-none animate-pop rounded-lg bg-sky-100 px-2.5 py-2.5 text-[0.88rem] font-bold text-sky-800"
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
                  <p className="animate-deslizar rounded-xl bg-amber-50 px-3 py-2 text-[0.8rem] leading-snug text-amber-800">
                    Esta persona no tiene asignado: {noRealiza.join(", ")}. Igual podés dejarlo así.
                  </p>
                )}
              </BloqueCita>

              {/* ---------- servicios ---------- */}
              <BloqueCita titulo="Servicios *" icono={<IconoTijera tam={17} />} tono="rosa" retraso={180}>
                <ServiciosCita lineas={lineas} catalogo={servicios} onCambio={setLineas} />
              </BloqueCita>

              {/* ---------- descuento ---------- */}
              <BloqueCita titulo="Descuento" icono={<IconoEtiqueta tam={17} />} tono="ambar" retraso={240}>
                {conDescuento ? (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="w-28 flex-none">
                        <Conmutador
                          etiqueta="Tipo de descuento"
                          acento="ambar"
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
                      <button
                        type="button"
                        onClick={() => {
                          setConDescuento(false);
                          setValorDescuento("");
                        }}
                        className="flex-none rounded-lg px-2.5 py-2 text-[0.8rem] font-semibold text-red-600 transition-colors hover:bg-red-50"
                      >
                        Quitar
                      </button>
                    </div>
                    {!resumen.ok && <MensajeError>{resumen.error}</MensajeError>}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConDescuento(true)}
                    className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/70 px-3 py-3 text-[0.86rem] font-semibold text-amber-800 transition-all duration-200 hover:border-amber-400 hover:bg-amber-50 active:scale-[0.98]"
                  >
                    <IconoMas tam={15} />
                    Aplicar un descuento
                  </button>
                )}
              </BloqueCita>

              {/* ---------- total ---------- */}
              {/* Dos capas porque cada una lleva su propia animación: la de afuera entra, la de adentro hace fluir el degradado. */}
              <div className="animate-deslizar" style={{ animationDelay: "300ms" }}>
                <div className="animate-fluir overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 bg-[length:200%_200%] p-4 text-white shadow-lg shadow-emerald-600/25">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[0.68rem] font-semibold uppercase tracking-rotulo opacity-85">Total a cobrar</p>
                      <p key={total} className="cifra mt-1 animate-pop text-[2rem] font-bold leading-none">
                        {formatearGuarani(total)}
                      </p>
                    </div>
                    {descuentoMonto > 0 && (
                      <span className="mb-0.5 rounded-full bg-white/25 px-3 py-1 text-[0.78rem] font-bold backdrop-blur-sm">
                        − {formatearGuarani(descuentoMonto)}
                        {resumen.ok && resumen.porcentaje != null ? ` (${String(resumen.porcentaje).replace(".", ",")}%)` : ""}
                      </span>
                    )}
                  </div>
                  {descuentoMonto > 0 && (
                    <p className="mt-2 text-[0.8rem] opacity-90">
                      Subtotal <span className="cifra font-semibold">{formatearGuarani(subtotal)}</span>
                    </p>
                  )}
                </div>
              </div>
            </fieldset>

            {/* ---------- cobro (solo de una cita ya creada y todavía sin cobrar) ---------- */}
            {!esNueva && !cobrada && (
              <SeccionCobro
                valor={datosCobro}
                onCambio={cambiarCobro}
                caja={caja}
                total={total}
                cobrando={cobrando}
                retraso={360}
              />
            )}
          </div>

          {/* ---------- pie fijo ---------- */}
          <div className="flex flex-none flex-col gap-2.5 border-t border-linea bg-superficie px-4 py-3.5 shadow-[0_-10px_24px_-14px_rgba(19,20,23,0.35)] sm:px-5">
            {error && <MensajeError>{error}</MensajeError>}

            {choque && (
              <div className="animate-deslizar rounded-xl border border-amber-300 bg-amber-50 p-3">
                <p className="text-[0.82rem] leading-snug text-amber-900">{choque}</p>
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
                    className="inline-flex h-10 items-center rounded-lg px-2.5 text-[0.88rem] font-semibold text-red-600 transition-colors hover:bg-red-50"
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
                    className={cobrando ? BOTON_COBRAR : BOTON_GUARDAR}
                  >
                    {textoBotonPrincipal}
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <ActividadCita actividad={actividad} />
      )}
    </form>
  );
}
