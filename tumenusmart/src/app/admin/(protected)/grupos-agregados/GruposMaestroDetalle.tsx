"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Tarjeta, clasesBoton } from "@/components/ui";
import { BotonesMover } from "@/components/BotonesMover";
import { CrearGrupoForm } from "./CrearGrupoForm";
import { GrupoPanel, type GrupoDatos } from "./GrupoPanel";
import { moverGrupo } from "./actions";

/**
 * La pantalla de Grupos de agregados en dos paneles, igual que Insumos y
 * Productos: a la izquierda la lista de grupos; con doble clic en uno, a la
 * derecha se abre todo (nombre, modificadores, uso). Los datos llegan completos
 * del servidor, así que abrir un grupo es instantáneo.
 */
export function GruposMaestroDetalle({
  grupos,
  abiertoInicialId,
}: {
  grupos: GrupoDatos[];
  /** El grupo que venía en la dirección (enlaces viejos), ya comprobado en el servidor. */
  abiertoInicialId: string | null;
}) {
  const router = useRouter();
  const [abiertoId, setAbiertoId] = useState<string | null>(abiertoInicialId);
  const [creando, setCreando] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const abierto = abiertoId ? (grupos.find((g) => g.id === abiertoId) ?? null) : null;

  // Un grupo recién creado tarda un instante en llegar con los datos; si nunca
  // llega (lo borraron desde otro lado), se deja de esperar.
  useEffect(() => {
    if (!abiertoId || abierto) return;
    const espera = setTimeout(() => setAbiertoId(null), 4000);
    return () => clearTimeout(espera);
  }, [abiertoId, abierto]);

  // En pantalla angosta el panel queda debajo de la lista: se lo trae a la
  // vista, si no el doble clic parecería no hacer nada.
  useEffect(() => {
    if (!abiertoId && !creando) return;
    if (window.matchMedia("(max-width: 1279px)").matches) {
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
        <button
          type="button"
          onClick={() => {
            setAbiertoId(null);
            setCreando(true);
          }}
          className={clasesBoton("nuevo")}
        >
          + Nuevo grupo
        </button>
        <span className="text-xs text-tinta-suave">
          {grupos.length} {grupos.length === 1 ? "grupo" : "grupos"} en total
        </span>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[26rem_minmax(0,1fr)]">
        {/* ---------------- izquierda: lista de grupos ---------------- */}
        <Tarjeta padding={false} className="!border-2 !border-azul/50 flex flex-col overflow-hidden">
          <div className="max-h-[32rem] overflow-y-auto">
            {grupos.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-tinta-suave">
                Todavía no hay grupos de agregados creados.
              </p>
            ) : (
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 bg-superficie">
                  <tr className="border-b border-linea text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
                    <th scope="col" className="px-2 py-2">
                      <span className="sr-only">Orden</span>
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Grupo
                    </th>
                    <th scope="col" className="px-2 py-2 text-right" title="Modificadores">
                      Modif.
                    </th>
                    <th scope="col" className="px-2 py-2 text-right" title="Productos que lo usan">
                      Prod.
                    </th>
                    <th scope="col" className="px-2 py-2">
                      <span className="sr-only">Ver</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {grupos.map((g, i) => (
                    <tr
                      key={g.id}
                      tabIndex={0}
                      title="Doble clic para ver el grupo"
                      onDoubleClick={() => abrir(g.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && e.target === e.currentTarget) abrir(g.id);
                      }}
                      className={`cursor-pointer border-b border-linea-fina text-[0.84rem] outline-none transition-colors focus-visible:bg-papel-hundido ${
                        abiertoId === g.id ? "bg-brand-light text-brand-texto" : "hover:bg-papel-suave"
                      }`}
                    >
                      <td className="px-2 py-1.5" onDoubleClick={(e) => e.stopPropagation()}>
                        <BotonesMover
                          id={g.id}
                          accion={moverGrupo}
                          esPrimero={i === 0}
                          esUltimo={i === grupos.length - 1}
                          etiqueta={g.nombre}
                        />
                      </td>
                      <td className="px-3 py-2 font-medium">
                        <span className="break-words">{g.nombre}</span>
                      </td>
                      <td className="cifra px-2 py-2 text-right">{g.modificadores.length}</td>
                      <td className="cifra px-2 py-2 text-right">{g.cantidadProductos}</td>
                      <td className="px-2 py-1 text-right">
                        <button type="button" onClick={() => abrir(g.id)} className={clasesBoton("suave", "sm")}>
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
            Doble clic en un grupo, o el botón Ver, para abrirlo. Las flechas ordenan cómo se ofrecen.
          </p>
        </Tarjeta>

        {/* ---------------- derecha: el grupo ---------------- */}
        <div ref={panelRef} className="min-w-0">
          {creando ? (
            <CrearGrupoForm
              onCancelar={() => setCreando(false)}
              onCreado={(id) => {
                setCreando(false);
                setAbiertoId(id);
                router.refresh();
              }}
            />
          ) : abierto ? (
            <GrupoPanel
              key={abierto.id}
              grupo={abierto}
              onCambio={() => router.refresh()}
              onEliminado={() => {
                setAbiertoId(null);
                router.refresh();
              }}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-linea bg-papel-suave px-6 py-14 text-center">
              <p className="text-[0.95rem] font-semibold tracking-titular text-tinta">
                {abiertoId ? "Abriendo el grupo…" : "Ningún grupo abierto"}
              </p>
              {!abiertoId && (
                <p className="mx-auto mt-1.5 max-w-sm text-[0.85rem] leading-snug text-tinta-media">
                  Hacé doble clic en un grupo de la lista para ver y editar sus modificadores, o creá uno nuevo con
                  el botón de arriba.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
