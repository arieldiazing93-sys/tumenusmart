"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pastilla, clasesBoton } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";
import {
  asignarIngredienteAElaborado,
  buscarIngredientesParaElaborado,
  quitarIngredienteDeElaborado,
  type IngredienteParaElaborado,
} from "./actions";

export type IngredienteDatos = {
  ingredienteId: string;
  nombre: string;
  /** Ya con la etiqueta ("Kilogramo"), lista para mostrar. */
  unidadMedida: string;
  /** Cuánto lleva UNA tanda. */
  cantidad: number;
  esElaborado: boolean;
};

/**
 * Con qué se hace una preparación (salsa, masa…): los insumos que lleva y
 * cuánto de cada uno para UNA tanda. Se busca entre los insumos ya cargados
 * (una preparación puede llevar otra preparación) y todo se agrega y corrige
 * acá mismo, sin salir del panel. Con esto y lo que rinde la tanda, el sistema
 * sabe cuánto de cada ingrediente gasta cada porción que se vende.
 */
export function RecetaElaborado({
  elaboradoId,
  nombre,
  unidadMedida,
  rindeTanda,
  ingredientes,
  costoPorUnidad,
}: {
  elaboradoId: string;
  nombre: string;
  /** Unidad de la preparación, en minúscula para la frase ("kilogramo"). */
  unidadMedida: string;
  rindeTanda: number | null;
  ingredientes: IngredienteDatos[];
  /** Lo que cuesta 1 unidad de la preparación, o null si todavía no se puede calcular. */
  costoPorUnidad: number | null;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [editando, setEditando] = useState<string | null>(null);
  const [cantidadEditada, setCantidadEditada] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Buscador de ingredientes.
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<IngredienteParaElaborado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [cantidades, setCantidades] = useState<Record<string, string>>({});

  async function buscar(texto: string) {
    setQuery(texto);
    setError(null);
    if (!texto.trim()) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    const r = await buscarIngredientesParaElaborado(elaboradoId, texto);
    setBuscando(false);
    setResultados(r);
  }

  function guardar(ingredienteId: string, cantidad: number, alTerminar: () => void) {
    setError(null);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      setError("La cantidad tiene que ser mayor a cero.");
      return;
    }
    iniciar(async () => {
      const r = await asignarIngredienteAElaborado(elaboradoId, ingredienteId, cantidad);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      alTerminar();
      router.refresh();
    });
  }

  function quitar(ingredienteId: string) {
    setError(null);
    iniciar(async () => {
      const r = await quitarIngredienteDeElaborado(elaboradoId, ingredienteId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  const sinRinde = rindeTanda == null || rindeTanda <= 0;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="rotulo text-[0.8rem] font-bold">Con qué se hace</p>
        <p className="text-sm text-tinta-media">
          Los insumos que lleva UNA tanda de {nombre}
          {rindeTanda != null && rindeTanda > 0 ? `, que rinde ${rindeTanda} ${unidadMedida}` : ""}. Al vender un
          producto que la usa, se descuentan solos estos insumos, en proporción.
        </p>
      </div>

      {sinRinde && (
        <p className="rounded-lg border border-aviso/25 bg-aviso-luz px-3 py-2 text-sm text-aviso">
          Falta cargar cuánto rinde una tanda (arriba, en “Rinde por tanda”). Sin eso no se puede calcular cuánto
          descuenta cada porción.
        </p>
      )}

      {ingredientes.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {ingredientes.map((r) => (
            <div
              key={r.ingredienteId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-linea bg-superficie px-3 py-2 text-sm"
            >
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {r.nombre}
                {r.esElaborado && <Pastilla color="azul">Preparación</Pastilla>}
              </p>
              {editando === r.ingredienteId ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    autoFocus
                    value={cantidadEditada}
                    onChange={(e) => setCantidadEditada(e.target.value)}
                    className="w-24 rounded border border-linea px-2 py-1 text-xs"
                  />
                  <span className="text-xs text-tinta-suave">{r.unidadMedida}</span>
                  <button
                    type="button"
                    disabled={pendiente}
                    onClick={() => guardar(r.ingredienteId, Number(cantidadEditada), () => setEditando(null))}
                    className={clasesBoton("principal", "sm")}
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditando(null);
                      setError(null);
                    }}
                    className="text-xs text-tinta-media hover:underline"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditando(r.ingredienteId);
                      setCantidadEditada(String(r.cantidad));
                      setError(null);
                    }}
                    className={clasesBoton("suave", "sm")}
                    title="Cambiar la cantidad"
                  >
                    {r.cantidad}
                  </button>
                  {/* La unidad va afuera del botón: pegada al número se leía "1Unidad". */}
                  <span className="text-xs text-tinta-suave">{r.unidadMedida}</span>
                  <button
                    type="button"
                    disabled={pendiente}
                    onClick={() => quitar(r.ingredienteId)}
                    className="rounded border border-peligro/30 bg-peligro-luz px-1.5 py-0.5 text-xs font-medium text-peligro hover:bg-peligro hover:text-white disabled:opacity-50"
                  >
                    Quitar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {ingredientes.length === 0 && (
        <p className="text-sm text-tinta-suave">Todavía no tiene ingredientes: buscá el primero abajo.</p>
      )}

      {error && <p className="text-xs font-medium text-peligro">{error}</p>}

      <div className="flex flex-col gap-2">
        <input
          value={query}
          onChange={(e) => buscar(e.target.value)}
          placeholder="Buscar un ingrediente por nombre (ej: tomate)"
          className="rounded-lg border border-linea px-3 py-2 text-sm"
        />
        {buscando && <p className="text-xs text-tinta-suave">Buscando…</p>}
        {!buscando && query.trim() && resultados.length === 0 && (
          <p className="text-xs text-tinta-suave">
            No encontré ningún insumo con ese nombre (o ya está en la receta) — creálo primero con “+ Nuevo insumo”.
          </p>
        )}
        {resultados.map((i) => (
          <div
            key={i.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-linea bg-superficie px-3 py-2 text-sm"
          >
            <div>
              <p className="font-medium">{i.nombre}</p>
              <p className="text-xs text-tinta-suave">{i.categoriaNombre}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                step="0.001"
                min="0"
                placeholder="Cant."
                value={cantidades[i.id] ?? ""}
                onChange={(e) => setCantidades((c) => ({ ...c, [i.id]: e.target.value }))}
                className="w-24 rounded border border-linea px-2 py-1 text-xs"
              />
              <span className="text-xs text-tinta-suave">{i.unidadMedida}</span>
              <button
                type="button"
                disabled={pendiente}
                onClick={() =>
                  guardar(i.id, Number(cantidades[i.id] ?? ""), () => {
                    setResultados((prev) => prev.filter((x) => x.id !== i.id));
                    setCantidades((c) => ({ ...c, [i.id]: "" }));
                  })
                }
                className={clasesBoton("principal", "sm")}
              >
                Agregar
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-linea pt-3 text-sm">
        {costoPorUnidad != null ? (
          <p className="text-tinta-media">
            Cada {unidadMedida} de {nombre} cuesta{" "}
            <span className="font-semibold text-tinta">{formatearGuarani(costoPorUnidad)}</span>, según lo que
            costaron sus ingredientes en su última compra.
          </p>
        ) : (
          <p className="text-tinta-suave">
            Todavía no se puede calcular el costo: falta cargar cuánto rinde la tanda, algún ingrediente, o a algún
            ingrediente le falta el costo (se completa al registrar una compra).
          </p>
        )}
      </div>
    </div>
  );
}
