"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Boton, clasesBoton } from "@/components/ui";
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
  "rounded-lg border border-linea bg-white px-2.5 py-2 text-[0.9rem] font-medium text-tinta focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15";

/**
 * El paso de cobro, separado de "armar el pedido".
 *
 * Recién acá se pregunta cómo paga — antes solo se está cargando el
 * carrito. Para efectivo se pide con cuánto paga y se calcula el vuelto:
 * es la cuenta que el cajero necesita para dar el cambio, no un dato
 * de negocio (no se guarda en la venta).
 *
 * Lo normal es una sola forma de pago (un toque y listo). "Dividir el pago"
 * abre el modo de varias formas — 50.000 en efectivo y 50.000 con débito —,
 * donde la suma tiene que dar justo el total antes de dejar cobrar.
 *
 * En el celular sube como una hoja desde abajo (mismo patrón que
 * FichaProducto.tsx en el menú público); en pantallas más anchas es un
 * cuadro centrado, ancho y bajo (el total al lado del cliente, las formas
 * de pago en dos renglones) — el pulgar del cajero queda cerca de los
 * botones en los dos casos.
 */
export function CobrarModal({
  clienteNombre,
  cantidadItems,
  total,
  cobrando,
  error,
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
  /** Si el local vende a crédito (Configuración): se ofrece "A crédito" como forma de pago. */
  permiteCredito: boolean;
  /** Lo que se muestra al elegir "A crédito": buscar el cliente o crearlo (lo arma la pantalla de venta, que tiene sus datos). */
  bloqueClienteCredito: ReactNode;
  /** Si ya hay un cliente cargado al que cobrarle después. Sin eso no se puede registrar la venta a crédito. */
  creditoListo: boolean;
  /** Si hay otro cuadro abierto encima (crear cliente): Escape cierra ese, no este. */
  hayModalEncima: boolean;
  onCerrar: () => void;
  /** Cómo se paga: una fila, o varias si se divide. `creditoDias` solo viene cuando se paga "a_credito". */
  onCobrar: (pagos: PagoCobro[], creditoDias?: number) => void;
}) {
  const [formaPago, setFormaPago] = useState<FormaPagoPos | typeof FORMA_PAGO_A_CREDITO>("efectivo");
  const [montoRecibido, setMontoRecibido] = useState(String(Math.round(total)));
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

  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      if (e.key === "Escape" && !hayModalEncima) onCerrar();
    }
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [onCerrar, hayModalEncima]);

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
    if (dividiendo) {
      onCobrar(lineas.map((l) => ({ forma: l.forma, monto: parseFloat(l.monto) || 0 })));
      return;
    }
    if (formaPago === FORMA_PAGO_A_CREDITO) {
      onCobrar(
        [{ forma: FORMA_PAGO_A_CREDITO, monto: total }],
        Math.max(0, Math.round(Number(creditoDias) || 0))
      );
      return;
    }
    onCobrar([{ forma: formaPago, monto: total }]);
  }

  const totalGrande = (
    <p className="cifra text-[1.9rem] font-bold leading-none text-tinta">{formatearGuarani(total)}</p>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-tinta/45 sm:items-center sm:p-4"
      onClick={onCerrar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cobrar"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-xl bg-white p-4 shadow-alta animate-[subirHoja_0.28s_cubic-bezier(0.22,0.7,0.3,1)] sm:max-w-xl sm:animate-[subir_0.22s_ease-out] sm:rounded-xl sm:p-5"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto mb-3 block h-1 w-10 flex-none rounded-full bg-linea sm:hidden" />

        {/* En pantallas anchas el total va al lado del cliente (ahorra una fila); en el celular queda debajo, más grande. */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[0.7rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
              Cobrar
            </p>
            <p className="truncate text-[0.85rem] text-tinta-media">
              {clienteNombre.trim() || "Cliente sin nombre"} · {cantidadItems}{" "}
              {cantidadItems === 1 ? "producto" : "productos"}
            </p>
          </div>
          <div className="hidden flex-none sm:block">{totalGrande}</div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-tinta-suave transition-colors hover:bg-papel-suave hover:text-tinta"
          >
            ✕
          </button>
        </div>
        <div className="mt-2 sm:hidden">{totalGrande}</div>

        <div className="mb-2 mt-4 flex items-center justify-between gap-2">
          <p className="text-[0.75rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
            {dividiendo ? "Dividir el pago" : "¿Cómo paga?"}
          </p>
          {dividiendo ? (
            <button type="button" onClick={volverAUnaForma} className={clasesBoton("suave", "sm")}>
              Una sola forma de pago
            </button>
          ) : (
            !esCredito && (
              <button type="button" onClick={empezarADividir} className={clasesBoton("suave", "sm")}>
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
                    value={l.monto}
                    onChange={(e) => cambiarLinea(i, { monto: e.target.value })}
                    onWheel={(e) => e.currentTarget.blur()}
                    placeholder="Monto"
                    aria-label={`Monto de la forma de pago ${i + 1}`}
                    className={`${CLASE_CAMPO} w-36 text-right`}
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
                <button type="button" onClick={agregarLinea} className={clasesBoton("suave", "sm")}>
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
              <div className="mt-2.5 flex flex-wrap items-center gap-3 rounded-lg border border-linea bg-papel-suave px-3 py-2">
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
                  value={efectivoRecibido}
                  onChange={(e) => setEfectivoRecibido(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  placeholder={String(Math.round(montoEnEfectivo))}
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
            <div className={`grid grid-cols-2 gap-2 ${permiteCredito ? "sm:grid-cols-3" : "sm:grid-cols-4"}`}>
              {FORMAS_PAGO_POS.map((f) => (
                <button
                  key={f.valor}
                  type="button"
                  onClick={() => setFormaPago(f.valor)}
                  aria-pressed={formaPago === f.valor}
                  className={`flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-[0.85rem] font-medium leading-tight transition-all active:scale-[0.97] ${
                    formaPago === f.valor
                      ? "border-brand bg-brand-light text-brand-texto shadow-sm"
                      : "border-linea text-tinta-media hover:border-brand/40 hover:bg-papel-suave"
                  }`}
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
                  className={`col-span-2 flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-[0.85rem] font-medium leading-tight transition-all active:scale-[0.97] sm:col-span-2 ${
                    esCredito
                      ? "border-brand bg-brand-light text-brand-texto shadow-sm"
                      : "border-linea text-tinta-media hover:border-brand/40 hover:bg-papel-suave"
                  }`}
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
                    value={creditoDias}
                    onChange={(e) => setCreditoDias(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="mt-1 w-full rounded-lg border border-linea bg-white px-3 py-2 text-center text-[1rem] font-semibold normal-case tracking-normal text-tinta focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
                  />
                </label>
                {bloqueClienteCredito}
              </div>
            )}

            {formaPago === "efectivo" && (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-linea bg-papel-suave px-3 py-2.5 animate-[subir_0.25s_ease-out]">
                <label
                  htmlFor="paga-con"
                  className="text-[0.75rem] font-semibold uppercase tracking-rotulo text-tinta-suave"
                >
                  Paga con
                </label>
                <input
                  id="paga-con"
                  type="number"
                  min={0}
                  step={1000}
                  value={montoRecibido}
                  onChange={(e) => setMontoRecibido(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="w-40 rounded-lg border border-linea bg-white px-3 py-2 text-center text-[1.05rem] font-semibold text-tinta transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
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

        {error && (
          <p className="mt-3 rounded-lg bg-peligro-luz px-3 py-2 text-[0.82rem] font-medium text-peligro">
            {error}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <div className="flex-1">
            <Boton tono="fantasma" tam="lg" onClick={onCerrar} className="w-full">
              Volver
            </Boton>
          </div>
          <div className="flex-[2]">
            <Boton
              tam="lg"
              onClick={cobrar}
              disabled={cobrando || (esCredito && !creditoListo) || (dividiendo && !puedeCobrarDividido)}
              className="w-full"
            >
              {cobrando
                ? "Guardando…"
                : !dividiendo && esCredito
                  ? "Registrar venta a crédito"
                  : `Cobrar ${formatearGuarani(total)}`}
            </Boton>
          </div>
        </div>
      </div>
    </div>
  );
}
