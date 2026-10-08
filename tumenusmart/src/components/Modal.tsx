"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Las ventanas abiertas ahora, de la más vieja a la más nueva: Escape solo le hace caso a la última. */
const ventanasAbiertas: object[] = [];

/**
 * Una ventana centrada con un velo oscuro detrás, para formularios cortos (un
 * nombre, una confirmación). Para formularios largos se usa el PanelLateral.
 *
 * Se dibuja con un portal directo en <body>, igual que el panel lateral y el
 * cajón del menú: adentro del panel del admin quedaría por debajo de la barra de
 * arriba. Se cierra con la X, con Escape y tocando el fondo; mientras está
 * abierta la página de atrás no se mueve.
 */
export function Modal({
  titulo,
  onCerrar,
  children,
}: {
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
}) {
  // Se guarda la función más reciente para no rearmar los listeners en cada
  // render de quien abre la ventana.
  const cerrar = useRef(onCerrar);
  useEffect(() => {
    cerrar.current = onCerrar;
  });

  useEffect(() => {
    // Con una ventana abierta encima de otra (el cuadro de la contraseña sobre el de un descuento), Escape cierra solo la de arriba.
    const yo = {};
    ventanasAbiertas.push(yo);
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape" && ventanasAbiertas[ventanasAbiertas.length - 1] === yo) cerrar.current();
    };
    window.addEventListener("keydown", alTeclear);

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", alTeclear);
      const lugar = ventanasAbiertas.indexOf(yo);
      if (lugar >= 0) ventanasAbiertas.splice(lugar, 1);
      document.body.style.overflow = overflowAnterior;
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={titulo}>
      <button
        type="button"
        tabIndex={-1}
        aria-label="Cerrar"
        onClick={onCerrar}
        className="absolute inset-0 cursor-default bg-noche/50"
      />
      <div className="relative w-full max-w-md rounded-xl border border-linea bg-superficie p-5 shadow-alta">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[1.05rem] font-semibold tracking-titular text-tinta">{titulo}</h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-tinta-media transition-colors hover:bg-papel-hundido hover:text-tinta"
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
