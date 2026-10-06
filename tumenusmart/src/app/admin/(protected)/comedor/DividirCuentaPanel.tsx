"use client";

import { useState } from "react";
import { MensajeError, Pastilla, clasesBoton, type ColorEstado } from "@/components/ui";
import { PanelLateral } from "@/components/PanelLateral";
import { Segmentado } from "@/components/Segmentado";
import { formatearCantidad, formatearGuarani, formatearNumero } from "@/lib/format";
import { agruparPorClave, claveDeLinea, claveDeMesa, importeDeLinea } from "@/lib/comedor";
import {
  PARTES_MAXIMAS,
  dividirEnPartesIguales,
  dividirPorProducto,
  nombresDeCuentasNuevas,
  type AsignacionDeLinea,
  type LineaBase,
} from "@/lib/division-cuenta";
import type { CuentaCajaFila, ItemCuentaFila } from "./ComedorCaja";
import { dividirCuenta } from "./division-actions";

type Modo = "iguales" | "producto";

/** Lo que se pasó de cada producto a cada cuenta nueva: producto → (cuenta nueva → unidades). La cuenta 1 es la "1-A", la 2 la "1-B"… */
type Pasado = Record<string, Record<number, number>>;

/** El mismo producto de varios pedidos, junto en una fila para elegirlo (las filas reales de la cuenta, de la más vieja a la más nueva). */
type GrupoParaDividir = {
  clave: string;
  nombre: string;
  opciones: string | null;
  precioUnitario: number;
  cantidad: number;
  filas: ItemCuentaFila[];
  /** Todas sus unidades son enteras: solo así se pueden repartir (si no, pasa completo a una sola cuenta). */
  enteras: boolean;
};

/** Un color por cuenta nueva, para leer de un vistazo cuál es cuál. */
const COLORES_DE_CUENTA: ColorEstado[] = ["azul", "exito", "marca", "amarillo", "aviso"];

const redondear4 = (n: number) => Math.round(n * 10000) / 10000;

/** Para mostrar: las líneas de una cuenta resultante con el mismo producto junto (suma de cantidad y de importe). */
function juntarParaMostrar<L extends { nombreProducto: string; cantidad: number; precioUnitario: number; importe: number }>(
  lineas: L[]
): { clave: string; nombre: string; cantidad: number; importe: number }[] {
  return agruparPorClave(lineas, (l) => `${l.nombreProducto}\u0001${l.precioUnitario}`).map((grupo) => ({
    clave: `${grupo[0].nombreProducto}\u0001${grupo[0].precioUnitario}`,
    nombre: grupo[0].nombreProducto,
    cantidad: redondear4(grupo.reduce((s, l) => s + l.cantidad, 0)),
    importe: grupo.reduce((s, l) => s + l.importe, 0),
  }));
}

/** Un contador con menos y más. */
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
 * Así nunca queda una cuenta nueva sin productos en el medio. Saca también lo que quedó en cero.
 */
function compactar(actual: Pasado): Pasado {
  const usados = [
    ...new Set(
      Object.values(actual).flatMap((porCuenta) =>
        Object.entries(porCuenta)
          .filter(([, c]) => c > 1e-9)
          .map(([d]) => Number(d))
      )
    ),
  ].sort((a, b) => a - b);
  const nuevoNumero = new Map(usados.map((d, i) => [d, i + 1]));
  const resultado: Pasado = {};
  for (const [clave, porCuenta] of Object.entries(actual)) {
    const fila: Record<number, number> = {};
    for (const [d, c] of Object.entries(porCuenta)) {
      if (c > 1e-9) fila[nuevoNumero.get(Number(d)) ?? Number(d)] = redondear4(c);
    }
    if (Object.keys(fila).length > 0) resultado[clave] = fila;
  }
  return resultado;
}

