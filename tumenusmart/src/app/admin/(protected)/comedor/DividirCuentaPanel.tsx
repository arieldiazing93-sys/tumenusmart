"use client";

import { useState } from "react";
import { MensajeError, Selector, clasesBoton } from "@/components/ui";
import { PanelLateral } from "@/components/PanelLateral";
import { Segmentado } from "@/components/Segmentado";
import { formatearCantidad, formatearGuarani, formatearNumero } from "@/lib/format";
import { claveDeMesa } from "@/lib/comedor";
import {
  PARTES_MAXIMAS,
  dividirEnPartesIguales,
  dividirPorProducto,
  nombresDeCuentasNuevas,
  type AsignacionDeLinea,
  type LineaBase,
} from "@/lib/division-cuenta";
import type { CuentaCajaFila } from "./ComedorCaja";
import { dividirCuenta } from "./division-actions";

type Modo = "iguales" | "producto";

/** Un contador con menos y más, para elegir en cuántas partes. */
function Contador({
  valor,
  minimo,
  maximo,
  onCambiar,
  etiqueta,
}: {
  valor: number;
  minimo: number;
  maximo: number;
  onCambiar: (nuevo: number) => void;
  etiqueta: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={`Una menos: ${etiqueta}`}
        disabled={valor <= minimo}
        onClick={() => onCambiar(valor - 1)}
        className={`${clasesBoton("suave", "md")} w-10 justify-center`}
      >
        −
      </button>
      <span className="cifra w-8 text-center text-[1.2rem] font-semibold text-tinta">{valor}</span>
      <button
        type="button"
        aria-label={`Una más: ${etiqueta}`}
        disabled={valor >= maximo}
        onClick={() => onCambiar(valor + 1)}
        className={`${clasesBoton("suave", "md")} w-10 justify-center`}
      >
        +
      </button>
    </div>
  );
}

/**
 * Dividir la cuenta de una mesa porque cada uno quiere su factura: en partes iguales (cada parte lleva, por ejemplo, media
 * pizza: 0,5) o por producto (se eligen los productos que pasan a una cuenta nueva y las cantidades quedan enteras). La
 * original conserva su nombre ("Mesa 1") y las nuevas se llaman "1-A", "1-B"…
 *
 * Lo que se muestra sale de la MISMA función que usa el servidor para dividir (src/lib/division-cuenta.ts), así que lo que se
 * ve es exactamente lo que se guarda: totales enteros que suman justo el total de la cuenta, sin un guaraní de diferencia.
 */
