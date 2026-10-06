"use client";

import { useState } from "react";
import { MensajeError, Pastilla, Selector, clasesBoton, type ColorEstado } from "@/components/ui";
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

/** A qué cuenta nueva pasa un producto (1 = la primera, "1-A") y cuántas de sus unidades. */
type Elegido = { destino: number; cantidad: number };

/** Un color por cuenta nueva, para leer de un vistazo a cuál va cada producto. */
const COLORES_DE_CUENTA: ColorEstado[] = ["azul", "exito", "marca", "amarillo", "aviso"];

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
 * Que las cuentas nuevas usadas sean 1, 2, 3… sin saltos: si se vacía la "1-A" y queda la "1-B", la "1-B" pasa a ser la "1-A".
 * Así nunca queda una cuenta nueva sin productos en el medio.
 */
function compactar(actual: Record<string, Elegido>): Record<string, Elegido> {
  const usados = [...new Set(Object.values(actual).map((e) => e.destino).filter((d) => d >= 1))].sort((a, b) => a - b);
  const nuevoNumero = new Map(usados.map((d, i) => [d, i + 1]));
  return Object.fromEntries(
    Object.entries(actual)
      .filter(([, e]) => e.destino >= 1)
      .map(([id, e]) => [id, { ...e, destino: nuevoNumero.get(e.destino) ?? e.destino }])
  );
}

