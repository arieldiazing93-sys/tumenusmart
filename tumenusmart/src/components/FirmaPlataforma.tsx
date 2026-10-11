import Link from "next/link";

/** La firma de la plataforma, al pie de las pantallas públicas (el menú, el pedido, el pago). */
export function FirmaPlataforma({ className = "mt-12" }: { className?: string }) {
  return (
    <p className={`text-center ${className}`}>
      <Link
        href="/"
        className="-mr-[0.14em] inline-block py-1.5 font-mono text-[0.74rem] font-semibold uppercase leading-tight tracking-[0.14em] text-tinta-suave transition-colors hover:text-tinta hover:underline"
      >
        Desarrollado por tumenusmart.com
      </Link>
    </p>
  );
}
