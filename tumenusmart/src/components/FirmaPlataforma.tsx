import Link from "next/link";

const TAMANOS = {
  chico: "text-[0.74rem]",
  medio: "text-[0.8rem]",
} as const;

/**
 * La firma de la plataforma, al pie de las pantallas públicas (el menú, el pedido, el pago, las reservas de turnos y de canchas).
 *
 * Todo el texto va en negrita y «tumenusmart.com» es un enlace subrayado y más oscuro que el resto, para que se vea que se puede tocar:
 * lleva a la página principal. Se abre en otra pestaña a propósito: quien está armando un pedido no tiene que perder lo que cargó si toca
 * el enlace sin querer.
 *
 * Una sola pieza para todas las pantallas (antes cada una tenía su copia). Tipografía monoespaciada y mayúsculas; el `-mr` compensa el
 * espacio que `tracking` agrega después de la última letra, para que el texto quede centrado de verdad.
 */
export function FirmaPlataforma({ className = "mt-12", tam = "chico" }: { className?: string; tam?: keyof typeof TAMANOS }) {
  return (
    <p className={`text-center ${className}`}>
      <span
        className={`-mr-[0.14em] inline-block py-1.5 font-mono font-bold uppercase leading-tight tracking-[0.14em] text-tinta-media ${TAMANOS[tam]}`}
      >
        Desarrollado por{" "}
        <Link
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          title="Ir a la página principal de tumenusmart.com"
          className="font-bold text-tinta underline decoration-2 underline-offset-4 transition-colors hover:text-brand"
        >
          tumenusmart.com
        </Link>
      </span>
    </p>
  );
}
