"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatearGuarani } from "@/lib/format";
import { BuscarProductoParaGrupo } from "@/components/BuscarProductoParaGrupo";
import { QuitarProductoDeGrupoBoton } from "@/components/QuitarProductoDeGrupoBoton";
import { asignarGrupoAProducto, crearGrupoYAdjuntar } from "../actions";

type Modificador = {
  productId: string;
  nombre: string;
  precio: number;
  iva: string;
  unidadMedida: string;
};

type GrupoAdjuntado = { id: string; nombre: string; modificadores: Modificador[] };
type GrupoDisponible = { id: string; nombre: string; cantidadModificadores: number };

/**
 * Todo el flujo de un grupo de agregados vive ACÁ, en la pantalla del
 * producto — crear el grupo, buscarle y agregarle productos como
 * modificadores, todo sin salir de esta pantalla (mismo criterio que
 * SoftRestaurant: la pestaña "Producto compuesto" de un producto es donde
 * se arma todo esto, no una pantalla aparte). /admin/grupos-agregados
 * sigue existiendo para renombrar/reordenar/borrar un grupo o ver en
 * cuántos productos se usa, pero no hace falta pasar por ahí para armar
 * uno nuevo.
 */
export function GruposAgregadosProducto({
  productId,
  gruposAdjuntados,
  gruposDisponibles,
}: {
  productId: string;
  gruposAdjuntados: GrupoAdjuntado[];
  gruposDisponibles: GrupoDisponible[];
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [creando, setCreando] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function crearGrupo() {
    setError(null);
    const nombre = nombreNuevo.trim();
    if (!nombre) {
      setError("El nombre del grupo es obligatorio");
      return;
    }
    iniciar(async () => {
      const r = await crearGrupoYAdjuntar(productId, nombre);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setNombreNuevo("");
      setCreando(false);
      router.refresh();
    });
  }

  function usarGrupoExistente(groupId: string) {
    iniciar(async () => {
      const r = await asignarGrupoAProducto(productId, groupId, true);
      if (!r.ok) {
        alert(r.error);
        return;
      }
      router.refresh();
    });
  }

  function quitarGrupo(groupId: string) {
    if (!confirm("¿Quitar este grupo de este producto? El grupo y sus modificadores no se borran, solo dejan de ofrecerse acá.")) return;
    iniciar(async () => {
      const r = await asignarGrupoAProducto(productId, groupId, false);
      if (!r.ok) {
        alert(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {gruposAdjuntados.map((g) => (
        <div key={g.id} className="rounded-lg border border-linea bg-papel-suave p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{g.nombre}</p>
            <button
              type="button"
              disabled={pendiente}
              onClick={() => quitarGrupo(g.id)}
              className="text-xs text-peligro hover:underline disabled:opacity-50"
            >
              Quitar grupo de este producto
            </button>
          </div>

          {g.modificadores.length > 0 && (
            <div className="mb-2 flex flex-col gap-1.5">
              {g.modificadores.map((m) => (
                <div
                  key={m.productId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-linea bg-white px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{m.nombre}</p>
                    <p className="text-xs text-tinta-suave">
                      {formatearGuarani(m.precio)} · {m.iva} · {m.unidadMedida}
                    </p>
                  </div>
                  <QuitarProductoDeGrupoBoton groupId={g.id} productId={m.productId} />
                </div>
              ))}
            </div>
          )}

          <BuscarProductoParaGrupo groupId={g.id} />
        </div>
      ))}

      {creando ? (
        <form
          ref={formRef}
          action={crearGrupo}
          className="flex flex-wrap items-end gap-2 rounded-lg border border-linea bg-papel-suave p-3"
        >
          <input
            autoFocus
            value={nombreNuevo}
            onChange={(e) => setNombreNuevo(e.target.value)}
            placeholder="Nombre del grupo (ej: Salsas)"
            className="min-w-[14rem] flex-1 rounded-lg border border-linea px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={pendiente}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {pendiente ? "Creando…" : "Crear grupo"}
          </button>
          <button
            type="button"
            onClick={() => {
              setCreando(false);
              setNombreNuevo("");
              setError(null);
            }}
            className="text-sm text-tinta-media hover:underline"
          >
            Cancelar
          </button>
          {error && <p className="w-full text-xs text-peligro">{error}</p>}
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setCreando(true)}
          className="self-start rounded-lg border border-dashed border-linea px-3 py-2 text-sm text-tinta-media hover:border-brand hover:text-brand"
        >
          + Crear grupo nuevo
        </button>
      )}

      {gruposDisponibles.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs text-tinta-suave">O usar un grupo que ya creaste:</p>
          <div className="flex flex-wrap gap-2">
            {gruposDisponibles.map((g) => (
              <button
                key={g.id}
                type="button"
                disabled={pendiente}
                onClick={() => usarGrupoExistente(g.id)}
                className="rounded-full border border-linea px-3 py-1.5 text-xs text-tinta-media hover:border-brand hover:text-brand disabled:opacity-50"
              >
                + {g.nombre} ({g.cantidadModificadores})
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
