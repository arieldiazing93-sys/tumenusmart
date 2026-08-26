import Link from "next/link";

/**
 * El botón para salir de una pantalla sin perder lo que se hizo.
 *
 * Existe como componente y no como un `<Link>` suelto en cada página por dos
 * motivos. Uno: antes era texto chico gris, y el cliente que entraba a "Ver mi
 * pedido" para revisarlo no encontraba cómo seguir agregando — terminaba
 * borrando todo o cerrando la página. Dos: si cada pantalla lo escribe a su
 * manera, en tres meses hay cinco versiones distintas.
 *
 * Va en azul porque acá el azul significa "navegar". El naranja se reserva
 * para avanzar y confirmar, así el cliente distingue los dos de un vistazo
 * sin tener que leer.
 */
export function Volver({
  href,
  texto,
  className = "",
}: {
  href: string;
  texto: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 rounded-lg border border-azul/35 bg-azul-luz px-4 py-2.5 text-[0.88rem] font-semibold text-azul-oscuro transition-colors hover:border-azul hover:bg-azul hover:text-white ${className}`}
    >
      <span aria-hidden="true" className="text-base leading-none">
        ←
      </span>
      {texto}
    </Link>
  );
}

/** Atajo para las pantallas públicas, que siempre vuelven a la carta. */
export function VolverAlMenu({
  slug,
  texto = "Volver a la carta",
  className = "",
}: {
  slug: string;
  texto?: string;
  className?: string;
}) {
  return <Volver href={`/${slug}`} texto={texto} className={className} />;
}