/**
 * Dividir la cuenta de una mesa porque cada uno quiere su factura: en partes iguales (cada parte lleva, por ejemplo, media
 * pizza: 0,5) o por producto. La original conserva su nombre ("Mesa 1") y las nuevas se llaman "1-A", "1-B"…
 *
 * Por producto, la pantalla tiene dos lados: a la IZQUIERDA lo que se queda en la cuenta original y a la DERECHA cada cuenta
 * nueva con sus productos y su total. Se marca un producto, se elige CUÁNTAS unidades pasan (si tiene varias) y se toca "Pasar a
 * Mesa 1-A": en el acto se ve en las dos cuentas. De la derecha se puede devolver una unidad (−), sumar otra (+) o devolver
 * todo. Un mismo producto se puede repartir entre varias cuentas (3 parrilladas para 3 personas: 1 se queda, 1 va a la A y 1 a
 * la B).
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
  // Por producto: lo que ya se pasó a cada cuenta nueva, los productos marcados y, si hay uno solo marcado, cuántas unidades pasan.
  const [pasado, setPasado] = useState<Pasado>({});
  const [marcados, setMarcados] = useState<Record<string, boolean>>({});
  const [cuantas, setCuantas] = useState<number | null>(null);
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

  // El mismo producto cargado en varios pedidos va junto en UNA fila (10 parrilladas, no 10 filas de 1), igual que en el detalle
  // de la cuenta. Lo que se elige es por fila; al dividir se reparte entre los pedidos de los que sale.
  const grupos: GrupoParaDividir[] = agruparPorClave(activos, (i) =>
    claveDeLinea({ nombre: i.nombre, opciones: i.opciones, precioUnitario: i.precioUnitario }, false)
  ).map((filas) => ({
    clave: claveDeLinea({ nombre: filas[0].nombre, opciones: filas[0].opciones, precioUnitario: filas[0].precioUnitario }, false),
    nombre: filas[0].nombre,
    opciones: filas[0].opciones,
    precioUnitario: filas[0].precioUnitario,
    cantidad: redondear4(filas.reduce((s, f) => s + f.cantidad, 0)),
    filas,
    enteras: filas.every((f) => Number.isInteger(f.cantidad)),
  }));

  // Lo que pasó cada producto en total y lo que le queda a la cuenta original.
  const pasadoDe = (g: GrupoParaDividir, destino: number) => pasado[g.clave]?.[destino] ?? 0;
  const restoDe = (g: GrupoParaDividir) =>
    redondear4(g.cantidad - Object.values(pasado[g.clave] ?? {}).reduce((s, c) => s + c, 0));

  // Cuántas cuentas nuevas hay ahora (las usadas son 1..k, sin saltos).
  const clavesActivas = new Set(grupos.map((g) => g.clave));
  const cuentasNuevasPorProducto = Object.entries(pasado)
    .filter(([clave]) => clavesActivas.has(clave))
    .reduce((m, [, porCuenta]) => Math.max(m, ...Object.keys(porCuenta).map(Number)), 0);

  // De lo elegido por fila agrupada a las filas reales de la cuenta (el servidor y la función de dividir trabajan con las reales):
  // de cada cuenta de destino se toma de las últimas filas que se cargaron, sin pasarse de lo que tiene cada una.
  const asignaciones: AsignacionDeLinea[] = grupos.flatMap((g) => {
    const porCuenta = pasado[g.clave];
    if (!porCuenta) return [];
    const disponible = new Map(g.filas.map((f) => [f.id, f.cantidad]));
    const salida: AsignacionDeLinea[] = [];
    for (const [d, cantidad] of Object.entries(porCuenta)
      .map(([d, c]) => [Number(d), c] as const)
      .sort((a, b) => a[0] - b[0])) {
      let faltan = cantidad;
      for (let i = g.filas.length - 1; i >= 0 && faltan > 1e-9; i--) {
        const fila = g.filas[i];
        const toma = Math.min(faltan, disponible.get(fila.id) ?? 0);
        if (toma > 1e-9) {
          salida.push({ itemId: fila.id, destino: d, cantidad: toma });
          disponible.set(fila.id, (disponible.get(fila.id) ?? 0) - toma);
          faltan -= toma;
        }
      }
    }
    return salida;
  });

  // Lo marcado ahora, y cuántas unidades pasarían.
  const marcadosAhora = grupos.filter((g) => marcados[g.clave] && restoDe(g) > 1e-9);
  const unico = marcadosAhora.length === 1 ? marcadosAhora[0] : null;
  const puedeElegirCantidad = !!unico && unico.enteras && Number.isInteger(restoDe(unico)) && restoDe(unico) > 1;
  const aPasar = unico && puedeElegirCantidad ? Math.min(Math.max(1, cuantas ?? restoDe(unico)), restoDe(unico)) : null;
  const cantidadDe = (g: GrupoParaDividir) => (unico && g.clave === unico.clave && aPasar !== null ? aPasar : restoDe(g));
  const resumenMarcados = marcadosAhora.map((g) => `${formatearCantidad(cantidadDe(g))} × ${g.nombre}`).join(" · ");

  const base = cuenta.mesaBase ?? cuenta.mesa;
  const ocupadas = new Set(mesasOcupadas.map(claveDeMesa));
  // Los nombres que hacen falta: en partes iguales, uno por parte menos la original; por producto, los usados más el que
  // se crearía con el próximo "Pasar a…".
  const cuantosNombres = modo === "iguales" ? partes - 1 : Math.min(cuentasNuevasPorProducto + 1, PARTES_MAXIMAS - 1);
  const nombres = nombresDeCuentasNuevas(base, cuantosNombres, (clave) => ocupadas.has(clave));
  const nombreDeParte = (indice: number) => (indice === 0 ? `Mesa ${cuenta.mesa}` : `Mesa ${nombres?.[indice - 1] ?? "…"}`);

  const plan =
    modo === "iguales"
      ? dividirEnPartesIguales(lineas, pedido, partes)
      : cuentasNuevasPorProducto >= 1
        ? dividirPorProducto(lineas, pedido, cuentasNuevasPorProducto, asignaciones)
        : null;

  /** Lo que vale (sin descuento) lo que hay en una cuenta: 0 = la original, 1.. = las nuevas. */
  function subtotalDe(destino: number): number {
    return grupos.reduce(
      (s, g) =>
        s + importeDeLinea({ precioUnitario: g.precioUnitario, cantidad: destino === 0 ? restoDe(g) : pasadoDe(g, destino) }),
      0
    );
  }
  /** El total de una cuenta: con el descuento repartido si ya se puede calcular, y si no, lo que suman sus productos. */
  const totalDe = (destino: number) => (plan && plan.ok ? plan.partes[destino].total : subtotalDe(destino));

  // ------------------------------------------------------------------------------------------- marcar y pasar
  function marcar(clave: string, valor: boolean) {
    setMarcados((actual) => ({ ...actual, [clave]: valor }));
    setCuantas(null);
  }

  function marcarTodos(valor: boolean) {
    setMarcados(valor ? Object.fromEntries(grupos.filter((g) => restoDe(g) > 1e-9).map((g) => [g.clave, true])) : {});
    setCuantas(null);
  }

  /** Pasa a la cuenta nueva `destino` lo marcado (la siguiente libre crea una cuenta nueva): las unidades elegidas, o todo lo que queda. */
  function pasarA(destino: number) {
    if (marcadosAhora.length === 0) return;
    setError(null);
    const cantidades = marcadosAhora.map((g) => ({ clave: g.clave, cantidad: cantidadDe(g) }));
    setPasado((actual) => {
      const siguiente: Pasado = { ...actual };
      for (const { clave, cantidad } of cantidades) {
        siguiente[clave] = { ...(siguiente[clave] ?? {}), [destino]: redondear4((siguiente[clave]?.[destino] ?? 0) + cantidad) };
      }
      return compactar(siguiente);
    });
    setMarcados({});
    setCuantas(null);
  }

  /** Cambia en una unidad lo que lleva una cuenta nueva de un producto: −1 la devuelve a la original, +1 suma otra de las que quedan. */
  function ajustar(g: GrupoParaDividir, destino: number, delta: 1 | -1) {
    setError(null);
    setPasado((actual) => {
      const porCuenta = { ...(actual[g.clave] ?? {}) };
      const enEstaCuenta = porCuenta[destino] ?? 0;
      const resto = redondear4(g.cantidad - Object.values(porCuenta).reduce((s, c) => s + c, 0));
      if (delta === -1) {
        // Un producto con fracciones (de una división anterior) se devuelve completo: no se reparte.
        porCuenta[destino] = g.enteras ? Math.max(0, enEstaCuenta - 1) : 0;
      } else if (g.enteras && resto >= 1) {
        porCuenta[destino] = enEstaCuenta + 1;
      }
      return compactar({ ...actual, [g.clave]: porCuenta });
    });
  }

  /** Devuelve a la cuenta original todo lo que tenía una cuenta nueva de un producto. */
  function devolverTodo(g: GrupoParaDividir, destino: number) {
    setError(null);
    setPasado((actual) => {
      const porCuenta = { ...(actual[g.clave] ?? {}) };
      porCuenta[destino] = 0;
      return compactar({ ...actual, [g.clave]: porCuenta });
    });
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
  const quedanEnOriginal = grupos.filter((g) => restoDe(g) > 1e-9);

  return (
    <PanelLateral
      titulo={`Dividir la mesa ${cuenta.mesa}`}
      onCerrar={() => !haciendo && onCerrar()}
      ancho={modo === "producto" ? "amplio" : "ancho"}
    >
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
            <div className="flex flex-col gap-3">
              <p className="text-[0.76rem] leading-snug text-tinta-suave">
                <strong className="font-semibold text-tinta">1.</strong> Marcá el producto de la izquierda.{" "}
                <strong className="font-semibold text-tinta">2.</strong> Si tiene varias unidades, elegí cuántas pasan.{" "}
                <strong className="font-semibold text-tinta">3.</strong> Tocá “Pasar a Mesa {nombres ? nombres[0] : "…"}”: la cuenta nueva
                aparece a la derecha. Lo que no pases se queda en la Mesa {cuenta.mesa}.
              </p>

              {/* La barra de acciones queda a la vista aunque la lista sea larga: qué se va a pasar, cuántas unidades y a dónde. */}
              <div className="sticky top-0 z-10 flex flex-col gap-2 rounded-xl border-2 border-azul/50 bg-papel-suave px-3 py-2.5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex cursor-pointer items-center gap-2 text-[0.82rem] font-medium text-tinta">
                    <input
                      type="checkbox"
                      checked={quedanEnOriginal.length > 0 && marcadosAhora.length === quedanEnOriginal.length}
                      onChange={(e) => marcarTodos(e.target.checked)}
                      disabled={quedanEnOriginal.length === 0}
                      className="h-5 w-5 accent-azul"
                    />
                    Marcar todos
                  </label>
                  <span className="text-[0.78rem] font-semibold text-tinta-media">
                    {marcadosAhora.length === 0
                      ? "Ninguno marcado"
                      : marcadosAhora.length === 1
                        ? "1 marcado"
                        : `${marcadosAhora.length} marcados`}
                  </span>
                </div>

                {puedeElegirCantidad && unico && aPasar !== null && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-superficie px-2.5 py-2">
                    <p className="min-w-0 text-[0.82rem] text-tinta">
                      <strong className="font-semibold">{unico.nombre}</strong> tiene {formatearCantidad(restoDe(unico))}. ¿Cuántas pasan?
                    </p>
                    <div className="flex items-center gap-2">
                      <Contador
                        valor={aPasar}
                        minimo={1}
                        maximo={restoDe(unico)}
                        onCambiar={(n) => setCuantas(n)}
                        etiqueta="unidades que pasan"
                      />
                      <button
                        type="button"
                        disabled={aPasar === restoDe(unico)}
                        onClick={() => setCuantas(null)}
                        className={clasesBoton("suave", "sm")}
                      >
                        Todas
                      </button>
                    </div>
                  </div>
                )}
                {marcadosAhora.length > 1 && (
                  <p className="text-[0.76rem] text-tinta-suave">Con varios marcados pasa todo lo que queda de cada uno.</p>
                )}
                {marcadosAhora.length > 0 && (
                  <p className="text-[0.8rem] font-medium text-tinta">
                    Se pasa: <span className="font-semibold">{resumenMarcados}</span>
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-1.5">
                  {Array.from({ length: Math.min(cuentasNuevasPorProducto + 1, PARTES_MAXIMAS - 1) }, (_, k) => k + 1).map((d) => {
                    const esNueva = d === cuentasNuevasPorProducto + 1;
                    return (
                      <button
                        key={d}
                        type="button"
                        disabled={marcadosAhora.length === 0 || !nombres}
                        onClick={() => pasarA(d)}
                        // Verde si crea una cuenta nueva; azul si es para una que ya tiene productos.
                        className={clasesBoton(esNueva ? "nuevo" : "navegar", "sm")}
                      >
                        Pasar a Mesa {nombres?.[d - 1] ?? "…"} →{esNueva && cuentasNuevasPorProducto > 0 ? " (nueva)" : ""}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {/* ----------------------------------------------------------- IZQUIERDA: lo que se queda */}
                <div className="flex flex-col gap-1.5 rounded-xl border-2 border-azul/50 bg-superficie p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[0.9rem] font-semibold text-tinta">
                      Mesa {cuenta.mesa} <span className="font-normal text-tinta-suave">· se queda</span>
                    </p>
                  </div>
                  {quedanEnOriginal.length === 0 ? (
                    <p className="rounded-lg bg-aviso-luz px-2.5 py-2 text-[0.8rem] font-medium text-aviso">
                      No queda nada en esta cuenta: dejá al menos un producto.
                    </p>
                  ) : (
                    <ul className="flex flex-col divide-y divide-linea-fina">
                      {quedanEnOriginal.map((g) => {
                        const resto = restoDe(g);
                        const marcado = !!marcados[g.clave];
                        return (
                          <li key={g.clave} className={marcado ? "bg-azul-luz/50" : ""}>
                            <label className="flex cursor-pointer items-start gap-2.5 px-1 py-2">
                              <input
                                type="checkbox"
                                checked={marcado}
                                onChange={(ev) => marcar(g.clave, ev.target.checked)}
                                className="mt-0.5 h-5 w-5 flex-none accent-azul"
                                aria-label={`Marcar ${g.nombre}`}
                              />
                              <span className="min-w-0 flex-1 text-[0.86rem] leading-snug text-tinta">
                                <span className="font-semibold">{formatearCantidad(resto)} ×</span> {g.nombre}
                                {resto !== g.cantidad && (
                                  <span className="text-[0.74rem] text-tinta-suave"> (de {formatearCantidad(g.cantidad)})</span>
                                )}
                                {g.opciones && <span className="block text-[0.74rem] text-tinta-suave">+ {g.opciones}</span>}
                              </span>
                              <span className="cifra flex-none text-[0.86rem] font-semibold text-tinta">
                                {formatearGuarani(importeDeLinea({ precioUnitario: g.precioUnitario, cantidad: resto }))}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <div className="mt-1 flex items-baseline justify-between gap-2 border-t border-linea pt-1.5">
                    <span className="text-[0.74rem] font-semibold uppercase tracking-rotulo text-tinta-suave">Total</span>
                    <span className="cifra text-[1.05rem] font-bold text-tinta">{formatearGuarani(totalDe(0))}</span>
                  </div>
                  {plan && plan.ok && plan.partes[0].montoDescuento > 0 && (
                    <p className="text-[0.74rem] text-tinta-suave">
                      {formatearGuarani(plan.partes[0].subtotal)} − descuento {formatearGuarani(plan.partes[0].montoDescuento)}
                    </p>
                  )}
                </div>

                {/* ------------------------------------------------------------ DERECHA: las cuentas nuevas */}
                <div className="flex flex-col gap-3">
                  {cuentasNuevasPorProducto === 0 && (
                    <p className="rounded-xl border-2 border-dashed border-linea px-3 py-4 text-center text-[0.82rem] text-tinta-suave">
                      Todavía no pasaste nada. Marcá un producto a la izquierda y tocá “Pasar a Mesa {nombres?.[0] ?? "…"}”: su cuenta
                      aparece acá.
                    </p>
                  )}
                  {Array.from({ length: cuentasNuevasPorProducto }, (_, k) => k + 1).map((d) => (
                    <div key={d} className="flex flex-col gap-1.5 rounded-xl border-2 border-azul/50 bg-superficie p-3">
                      <div className="flex items-center justify-between gap-2">
                        <Pastilla color={COLORES_DE_CUENTA[(d - 1) % COLORES_DE_CUENTA.length]}>{nombreDeParte(d)}</Pastilla>
                        <span className="text-[0.7rem] font-semibold uppercase tracking-rotulo text-tinta-suave">cuenta nueva</span>
                      </div>
                      <ul className="flex flex-col divide-y divide-linea-fina">
                        {grupos
                          .filter((g) => pasadoDe(g, d) > 1e-9)
                          .map((g) => {
                            const aqui = pasadoDe(g, d);
                            return (
                              <li key={g.clave} className="flex items-start gap-2 py-2">
                                <div className="flex flex-none items-center gap-1">
                                  <button
                                    type="button"
                                    aria-label={`Devolver una unidad de ${g.nombre} a la Mesa ${cuenta.mesa}`}
                                    onClick={() => ajustar(g, d, -1)}
                                    className={`${clasesBoton("suave", "sm")} w-8 justify-center`}
                                  >
                                    −
                                  </button>
                                  <span className="cifra w-7 text-center text-[0.9rem] font-semibold text-tinta">{formatearCantidad(aqui)}</span>
                                  <button
                                    type="button"
                                    aria-label={`Pasar una unidad más de ${g.nombre} a esta cuenta`}
                                    disabled={!g.enteras || restoDe(g) < 1}
                                    onClick={() => ajustar(g, d, 1)}
                                    className={`${clasesBoton("suave", "sm")} w-8 justify-center`}
                                  >
                                    +
                                  </button>
                                </div>
                                <span className="min-w-0 flex-1 text-[0.86rem] leading-snug text-tinta">
                                  {g.nombre}
                                  {g.opciones && <span className="block text-[0.74rem] text-tinta-suave">+ {g.opciones}</span>}
                                </span>
                                <span className="cifra flex-none text-[0.86rem] font-semibold text-tinta">
                                  {formatearGuarani(importeDeLinea({ precioUnitario: g.precioUnitario, cantidad: aqui }))}
                                </span>
                                <button
                                  type="button"
                                  aria-label={`Devolver todo ${g.nombre} a la Mesa ${cuenta.mesa}`}
                                  title="Devolver todo a la cuenta original"
                                  onClick={() => devolverTodo(g, d)}
                                  className={`${clasesBoton("suave", "sm")} flex-none`}
                                >
                                  ↩
                                </button>
                              </li>
                            );
                          })}
                      </ul>
                      <div className="mt-1 flex items-baseline justify-between gap-2 border-t border-linea pt-1.5">
                        <span className="text-[0.74rem] font-semibold uppercase tracking-rotulo text-tinta-suave">Total</span>
                        <span className="cifra text-[1.05rem] font-bold text-tinta">{formatearGuarani(totalDe(d))}</span>
                      </div>
                      {plan && plan.ok && plan.partes[d].montoDescuento > 0 && (
                        <p className="text-[0.74rem] text-tinta-suave">
                          {formatearGuarani(plan.partes[d].subtotal)} − descuento {formatearGuarani(plan.partes[d].montoDescuento)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------------- cómo queda cada cuenta */}
          {!sinProductos && (
            <div className="flex flex-col gap-2">
              {modo === "iguales" && <p className="text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">Así queda</p>}
              {plan === null ? null : plan.ok ? (
                <>
                  {modo === "iguales" &&
                    plan.partes.map((p) => (
                      <div key={p.indice} className="rounded-xl border-2 border-azul/50 bg-superficie p-3">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-[0.9rem] font-semibold text-tinta">
                            {nombreDeParte(p.indice)}
                            {p.indice === 0 && <span className="font-normal text-tinta-suave"> · la original</span>}
                          </p>
                          <p className="cifra text-[1.05rem] font-bold text-tinta">{formatearGuarani(p.total)}</p>
                        </div>
                        <ul className="mt-1.5 flex flex-col gap-0.5 text-[0.8rem] text-tinta-media">
                          {juntarParaMostrar(p.lineas).map((l) => (
                            <li key={l.clave} className="flex justify-between gap-2">
                              <span className="min-w-0">
                                <strong className="font-semibold text-tinta">{formatearCantidad(l.cantidad)} ×</strong> {l.nombre}
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
