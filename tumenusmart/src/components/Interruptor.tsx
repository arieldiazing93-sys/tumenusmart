"use client";

const FONDOS = {
  exito: "bg-exito",
  azul: "bg-azul",
  marca: "bg-brand",
} as const;

/**
 * Un interruptor de prendido/apagado (el clásico deslizable). Es controlado:
 * quien lo usa guarda el valor y recibe el cambio en `onChange`.
 *
 * El color de prendido cambia según qué encienda: verde para "está activo",
 * azul para lo secundario, naranja para lo de la marca. Apagado siempre va gris.
 */
export function Interruptor({
  activo,
  onChange,
  etiqueta,
  tono = "exito",
  deshabilitado = false,
}: {
  activo: boolean;
  onChange: (nuevo: boolean) => void;
  /** Lo que lee un lector de pantalla: "Trabaja el lunes". */
  etiqueta: string;
  tono?: keyof typeof FONDOS;
  deshabilitado?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={deshabilitado}
      onClick={() => onChange(!activo)}
      className={`relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45 ${
        activo ? FONDOS[tono] : "bg-tinta-suave/35"
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-150 ${
          activo ? "translate-x-[1.375rem]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
