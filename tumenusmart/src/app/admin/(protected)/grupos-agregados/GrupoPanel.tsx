"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Tarjeta, Campo, Entrada, Pastilla, clasesBoton } from "@/components/ui";
import { BotonesMover } from "@/components/BotonesMover";
import { BuscarProductoParaGrupo } from "@/components/BuscarProductoParaGrupo";
import { QuitarProductoDeGrupoBoton } from "@/components/QuitarProductoDeGrupoBoton";
import { formatearGuarani } from "@/lib/format";
import { eliminarGrupo, moverModificadorDeGrupo, renombrarGrupo } from "./actions";

export type ModificadorDatos = {
  /** El id de la fila que une el grupo con el producto (es el que se mueve al ordenar). */
  id: string;
  productId: string;
  categoryId: string;
  nombre: string;
  precio: number;
  iva: string;
  unidadMedida: string;
  disponible: boolean;
};

export type GrupoDatos = {
  id: string;
  nombre: string;
  cantidadProductos: number;
  modificadores: ModificadorDatos[];
};

/**
 * Todo un grupo de agregados en el panel de la derecha: renombrarlo, ordenar,
 * agregar y quitar sus modificadores, y borrarlo. Se abre con doble clic en la
 * lista y guarda sin salir de la pantalla.
 *
 * Cada modificador es un producto real del catálogo: el precio, el IVA y la
 * unidad se corrigen en la ficha de ese producto (el nombre es un botón que
 * lleva a ella).
 */
export function GrupoPanel({
  grupo,
  onCambio,
  onEliminado,
}: {
  grupo: GrupoDatos;
  /** Algo cambió en el servidor: la pantalla vuelve a leer los datos. */
  onCambio: () => void;
  onEliminado: () => void;
}) {
  const [pendiente, iniciar] = useTransition();
  const [nombre, setNombre] = useState(grupo.nombre);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  // Si el nombre cambió desde afuera (o se acaba de guardar), el campo lo sigue.
  useEffect(() => {
    setNombre(grupo.nombre);
  }, [grupo.nombre]);

  function guardarNombre(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    iniciar(async () => {
      const r = await renombrarGrupo(grupo.id, nombre);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setGuardado(true);
      onCambio();
      setTimeout(() => setGuardado(false), 2500);
    });
  }

  function borrar() {
    if (!confirm(`¿Borrar el grupo "${grupo.nombre}"? No se puede deshacer.`)) return;
    setError(null);
    iniciar(async () => {
      const r = await eliminarGrupo(grupo.id);
      // El motivo se muestra en una ventana: es largo ("desadjuntalo de cada producto primero").
      if (!r.ok) {
        alert(r.error);
        return;
      }
      onEliminado();
    });
  }

  return (
    <Tarjeta className="!border-2 !border-azul/50 flex flex-col gap-4">
      <div>
        <h2 className="break-words text-[1.1rem] font-semibold tracking-titular text-tinta">{grupo.nombre}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Pastilla color="neutro">
            {grupo.modificadores.length} {grupo.modificadores.length === 1 ? "modificador" : "modificadores"}
          </Pastilla>
          <Pastilla color={grupo.cantidadProductos > 0 ? "azul" : "neutro"}>
            Usado en {grupo.cantidadProductos} {grupo.cantidadProductos === 1 ? "producto" : "productos"}
          </Pastilla>
        </div>
      </div>

      <form onSubmit={guardarNombre} className="campos-grises flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1">
          <Campo etiqueta="Nombre del grupo">
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

      <div className="flex flex-col gap-3 border-t border-linea pt-4">
        <div>
          <p className="rotulo text-[0.8rem] font-bold">Modificadores</p>
          <p className="text-sm text-tinta-media">
            Cada modificador es un producto real del catálogo — para corregirle el precio, el IVA o la unidad,
            abrí el producto con su nombre. Ordenalos con las flechas.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {grupo.modificadores.map((m, i) => (
            <div
              key={m.id}
              className="flex flex-col gap-2 rounded-lg border border-linea bg-white px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-wrap items-center gap-2">
                <BotonesMover
                  id={m.id}
                  accion={moverModificadorDeGrupo}
                  esPrimero={i === 0}
                  esUltimo={i === grupo.modificadores.length - 1}
                  etiqueta={m.nombre}
                />
                <Link
                  href={`/admin/productos?categoria=${m.categoryId}&producto=${m.productId}`}
                  className={clasesBoton("navegar", "sm")}
                >
                  {m.nombre}
                </Link>
                {!m.disponible && <span className="text-xs text-aviso">No disponible — no se ofrece ahora</span>}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-tinta-media">
                <span className="cifra">{formatearGuarani(m.precio)}</span>
                <span>{m.iva}</span>
                <span>{m.unidadMedida}</span>
                <QuitarProductoDeGrupoBoton groupId={grupo.id} productId={m.productId} />
              </div>
            </div>
          ))}
          {grupo.modificadores.length === 0 && (
            <p className="text-sm text-tinta-suave">Este grupo todavía no tiene modificadores.</p>
          )}
        </div>

        <BuscarProductoParaGrupo groupId={grupo.id} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linea pt-4">
        <p className="text-xs text-tinta-suave">
          Un grupo que todavía está adjuntado a algún producto no se puede borrar: primero se lo quita de cada uno.
        </p>
        <button type="button" disabled={pendiente} onClick={borrar} className={clasesBoton("peligro", "sm")}>
          Borrar grupo
        </button>
      </div>
    </Tarjeta>
  );
}