/**
 * Dividir la cuenta de una mesa porque cada uno quiere su factura: en partes iguales (cada parte lleva, por ejemplo, media
 * pizza: 0,5) o por producto (se marcan los productos y se mueven a una cuenta nueva; las cantidades quedan enteras). La
 * original conserva su nombre ("Mesa 1") y las nuevas se llaman "1-A", "1-B"…
 *
 * Por producto: una sola lista con una casilla en cada producto. Se marcan los que pasan a otra persona y se toca "Mover a
 * Mesa 1-A" (o "1-B" para una tercera persona): la cuenta nueva se arma con esos productos. Se puede mover de nuevo o
 * devolver a la original las veces que haga falta antes de confirmar.
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
  // Por producto: a qué cuenta nueva pasa cada producto (los que no están acá se quedan en la original) y cuáles están marcados.
  const [elegido, setElegido] = useState<Record<string, Elegido>>({});
  const [marcados, setMarcados] = useState<Record<string, boolean>>({});
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

  // Por producto: cuántas cuentas nuevas hay ahora (las usadas son 1..k) y las marcas que siguen valiendo.
  const idsActivos = new Set(activos.map((i) => i.id));
  const asignaciones: AsignacionDeLinea[] = Object.entries(elegido)
    .filter(([id]) => idsActivos.has(id))
    .map(([itemId, e]) => ({ itemId, destino: e.destino, cantidad: e.cantidad }));
  const cuentasNuevasPorProducto = asignaciones.reduce((m, a) => Math.max(m, a.destino), 0);
  const cantidadMarcados = activos.filter((i) => marcados[i.id]).length;

  const base = cuenta.mesaBase ?? cuenta.mesa;
  const ocupadas = new Set(mesasOcupadas.map(claveDeMesa));
  // Los nombres que hacen falta: en partes iguales, uno por parte menos la original; por producto, los usados más el que
  // se crearía con el próximo "Mover a…".
  const cuantosNombres =
    modo === "iguales" ? partes - 1 : Math.min(cuentasNuevasPorProducto + 1, PARTES_MAXIMAS - 1);
  const nombres = nombresDeCuentasNuevas(base, cuantosNombres, (clave) => ocupadas.has(clave));
  const nombreDeParte = (indice: number) => (indice === 0 ? `Mesa ${cuenta.mesa}` : `Mesa ${nombres?.[indice - 1] ?? "…"}`);

  const plan =
    modo === "iguales"
      ? dividirEnPartesIguales(lineas, pedido, partes)
      : cuentasNuevasPorProducto >= 1
        ? dividirPorProducto(lineas, pedido, cuentasNuevasPorProducto, asignaciones)
        : null;

  // ------------------------------------------------------------------------------------------- marcar y mover
  function marcar(id: string, valor: boolean) {
    setMarcados((actual) => ({ ...actual, [id]: valor }));
  }

  function marcarTodos(valor: boolean) {
    setMarcados(valor ? Object.fromEntries(activos.map((i) => [i.id, true])) : {});
  }

  /** Mueve los productos marcados a la cuenta nueva `destino` (la siguiente libre crea una cuenta nueva). */
  function moverMarcados(destino: number) {
    const ids = activos.filter((i) => marcados[i.id]);
    if (ids.length === 0) return;
    setError(null);
    setElegido((actual) =>
      compactar({ ...actual, ...Object.fromEntries(ids.map((i) => [i.id, { destino, cantidad: i.cantidad }])) })
    );
    setMarcados({});
  }

  /** Devuelve los productos marcados a la cuenta original. */
  function devolverMarcados() {
    const ids = new Set(activos.filter((i) => marcados[i.id]).map((i) => i.id));
    if (ids.size === 0) return;
    setError(null);
    setElegido((actual) => compactar(Object.fromEntries(Object.entries(actual).filter(([id]) => !ids.has(id)))));
    setMarcados({});
  }

  function elegirCantidad(itemId: string, cantidad: number) {
    setElegido((actual) => (actual[itemId] ? { ...actual, [itemId]: { ...actual[itemId], cantidad } } : actual));
  }

  async function dividir() {
    if (!plan || !plan.ok || !nombres || haciendo) return;
    setHaciendo(true);
    setError(null);
    try {
      const r = await dividirCuenta(
        cuenta.id,
        modo === "iguales"
          ? { modo, partes, totalMostrado: cuenta.totales.total }
          : { modo, destinos: cuentasNuevasPorProducto, asignaciones, totalMostrado: cuenta.totales.total }
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
  const puedeDividir = !!plan && plan.ok && !!nombres && !sinProductos;

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
              { value: "producto", label: "Por producto", sublabel: "Cada uno paga lo suyo" },
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
            <div className="flex flex-col gap-2 rounded-xl border-2 border-azul/50 bg-superficie p-3">
              <p className="text-[0.76rem] leading-snug text-tinta-suave">
                Marcá los productos que paga otra persona y tocá <strong className="font-semibold text-tinta">Mover</strong>: se crea su
                cuenta ({nombres ? `Mesa ${nombres[0]}` : "…"}). Para una tercera persona, marcá los suyos y movelos a la siguiente. Lo
                que no muevas se queda en la Mesa {cuenta.mesa}.
              </p>

              {/* La barra de acciones queda a la vista aunque la lista sea larga. */}
              <div className="sticky top-0 z-10 -mx-1 flex flex-col gap-2 rounded-lg border border-linea bg-papel-suave px-2.5 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex cursor-pointer items-center gap-2 text-[0.82rem] font-medium text-tinta">
                    <input
                      type="checkbox"
                      checked={cantidadMarcados === activos.length && activos.length > 0}
                      onChange={(e) => marcarTodos(e.target.checked)}
                      className="h-5 w-5 accent-azul"
                    />
                    Marcar todos
                  </label>
                  <span className="text-[0.78rem] font-semibold text-tinta-media">
                    {cantidadMarcados === 0
                      ? "Ninguno marcado"
                      : cantidadMarcados === 1
                        ? "1 marcado"
                        : `${cantidadMarcados} marcados`}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {Array.from({ length: Math.min(cuentasNuevasPorProducto + 1, PARTES_MAXIMAS - 1) }, (_, k) => k + 1).map((d) => {
                    const esNueva = d === cuentasNuevasPorProducto + 1;
                    return (
                      <button
                        key={d}
                        type="button"
                        disabled={cantidadMarcados === 0 || !nombres}
                        onClick={() => moverMarcados(d)}
                        // Verde si crea una cuenta nueva; azul si es para una que ya tiene productos.
                        className={clasesBoton(esNueva ? "nuevo" : "navegar", "sm")}
                      >
                        Mover a Mesa {nombres?.[d - 1] ?? "…"}
                        {esNueva && cuentasNuevasPorProducto > 0 ? " (nueva)" : ""}
                      </button>
                    );
                  })}
                  {cuentasNuevasPorProducto > 0 && (
                    <button
                      type="button"
                      disabled={cantidadMarcados === 0}
                      onClick={devolverMarcados}
                      className={clasesBoton("suave", "sm")}
                    >
                      Devolver a Mesa {cuenta.mesa}
                    </button>
                  )}
                </div>
              </div>

              <ul className="flex flex-col divide-y divide-linea-fina">
                {activos.map((i) => {
                  const e = elegido[i.id];
                  const destino = e ? e.destino : 0;
                  const puedeParcial = destino >= 1 && Number.isInteger(i.cantidad) && i.cantidad > 1;
                  return (
                    <li key={i.id} className={`flex flex-col gap-1 py-2 ${marcados[i.id] ? "bg-azul-luz/40" : ""}`}>
                      <label className="flex cursor-pointer items-start gap-2.5 px-1">
                        <input
                          type="checkbox"
                          checked={!!marcados[i.id]}
                          onChange={(ev) => marcar(i.id, ev.target.checked)}
                          className="mt-0.5 h-5 w-5 flex-none accent-azul"
                          aria-label={`Marcar ${i.nombre}`}
                        />
                        <span className="min-w-0 flex-1 text-[0.86rem] leading-snug text-tinta">
                          <span className="font-semibold">{formatearCantidad(i.cantidad)} ×</span> {i.nombre}
                          {i.opciones && <span className="block text-[0.74rem] text-tinta-suave">+ {i.opciones}</span>}
                        </span>
                        <span className="flex flex-none flex-col items-end gap-1">
                          <span className="cifra text-[0.86rem] font-semibold text-tinta">
                            {formatearGuarani(i.precioUnitario * i.cantidad)}
                          </span>
                          {destino >= 1 ? (
                            <Pastilla color={COLORES_DE_CUENTA[(destino - 1) % COLORES_DE_CUENTA.length]}>
                              → Mesa {nombres?.[destino - 1] ?? "…"}
                            </Pastilla>
                          ) : (
                            <Pastilla>Mesa {cuenta.mesa}</Pastilla>
                          )}
                        </span>
                      </label>
                      {puedeParcial && e && (
                        <div className="flex items-center gap-1.5 pl-8">
                          <span className="text-[0.76rem] text-tinta-suave">Pasan</span>
                          <Selector
                            value={String(e.cantidad)}
                            onChange={(ev) => elegirCantidad(i.id, Number(ev.target.value))}
                            aria-label={`Cuántas unidades de ${i.nombre} pasan`}
                            className="!w-auto"
                          >
                            {Array.from({ length: i.cantidad }, (_, k) => (
                              <option key={k + 1} value={k + 1}>
                                {k + 1}
                                {k + 1 === i.cantidad ? " (todas)" : ""}
                              </option>
                            ))}
                          </Selector>
                          <span className="text-[0.76rem] text-tinta-suave">de {formatearCantidad(i.cantidad)}</span>
                        </div>
                      )}
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
              {plan === null ? (
                <p className="rounded-lg bg-papel-suave px-3 py-2 text-[0.82rem] text-tinta-media">
                  Todavía no moviste ningún producto: marcalos arriba y tocá “Mover a Mesa {nombres?.[0] ?? "…"}”.
                </p>
              ) : plan.ok ? (
                <>
                  {plan.partes.map((p) => (
                    <div key={p.indice} className="rounded-xl border-2 border-azul/50 bg-superficie p-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[0.9rem] font-semibold text-tinta">
                          {nombreDeParte(p.indice)}
                          {p.indice === 0 && <span className="font-normal text-tinta-suave"> · la original</span>}
                          {modo === "producto" && (
                            <span className="font-normal text-tinta-suave">
                              {" "}
                              · {p.lineas.length} {p.lineas.length === 1 ? "producto" : "productos"}
                            </span>
                          )}
                        </p>
                        <p className="cifra text-[1.05rem] font-bold text-tinta">{formatearGuarani(p.total)}</p>
                      </div>
                      {/* En partes iguales se ve el detalle (las fracciones); por producto la lista de arriba ya lo muestra. */}
                      {modo === "iguales" && (
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
                      )}
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
                Las cuentas quedan abiertas: imprimí cada una antes de cobrarla.
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
              disabled={haciendo || !puedeDividir}
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
