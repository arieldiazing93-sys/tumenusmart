"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Tarjeta, Campo, Entrada, Pastilla, clasesBoton } from "@/components/ui";
import { alternarActivaCategoria, eliminarCategoria, renombrarCategoria } from "./actions";
import { HorarioCategoria, type TramoDatos } from "./HorarioCategoria";

export type CategoriaDatos = {
  id: string;
  nombre: string;
  activa: boolean;
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

  // Si el nombre cambió desde afuera (o se acaba de guardar), el campo lo sigue.
  useEffect(() => {
    setNombre(categoria.nombre);
  }, [categoria.nombre]);

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
