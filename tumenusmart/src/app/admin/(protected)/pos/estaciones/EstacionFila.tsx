"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  renombrarEstacion,
  alternarActivaEstacion,
  vincularEstacion,
  asignarPuntoExpedicion,
  asignarImpresoraDeArea,
  asignarAreaTicket,
  cambiarCopiasDeArea,
  cambiarCopiasFactura,
} from "./actions";
import { Boton, Entrada, Pastilla, clasesBoton } from "@/components/ui";
import { listarImpresoras } from "@/lib/qz-tray";
import { imprimirPrueba } from "@/lib/impresion-comprobantes";

type PuntoExpedicionOpcion = {
  id: string;
  nombre: string;
  establecimiento: string;
  puntoExpedicion: string;
};

type AreaImpresionOpcion = { id: string; nombre: string };
type ImpresoraAsignada = { areaImpresionId: string; nombreImpresora: string; copias: number };

const COPIAS_MAXIMAS = 9;

/**
 * El contador de copias de una impresión: − N +. "1 copia" es lo normal, 2 sale dos veces, y 0 es "No imprime" (en rojo, para que
 * se note que ese comprobante no sale en esta estación). Va fuera del componente de la fila para no re-armarse en cada cambio.
 */
function ContadorCopias({
  etiqueta,
  valor,
  deshabilitado,
  onCambiar,
}: {
  etiqueta: string;
  valor: number;
  deshabilitado: boolean;
  onCambiar: (nuevo: number) => void;
}) {
  const boton =
    "flex h-7 w-7 flex-none items-center justify-center rounded-md border border-azul/40 bg-azul-luz text-[1rem] font-bold leading-none text-azul-oscuro transition-colors hover:bg-azul hover:text-white disabled:opacity-40";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-tinta-media">
      <span className="font-semibold">{etiqueta}</span>
      <button
        type="button"
        aria-label={`Una copia menos de ${etiqueta}`}
        disabled={deshabilitado || valor <= 0}
        onClick={() => onCambiar(valor - 1)}
        className={boton}
      >
        −
      </button>
      <span className={`min-w-[4.6rem] text-center text-[0.8rem] font-semibold ${valor === 0 ? "text-peligro" : "text-tinta"}`}>
        {valor === 0 ? "No imprime" : valor === 1 ? "1 copia" : `${valor} copias`}
      </span>
      <button
        type="button"
        aria-label={`Una copia más de ${etiqueta}`}
        disabled={deshabilitado || valor >= COPIAS_MAXIMAS}
        onClick={() => onCambiar(valor + 1)}
        className={boton}
      >
        +
      </button>
    </span>
  );
}

// Mismo lenguaje visual que clasesDeCampo() (foco, transición) pero sin el
// w-full de un campo de formulario normal — estos <select> viven dentro de
// una fila compacta, al lado de texto, y ancho completo los estiraría a lo
// loco dentro de un flex sin ancho propio.
//
// El color depende de si ya tiene algo asignado: antes los tres selects
// (punto de expedición, área de ticket, impresora por área) eran blancos
// como el resto de la fila, así que había que leer cada uno para saber si
// faltaba configurar algo. Con el fondo puesto, "sin asignar" salta a la
// vista sin leer texto.
function clasesSelectCompacto(asignado: boolean): string {
  return (
    "rounded-lg border px-2 py-1.5 text-[0.82rem] font-medium transition-colors duration-150 " +
    "focus:outline-none focus:ring-2 disabled:opacity-50 " +
    (asignado
      ? "border-exito/30 bg-exito-luz text-exito focus:border-exito focus:ring-exito/15"
      : "border-aviso/30 bg-aviso-luz text-aviso focus:border-aviso focus:ring-aviso/15")
  );
}

