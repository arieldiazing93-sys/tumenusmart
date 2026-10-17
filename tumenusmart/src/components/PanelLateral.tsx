"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useCapa } from "./capas";

/**
 * Un panel que entra desde la derecha y ocupa todo el alto de la pantalla, para
 * los formularios de alta y edición (en el celular ocupa todo el ancho también).
 *
 * Se dibuja con un portal directo en <body> por el mismo motivo que el cajón del
 * menú (NavPanel): adentro del panel del admin quedaría por debajo de la barra
 * de arriba y no taparía toda la pantalla.
 *
 * Los hijos traen su propio cuerpo y su pie de botones (un <form> que ocupe el
 * alto), así el pie queda fijo abajo mientras el cuerpo se desliza. Se cierra
 * con la X, con Escape y tocando el fondo oscuro; mientras está abierto la
 * página de atrás no se mueve.
 */
/** El ancho máximo en pantallas medianas y grandes (en el celular siempre ocupa todo el ancho). */
const ANCHOS = {
  normal: "sm:max-w-[26rem]",
  // Para los paneles con más contenido, como el detalle de una cita que también cobra.
  ancho: "sm:max-w-[31rem]",
  // Para elegir entre muchas tarjetas, como la carta de productos al cargar una mesa: entran tres columnas.
  amplio: "sm:max-w-[46rem]",
} as const;

export function PanelLateral({
  titulo,
  onCerrar,
  ancho = "normal",
  compacto = false,
  encabezado,
  children,
}: {
  titulo: string;
  onCerrar: () => void;
  ancho?: keyof typeof ANCHOS;
  /** La barra de arriba más baja y con letra más chica, para dejarle más lugar al contenido. */
  compacto?: boolean;
  /**
   * Lo que va en la barra de arriba en lugar del título (por ejemplo unas pestañas), para no gastar
   * una fila más. Tiene que ocupar el alto de la barra: la X queda a la derecha. `titulo` sigue
   * siendo el nombre del panel para los lectores de pantalla.
   */
  encabezado?: ReactNode;
  children: ReactNode;
}) {
  // Escape cierra el panel solo si es la capa de arriba (con un cuadro encima, lo cierra a él y el panel sigue), y la página de atrás
  // no se mueve mientras haya algo abierto: las dos cosas, de a una para toda la pantalla (ver capas.ts).
  useCapa(onCerrar, { bloquearScroll: true });

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={titulo}>
      <button
        type="button"
        tabIndex={-1}
        aria-label="Cerrar"
        onClick={onCerrar}
        className="absolute inset-0 cursor-default bg-noche/40"
      />
      <div
        className={`absolute inset-y-0 right-0 flex w-full animate-[entrarDerecha_0.2s_ease-out] flex-col bg-superficie shadow-alta sm:border-l sm:border-linea ${ANCHOS[ancho]}`}
      >
        <div
          className={`flex flex-none justify-between border-b border-linea ${compacto ? "px-4" : "px-5"} ${
            encabezado ? "items-stretch" : compacto ? "items-center py-1.5" : "items-center py-4"
          }`}
        >
          {encabezado ?? (
            <h2
              className={`font-semibold tracking-titular text-tinta ${compacto ? "truncate text-[0.95rem]" : "text-[1.05rem]"}`}
            >
              {titulo}
            </h2>
          )}
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className={`flex flex-none items-center justify-center rounded-lg text-tinta-media transition-colors hover:bg-papel-hundido hover:text-tinta ${
              compacto ? "h-8 w-8" : "h-9 w-9"
            } ${encabezado ? "self-center" : ""}`}
          >
            <svg
              viewBox="0 0 24 24"
              width={18}
              height={18}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
