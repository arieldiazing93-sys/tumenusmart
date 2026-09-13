"use client";

import { useState } from "react";
import { IconoOjo, IconoOjoCerrado } from "./iconos";

/**
 * Un <input type="password"> con el ojito para mostrar/ocultar lo que se
 * escribió — ningún navegador lo agrega solo en todos los casos, así que si
 * hace falta, hay que ponerlo. Recibe las mismas props que un input
 * cualquiera (className incluida), así reemplaza a un input de contraseña
 * sin tener que retocar los estilos de alrededor.
 */
export function CampoContrasena({
  className = "",
  ...resto
}: React.InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input {...resto} type={visible ? "text" : "password"} className={`pr-10 ${className}`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        // No participa del orden de tabulación del formulario: es un atajo
        // visual, no un campo — Tab tiene que ir de una contraseña a la
        // siguiente, no pasar por este botón en el medio.
        tabIndex={-1}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-tinta-suave hover:text-tinta-media"
      >
        {visible ? <IconoOjoCerrado /> : <IconoOjo />}
      </button>
    </div>
  );
}
