"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Tarjeta, Campo, Entrada, Pastilla, clasesBoton } from "@/components/ui";
import { COLORES_CATEGORIA, colorDeCategoria, variablesDeColor } from "@/lib/colores-categoria";
import { alternarActivaCategoria, cambiarColorCategoria, eliminarCategoria, renombrarCategoria } from "./actions";
import { HorarioCategoria, type TramoDatos } from "./HorarioCategoria";

export type CategoriaDatos = {
  id: string;
  nombre: string;
  activa: boolean;
  /** La clave del color elegido (ver src/lib/colores-categoria.ts); NULL = sin color. */
  color: string | null;
  cantidadProductos: number;
  /** Si ahora mismo está dentro de uno de sus bloqueos de horario (lo calcula el servidor). */
  ocultaAhora: boolean;
  tramos: TramoDatos[];
};

/**
 * Toda una categoría en el panel de la derecha: nombre, si se muestra o no en la
 * carta, sus productos, su horario de bloqueo y borrarla. Se abre con doble clic
 * en la lista y guarda sin salir de la pantalla.
 */
export function CategoriaPanel({
  categoria,
  onCambio,
  onEliminada,
}: {
  categoria: CategoriaDatos;
  /** Algo cambió en el servidor: la pantalla vuelve a leer los datos. */
  onCambio: () => void;
  onEliminada: () => void;
}) {
  const [pendiente, iniciar] = useTransition();
  const [nombre, setNombre] = useState(categoria.nombre);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  // El color elegido se ve al instante; se guarda en cuanto se toca (como mostrar u ocultar la categoría).
  const [color, setColor] = useState<string | null>(categoria.color);
  const [colorGuardado, setColorGuardado] = useState(false);

  // Si el nombre cambió desde afuera (o se acaba de guardar), el campo lo sigue.
  useEffect(() => {
    setNombre(categoria.nombre);
  }, [categoria.nombre]);

  useEffect(() => {
    setColor(categoria.color);
  }, [categoria.color]);

  function elegirColor(nuevo: string | null) {
    if (nuevo === color) return;
    const anterior = color;
    setColor(nuevo);
    setError(null);
    setColorGuardado(false);
    iniciar(async () => {
      const r = await cambiarColorCategoria(categoria.id, nuevo);
      if (!r.ok) {
        setColor(anterior);
        setError(r.error);
        return;
      }
      setColorGuardado(true);
      onCambio();
      setTimeout(() => setColorGuardado(false), 2500);
    });
  }

  function guardarNombre(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    iniciar(async () => {
      const r = await renombrarCategoria(categoria.id, nombre);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setGuardado(true);
      onCambio();
      setTimeout(() => setGuardado(false), 2500);
    });
  }

  function alternarVisibilidad() {
    setError(null);
    iniciar(async () => {
      await alternarActivaCategoria(categoria.id, !categoria.activa);
      onCambio();
    });
  }

  function borrar() {
    if (!confirm(`¿Borrar la categoría "${categoria.nombre}"?`)) return;
    setError(null);
    iniciar(async () => {
      const r = await eliminarCategoria(categoria.id);
      // El motivo se muestra en una ventana: es largo ("movelos o borralos primero").
      if (!r.ok) {
        alert(r.error);
        return;
      }
      onEliminada();
    });
  }

  return (
    <Tarjeta className="!border-2 !border-azul/50 flex flex-col gap-4">
      <div>
        <h2 className="break-words text-[1.1rem] font-semibold tracking-titular text-tinta">{categoria.nombre}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Pastilla color={categoria.activa ? "exito" : "neutro"}>
            {categoria.activa ? "Visible en la carta" : "Oculta"}
          </Pastilla>
          <Pastilla color="neutro">
            {categoria.cantidadProductos} {categoria.cantidadProductos === 1 ? "producto" : "productos"}
          </Pastilla>
          {categoria.activa && categoria.ocultaAhora && <Pastilla color="aviso">Oculta ahora por horario</Pastilla>}
        </div>
      </div>

      <form onSubmit={guardarNombre} className="campos-grises flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1">
          <Campo etiqueta="Nombre de la categoría">
            <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </Campo>
        </div>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pendiente} className={clasesBoton("navegar")}>
            {pendiente ? "Guardando…" : "Guardar nombre"}
          </button>
          {guardado && <span className="text-xs font-medium text-exito">✓ Guardado</span>}
        </div>
      </form>
      {error && <p className="text-sm font-medium text-peligro">{error}</p>}

      <div className="border-t border-linea pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="rotulo text-[0.8rem] font-bold">Color</p>
          {colorGuardado && <span className="text-xs font-medium text-exito">✓ Guardado</span>}
        </div>
        <p className="mt-0.5 text-sm text-tinta-media">
          Elegí un color para distinguir esta categoría en el punto de venta: su pastilla y las tarjetas de sus productos se ven de ese color.
        </p>
        <div role="radiogroup" aria-label="Color de la categoría" className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            role="radio"
            aria-checked={color === null}
            onClick={() => elegirColor(null)}
            className={`flex h-9 items-center rounded-full border-2 px-3 text-[0.8rem] font-semibold transition-colors ${
              color === null ? "border-tinta bg-papel-hundido text-tinta" : "border-linea bg-superficie text-tinta-media hover:border-tinta/50"
            }`}
          >
            Sin color
          </button>
          {COLORES_CATEGORIA.map((c) => {
            const elegido = color === c.clave;
            return (
              <button
                key={c.clave}
                type="button"
                role="radio"
                aria-checked={elegido}
                aria-label={c.etiqueta}
                title={c.etiqueta}
                onClick={() => elegirColor(c.clave)}
                style={{ backgroundColor: c.hex }}
                className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-white text-[1rem] font-bold text-white shadow-sm transition-transform hover:scale-110 ${
                  elegido ? "ring-2 ring-tinta ring-offset-2" : "ring-1 ring-linea"
                }`}
              >
                {elegido ? "✓" : ""}
              </button>
            );
          })}
        </div>

        {/* Una muestra de cómo se ve en el punto de venta: la pastilla (sin elegir y elegida) y una tarjeta de producto. */}
        <div className="mt-3 flex flex-wrap items-center gap-2" style={variablesDeColor(color)} aria-label="Así se ve en el punto de venta">
          <span
            className={`inline-flex h-9 items-center rounded-full border px-3.5 text-[0.85rem] font-medium ${
              color ? "border-[var(--cat-45)] bg-[var(--cat-10)] text-tinta" : "border-linea bg-white text-tinta-media"
            }`}
          >
            {categoria.nombre} <span className="ml-1.5 text-tinta-suave">{categoria.cantidadProductos}</span>
          </span>
          <span
            className={`inline-flex h-9 items-center rounded-full border px-3.5 text-[0.85rem] font-medium text-white ${
              color ? "border-[var(--cat)] bg-[var(--cat)]" : "border-brand bg-brand"
            }`}
          >
            {categoria.nombre} <span className="ml-1.5 text-white/80">{categoria.cantidadProductos}</span>
          </span>
          <span
            className={`rounded-xl border px-3.5 py-2 text-left shadow-sm ${
              color ? "border-[var(--cat-45)] bg-[var(--cat-10)]" : "border-linea bg-brand-light/40"
            }`}
          >
            <span className="block text-[0.86rem] font-medium leading-snug text-tinta">Un producto</span>
            <span className="cifra block text-[0.9rem] font-semibold text-tinta">Gs. 25.000</span>
          </span>
          <span className="text-xs text-tinta-suave">
            {colorDeCategoria(color) ? `Color: ${colorDeCategoria(color)?.etiqueta}` : "Sin color: se ve como siempre"}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linea pt-4">
        <div className="min-w-0">
          <p className="rotulo text-[0.8rem] font-bold">Visibilidad</p>
          <p className="text-sm text-tinta-media">
            {categoria.activa
              ? "Los clientes ven esta categoría y sus productos en la carta."
              : "Está oculta: no aparece en la carta pública ni en el punto de venta."}
          </p>
        </div>
        <button type="button" disabled={pendiente} onClick={alternarVisibilidad} className={clasesBoton("suave", "sm")}>
          {categoria.activa ? "Ocultar de la carta" : "Mostrar en la carta"}
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linea pt-4">
        <div className="min-w-0">
          <p className="rotulo text-[0.8rem] font-bold">Productos</p>
          <p className="text-sm text-tinta-media">
            {categoria.cantidadProductos === 0
              ? "Todavía no tiene productos."
              : `Tiene ${categoria.cantidadProductos} ${categoria.cantidadProductos === 1 ? "producto" : "productos"}.`}
          </p>
        </div>
        <Link href={`/admin/productos?categoria=${categoria.id}`} className={clasesBoton("navegar", "sm")}>
          Ver sus productos
        </Link>
      </div>

      <div className="border-t border-linea pt-4">
        <HorarioCategoria categoryId={categoria.id} tramos={categoria.tramos} ocultaAhora={categoria.ocultaAhora} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linea pt-4">
        <p className="text-xs text-tinta-suave">
          Una categoría con productos no se puede borrar: primero se mueven o se borran sus productos.
        </p>
        <button type="button" disabled={pendiente} onClick={borrar} className={clasesBoton("peligro", "sm")}>
          Borrar categoría
        </button>
      </div>
    </Tarjeta>
  );
}
