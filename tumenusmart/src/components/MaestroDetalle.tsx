"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Tarjeta, clasesBoton } from "@/components/ui";

export type ColumnaMaestro<T> = {
  titulo: string;
  celda: (item: T) => ReactNode;
  derecha?: boolean;
};

/**
 * La pantalla de dos paneles de los catálogos del panel: a la izquierda la
 * lista, con doble clic en una fila se abren sus datos a la derecha para
 * editarlos, y el botón de arriba abre el formulario de alta en ese mismo
 * panel. Todo en una pantalla, sin saltar a otra página.
 *
 * Es solo el esqueleto: qué columnas se listan y qué formulario va a la
 * derecha lo pone cada pantalla. Los formularios avisan cuándo guardaron o
 * crearon algo y este componente refresca los datos.
 */
export function MaestroDetalle<T extends { id: string; activo: boolean }>({
  items,
  columnas,
  textoNuevo,
  textoVacio,
  textoPlaceholder,
  renderPanel,
  renderNuevo,
}: {
  items: T[];
  columnas: ColumnaMaestro<T>[];
  /** El del botón de arriba, ej: "+ Nuevo proveedor". Sin él (y sin `renderNuevo`) no hay botón: la lista es solo para consultar. */
  textoNuevo?: string;
  /** Cuando la lista está vacía. */
  textoVacio: string;
  /** Qué dice el panel derecho mientras no hay nada abierto. */
  textoPlaceholder: string;
  renderPanel: (item: T, alGuardar: () => void) => ReactNode;
  renderNuevo?: (alCrear: (id: string) => void) => ReactNode;
}) {
  const router = useRouter();
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const abierto = abiertoId ? (items.find((i) => i.id === abiertoId) ?? null) : null;

  // En pantalla angosta el panel queda debajo de la lista: se lo trae a la
  // vista, si no el doble clic parecería no hacer nada.
  useEffect(() => {
    if (!abiertoId && !creando) return;
    if (window.matchMedia("(max-width: 1023px)").matches) {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [abiertoId, creando]);

  function abrir(id: string) {
    setCreando(false);
    setAbiertoId(id);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {textoNuevo && renderNuevo && (
          <button
            type="button"
            onClick={() => {
              setAbiertoId(null);
              setCreando(true);
            }}
            className={clasesBoton("principal")}
          >
            {textoNuevo}
          </button>
        )}
        <span className="text-xs text-tinta-suave">{items.length} en total</span>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[26rem_minmax(0,1fr)]">
        {/* ---------------- izquierda: la lista ---------------- */}
        <Tarjeta padding={false} className="flex flex-col overflow-hidden">
          <div className="max-h-[32rem] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-tinta-suave">{textoVacio}</p>
            ) : (
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 bg-superficie">
                  <tr className="border-b border-linea text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
                    {columnas.map((c) => (
                      <th key={c.titulo} scope="col" className={`px-3 py-2 ${c.derecha ? "text-right" : ""}`}>
                        {c.titulo}
                      </th>
                    ))}
                    <th scope="col" className="px-2 py-2">
                      <span className="sr-only">Ver</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      tabIndex={0}
                      title="Doble clic para ver los datos"
                      onDoubleClick={() => abrir(item.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") abrir(item.id);
                      }}
                      className={`cursor-pointer border-b border-linea-fina text-[0.84rem] outline-none transition-colors focus-visible:bg-papel-hundido ${
                        abiertoId === item.id ? "bg-brand-light text-brand-texto" : "hover:bg-papel-suave"
                      } ${item.activo ? "" : "opacity-60"}`}
                    >
                      {columnas.map((c) => (
                        <td key={c.titulo} className={`px-3 py-2 ${c.derecha ? "text-right" : ""}`}>
                          {c.celda(item)}
                        </td>
                      ))}
                      <td className="px-2 py-1 text-right">
                        <button type="button" onClick={() => abrir(item.id)} className={clasesBoton("suave", "sm")}>
                          Ver
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <p className="border-t border-linea px-3 py-2 text-[0.74rem] text-tinta-suave">
            Doble clic en una fila, o el botón Ver, para abrir sus datos.
          </p>
        </Tarjeta>

        {/* ---------------- derecha: los datos ---------------- */}
        <div ref={panelRef}>
          {creando && renderNuevo ? (
            renderNuevo((id) => {
              setCreando(false);
              setAbiertoId(id);
              router.refresh();
            })
          ) : abierto ? (
            <div key={abierto.id}>{renderPanel(abierto, () => router.refresh())}</div>
          ) : (
            <div className="rounded-xl border border-dashed border-linea bg-papel-suave px-6 py-14 text-center">
              <p className="text-[0.95rem] font-semibold tracking-titular text-tinta">
                {abiertoId ? "Abriendo…" : "Nada abierto"}
              </p>
              {!abiertoId && (
                <p className="mx-auto mt-1.5 max-w-sm text-[0.85rem] leading-snug text-tinta-media">
                  {textoPlaceholder}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
