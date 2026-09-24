"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Entrada, Selector, Tarjeta, clasesBoton } from "@/components/ui";
import { motivosDe, type TipoMovimientoAlmacen } from "@/lib/movimiento-almacen";
import { buscarInsumosParaCompra, type InsumoParaCompra } from "../compras/actions";
import { consultarStockEnAlmacen, registrarMovimientoAlmacen } from "./actions";

type Almacen = { id: string; nombre: string };

/** Campos bajos: el formulario ocupa poco lugar en pantalla (el padding base de los campos se pisa con !). */
const CAMPO_BAJO = "!py-1.5 !text-[0.85rem]";

/** Una etiqueta chica arriba de un campo. */
function Etiqueta({ texto, children, className = "" }: { texto: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-0.5 block text-[0.74rem] font-semibold text-tinta-media">{texto}</span>
      {children}
    </label>
  );
}

/**
 * El formulario "Nuevo movimiento" de almacén: entrada o salida, en qué
 * almacén, de qué insumo, cuánto y por qué. La salida es para lo que se
 * pierde sin venderse (se venció, se rompió, lo consumió el personal); la
 * entrada, para lo que llega sin una compra.
 *
 * Compacto a propósito: en pantalla ancha entra en tres renglones (tipo; almacén,
 * insumo, cantidad y motivo; detalle y botón).
 */
export function NuevoMovimientoAlmacenForm({ almacenes }: { almacenes: Almacen[] }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [tipo, setTipo] = useState<TipoMovimientoAlmacen>("salida");
  const [almacenId, setAlmacenId] = useState(almacenes[0]?.id ?? "");
  const [insumo, setInsumo] = useState<InsumoParaCompra | null>(null);
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [registrado, setRegistrado] = useState(false);
  const [stock, setStock] = useState<{ stock: number; unidad: string } | null>(null);

  // Cuánto hay del insumo elegido en el almacén elegido: ayuda a saber de cuánto se puede sacar.
  useEffect(() => {
    let vigente = true;
    setStock(null);
    if (!insumo || !almacenId) return;
    consultarStockEnAlmacen(insumo.id, almacenId).then((r) => {
      if (vigente) setStock(r);
    });
    return () => {
      vigente = false;
    };
  }, [insumo, almacenId]);

  function cambiarTipo(nuevo: TipoMovimientoAlmacen) {
    setTipo(nuevo);
    // Los motivos de una entrada y de una salida son distintos.
    setMotivo("");
  }

  function registrar() {
    setError(null);
    setRegistrado(false);
    if (!almacenId) return setError("Elegí el almacén.");
    if (!insumo) return setError("Elegí el insumo.");
    const valor = Number(cantidad);
    if (!Number.isFinite(valor) || valor <= 0) return setError("Escribí la cantidad.");
    if (!motivo) return setError("Elegí el motivo.");
    iniciar(async () => {
      const r = await registrarMovimientoAlmacen({ tipo, almacenId, insumoId: insumo.id, cantidad: valor, motivo, detalle });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setInsumo(null);
      setCantidad("");
      setMotivo("");
      setDetalle("");
      setRegistrado(true);
      router.refresh();
    });
  }

  return (
    <Tarjeta padding={false} className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <p className="rotulo text-[0.78rem] font-bold">Nuevo movimiento</p>
        <div className="inline-flex overflow-hidden rounded-lg border border-linea">
          {(
            [
              { valor: "salida", etiqueta: "− Salida", ayuda: "Se pierde o se saca sin vender" },
              { valor: "entrada", etiqueta: "+ Entrada", ayuda: "Llega sin una compra" },
            ] as const
          ).map((o) => (
            <button
              key={o.valor}
              type="button"
              title={o.ayuda}
              aria-pressed={tipo === o.valor}
              onClick={() => cambiarTipo(o.valor)}
              className={`px-3.5 py-1 text-[0.82rem] font-medium transition-colors ${
                tipo === o.valor ? "bg-tinta text-papel" : "text-tinta-media hover:bg-papel-suave"
              }`}
            >
              {o.etiqueta}
            </button>
          ))}
        </div>
        <span className="text-xs text-tinta-suave">
          {tipo === "salida" ? "Se pierde o se saca sin vender." : "Llega sin una compra."}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1.5fr_7rem_1.2fr]">
        <Etiqueta texto="Almacén">
          <Selector className={CAMPO_BAJO} value={almacenId} onChange={(e) => setAlmacenId(e.target.value)}>
            {almacenes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </Selector>
        </Etiqueta>

        <div>
          <span className="mb-0.5 block text-[0.74rem] font-semibold text-tinta-media">Insumo</span>
          {insumo ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-linea bg-papel-suave px-2.5 py-1">
              <div className="min-w-0">
                <p className="truncate text-[0.84rem] font-medium leading-tight text-tinta">{insumo.nombre}</p>
                <p className="truncate text-[0.7rem] leading-tight text-tinta-suave">
                  {insumo.unidadMedida}
                  {stock && ` · hay ${stock.stock} ${stock.unidad}`}
                </p>
              </div>
              <button type="button" onClick={() => setInsumo(null)} className={clasesBoton("suave", "sm")}>
                Cambiar
              </button>
            </div>
          ) : (
            <BuscadorInsumo onElegir={setInsumo} />
          )}
        </div>

        <Etiqueta texto={`Cantidad${insumo ? ` (${insumo.unidadMedida.toLowerCase()})` : ""}`}>
          <Entrada
            className={CAMPO_BAJO}
            type="number"
            step="any"
            min="0"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            placeholder="Ej: 3"
          />
        </Etiqueta>

        <Etiqueta texto="Motivo">
          <Selector className={CAMPO_BAJO} value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            <option value="">Elegí el motivo…</option>
            {motivosDe(tipo).map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.etiqueta}
              </option>
            ))}
          </Selector>
        </Etiqueta>
      </div>

      <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_auto]">
        <Etiqueta texto={motivo === "otro" ? "Detalle del motivo" : "Detalle (opcional)"}>
          <Entrada
            className={CAMPO_BAJO}
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
            maxLength={200}
            placeholder="Ej: se cayó una caja en el depósito"
          />
        </Etiqueta>
        <div className="flex items-center gap-3">
          <button type="button" disabled={pendiente} onClick={registrar} className={clasesBoton("principal", "sm")}>
            {pendiente ? "Guardando…" : tipo === "salida" ? "Registrar salida" : "Registrar entrada"}
          </button>
          {registrado && <span className="text-xs font-medium text-exito">✓ Registrado</span>}
        </div>
      </div>

      {error && <p className="text-[0.82rem] font-medium text-peligro">{error}</p>}
    </Tarjeta>
  );
}

