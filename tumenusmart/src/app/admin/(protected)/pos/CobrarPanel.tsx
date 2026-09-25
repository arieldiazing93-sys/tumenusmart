"use client";

import { useState, type ReactNode } from "react";
import { PanelLateral } from "@/components/PanelLateral";
import { clasesBoton } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";
import { FORMAS_PAGO_POS, FORMA_PAGO_A_CREDITO, type FormaPagoPos } from "@/lib/turno-pos";
import { MAX_PAGOS_POR_VENTA, type PagoCobro } from "@/lib/pago-venta";

/** Los días de plazo que se proponen al vender a crédito. */
const DIAS_CREDITO_POR_DEFECTO = 30;

const ICONOS_FORMA: Record<FormaPagoPos, string> = {
  efectivo: "💵",
  transferencia: "🏦",
  tarjeta_debito: "💳",
  tarjeta_credito: "💳",
};

/** Una fila del pago dividido: la forma y lo que se cobra con ella (el monto se tipea, por eso es texto). */
type LineaPago = { forma: FormaPagoPos; monto: string };

const CLASE_CAMPO =
  "rounded-lg border border-linea bg-white px-2.5 py-2 text-[0.9rem] font-medium text-tinta focus:border-azul focus:outline-none focus:ring-2 focus:ring-azul/15";

/** El campo de a quién se le asigna el trabajo va en amarillo, igual que el de Personal en la agenda. */
const CAMPO_AMARILLO = { backgroundColor: "#FEF08A", borderColor: "#EAB308" } as const;

/** Un método de pago: blanco con borde, y en azul el elegido (igual que en el cobro de las citas). */
function claseMetodo(elegido: boolean): string {
  return `flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-[0.85rem] font-medium leading-tight transition-colors active:scale-[0.98] ${
    elegido
      ? "border-azul bg-azul-luz text-azul-oscuro"
      : "border-linea text-tinta-media hover:border-azul/40 hover:bg-papel-suave"
  }`;
}

/**
 * El paso de cobro del mostrador, como un panel que entra desde la derecha y ocupa toda la
 * pantalla de arriba a abajo (el mismo que se usa para cobrar una cita en la agenda).
 *
 * Recién acá se pregunta cómo paga — antes solo se está cargando el carrito. Para efectivo se
 * pide con cuánto paga y se calcula el vuelto: es la cuenta que el cajero necesita para dar el
 * cambio, no un dato de negocio (no se guarda en la venta). El campo arranca vacío: lo que se
 * ve ahí lo escribió el cajero (o lo puso el botón "Justo").
 *
 * Lo normal es una sola forma de pago (un toque y listo). "Dividir el pago" abre el modo de
 * varias formas — 50.000 en efectivo y 50.000 con débito —, donde la suma tiene que dar justo
 * el total antes de dejar cobrar. Arriba queda el total; abajo, fijos, "Volver" y "Cobrar".
 */
