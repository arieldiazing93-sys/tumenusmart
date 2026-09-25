import type { ReactNode } from "react";

/**
 * Los íconos de la Agenda: chicos, de línea, del color del texto que los rodea
 * (`currentColor`), así el mismo dibujo sirve sobre cualquier fondo.
 */

function Trazo({ children, tam = 16, grosor = 2 }: { children: ReactNode; tam?: number; grosor?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={tam}
      height={tam}
      fill="none"
      stroke="currentColor"
      strokeWidth={grosor}
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

/** El ícono de cada estado del turno: reloj (pendiente), flecha (próxima), tilde, cruz y prohibido. */
export function IconoEstado({ estado, tam = 12 }: { estado: string; tam?: number }) {
  switch (estado) {
    case "proxima":
      return (
        <Trazo tam={tam} grosor={2.6}>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </Trazo>
      );
    case "finalizada":
      return (
        <Trazo tam={tam} grosor={3}>
          <path d="M20 6 9 17l-5-5" />
        </Trazo>
      );
    case "cancelada":
      return (
        <Trazo tam={tam} grosor={3}>
          <path d="M18 6 6 18M6 6l12 12" />
        </Trazo>
      );
    case "no_asistio":
      return (
        <Trazo tam={tam} grosor={2.6}>
          <circle cx="12" cy="12" r="9" />
          <path d="m5.6 5.6 12.8 12.8" />
        </Trazo>
      );
    default:
      // pendiente
      return (
        <Trazo tam={tam} grosor={2.6}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </Trazo>
      );
  }
}

export const IconoPersona = ({ tam = 18 }: Tam) => (
  <Trazo tam={tam}>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </Trazo>
);

export const IconoEquipo = ({ tam = 18 }: Tam) => (
  <Trazo tam={tam}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </Trazo>
);

export const IconoCalendarioHora = ({ tam = 18 }: Tam) => (
  <Trazo tam={tam}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </Trazo>
);

export const IconoTijera = ({ tam = 18 }: Tam) => (
  <Trazo tam={tam}>
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12" />
  </Trazo>
);

export const IconoBillete = ({ tam = 18 }: Tam) => (
  <Trazo tam={tam}>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M6 12h.01M18 12h.01" />
  </Trazo>
);

export const IconoBanco = ({ tam = 18 }: Tam) => (
  <Trazo tam={tam}>
    <path d="m12 3 9 5H3z" />
    <path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18" />
  </Trazo>
);

export const IconoTarjeta = ({ tam = 18 }: Tam) => (
  <Trazo tam={tam}>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M2 10h20M6 15h4" />
  </Trazo>
);

export const IconoEtiqueta = ({ tam = 18 }: Tam) => (
  <Trazo tam={tam}>
    <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
    <circle cx="7" cy="7" r="1.4" />
  </Trazo>
);

export const IconoRecibo = ({ tam = 18 }: Tam) => (
  <Trazo tam={tam}>
    <path d="M4 2v20l3-2 3 2 3-2 3 2 3-2V2z" />
    <path d="M8 7h8M8 12h8" />
  </Trazo>
);

export const IconoCerrar = ({ tam = 18 }: Tam) => (
  <Trazo tam={tam}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Trazo>
);

export const IconoTilde = ({ tam = 18 }: Tam) => (
  <Trazo tam={tam} grosor={3}>
    <path d="M20 6 9 17l-5-5" />
  </Trazo>
);

export const IconoLapiz = ({ tam = 16 }: Tam) => (
  <Trazo tam={tam} grosor={2.4}>
    <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
  </Trazo>
);

export const IconoMas = ({ tam = 16 }: Tam) => (
  <Trazo tam={tam} grosor={2.6}>
    <path d="M12 5v14M5 12h14" />
  </Trazo>
);
