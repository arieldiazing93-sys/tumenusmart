import Link from "next/link";
import { redirect } from "next/navigation";
import { sesionActual } from "@/lib/auth";
import { cerrarSesion } from "./logout/actions";
import { idLocalActual, listarLocales } from "@/lib/local-actual";
import { ideaDeLaSemana } from "@/lib/idea-semanal";
import { SelectorLocal } from "./SelectorLocal";

const LINKS = [
  { href: "/admin/pedidos", label: "Pedidos" },
  { href: "/admin/productos", label: "Productos" },
  { href: "/admin/categorias", label: "Categorías" },
  { href: "/admin/repartidores", label: "Repartidores" },
  { href: "/admin/reservas", label: "Reservas" },
  { href: "/admin/estadisticas", label: "Estadísticas" },
  { href: "/admin/analista", label: "Ideas" },
  { href: "/admin/configuracion", label: "Configuración" },
];

/** Secciones que solamente ve el superadmin. */
const LINKS_SUPERADMIN = [
  { href: "/admin/super", label: "Cartera" },
  { href: "/admin/usuarios", label: "Usuarios" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sesion = await sesionActual();
  // El middleware ya redirige si no hay cookie; esto cubre la cookie presente
  // pero inválida: firma manipulada, usuario borrado o usuario desactivado.
  if (!sesion) redirect("/admin/login");

  const esSuper = sesion.rol === "superadmin";

  // El selector solo tiene sentido para el superadmin. Para los demás el local
  // sale de su usuario, así que la lista trae uno solo y el selector no aparece.
  const locales = esSuper ? await listarLocales() : [];

  let localActualId = "";
  try {
    localActualId = await idLocalActual();
  } catch {
    // Sin locales cargados todavía: se deja pasar para que Configuración
    // pueda crear el primero.
    localActualId = "";
  }

  // Aviso de idea nueva: un punto al lado de "Ideas" hasta que el dueño entre
  // a leerla. Es la única notificación del panel, así que se gana el lugar.
  let hayIdeaSinVer = false;
  if (localActualId) {
    try {
      const idea = await ideaDeLaSemana(localActualId);
      hayIdeaSinVer = idea != null && !idea.vista;
    } catch {
      hayIdeaSinVer = false;
    }
  }

  const enlaces = esSuper ? [...LINKS, ...LINKS_SUPERADMIN] : LINKS;
  const nombreVisible = sesion.nombre?.trim() || sesion.email;

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className="font-semibold text-neutral-900">TuMenuSmart</span>
            <nav className="flex flex-wrap gap-4 text-sm font-medium text-neutral-600">
              {enlaces.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="relative hover:text-brand"
                >
                  {link.label}
                  {link.href === "/admin/analista" && hayIdeaSinVer && (
                    <span
                      className="absolute -right-2 -top-0.5 h-2 w-2 rounded-full bg-brand"
                      aria-label="Tenés una idea nueva"
                    />
                  )}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {esSuper && <SelectorLocal locales={locales} actual={localActualId} />}

            <Link
              href="/admin/mi-cuenta"
              className="text-sm text-neutral-500 hover:text-brand"
              title="Mi cuenta"
            >
              {nombreVisible}
            </Link>

            <form action={cerrarSesion}>
              <button type="submit" className="text-sm text-neutral-500 hover:text-red-600">
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6 print:max-w-none print:p-0">{children}</div>
    </div>
  );
}
