import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { sesionActual } from "@/lib/auth";
import { Pastilla, Vacio } from "@/components/ui";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { UsuarioAcciones } from "./UsuarioAcciones";
import { CrearUsuarioForm } from "./CrearUsuarioForm";
import { FiltroUsuarios } from "./FiltroUsuarios";

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

/** Sin tildes ni mayúsculas, para que "perez" encuentre a "Pérez". */
function sinTildes(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** La inicial para el círculo de cada usuario: la del nombre y, si no hay, la del correo. */
function inicial(nombre: string | null, email: string): string {
  const base = (nombre?.trim() || email).trim();
  return (base[0] ?? "?").toUpperCase();
}

export default async function AdminUsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ local?: string; buscar?: string }>;
}) {
  const sesion = await sesionActual();
  // El layout ya lo oculta del menú, pero alguien podría escribir la dirección
  // a mano. La pantalla se defiende sola.
  if (!sesion || sesion.rol !== "superadmin") redirect("/admin/pos");

  const sp = await searchParams;
  const filtroLocal = (sp.local ?? "").trim();
  const buscar = (sp.buscar ?? "").trim().slice(0, 80);

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

  // Cuántos usuarios tiene cada local (para mostrarlo en el selector del filtro). Son pocos: se cuenta acá, sin otra consulta.
  const cantidadPorLocal = new Map<string, number>();
  let administradores = 0;
  let sinLocal = 0;
  for (const u of usuarios) {
    if (u.rol === "superadmin") administradores += 1;
    else if (u.storeId) cantidadPorLocal.set(u.storeId, (cantidadPorLocal.get(u.storeId) ?? 0) + 1);
    else sinLocal += 1;
  }

  // El filtro: un local, solo los administradores, o los que quedaron sin local; y el buscador por correo o nombre.
  const q = sinTildes(buscar);
  const localElegido = locales.find((l) => l.id === filtroLocal) ?? null;
  const visibles = usuarios
    .filter((u) => {
      if (filtroLocal === "admins") return u.rol === "superadmin";
      if (filtroLocal === "sin-local") return u.rol !== "superadmin" && !u.storeId;
      if (localElegido) return u.storeId === localElegido.id && u.rol !== "superadmin";
      return true;
    })
    .filter((u) => !q || sinTildes(`${u.email} ${u.nombre ?? ""}`).includes(q))
    // Los administradores primero; después por local y por correo, así los de un mismo negocio quedan juntos.
    .sort((a, b) => {
      if ((a.rol === "superadmin") !== (b.rol === "superadmin")) return a.rol === "superadmin" ? -1 : 1;
      const la = a.store?.nombre ?? "";
      const lb = b.store?.nombre ?? "";
      if (la !== lb) return la.localeCompare(lb, "es");
      return a.email.localeCompare(b.email, "es");
    });

  const filtroTexto = filtroLocal === "admins" ? "los administradores" : localElegido ? localElegido.nombre : null;

  return (
    <div>
      <h1 className="mb-1 text-[1.4rem] font-semibold tracking-titular text-tinta">Usuarios</h1>
      <p className="mb-5 text-sm text-tinta-media">
        Cada local entra con su propio correo y contraseña, y ve únicamente su negocio.
      </p>

      <details className="group mb-4 rounded-xl !border-2 !border-azul/50 bg-white">
        <summary className="flex cursor-pointer list-none items-center gap-2.5 px-4 py-3 text-[0.92rem] font-semibold text-tinta">
          <span
            aria-hidden="true"
            className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-exito text-[1.1rem] leading-none text-white"
          >
            +
          </span>
          Crear un usuario nuevo
          <span className="ml-auto text-[0.76rem] font-normal text-tinta-suave group-open:hidden">tocá para abrir</span>
        </summary>

        <CrearUsuarioForm locales={locales} />
      </details>

      <FiltroUsuarios
        locales={locales.map((l) => ({ id: l.id, nombre: l.nombre, cantidad: cantidadPorLocal.get(l.id) ?? 0 }))}
        totalUsuarios={usuarios.length}
        administradores={administradores}
        sinLocal={sinLocal}
        local={filtroLocal === "admins" || filtroLocal === "sin-local" || localElegido ? filtroLocal : ""}
        buscar={buscar}
      />

      <p className="mb-2 text-[0.8rem] text-tinta-media">
        {visibles.length === usuarios.length
          ? `${usuarios.length} ${usuarios.length === 1 ? "usuario" : "usuarios"} en total`
          : `Mostrando ${visibles.length} de ${usuarios.length}${filtroTexto ? ` · ${filtroTexto}` : ""}${buscar ? ` · «${buscar}»` : ""}`}
      </p>

      <div className="flex flex-col gap-2">
        {visibles.map((u) => (
          <div
            key={u.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl !border-2 !border-azul/50 bg-white px-4 py-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden="true"
                className={`flex h-10 w-10 flex-none items-center justify-center rounded-full text-[1rem] font-semibold ${
                  u.rol === "superadmin" ? "bg-aviso-luz text-aviso" : "bg-azul-luz text-azul-oscuro"
                }`}
              >
                {inicial(u.nombre, u.email)}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-all font-semibold text-tinta">{u.email}</span>
                  {u.rol === "superadmin" ? (
                    <Pastilla color="aviso">Administrador</Pastilla>
                  ) : u.store ? (
                    <Pastilla color="azul">
                      {u.store.nombre} <span className="font-normal opacity-70">/{u.store.slug}</span>
                    </Pastilla>
                  ) : (
                    <Pastilla color="peligro">Sin local</Pastilla>
                  )}
                  {u.id === sesion.id && <span className="text-xs text-tinta-suave">— sos vos</span>}
                </div>
                <p className="mt-0.5 text-xs text-tinta-media">
                  {u.nombre ? `${u.nombre} · ` : ""}
                  Último ingreso: {fechaCorta(u.ultimoIngreso)}
                </p>
              </div>
            </div>

            <UsuarioAcciones id={u.id} activo={u.activo} email={u.email} esUnoMismo={u.id === sesion.id} />
          </div>
        ))}

        {visibles.length === 0 && (
          <Vacio
            titulo={usuarios.length === 0 ? "Todavía no hay usuarios cargados" : "Ningún usuario coincide con el filtro"}
            detalle={
              usuarios.length === 0
                ? "Creá el primero con «Crear un usuario nuevo»."
                : "Probá con otro local o con otra parte del correo o del nombre."
            }
          />
        )}
      </div>
    </div>
  );
}
