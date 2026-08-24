import Link from "next/link";
import { redirect } from "next/navigation";
import { haySesionAdminValida } from "@/lib/auth";
import { cerrarSesion } from "./logout/actions";
import { idLocalActual, listarLocales } from "@/lib/local-actual";
import { SelectorLocal } from "./SelectorLocal";

const LINKS = [
  { href: "/admin/pedidos", label: "Pedidos" },
  { href: "/admin/productos", label: "Productos" },
  { href: "/admin/categorias", label: "Categorías" },
  { href: "/admin/repartidores", label: "Repartidores" },
  { href: "/admin/reservas", label: "Reservas" },
  { href: "/admin/estadisticas", label: "Estadísticas" },
  { href: "/admin/configuracion", label: "Configuración" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const autenticado = await haySesionAdminValida();
  // El middleware ya redirige si no hay cookie; esto cubre el caso de
  // cookie presente pero con firma inválida (manipulada o vencida).
  if (!autenticado) redirect("/admin/login");

  // Con varios locales cargados hace falta saber cuál se está administrando.
  // Si todavía no hay ninguno, se deja pasar para que Configuración pueda
  // crear el primero.
  const locales = await listarLocales();
  let localActualId = "";
  try {
    localActualId = await idLocalActual();
  } catch {
    localActualId = "";
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="font-semibold text-neutral-900">TuMenuSmart</span>
            <nav className="flex gap-4 text-sm font-medium text-neutral-600">
              {LINKS.map((link) => (
                <Link key={link.href} href={link.href} className="hover:text-brand">
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <SelectorLocal locales={locales} actual={localActualId} />
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