/** Busca un insumo por nombre y lo devuelve al elegirlo. */
function BuscadorInsumo({ onElegir }: { onElegir: (insumo: InsumoParaCompra) => void }) {
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<InsumoParaCompra[]>([]);
  const [buscando, setBuscando] = useState(false);
  // Si se escribe rápido, la respuesta de una búsqueda vieja no pisa a la nueva.
  const ultimaBusqueda = useRef(0);

  async function buscar(texto: string) {
    setQuery(texto);
    const numero = ++ultimaBusqueda.current;
    if (!texto.trim()) {
      setResultados([]);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    const r = await buscarInsumosParaCompra(texto);
    if (numero !== ultimaBusqueda.current) return;
    setBuscando(false);
    setResultados(r);
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        value={query}
        onChange={(e) => buscar(e.target.value)}
        placeholder="Buscá un insumo por nombre"
        className="w-full rounded-lg border border-linea bg-superficie px-3 py-1.5 text-[0.85rem] focus:border-brand focus:outline-none"
      />
      {buscando && <p className="text-xs text-tinta-suave">Buscando…</p>}
      {!buscando && query.trim() && resultados.length === 0 && (
        <p className="text-xs text-tinta-suave">No encontré ningún insumo con ese nombre.</p>
      )}
      {resultados.length > 0 && (
        <div className="flex flex-col gap-1">
          {resultados.map((i) => (
            <div
              key={i.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-linea bg-superficie px-2.5 py-1 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate text-[0.84rem] font-medium leading-tight">{i.nombre}</p>
                <p className="truncate text-[0.7rem] leading-tight text-tinta-suave">
                  {i.categoriaNombre} · {i.unidadMedida}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onElegir(i);
                  setQuery("");
                  setResultados([]);
                  ultimaBusqueda.current++;
                }}
                className={clasesBoton("principal", "sm")}
              >
                Elegir
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
