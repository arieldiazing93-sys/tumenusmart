"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Campo, Entrada, Selector, Tarjeta, clasesBoton } from "@/components/ui";
import { Segmentado } from "@/components/Segmentado";
import { motivosDe, type TipoMovimientoAlmacen } from "@/lib/movimiento-almacen";
import { buscarInsumosParaCompra, type InsumoParaCompra } from "../compras/actions";
import { consultarStockEnAlmacen, registrarMovimientoAlmacen } from "./actions";

type Almacen = { id: string; nombre: string };

/**
 * El formulario "Nuevo movimiento" de almacén: entrada o salida, en qué
 * almacén, de qué insumo, cuánto y por qué. La salida es para lo que se
 * pierde sin venderse (se venció, se rompió, lo consumió el personal); la
 * entrada, para lo que llega sin una compra.
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
    <Tarjeta className="flex flex-col gap-3">
      <p className="rotulo text-[0.8rem] font-bold">Nuevo movimiento</p>

      <Segmentado
        opciones={[
          { value: "salida", label: "− Salida", sublabel: "Se pierde o se saca sin vender" },
          { value: "entrada", label: "+ Entrada", sublabel: "Llega sin una compra" },
        ]}
        valor={tipo}
        onChange={cambiarTipo}
        color="tinta"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo etiqueta="Almacén">
          <Selector value={almacenId} onChange={(e) => setAlmacenId(e.target.value)}>
            {almacenes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </Selector>
        </Campo>

        <div>
          <span className="mb-1.5 block text-[0.82rem] font-semibold text-tinta">Insumo</span>
          {insumo ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-linea bg-papel-suave px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[0.88rem] font-medium text-tinta">{insumo.nombre}</p>
                <p className="text-xs text-tinta-suave">
                  {insumo.unidadMedida}
                  {stock && ` · en este almacén hay ${stock.stock} ${stock.unidad}`}
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

        <Campo etiqueta={`Cantidad${insumo ? ` (${insumo.unidadMedida.toLowerCase()})` : ""}`}>
          <Entrada
            type="number"
            step="any"
            min="0"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            placeholder="Ej: 3"
          />
        </Campo>

        <Campo etiqueta="Motivo">
          <Selector value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            <option value="">Elegí el motivo…</option>
            {motivosDe(tipo).map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.etiqueta}
              </option>
            ))}
          </Selector>
        </Campo>

        <Campo
          etiqueta={motivo === "otro" ? "Detalle del motivo" : "Detalle (opcional)"}
          className="sm:col-span-2"
        >
          <Entrada
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
            maxLength={200}
            placeholder="Ej: se cayó una caja en el depósito"
          />
        </Campo>
      </div>

      {error && <p className="text-sm font-medium text-peligro">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={pendiente} onClick={registrar} className={clasesBoton("principal")}>
          {pendiente ? "Guardando…" : tipo === "salida" ? "Registrar salida" : "Registrar entrada"}
        </button>
        {registrado && <span className="text-sm font-medium text-exito">✓ Movimiento registrado</span>}
      </div>
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
    <div className="flex flex-col gap-2">
      <input
        value={query}
        onChange={(e) => buscar(e.target.value)}
        placeholder="Buscá un insumo por nombre"
        className="w-full rounded-lg border border-linea bg-superficie px-3 py-2.5 text-[0.88rem] focus:border-brand focus:outline-none"
      />
      {buscando && <p className="text-xs text-tinta-suave">Buscando…</p>}
      {!buscando && query.trim() && resultados.length === 0 && (
        <p className="text-xs text-tinta-suave">No encontré ningún insumo con ese nombre.</p>
      )}
      {resultados.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {resultados.map((i) => (
            <div
              key={i.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-linea bg-superficie px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium">{i.nombre}</p>
                <p className="text-xs text-tinta-suave">
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
