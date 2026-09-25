import type { ReactNode } from "react";

/**
 * Los íconos de las tarjetas del detalle de la cita: chicos, de línea, del color del
 * texto que los rodea (`currentColor`).
 */

function Trazo({ children, tam }: { children: ReactNode; tam: number }) {
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
      className="flex-none"
    >
      {children}
    </svg>
  );
}

type Tam = { tam?: number };

export const IconoPersona = ({ tam = 16 }: Tam) => (
  <Trazo tam={tam}>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </Trazo>
);

export const IconoCalendarioHora = ({ tam = 16 }: Tam) => (
  <Trazo tam={tam}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </Trazo>
);

export const IconoTijera = ({ tam = 16 }: Tam) => (
  <Trazo tam={tam}>
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12" />
  </Trazo>
);

export const IconoBillete = ({ tam = 16 }: Tam) => (
  <Trazo tam={tam}>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M6 12h.01M18 12h.01" />
  </Trazo>
);
