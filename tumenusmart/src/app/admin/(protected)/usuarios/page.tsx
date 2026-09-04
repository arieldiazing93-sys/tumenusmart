import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { sesionActual } from "@/lib/auth";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { UsuarioAcciones } from "./UsuarioAcciones";
import { CrearUsuarioForm } from "./CrearUsuarioForm";

export const dynamic = "force-dynamic";

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
      <h1 className="mb-1 text-[1.4rem] font-semibold tracking-titular text-tinta">Usuarios</h1>
      <p className="mb-6 text-sm text-tinta-media">
        Cada local entra con su propio correo y contraseña, y ve únicamente su negocio.
      </p>

      <details className="mb-6 rounded-lg border border-linea bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-tinta">
          Crear un usuario nuevo
        </summary>

        <CrearUsuarioForm locales={locales} />
      </details>

      <div className="flex flex-col gap-2">
        {usuarios.map((u) => (
          <div
            key={u.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-linea bg-white px-4 py-3"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-tinta">{u.email}</span>
                {u.rol === "superadmin" ? (
                  <span className="rounded-full bg-aviso-luz px-2 py-0.5 text-xs font-medium text-aviso">
                    Administrador
                  </span>
                ) : (
                  <span className="rounded-full bg-papel-hundido px-2 py-0.5 text-xs font-medium text-tinta-media">
                    {u.store ? `${u.store.nombre} (/${u.store.slug})` : "Sin local"}
                  </span>
                )}
                {u.id === sesion.id && (
                  <span className="text-xs text-tinta-suave">— sos vos</span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-tinta-media">
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
          <p className="rounded-lg border border-dashed border-linea px-4 py-6 text-center text-sm text-tinta-media">
            Todavía no hay usuarios cargados.
          </p>
        )}
      </div>
    </div>
  );
}
