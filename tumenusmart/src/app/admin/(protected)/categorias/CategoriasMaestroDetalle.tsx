"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Tarjeta, clasesBoton } from "@/components/ui";
import { BotonesMover } from "@/components/BotonesMover";
import { CategoriaPanel, type CategoriaDatos } from "./CategoriaPanel";
import { CrearCategoriaForm } from "./CrearCategoriaForm";
import { moverCategoria } from "./actions";

/**
 * La pantalla de Categorías en dos paneles, igual que Insumos, Productos y
 * Grupos de agregados: a la izquierda la lista en el orden de la carta; con doble
 * clic en una, a la derecha se abre todo (nombre, visibilidad, productos,
 * horario de bloqueo). Los datos llegan completos del servidor, así que abrir una
 * categoría es instantáneo.
 *
 * Quien solo puede ver (el empleado) mira la lista y cuántos productos tiene cada
 * una, y nada más.
 */
export function CategoriasMaestroDetalle({
  categorias,
  puedeEditar,
  abiertaInicialId,
}: {
  categorias: CategoriaDatos[];
  puedeEditar: boolean;
  /** La categoría que venía en la dirección (enlaces viejos), ya comprobada en el servidor. */
  abiertaInicialId: string | null;
}) {
  const router = useRouter();
  const [abiertaId, setAbiertaId] = useState<string | null>(puedeEditar ? abiertaInicialId : null);
  const [creando, setCreando] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const abierta = abiertaId ? (categorias.find((c) => c.id === abiertaId) ?? null) : null;

  // Una categoría recién creada tarda un instante en llegar con los datos; si
  // nunca llega (la borraron desde otro lado), se deja de esperar.
  useEffect(() => {
    if (!abiertaId || abierta) return;
    const espera = setTimeout(() => setAbiertaId(null), 4000);
    return () => clearTimeout(espera);
  }, [abiertaId, abierta]);

  // En pantalla angosta el panel queda debajo de la lista: se lo trae a la
  // vista, si no el doble clic parecería no hacer nada.
  useEffect(() => {
    if (!abiertaId && !creando) return;
    if (window.matchMedia("(max-width: 1279px)").matches) {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [abiertaId, creando]);

  function abrir(id: string) {
    if (!puedeEditar) return;
    setCreando(false);
    setAbiertaId(id);
  }

  const conFlechas = puedeEditar && categorias.length > 1;

  const lista = (
    <Tarjeta padding={false} className="!border-2 !border-azul/50 flex flex-col overflow-hidden">
      <div className="max-h-[32rem] overflow-y-auto">
        {categorias.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-tinta-suave">Todavía no hay categorías creadas.</p>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 bg-superficie">
              <tr className="border-b border-linea text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
                {conFlechas && (
                  <th scope="col" className="px-2 py-2">
                    <span className="sr-only">Orden</span>
                  </th>
                )}
                <th scope="col" className="px-3 py-2">
                  Categoría
                </th>
                <th scope="col" className="px-2 py-2 text-right" title="Productos">
                  Prod.
                </th>
                {puedeEditar && (
                  <th scope="col" className="px-2 py-2">
                    <span className="sr-only">Ver</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {categorias.map((c, i) => (
                <tr
                  key={c.id}
                  tabIndex={puedeEditar ? 0 : undefined}
                  title={puedeEditar ? "Doble clic para ver la categoría" : undefined}
                  onDoubleClick={puedeEditar ? () => abrir(c.id) : undefined}
                  onKeyDown={
                    puedeEditar
                      ? (e) => {
                          if (e.key === "Enter" && e.target === e.currentTarget) abrir(c.id);
                        }
                      : undefined
                  }
                  className={`border-b border-linea-fina text-[0.84rem] outline-none transition-colors focus-visible:bg-papel-hundido ${
                    puedeEditar ? "cursor-pointer" : ""
                  } ${abiertaId === c.id ? "bg-brand-light text-brand-texto" : puedeEditar ? "hover:bg-papel-suave" : ""} ${
                    c.activa ? "" : "opacity-60"
                  }`}
                >
                  {conFlechas && (
                    <td className="px-2 py-1.5" onDoubleClick={(e) => e.stopPropagation()}>
                      <BotonesMover
                        id={c.id}
                        accion={moverCategoria}
                        esPrimero={i === 0}
                        esUltimo={i === categorias.length - 1}
                        etiqueta={c.nombre}
                      />
                    </td>
                  )}
                  <td className="px-3 py-2 font-medium">
                    <span className="break-words">{c.nombre}</span>
                    {!c.activa && <span className="ml-1.5 text-xs font-normal text-tinta-suave">(oculta)</span>}
                  </td>
                  <td className="cifra px-2 py-2 text-right">{c.cantidadProductos}</td>
                  {puedeEditar && (
                    <td className="px-2 py-1 text-right">
                      <button type="button" onClick={() => abrir(c.id)} className={clasesBoton("suave", "sm")}>
                        Ver
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="border-t border-linea px-3 py-2 text-[0.74rem] text-tinta-suave">
        {puedeEditar
          ? "El orden de esta lista es el orden en que tu cliente ve las categorías en la carta: movelas con las flechas. Doble clic, o el botón Ver, para abrirla."
          : "El orden de esta lista es el orden en que tu cliente ve las categorías en la carta."}
      </p>
    </Tarjeta>
  );

  // Quien no puede editar solo ve la lista.
  if (!puedeEditar) return <div className="max-w-3xl">{lista}</div>;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setAbiertaId(null);
            setCreando(true);
          }}
          className={clasesBoton("nuevo")}
        >
          + Nueva categoría
        </button>
        <span className="text-xs text-tinta-suave">
          {categorias.length} {categorias.length === 1 ? "categoría" : "categorías"} en total
        </span>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[26rem_minmax(0,1fr)]">
        {/* ---------------- izquierda: lista de categorías ---------------- */}
        {lista}

        {/* ---------------- derecha: la categoría ---------------- */}
        <div ref={panelRef} className="min-w-0">
          {creando ? (
            <CrearCategoriaForm
              onCancelar={() => setCreando(false)}
              onCreada={(id) => {
                setCreando(false);
                setAbiertaId(id);
                router.refresh();
              }}
            />
          ) : abierta ? (
            <CategoriaPanel
              key={abierta.id}
              categoria={abierta}
              onCambio={() => router.refresh()}
              onEliminada={() => {
                setAbiertaId(null);
                router.refresh();
              }}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-linea bg-papel-suave px-6 py-14 text-center">
              <p className="text-[0.95rem] font-semibold tracking-titular text-tinta">
                {abiertaId ? "Abriendo la categoría…" : "Ninguna categoría abierta"}
              </p>
              {!abiertaId && (
                <p className="mx-auto mt-1.5 max-w-sm text-[0.85rem] leading-snug text-tinta-media">
                  Hacé doble clic en una categoría de la lista para ver y editar su nombre, su visibilidad y su
                  horario, o creá una nueva con el botón de arriba.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
