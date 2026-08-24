import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { sesionActual } from "@/lib/auth";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { crearUsuario } from "./actions";
import { UsuarioAcciones } from "./UsuarioAcciones";

export const dynamic = "force-dynamic";

const CAMPO =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";

function fechaCorta(valor: Date | null): string {
  if (!valor) return "Nunca entró";
  return new Date(valor).toLocaleString("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ZONA_NEGOCIO,
  });
}

export default async function AdminUsuariosPage() {
  const sesion = await sesionActual();
  // El layout ya lo oculta del menú, pero alguien podría escribir la dirección
  // a mano. La pantalla se defiende sola.
  if (!sesion || sesion.rol !== "superadmin") redirect("/admin/pedidos");

  const [usuarios, locales] = await Promise.all([
    prisma.usuario.findMany({
      orderBy: [{ rol: "asc" }, { email: "asc" }],
      include: { store: { select: { nombre: true, slug: true } } },
    }),
    prisma.store.findMany({
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true, slug: true },
    }),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-neutral-900">Usuarios</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Cada local entra con su propio correo y contraseña, y ve únicamente su negocio.
      </p>

      <details className="mb-6 rounded-lg border border-neutral-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-neutral-800">
          Crear un usuario nuevo
        </summary>

        <form
          action={crearUsuario}
          className="grid gap-3 border-t border-neutral-200 p-4 sm:grid-cols-2"
        >
          <label className="flex flex-col gap-1 text-sm text-neutral-600">
            Correo
            <input
              type="email"
              name="email"
              required
              placeholder="juan@maspizza.com"
              className={CAMPO}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-neutral-600">
            Nombre
            <input type="text" name="nombre" placeholder="Juan Pérez" className={CAMPO} />
          </label>

          <label className="flex flex-col gap-1 text-sm text-neutral-600">
            Local
            <select name="storeId" className={CAMPO} defaultValue="">
              <option value="">— Elegí un local —</option>
              {locales.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre} (/{l.slug})
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm text-neutral-600">
            Nivel
            <select name="rol" className={CAMPO} defaultValue="local">
              <option value="local">Local — solo su negocio</option>
              <option value="superadmin">Administrador — todos los locales</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm text-neutral-600 sm:col-span-2">
            Contraseña
            <input
              type="text"
              name="password"
              required
              autoComplete="off"
              placeholder="Al menos 8 caracteres, con letras y números"
              className={CAMPO}
            />
            <span className="text-xs text-neutral-400">
              Se muestra en claro a propósito, para que puedas copiarla y pasársela. Después
              de guardar no se puede volver a ver: solo cambiarla. Si elegís Administrador, el
              local queda ignorado.
            </span>
          </label>

          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
            >
              Crear usuario
            </button>
          </div>
        </form>
      </details>

      <div className="flex flex-col gap-2">
        {usuarios.map((u) => (
          <div
            key={u.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-neutral-900">{u.email}</span>
                {u.rol === "superadmin" ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    Administrador
                  </span>
                ) : (
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
                    {u.store ? `${u.store.nombre} (/${u.store.slug})` : "Sin local"}
                  </span>
                )}
                {u.id === sesion.id && (
                  <span className="text-xs text-neutral-400">— sos vos</span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-neutral-500">
                {u.nombre ? `${u.nombre} · ` : ""}
                Último ingreso: {fechaCorta(u.ultimoIngreso)}
              </p>
            </div>

            <UsuarioAcciones
              id={u.id}
              activo={u.activo}
              email={u.email}
              esUnoMismo={u.id === sesion.id}
            />
          </div>
        ))}

        {usuarios.length === 0 && (
          <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500">
            Todavía no hay usuarios cargados.
          </p>
        )}
      </div>
    </div>
  );
}