export function DividirCuentaPanel({
  cuenta,
  mesasOcupadas,
  onCerrar,
  onHecho,
}: {
  cuenta: CuentaCajaFila;
  /** Los nombres de las mesas que ya tienen una cuenta abierta (para que los nombres nuevos no se repitan). */
  mesasOcupadas: string[];
  onCerrar: () => void;
  /** Se llama con el mensaje a mostrar cuando la división ya se hizo. */
  onHecho: (mensaje: string) => void;
}) {
  const [modo, setModo] = useState<Modo>("iguales");
  const [partes, setPartes] = useState(2);
  const [destinos, setDestinos] = useState(1);
  // Por producto: a qué cuenta nueva pasa cada línea (0 = se queda) y cuántas unidades.
  const [elegido, setElegido] = useState<Record<string, { destino: number; cantidad: number }>>({});
  const [haciendo, setHaciendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activos = cuenta.items.filter((i) => !i.anulado);
  const lineas: LineaBase[] = activos.map((i) => ({
    id: i.id,
    nombreProducto: i.opciones ? `${i.nombre} (${i.opciones})` : i.nombre,
    cantidad: i.cantidad,
    precioUnitario: i.precioUnitario,
  }));
  const pedido = cuenta.descuento ? { tipo: cuenta.descuento.tipo, valor: cuenta.descuento.valor } : null;

  const base = cuenta.mesaBase ?? cuenta.mesa;
  const ocupadas = new Set(mesasOcupadas.map(claveDeMesa));
  const cuantasNuevas = modo === "iguales" ? partes - 1 : destinos;
  const nombres = nombresDeCuentasNuevas(base, cuantasNuevas, (clave) => ocupadas.has(clave));
  const nombreDeParte = (indice: number) => (indice === 0 ? `Mesa ${cuenta.mesa}` : `Mesa ${nombres?.[indice - 1] ?? "…"}`);

  const asignaciones: AsignacionDeLinea[] = Object.entries(elegido)
    .filter(([, e]) => e.destino >= 1 && e.destino <= destinos)
    .map(([itemId, e]) => ({ itemId, destino: e.destino, cantidad: e.cantidad }));
  const plan =
    modo === "iguales" ? dividirEnPartesIguales(lineas, pedido, partes) : dividirPorProducto(lineas, pedido, destinos, asignaciones);

  function cambiarDestinos(nuevo: number) {
    setDestinos(nuevo);
    // Lo que iba a una cuenta que ya no existe vuelve a quedarse en la original.
    setElegido((actual) => Object.fromEntries(Object.entries(actual).map(([id, e]) => [id, e.destino > nuevo ? { ...e, destino: 0 } : e])));
  }

  function elegirDestino(itemId: string, cantidadTotal: number, destino: number) {
    setElegido((actual) => ({ ...actual, [itemId]: { destino, cantidad: actual[itemId]?.cantidad ?? cantidadTotal } }));
  }

  function elegirCantidad(itemId: string, cantidad: number) {
    setElegido((actual) => ({ ...actual, [itemId]: { destino: actual[itemId]?.destino ?? 0, cantidad } }));
  }

  async function dividir() {
    if (!plan.ok || !nombres || haciendo) return;
    setHaciendo(true);
    setError(null);
    try {
      const r = await dividirCuenta(
        cuenta.id,
        modo === "iguales"
          ? { modo, partes, totalMostrado: cuenta.totales.total }
          : { modo, destinos, asignaciones, totalMostrado: cuenta.totales.total }
      );
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onHecho(
        `Cuenta dividida: Mesa ${r.original.mesa} (${formatearGuarani(r.original.total)})` +
          r.nuevas.map((n) => ` · Mesa ${n.mesa} (${formatearGuarani(n.total)})`).join("") +
          ". Quedaron abiertas: imprimí cada una antes de cobrarla."
      );
    } catch {
      setError("No se pudo dividir la cuenta. Revisá la conexión y probá de nuevo: no se hizo ningún cambio.");
    } finally {
      setHaciendo(false);
    }
  }

  const sinProductos = activos.length === 0;

  return (
    <PanelLateral titulo={`Dividir la mesa ${cuenta.mesa}`} onCerrar={() => !haciendo && onCerrar()} ancho="ancho">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
          <div className="rounded-xl border-2 border-azul/50 bg-superficie p-3.5">
            <p className="text-[0.7rem] font-semibold uppercase tracking-rotulo text-tinta-suave">Cuenta a dividir</p>
            <p className="text-[0.85rem] text-tinta-media">
              Mesa {cuenta.mesa} · Cuenta {formatearNumero(cuenta.numero)}
            </p>
            <p className="cifra text-[1.35rem] font-bold text-tinta">{formatearGuarani(cuenta.totales.total)}</p>
            {cuenta.descuento && (
              <p className="text-[0.76rem] text-tinta-suave">
                Con descuento: se reparte entre las cuentas para que el total no cambie ni en un guaraní.
              </p>
            )}
          </div>

          <Segmentado<Modo>
            opciones={[
              { value: "iguales", label: "En partes iguales", sublabel: "Cada uno paga lo mismo" },
              { value: "producto", label: "Por producto", sublabel: "Elegís qué paga cada uno" },
            ]}
            valor={modo}
            onChange={(m) => {
              setModo(m);
              setError(null);
            }}
          />

          {sinProductos ? (
            <p className="rounded-lg bg-aviso-luz px-3 py-2 text-[0.82rem] font-medium text-aviso">La cuenta no tiene productos para dividir.</p>
          ) : modo === "iguales" ? (
            <div className="flex flex-col gap-2 rounded-xl border-2 border-azul/50 bg-superficie p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[0.85rem] font-semibold text-tinta">¿En cuántas cuentas?</p>
                <Contador valor={partes} minimo={2} maximo={PARTES_MAXIMAS} onCambiar={setPartes} etiqueta="cuentas" />
              </div>
              <p className="text-[0.76rem] leading-snug text-tinta-suave">
                Cada cuenta lleva una parte de cada producto (media pizza, medio lomito…). La original queda como la 1 y las
                demás se llaman {nombres ? nombres.map((n) => `Mesa ${n}`).join(", ") : "…"}.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2 rounded-xl border-2 border-azul/50 bg-superficie p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[0.85rem] font-semibold text-tinta">Cuentas nuevas</p>
                  <Contador valor={destinos} minimo={1} maximo={PARTES_MAXIMAS - 1} onCambiar={cambiarDestinos} etiqueta="cuentas nuevas" />
                </div>
                <p className="text-[0.76rem] leading-snug text-tinta-suave">
                  Elegí a qué cuenta pasa cada producto. Lo que no cambies se queda en la Mesa {cuenta.mesa}. Las cantidades quedan
                  enteras.
                </p>
              </div>

              <ul className="flex flex-col gap-2">
                {activos.map((i) => {
                  const e = elegido[i.id] ?? { destino: 0, cantidad: i.cantidad };
                  const pasa = e.destino >= 1 && e.destino <= destinos;
                  const enteraYVariasUnidades = Number.isInteger(i.cantidad) && i.cantidad > 1;
                  return (
                    <li key={i.id} className="rounded-xl border border-linea bg-superficie p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 text-[0.86rem] text-tinta">
                          <span className="font-semibold">{formatearCantidad(i.cantidad)} ×</span> {i.nombre}
                          {i.opciones && <span className="block text-[0.74rem] text-tinta-suave">+ {i.opciones}</span>}
                        </p>
                        <p className="cifra flex-none text-[0.86rem] font-semibold text-tinta">
                          {formatearGuarani(i.precioUnitario * i.cantidad)}
                        </p>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <div className="min-w-[10rem] flex-1">
                          <Selector
                            value={String(pasa ? e.destino : 0)}
                            onChange={(ev) => elegirDestino(i.id, i.cantidad, Number(ev.target.value))}
                            aria-label={`A qué cuenta pasa ${i.nombre}`}
                          >
                            <option value="0">Se queda en Mesa {cuenta.mesa}</option>
                            {Array.from({ length: destinos }, (_, k) => (
                              <option key={k + 1} value={k + 1}>
                                Pasa a Mesa {nombres?.[k] ?? "…"}
                              </option>
                            ))}
                          </Selector>
                        </div>
                        {pasa && enteraYVariasUnidades && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[0.76rem] text-tinta-suave">Cuántas</span>
                            <Selector
                              value={String(e.cantidad)}
                              onChange={(ev) => elegirCantidad(i.id, Number(ev.target.value))}
                              aria-label={`Cuántas unidades de ${i.nombre} pasan`}
                            >
                              {Array.from({ length: i.cantidad }, (_, k) => (
                                <option key={k + 1} value={k + 1}>
                                  {k + 1}
                                  {k + 1 === i.cantidad ? " (todas)" : ""}
                                </option>
                              ))}
                            </Selector>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* ------------------------------------------------------------------- cómo queda cada cuenta */}
          {!sinProductos && (
            <div className="flex flex-col gap-2">
              <p className="text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">Así queda</p>
              {plan.ok ? (
                <>
                  {plan.partes.map((p) => (
                    <div key={p.indice} className="rounded-xl border-2 border-azul/50 bg-superficie p-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[0.9rem] font-semibold text-tinta">
                          {nombreDeParte(p.indice)}
                          {p.indice === 0 && <span className="font-normal text-tinta-suave"> · la original</span>}
                        </p>
                        <p className="cifra text-[1.05rem] font-bold text-tinta">{formatearGuarani(p.total)}</p>
                      </div>
                      <ul className="mt-1.5 flex flex-col gap-0.5 text-[0.8rem] text-tinta-media">
                        {p.lineas.map((l) => (
                          <li key={`${l.origenId}-${l.accion}`} className="flex justify-between gap-2">
                            <span className="min-w-0">
                              <strong className="font-semibold text-tinta">{formatearCantidad(l.cantidad)} ×</strong> {l.nombreProducto}
                            </span>
                            <span className="cifra flex-none">{formatearGuarani(l.importe)}</span>
                          </li>
                        ))}
                      </ul>
                      {p.montoDescuento > 0 && (
                        <p className="mt-1 text-[0.74rem] text-tinta-suave">
                          {formatearGuarani(p.subtotal)} − descuento {formatearGuarani(p.montoDescuento)}
                        </p>
                      )}
                    </div>
                  ))}
                  <p className="text-[0.76rem] leading-snug text-tinta-suave">
                    Las cuentas suman {formatearGuarani(plan.partes.reduce((s, p) => s + p.total, 0))}, igual que la cuenta original:
                    no sobra ni falta ningún guaraní. Cada una se cobra y se factura por separado (el IVA de cada factura sale de su
                    propio total).
                  </p>
                </>
              ) : (
                <p className="rounded-lg bg-aviso-luz px-3 py-2 text-[0.82rem] font-medium text-aviso">{plan.error}</p>
              )}
              {!nombres && (
                <p className="rounded-lg bg-peligro-luz px-3 py-2 text-[0.82rem] font-medium text-peligro">
                  No se pueden armar los nombres de las cuentas nuevas: el nombre de la mesa es demasiado largo.
                </p>
              )}
              <p className="text-[0.76rem] leading-snug text-tinta-suave">
                {cuenta.estado === "por_cobrar"
                  ? "Esta cuenta ya estaba impresa: al dividirla cambian los totales, así que quedan todas abiertas y hay que imprimir cada una antes de cobrarla."
                  : "Las cuentas quedan abiertas: imprimí cada una antes de cobrarla."}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-none flex-col gap-2 border-t border-linea bg-superficie px-4 py-3">
          {error && <MensajeError>{error}</MensajeError>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCerrar} disabled={haciendo} className={clasesBoton("peligro", "md")}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void dividir()}
              disabled={haciendo || sinProductos || !plan.ok || !nombres}
              className={clasesBoton("nuevo", "md")}
            >
              {haciendo ? "Dividiendo…" : "Dividir la cuenta"}
            </button>
          </div>
        </div>
      </div>
    </PanelLateral>
  );
}
