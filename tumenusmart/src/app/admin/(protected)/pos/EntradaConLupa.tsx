"use client";

import type { InputHTMLAttributes } from "react";
import { Entrada } from "@/components/ui";

/**
 * Un campo de búsqueda con la lupa adentro.
 *
 * En la computadora alcanzaba con apretar Enter, pero el teclado del celular
 * no siempre tiene esa tecla (el de números, por ejemplo, no la trae): sin un
 * botón, desde el teléfono no había forma de buscar. La lupa es un botón real
 * y hace lo mismo que Enter; además el teclado, cuando puede, muestra su tecla
 * de "buscar" (`enterKeyHint`).
 */
export function EntradaConLupa({
  onBuscar,
  buscando = false,
  etiquetaBoton = "Buscar",
  className = "",
  onKeyDown,
  ...campo
}: InputHTMLAttributes<HTMLInputElement> & {
  /** Lo que se hace al tocar la lupa o apretar Enter. */
  onBuscar: () => void;
  /** Mientras busca, la lupa no se puede volver a tocar. */
  buscando?: boolean;
  /** Lo que lee un lector de pantalla y lo que aparece al dejar el mouse encima. */
  etiquetaBoton?: string;
}) {
  const vacio = String(campo.value ?? "").trim() === "";

  return (
    <div className="relative">
      <Entrada
        {...campo}
        enterKeyHint="search"
        // Lugar a la derecha para que el texto no quede debajo de la lupa.
        className={`pr-10 ${className}`}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (e.key !== "Enter") return;
          e.preventDefault();
          if (!vacio && !buscando) onBuscar();
        }}
      />
      <button
        type="button"
        onClick={onBuscar}
        disabled={buscando || vacio}
        aria-label={etiquetaBoton}
        title={etiquetaBoton}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-tinta-media transition-colors hover:text-brand focus-visible:text-brand disabled:pointer-events-none disabled:opacity-40"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
      </button>
    </div>
  );
}
