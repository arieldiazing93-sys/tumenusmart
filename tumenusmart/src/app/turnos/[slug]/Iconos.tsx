import type { ReactNode } from "react";

/**
 * Los iconos de la página de reservas y de su asistente. Dibujados acá para no sumar ninguna librería: mismo trazo
 * redondeado, sin relleno, y toman el color del texto que los rodea.
 */
function Base({ tam, className = "", children }: { tam: number; className?: string; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={tam}
      height={tam}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`flex-none ${className}`}
    >
      {children}
    </svg>
  );
}

type Props = { tam?: number; className?: string };

export function IconoReloj({ tam = 16, className }: Props) {
  return (
    <Base tam={tam} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Base>
  );
}

export function IconoCalendario({ tam = 18, className }: Props) {
  return (
    <Base tam={tam} className={className}>
      <rect x="3" y="4" width="18" height="18" rx="3" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </Base>
  );
}

export function IconoCheck({ tam = 16, className }: Props) {
  return (
    <Base tam={tam} className={className}>
      <path d="M20 6 9 17l-5-5" />
    </Base>
  );
}

export function IconoChevron({ tam = 18, className }: Props) {
  return (
    <Base tam={tam} className={className}>
      <path d="m6 9 6 6 6-6" />
    </Base>
  );
}

export function IconoAtras({ tam = 20, className }: Props) {
  return (
    <Base tam={tam} className={className}>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </Base>
  );
}

export function IconoBuscar({ tam = 18, className }: Props) {
  return (
    <Base tam={tam} className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </Base>
  );
}
