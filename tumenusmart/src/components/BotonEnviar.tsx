"use client";

import type { ReactNode } from "react";
import { clasesBoton } from "./ui";

/**
 * El botón de enviar un formulario público (checkout, reservas).
 *
 * Antes el único indicio de que algo estaba pasando era que el texto cambiaba
 * a "Generando pedido...". Acá se le suma un spinner, porque en una conexión
 * lenta un cliente que no ve nada moverse vuelve a tocar el botón.
 */
export function BotonEnviar({
  enviando,
  disabled = false,
  children,
  enviandoTexto = "Enviando...",
  className = "",
  tam = "lg",
}: {
  enviando: boolean;
  disabled?: boolean;
  enviandoTexto?: string;
  children: ReactNode;
  className?: string;
  tam?: "sm" | "md" | "lg";
}) {
  return (
    <button
      type="submit"
      disabled={enviando || disabled}
      className={`${clasesBoton("principal", tam)} ${className}`}
    >
      {enviando && (
        <span
          aria-hidden="true"
          className="h-4 w-4 flex-none animate-[girar_0.6s_linear_infinite] rounded-full border-2 border-white/35 border-t-white"
        />
      )}
      {enviando ? enviandoTexto : children}
    </button>
  );
}
