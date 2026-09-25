import type { ReactNode } from "react";

/**
 * Iconos de redes sociales y de contacto para la página pública de reservas y
 * su editor. Van de línea (currentColor) como los demás del panel, así toman el
 * color del texto o del botón donde se pongan.
 */

type Props = { tam?: number; className?: string };

function Svg({ tam = 20, className = "", children }: Props & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={tam}
      height={tam}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`flex-none ${className}`}
    >
      {children}
    </svg>
  );
}

export const IconoInstagram = (p: Props) => (
  <Svg {...p}>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
  </Svg>
);

export const IconoFacebook = (p: Props) => (
  <Svg {...p}>
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </Svg>
);

export const IconoTiktok = (p: Props) => (
  <Svg {...p}>
    <path d="M15 3v10.5a4.5 4.5 0 1 1-4.5-4.5" />
    <path d="M15 3c0 2.8 2.2 5 5 5" />
  </Svg>
);

export const IconoTelefono = (p: Props) => (
  <Svg {...p}>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
  </Svg>
);

export const IconoCorreo = (p: Props) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </Svg>
);

export const IconoCompartir = (p: Props) => (
  <Svg {...p}>
    <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
    <path d="M16 6l-4-4-4 4" />
    <path d="M12 2v13" />
  </Svg>
);

export const IconoReloj = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);

export const IconoCamara = (p: Props) => (
  <Svg {...p}>
    <path d="M4 8a2 2 0 0 1 2-2h1.5l1.2-1.6A2 2 0 0 1 10.3 4h3.4a2 2 0 0 1 1.6.8L16.5 6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
    <circle cx="12" cy="12.5" r="3.5" />
  </Svg>
);
