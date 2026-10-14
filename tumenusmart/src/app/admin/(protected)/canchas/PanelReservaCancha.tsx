"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PanelLateral } from "@/components/PanelLateral";
import { Area, Campo, Entrada, MensajeError, Selector, clasesBoton } from "@/components/ui";
import { ESTADOS_CITA, diaLargo, estadoDeCita } from "@/lib/agenda";
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
import { construirLinkWhatsapp } from "@/lib/whatsapp";
import { cambiarEstadoReservaCancha, guardarReservaCancha } from "./actions";

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
};

export type CanchaDelPanel = CanchaPublica & { activa: boolean };

/** Las duraciones que se pueden poner a mano: de media hora a ocho horas, de a media hora. */
const DURACIONES_MANUALES = Array.from({ length: 16 }, (_, i) => (i + 1) * 30);

/**
 * El detalle de una reserva de cancha: un panel que entra desde la derecha al tocar una reserva del calendario (o un hueco
 * vacío, para anotar una nueva). Se edita la cancha, el día y la hora, la duración, el cliente, el precio y el estado.
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
}: {
  /** La reserva abierta, o null para una nueva. */
  reserva: DetalleReservaCancha | null;
  canchas: CanchaDelPanel[];
  /** Para una reserva nueva: lo que ya venía elegido (el hueco que se tocó). */
  precarga: { canchaId: string | null; hora: string | null; fecha: string };
  parametros: ParametrosCanchas;
  /** El nombre del negocio, para el mensaje de WhatsApp al cliente. */
  negocio: string;
}) {
  const router = useRouter();
  const [montado, setMontado] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fueraDeHorario, setFueraDeHorario] = useState(false);

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

  const cancha = canchas.find((c) => c.id === canchaId) ?? null;
  const calculado = useMemo(
    () => (cancha && /^\d{2}:\d{2}$/.test(hora) ? precioDeReserva(cancha, aMinutos(hora), duracion) : null),
    [cancha, hora, duracion]
  );
  const precioMostrado = precioManual ? precio : calculado === null ? "" : String(calculado);

  const cerrar = useCallback(() => {
    router.replace(urlCanchas(parametros), { scroll: false });
  }, [router, parametros]);

  if (!montado) return null;

  function datos(forzar: boolean) {
    return {
      canchaId,
      fecha,
      hora,
      duracion,
      clienteNombre,
      clienteTelefono,
      nota,
      precio: Number(String(precioMostrado).replace(/[\s.]/g, "")),
      estado,
      forzar,
    };
  }

  function guardar(forzar = false) {
    setError(null);
    setFueraDeHorario(false);
    iniciar(async () => {
      const resultado = await guardarReservaCancha(reserva?.id ?? null, datos(forzar));
      if (!resultado.ok) {
        setError(resultado.error);
        setFueraDeHorario(resultado.fueraDeHorario === true);
        return;
      }
      router.refresh();
      cerrar();
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

  return (
    <PanelLateral titulo={reserva ? `Reserva ${reserva.codigo}` : "Nueva reserva"} onCerrar={cerrar}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          guardar(false);
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
          {/* ---------- el estado y lo que se hace con un toque ---------- */}
          {reserva && estadoActual && (
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
                {reserva.estado !== "finalizada" && (
                  <button type="button" disabled={pendiente} onClick={() => cambiarEstado("finalizada")} className={clasesBoton("nuevo", "sm")}>
                    Jugó
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
            {precioManual && calculado !== null && String(calculado) !== String(precio).replace(/[\s.]/g, "") && (
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
        </div>

        {/* ---------- pie fijo ---------- */}
        <div className="flex flex-none flex-col gap-2 border-t border-linea bg-superficie px-5 py-4">
          {error && <MensajeError>{error}</MensajeError>}
          <div className="flex flex-wrap justify-end gap-2">
            {fueraDeHorario && (
              <button type="button" disabled={pendiente} onClick={() => guardar(true)} className={clasesBoton("navegar", "md")}>
                Guardar igual
              </button>
            )}
            <button type="button" onClick={cerrar} className={clasesBoton("peligro", "md")}>
              Cancelar
            </button>
            <button type="submit" disabled={pendiente} className={clasesBoton(esNueva ? "nuevo" : "navegar", "md")}>
              {pendiente ? "Guardando…" : esNueva ? "Crear reserva" : "Guardar"}
            </button>
          </div>
        </div>
      </form>
    </PanelLateral>
  );
}
