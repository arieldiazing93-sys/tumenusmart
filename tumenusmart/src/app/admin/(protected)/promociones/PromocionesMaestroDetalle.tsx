"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pastilla, Tarjeta, clasesBoton } from "@/components/ui";
import { etiquetaDePromo, resumenDePromo, type PromoDef } from "@/lib/promociones";
import { PromocionForm } from "./PromocionForm";
import type { CategoriaConProductos } from "./SelectorDeProductos";

/**
 * La pantalla de Promociones en dos paneles, como Insumos, Productos y Categorías: a la izquierda la lista; con doble clic en una, a
 * la derecha se abre su ficha completa (tipo, descuento o "por cada X regalar Y", días y horarios, productos). Los datos llegan
 * completos del servidor, así que abrir una promoción es instantáneo.
 *
 * Quien solo puede ver (el empleado) mira la lista y qué promociones hay activas, y nada más.
 */
export function PromocionesMaestroDetalle({
  promociones,
  categorias,
  puedeEditar,
}: {
  promociones: PromoDef[];
  /** Los productos para elegir en una promoción. Vacío si la persona no puede editar. */
  categorias: CategoriaConProductos[];
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [abiertaId, setAbiertaId] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const abierta = abiertaId ? (promociones.find((p) => p.id === abiertaId) ?? null) : null;

  // Una promoción recién creada o copiada tarda un instante en llegar con los datos; si nunca llega (la borraron desde otro lado), se
  // deja de esperar.
  useEffect(() => {
    if (!abiertaId || abierta) return;
    const espera = setTimeout(() => setAbiertaId(null), 4000);
    return () => clearTimeout(espera);
  }, [abiertaId, abierta]);

  // En pantalla angosta el panel queda debajo de la lista: se lo trae a la vista, si no el doble clic parecería no hacer nada.
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

  const lista = (
    <Tarjeta padding={false} className="!border-2 !border-azul/50 flex flex-col overflow-hidden">
      <div className="max-h-[36rem] overflow-y-auto">
        {promociones.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-tinta-suave">Todavía no creaste ninguna promoción.</p>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 bg-superficie">
              <tr className="border-b border-linea text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
                <th scope="col" className="px-3 py-2">
                  Promoción
                </th>
                <th scope="col" className="px-2 py-2">
                  Estado
                </th>
                {puedeEditar && (
                  <th scope="col" className="px-2 py-2">
                    <span className="sr-only">Ver</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {promociones.map((p) => (
                <tr
                  key={p.id}
                  tabIndex={puedeEditar ? 0 : undefined}
                  title={puedeEditar ? "Doble clic para ver la promoción" : undefined}
                  onDoubleClick={puedeEditar ? () => abrir(p.id) : undefined}
                  onKeyDown={
                    puedeEditar
                      ? (e) => {
                          if (e.key === "Enter" && e.target === e.currentTarget) abrir(p.id);
                        }
                      : undefined
                  }
                  className={`border-b border-linea-fina text-[0.84rem] outline-none transition-colors focus-visible:bg-papel-hundido ${
                    puedeEditar ? "cursor-pointer" : ""
                  } ${abiertaId === p.id ? "bg-brand-light text-brand-texto" : puedeEditar ? "hover:bg-papel-suave" : ""} ${
                    p.activa ? "" : "opacity-70"
                  }`}
                >
                  <td className="px-3 py-2">
                    <span className="flex flex-wrap items-center gap-1.5 font-medium">
                      <span className="break-words">{p.nombre}</span>
                      <span className="rounded-full bg-exito-luz px-1.5 py-0.5 text-[0.64rem] font-bold uppercase tracking-rotulo text-exito">
                        {etiquetaDePromo(p)}
                      </span>
                    </span>
                    <span className="block text-[0.74rem] font-normal text-tinta-suave">
                      {resumenDePromo(p)} · {p.productIds.length} {p.productIds.length === 1 ? "producto" : "productos"}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <Pastilla color={p.activa ? "exito" : "neutro"}>{p.activa ? "Activa" : "Inactiva"}</Pastilla>
                  </td>
                  {puedeEditar && (
                    <td className="px-2 py-1 text-right">
                      <button type="button" onClick={() => abrir(p.id)} className={clasesBoton("suave", "sm")}>
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
      {puedeEditar && (
        <p className="border-t border-linea px-3 py-2 text-[0.74rem] text-tinta-suave">
          Doble clic en una promoción, o el botón Ver, para abrirla. Un producto está en una promoción a la vez.
        </p>
      )}
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
          + Nueva promoción
        </button>
        <span className="text-xs text-tinta-suave">
          {promociones.length} {promociones.length === 1 ? "promoción" : "promociones"} ·{" "}
          {promociones.filter((p) => p.activa).length} {promociones.filter((p) => p.activa).length === 1 ? "activa" : "activas"}
        </span>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[26rem_minmax(0,1fr)]">
        {lista}

        <div ref={panelRef} className="min-w-0">
          {creando ? (
            <PromocionForm
              key="nueva"
              inicial={null}
              todas={promociones}
              categorias={categorias}
              onCerrar={() => setCreando(false)}
              onGuardada={(id) => {
                setCreando(false);
                setAbiertaId(id);
                router.refresh();
              }}
              onEliminada={() => undefined}
              onDuplicada={() => undefined}
              onCambioDeEstado={() => undefined}
            />
          ) : abierta ? (
            <PromocionForm
              // La llave incluye lo guardado: al guardar, el formulario se vuelve a armar con lo que quedó en el servidor.
              key={`${abierta.id}|${JSON.stringify(abierta)}`}
              inicial={abierta}
              todas={promociones}
              categorias={categorias}
              onCerrar={() => setAbiertaId(null)}
              onGuardada={() => router.refresh()}
              onEliminada={() => {
                setAbiertaId(null);
                router.refresh();
              }}
              onDuplicada={(id) => {
                setAbiertaId(id);
                router.refresh();
              }}
              onCambioDeEstado={() => router.refresh()}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-linea bg-papel-suave px-6 py-14 text-center">
              <p className="text-[0.95rem] font-semibold tracking-titular text-tinta">
                {abiertaId ? "Abriendo la promoción…" : "Ninguna promoción abierta"}
              </p>
              {!abiertaId && (
                <p className="mx-auto mt-1.5 max-w-sm text-[0.85rem] leading-snug text-tinta-media">
                  Hacé doble clic en una promoción de la lista para verla y editarla, o creá una nueva con el botón de arriba: por descuento
                  (“PROMO 20 %”) o por volumen (“2 por 1”).
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