export function CobrarPanel({
  clienteNombre,
  cantidadItems,
  total,
  cobrando,
  error,
  personal,
  permiteCredito,
  bloqueClienteCredito,
  creditoListo,
  hayModalEncima,
  onCerrar,
  onCobrar,
}: {
  clienteNombre: string;
  cantidadItems: number;
  total: number;
  cobrando: boolean;
  error: string | null;
  /**
   * El personal al que se le puede asignar el trabajo. Con gente, el cobro pregunta "¿Quién hizo el
   * trabajo?" y no deja cobrar sin elegir; vacío (la mayoría de los negocios), no pregunta nada.
   */
  personal: { id: string; nombre: string }[];
  /** Si el local vende a crédito (Configuración): se ofrece "A crédito" como forma de pago. */
  permiteCredito: boolean;
  /** Lo que se muestra al elegir "A crédito": buscar el cliente o crearlo (lo arma la pantalla de venta, que tiene sus datos). */
  bloqueClienteCredito: ReactNode;
  /** Si ya hay un cliente cargado al que cobrarle después. Sin eso no se puede registrar la venta a crédito. */
  creditoListo: boolean;
  /** Si hay otro cuadro abierto encima (crear cliente): Escape cierra ese, no este panel. */
  hayModalEncima: boolean;
  onCerrar: () => void;
  /**
   * Cómo se paga: una fila, o varias si se divide. `creditoDias` solo viene cuando se paga "a_credito";
   * `personalId` solo cuando el cobro preguntó a quién se le asigna el trabajo.
   */
  onCobrar: (pagos: PagoCobro[], creditoDias?: number, personalId?: string) => void;
}) {
  const pideAsignar = personal.length > 0;
  const [personalId, setPersonalId] = useState("");
  const [formaPago, setFormaPago] = useState<FormaPagoPos | typeof FORMA_PAGO_A_CREDITO>("efectivo");
  // Vacío al abrir: no se propone ningún monto.
  const [montoRecibido, setMontoRecibido] = useState("");
  const [creditoDias, setCreditoDias] = useState(String(DIAS_CREDITO_POR_DEFECTO));
  const esCredito = formaPago === FORMA_PAGO_A_CREDITO;

  // Pago dividido.
  const [dividiendo, setDividiendo] = useState(false);
  const [lineas, setLineas] = useState<LineaPago[]>([]);
  const [efectivoRecibido, setEfectivoRecibido] = useState("");

  const vuelto = formaPago === "efectivo" ? (parseFloat(montoRecibido) || 0) - total : 0;

  const sumaLineas = lineas.reduce((s, l) => s + (parseFloat(l.monto) || 0), 0);
  const restante = total - sumaLineas;
  const cubreElTotal = Math.abs(restante) < 0.5;
  const puedeCobrarDividido =
    lineas.length >= 2 && lineas.every((l) => (parseFloat(l.monto) || 0) > 0) && cubreElTotal;
  // El vuelto del pago dividido sale solo de la parte en efectivo.
  const montoEnEfectivo = lineas
    .filter((l) => l.forma === "efectivo")
    .reduce((s, l) => s + (parseFloat(l.monto) || 0), 0);
  const vueltoDividido = montoEnEfectivo > 0 ? (parseFloat(efectivoRecibido) || 0) - montoEnEfectivo : 0;

  function empezarADividir() {
    const primera: FormaPagoPos = formaPago === FORMA_PAGO_A_CREDITO ? "efectivo" : formaPago;
    const segunda = FORMAS_PAGO_POS.find((f) => f.valor !== primera)?.valor ?? "transferencia";
    setLineas([
      { forma: primera, monto: "" },
      { forma: segunda, monto: "" },
    ]);
    setEfectivoRecibido("");
    setDividiendo(true);
  }

  function volverAUnaForma() {
    setDividiendo(false);
    setLineas([]);
  }

  function cambiarLinea(indice: number, cambios: Partial<LineaPago>) {
    setLineas((previas) => previas.map((l, i) => (i === indice ? { ...l, ...cambios } : l)));
  }

  /** Pone en esa fila lo que falta para llegar al total, descontando lo de las otras. */
  function completarConElResto(indice: number) {
    const deLasOtras = lineas.reduce((s, l, i) => (i === indice ? s : s + (parseFloat(l.monto) || 0)), 0);
    cambiarLinea(indice, { monto: String(Math.max(0, Math.round(total - deLasOtras))) });
  }

  function agregarLinea() {
    const usadas = new Set(lineas.map((l) => l.forma));
    const forma = FORMAS_PAGO_POS.find((f) => !usadas.has(f.valor))?.valor ?? "efectivo";
    setLineas((previas) => [...previas, { forma, monto: String(Math.max(0, Math.round(restante))) }]);
  }

  function quitarLinea(indice: number) {
    setLineas((previas) => previas.filter((_, i) => i !== indice));
  }

  function cobrar() {
    const asignado = pideAsignar ? personalId : undefined;
    if (dividiendo) {
      onCobrar(lineas.map((l) => ({ forma: l.forma, monto: parseFloat(l.monto) || 0 })), undefined, asignado);
      return;
    }
    if (formaPago === FORMA_PAGO_A_CREDITO) {
      onCobrar(
        [{ forma: FORMA_PAGO_A_CREDITO, monto: total }],
        Math.max(0, Math.round(Number(creditoDias) || 0)),
        asignado
      );
      return;
    }
    onCobrar([{ forma: formaPago, monto: total }], undefined, asignado);
  }

  const faltaElegirPersonal = pideAsignar && !personalId;
  const cobroBloqueado =
    cobrando || faltaElegirPersonal || (esCredito && !creditoListo) || (dividiendo && !puedeCobrarDividido);

  return (
    <PanelLateral
      titulo="Cobrar"
      // Escape cierra el cuadro de encima (crear cliente), no este panel.
      onCerrar={() => {
        if (!hayModalEncima) onCerrar();
      }}
      ancho="ancho"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
          {/* ---------- lo que se cobra ---------- */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-linea bg-superficie p-3.5 shadow-sm">
            <div className="min-w-0">
              <p className="text-[0.7rem] font-semibold uppercase tracking-rotulo text-tinta-suave">A cobrar</p>
              <p className="truncate text-[0.85rem] text-tinta-media">
                {clienteNombre.trim() || "Cliente sin nombre"} · {cantidadItems}{" "}
                {cantidadItems === 1 ? "producto" : "productos"}
              </p>
            </div>
            <p className="cifra flex-none text-[1.7rem] font-bold leading-none text-tinta">{formatearGuarani(total)}</p>
          </div>

          {/* ---------- a quién se le asigna el trabajo (solo en los negocios que lo activaron) ---------- */}
          {pideAsignar && (
            <div className="rounded-xl border border-yellow-400 bg-yellow-50 p-3.5">
              <label className="block">
                <span className="mb-1.5 block text-[0.82rem] font-semibold text-tinta">¿Quién hizo el trabajo? *</span>
                <select
                  value={personalId}
                  onChange={(e) => setPersonalId(e.target.value)}
                  style={CAMPO_AMARILLO}
                  className={`${CLASE_CAMPO} w-full font-semibold`}
                >
                  <option value="">Elegí a quién se le asigna…</option>
                  {personal.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-1.5 text-[0.76rem] leading-snug text-tinta-suave">
                El trabajo queda a su nombre: cuenta en su vista de trabajo y en su comisión.
              </p>
            </div>
          )}

          {/* ---------- cómo paga ---------- */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[0.82rem] font-semibold text-tinta">{dividiendo ? "Dividir el pago" : "Método de pago"}</p>
              {dividiendo ? (
                <button type="button" onClick={volverAUnaForma} className={clasesBoton("navegar", "sm")}>
                  Una sola forma de pago
                </button>
              ) : (
                !esCredito && (
                  // Azul (el tono de "ir a otro modo") para que se note que existe: en blanco casi no se veía.
                  <button type="button" onClick={empezarADividir} className={clasesBoton("navegar", "sm")}>
                    Dividir el pago
                  </button>
                )
              )}
            </div>

            {dividiendo ? (
              <div className="animate-[subir_0.25s_ease-out]">
                <div className="flex flex-col gap-2">
                  {lineas.map((l, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <select
                        value={l.forma}
                        onChange={(e) => cambiarLinea(i, { forma: e.target.value as FormaPagoPos })}
                        aria-label={`Forma de pago ${i + 1}`}
                        className={`${CLASE_CAMPO} min-w-0 flex-1`}
                      >
                        {FORMAS_PAGO_POS.map((f) => (
                          <option key={f.valor} value={f.valor}>
                            {ICONOS_FORMA[f.valor]} {f.etiqueta}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        inputMode="numeric"
                        autoComplete="off"
                        value={l.monto}
                        onChange={(e) => cambiarLinea(i, { monto: e.target.value })}
                        onWheel={(e) => e.currentTarget.blur()}
                        placeholder="Monto"
                        aria-label={`Monto de la forma de pago ${i + 1}`}
                        className={`${CLASE_CAMPO} w-32 text-right`}
                      />
                      <button
                        type="button"
                        onClick={() => completarConElResto(i)}
                        title="Poner lo que falta para llegar al total"
                        className={clasesBoton("suave", "sm")}
                      >
                        Resto
                      </button>
                      {lineas.length > 2 && (
                        <button
                          type="button"
                          onClick={() => quitarLinea(i)}
                          aria-label="Quitar esta forma de pago"
                          className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-tinta-suave transition-colors hover:bg-papel-suave hover:text-peligro"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {lineas.length < MAX_PAGOS_POR_VENTA && (
                    <button type="button" onClick={agregarLinea} className={clasesBoton("navegar", "sm")}>
                      + Agregar otra forma de pago
                    </button>
                  )}
                  <p
                    className={`flex-1 rounded-lg px-3 py-1.5 text-[0.85rem] font-medium ${
                      cubreElTotal
                        ? "bg-exito-luz text-exito"
                        : restante > 0
                          ? "bg-aviso-luz text-aviso"
                          : "bg-peligro-luz text-peligro"
                    }`}
                  >
                    {cubreElTotal
                      ? "✓ Los montos cubren el total."
                      : restante > 0
                        ? `Falta cobrar ${formatearGuarani(restante)}`
                        : `Se pasa por ${formatearGuarani(-restante)}`}
                  </p>
                </div>

                {montoEnEfectivo > 0 && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-3 rounded-lg border border-linea bg-white px-3 py-2">
                    <label
                      htmlFor="efectivo-recibido"
                      className="text-[0.75rem] font-semibold uppercase tracking-rotulo text-tinta-suave"
                    >
                      Efectivo recibido (opcional)
                    </label>
                    <input
                      id="efectivo-recibido"
                      type="number"
                      min={0}
                      step={1000}
                      autoComplete="off"
                      value={efectivoRecibido}
                      onChange={(e) => setEfectivoRecibido(e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      className={`${CLASE_CAMPO} w-36 text-center`}
                    />
                    {vueltoDividido > 0 && (
                      <p className="text-[0.85rem] text-tinta">
                        Vuelto: <strong className="cifra text-exito">{formatearGuarani(vueltoDividido)}</strong>
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {FORMAS_PAGO_POS.map((f) => (
                    <button
                      key={f.valor}
                      type="button"
                      onClick={() => setFormaPago(f.valor)}
                      aria-pressed={formaPago === f.valor}
                      className={claseMetodo(formaPago === f.valor)}
                    >
                      <span aria-hidden="true" className="text-base leading-none">
                        {ICONOS_FORMA[f.valor]}
                      </span>
                      {f.etiqueta}
                    </button>
                  ))}
                  {permiteCredito && (
                    <button
                      type="button"
                      onClick={() => setFormaPago(FORMA_PAGO_A_CREDITO)}
                      aria-pressed={esCredito}
                      className={`${claseMetodo(esCredito)} col-span-2`}
                    >
                      <span aria-hidden="true" className="text-base leading-none">
                        🧾
                      </span>
                      A crédito (paga después)
                    </button>
                  )}
                </div>

                {esCredito && (
                  <div className="mt-3 rounded-lg border border-aviso/30 bg-aviso-luz p-3.5 animate-[subir_0.25s_ease-out]">
                    <p className="text-[0.85rem] font-medium text-tinta">
                      Esta venta no entra en la caja: el cliente la paga después.
                    </p>
                    <p className="mt-1 text-[0.78rem] text-tinta-media">
                      Hace falta saber a quién cobrarle después: buscá al cliente o creá uno nuevo acá abajo. Se cobra desde
                      Cuentas por cobrar.
                    </p>
                    <label className="mt-2.5 block text-[0.75rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
                      Vence en (días)
                      <input
                        type="number"
                        min={0}
                        max={365}
                        step={1}
                        autoComplete="off"
                        value={creditoDias}
                        onChange={(e) => setCreditoDias(e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        className={`${CLASE_CAMPO} mt-1 w-full py-2 text-center text-[1rem] font-semibold normal-case tracking-normal`}
                      />
                    </label>
                    {bloqueClienteCredito}
                  </div>
                )}

                {formaPago === "efectivo" && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2.5 rounded-lg border border-linea bg-white px-3 py-2.5 animate-[subir_0.25s_ease-out]">
                    <label
                      htmlFor="paga-con"
                      className="text-[0.75rem] font-semibold uppercase tracking-rotulo text-tinta-suave"
                    >
                      Paga con
                    </label>
                    {/* Arranca vacío: nada de montos de ejemplo que parezcan cargados. */}
                    <input
                      id="paga-con"
                      type="number"
                      min={0}
                      step={1000}
                      inputMode="numeric"
                      autoComplete="off"
                      value={montoRecibido}
                      onChange={(e) => setMontoRecibido(e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      className={`${CLASE_CAMPO} w-36 text-center text-[1.05rem] font-semibold`}
                    />
                    <button
                      type="button"
                      onClick={() => setMontoRecibido(String(Math.round(total)))}
                      className={clasesBoton("suave", "sm")}
                    >
                      Justo
                    </button>
                    {vuelto > 0 && (
                      <p className="ml-auto text-[0.9rem] text-tinta">
                        Vuelto: <strong className="cifra text-exito">{formatearGuarani(vuelto)}</strong>
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ---------- pie fijo: siempre a la vista, aunque el panel se deslice ---------- */}
        <div
          className="flex flex-none flex-col gap-2 border-t border-linea bg-superficie px-4 pt-3"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
        >
          {error && (
            <p className="rounded-lg bg-peligro-luz px-3 py-2 text-[0.82rem] font-medium text-peligro">{error}</p>
          )}
          {faltaElegirPersonal && !error && (
            <p className="text-center text-[0.78rem] font-medium text-aviso">Elegí quién hizo el trabajo para poder cobrar.</p>
          )}
          <div className="flex items-center gap-2">
            <button type="button" onClick={onCerrar} className={clasesBoton("fantasma", "lg")}>
              Volver
            </button>
            {/* El ancho lo da este contenedor: el botón lo ocupa entero, diga lo que diga. */}
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={cobrar}
                disabled={cobroBloqueado}
                className={`${clasesBoton("principal", "lg")} w-full`}
              >
                {cobrando
                  ? "Guardando…"
                  : !dividiendo && esCredito
                    ? "Registrar venta a crédito"
                    : `Cobrar ${formatearGuarani(total)}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </PanelLateral>
  );
}
