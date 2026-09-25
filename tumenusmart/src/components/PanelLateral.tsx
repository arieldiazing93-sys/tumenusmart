"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

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
} as const;

export function PanelLateral({
  titulo,
  onCerrar,
  ancho = "normal",
  sinCabecera = false,
  children,
}: {
  titulo: string;
  onCerrar: () => void;
  ancho?: keyof typeof ANCHOS;
  /**
   * Sin la barra de título y la X de siempre: el contenido trae la suya (el detalle de
   * la cita tiene una cabecera de color con su propia X). Escape y el fondo oscuro
   * siguen cerrando el panel.
   */
  sinCabecera?: boolean;
  children: ReactNode;
}) {
  // Se guarda la función más reciente para no rearmar los listeners en cada
  // render de quien abre el panel.
  const cerrar = useRef(onCerrar);
  useEffect(() => {
    cerrar.current = onCerrar;
  });

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar.current();
    };
    window.addEventListener("keydown", alTeclear);

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = overflowAnterior;
    };
  }, []);

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
        {!sinCabecera && (
          <div className="flex flex-none items-center justify-between border-b border-linea px-5 py-4">
            <h2 className="text-[1.05rem] font-semibold tracking-titular text-tinta">{titulo}</h2>
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-tinta-media transition-colors hover:bg-papel-hundido hover:text-tinta"
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
        )}
        {children}
      </div>
    </div>,
    document.body
  );
}
