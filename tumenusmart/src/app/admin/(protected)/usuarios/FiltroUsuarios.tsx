"use client";

import { Entrada, Selector, clasesBoton } from "@/components/ui";

export type OpcionLocal = { id: string; nombre: string; cantidad: number };

/**
 * El filtro de la lista de usuarios: por local (o solo los administradores), y un buscador por correo o nombre. Al elegir otro
 * local la lista se actualiza sola; el buscador se aplica con «Filtrar» o con Enter. Es un formulario GET: el filtro queda en la
 * dirección, así se puede volver a una vista o compartirla.
 */
export function FiltroUsuarios({
  locales,
  totalUsuarios,
  administradores,
  sinLocal,
  local,
  buscar,
}: {
  locales: OpcionLocal[];
  totalUsuarios: number;
  administradores: number;
  /** Cuántos usuarios de nivel «local» no tienen ningún local asignado (no debería haber, pero se muestra si los hay). */
  sinLocal: number;
  /** El filtro elegido: "" = todos, "admins", "sin-local" o el id de un local. */
  local: string;
  buscar: string;
}) {
  const hayFiltro = local !== "" || buscar !== "";
  return (
    <form
      method="get"
      action="/admin/usuarios"
      className="campos-grises mb-4 flex flex-wrap items-end gap-3 rounded-xl !border-2 !border-azul/50 bg-white p-3"
    >
      <label className="block min-w-[14rem] flex-1 sm:max-w-xs">
        <span className="mb-1 block text-[0.78rem] font-semibold text-tinta">Local</span>
        <Selector
          name="local"
          defaultValue={local}
          // Elegir otro local actualiza la lista enseguida, sin tener que tocar «Filtrar».
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          aria-label="Filtrar por local"
        >
          <option value="">Todos los locales ({totalUsuarios})</option>
          <option value="admins">Administradores ({administradores})</option>
          {locales.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nombre} ({l.cantidad})
            </option>
          ))}
          {sinLocal > 0 && <option value="sin-local">Sin local asignado ({sinLocal})</option>}
        </Selector>
      </label>

      <label className="block min-w-[14rem] flex-1 sm:max-w-sm">
        <span className="mb-1 block text-[0.78rem] font-semibold text-tinta">Buscar por correo o nombre</span>
        <Entrada type="search" name="buscar" defaultValue={buscar} placeholder="Ej: juan@…" autoComplete="off" />
      </label>

      <div className="flex items-center gap-2">
        <button type="submit" className={clasesBoton("principal", "md")}>
          Filtrar
        </button>
        {hayFiltro && (
          <a href="/admin/usuarios" className={clasesBoton("suave", "md")}>
            Quitar filtros
          </a>
        )}
      </div>
    </form>
  );
}
