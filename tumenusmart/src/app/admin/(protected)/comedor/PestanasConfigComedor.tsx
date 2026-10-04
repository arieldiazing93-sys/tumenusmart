import Link from "next/link";

const PANTALLAS = [
  { clave: "mozos", href: "/admin/comedor/mozos", texto: "Mozos y enlace" },
  { clave: "mesas", href: "/admin/comedor/mesas", texto: "Mesas y sectores" },
  { clave: "reglas", href: "/admin/comedor/reglas", texto: "Reglas del mozo" },
] as const;

/**
 * Los bloques de la Configuración del servicio comedor (en Ajustes), para pasar de uno a otro sin volver al menú. Cada
 * bloque nuevo que se agregue a la configuración se suma a esta lista y al submenú de Ajustes.
 */
export function PestanasConfigComedor({ activa }: { activa: (typeof PANTALLAS)[number]["clave"] }) {
  return (
    <nav aria-label="Configuración del servicio comedor" className="flex flex-wrap items-center gap-2">
      {PANTALLAS.map((p) => (
        <Link
          key={p.clave}
          href={p.href}
          aria-current={p.clave === activa ? "page" : undefined}
          className={`rounded-full border px-3.5 py-1.5 text-[0.85rem] font-medium transition-colors ${
            p.clave === activa
              ? "border-brand bg-brand text-white"
              : "border-linea text-tinta-media hover:border-brand hover:text-brand"
          }`}
        >
          {p.texto}
        </Link>
      ))}
    </nav>
  );
}