export function EstacionFila({
  id,
  nombre,
  activa,
  cantidadTurnos,
  esEstaComputadora,
  puntoExpedicionId,
  puntosExpedicion,
  areaTicketId,
  impresoras,
  copiasFactura,
  areasImpresion,
}: {
  id: string;
  nombre: string;
  activa: boolean;
  cantidadTurnos: number;
  /** Si la cookie de ESTE navegador ya apunta a esta estación. */
  esEstaComputadora: boolean;
  puntoExpedicionId: string | null;
  /** Puntos de expedición activos del local, para elegir a cuál queda atada. */
  puntosExpedicion: PuntoExpedicionOpcion[];
  /** Qué Área de Impresión maneja el ticket/factura en esta estación. */
  areaTicketId: string | null;
  /** Mapeo YA guardado de área → impresora (y cuántas copias salen), para esta estación. */
  impresoras: ImpresoraAsignada[];
  /** Cuántas copias salen de cada factura en esta estación (0 = no se imprime). */
  copiasFactura: number;
  /** Áreas de impresión activas del local (catálogo). */
  areasImpresion: AreaImpresionOpcion[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editando, setEditando] = useState(false);
  const [nombreEditado, setNombreEditado] = useState(nombre);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [vinculando, setVinculando] = useState(false);
  const [asignando, setAsignando] = useState(false);
  const [asignandoTicket, setAsignandoTicket] = useState(false);
  const [impresorasDetectadas, setImpresorasDetectadas] = useState<string[]>([]);
  const [buscandoImpresoras, setBuscandoImpresoras] = useState(false);
  const [errorQz, setErrorQz] = useState<string | null>(null);
  const [asignandoArea, setAsignandoArea] = useState<string | null>(null);
  // Cambiando copias ("factura" o el id de un área) y la prueba de impresión que se está mandando o su resultado.
  const [cambiandoCopias, setCambiandoCopias] = useState<string | null>(null);
  const [probando, setProbando] = useState<string | null>(null);
  const [resultadoPrueba, setResultadoPrueba] = useState<{ areaId: string; ok: boolean; texto: string } | null>(null);

  const mapaImpresoras = new Map(impresoras.map((i) => [i.areaImpresionId, i.nombreImpresora]));
  const mapaCopias = new Map(impresoras.map((i) => [i.areaImpresionId, i.copias]));

  async function cambiarCopias(areaImpresionId: string, copias: number) {
    setCambiandoCopias(areaImpresionId);
    setErrorQz(null);
    const resultado = await cambiarCopiasDeArea(id, areaImpresionId, copias);
    setCambiandoCopias(null);
    if (!resultado.ok) setErrorQz(resultado.error);
  }

  async function cambiarCopiasDeLaFactura(copias: number) {
    setCambiandoCopias("factura");
    setErrorQz(null);
    const resultado = await cambiarCopiasFactura(id, copias);
    setCambiandoCopias(null);
    if (!resultado.ok) setErrorQz(resultado.error);
  }

  /** Manda una prueba cortita a la impresora de esa área, para ver que sale antes de usarla con un pedido de verdad. */
  async function probarImpresion(areaImpresionId: string, nombreArea: string, impresora: string) {
    setProbando(areaImpresionId);
    setResultadoPrueba(null);
    const r = await imprimirPrueba(impresora, `${nombre} - ${nombreArea}`);
    setProbando(null);
    if (r.ok) {
      setResultadoPrueba({
        areaId: areaImpresionId,
        ok: true,
        texto: `Se mandó la prueba a “${impresora}”. Si no salió, revisá que esté encendida, con papel y conectada.`,
      });
    } else {
      setResultadoPrueba({
        areaId: areaImpresionId,
        ok: false,
        texto:
          r.motivo === "sin_qz"
            ? "No se pudo conectar con QZ Tray en esta computadora. ¿Está instalado y corriendo?"
            : `No se pudo mandar la prueba: ${r.detalle ?? "error desconocido"}`,
      });
    }
  }

  async function cambiarPuntoExpedicion(valor: string) {
    setAsignando(true);
    setError(null);
    const resultado = await asignarPuntoExpedicion(id, valor || null);
    setAsignando(false);
    if (!resultado.ok) setError(resultado.error);
  }

  async function cambiarAreaTicket(valor: string) {
    setAsignandoTicket(true);
    setError(null);
    const resultado = await asignarAreaTicket(id, valor || null);
    setAsignandoTicket(false);
    if (!resultado.ok) setError(resultado.error);
  }

  async function buscarImpresoras() {
    setBuscandoImpresoras(true);
    setErrorQz(null);
    try {
      setImpresorasDetectadas(await listarImpresoras());
    } catch {
      setErrorQz("No se pudo conectar con QZ Tray en esta computadora. ¿Está instalado y corriendo?");
    }
    setBuscandoImpresoras(false);
  }

  async function cambiarImpresoraDeArea(areaImpresionId: string, valor: string) {
    setAsignandoArea(areaImpresionId);
    setErrorQz(null);
    const resultado = await asignarImpresoraDeArea(id, areaImpresionId, valor || null);
    setAsignandoArea(null);
    if (!resultado.ok) setErrorQz(resultado.error);
  }

  function guardarNombre() {
    setError(null);
    startTransition(async () => {
      const resultado = await renombrarEstacion(id, nombreEditado);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setEditando(false);
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2000);
    });
  }

  async function vincular() {
    if (
      !confirm(
        `¿Vincular ESTA computadora a "${nombre}"? De ahora en más, cualquier cajero que use este navegador va a operar bajo esta estación.`
      )
    ) {
      return;
    }
    setVinculando(true);
    setError(null);
    const resultado = await vincularEstacion(id);
    setVinculando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    router.refresh();
  }

  return (
    // El estado se ve en la etiqueta "Desactivada" y en el color del botón; la fila no cambia de fondo, para que lo que
    // resalte sean los botones.
    <div className="rounded-lg border-2 border-azul/50 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {editando ? (
          <div className="flex flex-1 items-center gap-2">
            <Entrada
              autoFocus
              value={nombreEditado}
              onChange={(e) => setNombreEditado(e.target.value)}
              className="flex-1"
            />
            <button
              type="button"
              disabled={pending}
              onClick={guardarNombre}
              className={clasesBoton("navegar", "sm")}
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => {
                setNombreEditado(nombre);
                setEditando(false);
                setError(null);
              }}
              className={clasesBoton("peligro", "sm")}
            >
              Cancelar
            </button>
          </div>
        ) : (
          <span className="font-medium">
            {nombre}
            {!activa && (
              <span className="ml-2 align-middle">
                <Pastilla color="amarillo" punto>
                  Desactivada
                </Pastilla>
              </span>
            )}
            {esEstaComputadora && (
              <span className="ml-2 text-xs font-semibold text-exito">✓ Esta computadora</span>
            )}
            {guardado && <span className="ml-2 text-xs font-normal text-exito">✓ Guardado</span>}
          </span>
        )}

        {!editando && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-tinta-media">{cantidadTurnos} turno(s)</span>
            <label className="flex items-center gap-1.5 text-tinta-media">
              Punto de expedición
              <select
                value={puntoExpedicionId ?? ""}
                disabled={asignando}
                onChange={(e) => cambiarPuntoExpedicion(e.target.value)}
                className={clasesSelectCompacto(!!puntoExpedicionId)}
              >
                <option value="">Sin asignar — solo tickets</option>
                {puntosExpedicion.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} ({p.establecimiento}-{p.puntoExpedicion})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-tinta-media">
              Área del ticket/factura
              <select
                value={areaTicketId ?? ""}
                disabled={asignandoTicket || areasImpresion.length === 0}
                title={areasImpresion.length === 0 ? "Primero creá un área en Áreas de impresión" : undefined}
                onChange={(e) => cambiarAreaTicket(e.target.value)}
                className={clasesSelectCompacto(!!areaTicketId)}
              >
                <option value="">Sin asignar — imprime manual</option>
                {areasImpresion.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </select>
            </label>
            {activa && !esEstaComputadora && (
              <Boton tono="navegar" tam="sm" onClick={vincular} disabled={vinculando}>
                {vinculando ? "Vinculando…" : "Vincular esta computadora"}
              </Boton>
            )}
            <Boton tono="navegar" tam="sm" onClick={() => setEditando(true)}>
              Renombrar
            </Boton>
            <Boton
              tono={activa ? "peligro" : "nuevo"}
              tam="sm"
              disabled={pending}
              onClick={() => startTransition(() => alternarActivaEstacion(id, !activa))}
            >
              {activa ? "Desactivar" : "Reactivar"}
            </Boton>
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-peligro">{error}</p>}

      {!editando && areasImpresion.length > 0 && (
        <div className="mt-3 border-t border-linea-fina pt-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-tinta-media">
            Impresoras por área — impresión automática (QZ Tray)
          </p>
          <p className="mb-2 text-xs text-tinta-suave">
            Elegí la impresora configurada como "raw" (driver Generic / Text
            Only en Windows) — no la impresora normal con el driver del
            fabricante, que se usa solo para ver/imprimir a mano desde el
            navegador.
          </p>

          {esEstaComputadora ? (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
                <button
                  type="button"
                  onClick={buscarImpresoras}
                  disabled={buscandoImpresoras}
                  className={clasesBoton("navegar", "sm")}
                >
                  {buscandoImpresoras ? "Buscando…" : "Buscar impresoras"}
                </button>
                {errorQz && <span className="text-xs text-peligro">{errorQz}</span>}
              </div>
              <p className="mb-2 text-xs text-tinta-suave">
                <strong className="font-semibold text-tinta-media">Copias:</strong> cuántas veces sale cada impresión en esta
                estación. 1 es lo normal; 2 sale dos veces (por ejemplo la comanda de la cocina); “No imprime” (0) hace que
                ese comprobante no salga acá (por ejemplo el ticket de un local que solo quiere la factura). Con “Probar
                impresión” sale una prueba cortita para ver que funciona antes de usarla con un pedido.
              </p>
              <div className="flex flex-col gap-3">
                {areasImpresion.map((a) => {
                  const actual = mapaImpresoras.get(a.id) ?? "";
                  const copias = mapaCopias.get(a.id) ?? 1;
                  const esAreaDelTicket = areaTicketId === a.id;
                  return (
                    <div key={a.id} className="flex flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-tinta-media">
                        <span className="w-24 flex-none font-medium">{a.nombre}</span>
                        <select
                          value={actual}
                          disabled={asignandoArea === a.id}
                          onChange={(e) => cambiarImpresoraDeArea(a.id, e.target.value)}
                          aria-label={`Impresora del área ${a.nombre}`}
                          className={clasesSelectCompacto(!!actual)}
                        >
                          <option value="">Sin asignar — imprime manual</option>
                          {actual && !impresorasDetectadas.includes(actual) && (
                            <option value={actual}>{actual} (guardada)</option>
                          )}
                          {impresorasDetectadas.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                        {actual && (
                          <button
                            type="button"
                            disabled={probando !== null}
                            onClick={() => probarImpresion(a.id, a.nombre, actual)}
                            className={clasesBoton("navegar", "sm")}
                          >
                            {probando === a.id ? "Enviando prueba…" : "Probar impresión"}
                          </button>
                        )}
                      </div>
                      {actual && (
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 pl-0 sm:pl-[6.75rem]">
                          <ContadorCopias
                            etiqueta={esAreaDelTicket ? "Ticket" : "Copias"}
                            valor={copias}
                            deshabilitado={cambiandoCopias === a.id}
                            onCambiar={(n) => cambiarCopias(a.id, n)}
                          />
                          {/* El área del ticket/factura imprime las dos cosas: la factura tiene su propio contador. */}
                          {esAreaDelTicket && (
                            <ContadorCopias
                              etiqueta="Factura"
                              valor={copiasFactura}
                              deshabilitado={cambiandoCopias === "factura"}
                              onCambiar={cambiarCopiasDeLaFactura}
                            />
                          )}
                        </div>
                      )}
                      {resultadoPrueba?.areaId === a.id && (
                        <p
                          className={`text-xs font-medium sm:pl-[6.75rem] ${resultadoPrueba.ok ? "text-exito" : "text-peligro"}`}
                        >
                          {resultadoPrueba.texto}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <ul className="flex flex-col gap-0.5 text-xs text-tinta-media">
              {areasImpresion.map((a) => (
                <li key={a.id}>
                  {a.nombre}: {mapaImpresoras.get(a.id) ?? "sin asignar"}
                  {mapaImpresoras.has(a.id) && (
                    <>
                      {" · "}
                      {(mapaCopias.get(a.id) ?? 1) === 0
                        ? "no imprime"
                        : `${mapaCopias.get(a.id) ?? 1} ${(mapaCopias.get(a.id) ?? 1) === 1 ? "copia" : "copias"}`}
                      {areaTicketId === a.id && ` (ticket) · factura: ${copiasFactura === 0 ? "no imprime" : `${copiasFactura} ${copiasFactura === 1 ? "copia" : "copias"}`}`}
                    </>
                  )}
                </li>
              ))}
              <li className="mt-1 text-tinta-suave">
                Para configurar impresoras, entrá a esta pantalla desde ESA computadora.
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
