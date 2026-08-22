import Link from "next/link";
import { redirect } from "next/navigation";
import { haySesionAdminValida } from "@/lib/auth";
import { cerrarSesion } from "./logout/actions";

const LINKS = [
  { href: "/admin/pedidos", label: "Pedidos" },
  { href: "/admin/productos", label: "Productos" },
  { href: "/admin/categorias", label: "Categorías" },
  { href: "/admin/repartidores", label: "Repartidores" },
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

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
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
          <form action={cerrarSesion}>
            <button type="submit" className="text-sm text-neutral-500 hover:text-red-600">
              Cerrar sesión
            </button>
          </form>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}
