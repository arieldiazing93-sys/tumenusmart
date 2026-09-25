import type { ReactNode } from "react";

/**
 * Las tarjetas del detalle de la cita: fondo blanco, borde suave y un ícono azul claro
 * junto al título. Sin más color que ese: lo que destaca son los datos.
 */
export function BloqueCita({
  titulo,
  icono,
  retraso = 0,
  children,
}: {
  titulo: string;
  icono: ReactNode;
  /** Milisegundos que espera para entrar (las tarjetas entran una tras otra). */
  retraso?: number;
  children: ReactNode;
}) {
  return (
    <section
      className="animate-deslizar rounded-xl border border-linea bg-superficie p-4 shadow-sm"
      style={{ animationDelay: `${retraso}ms` }}
    >
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-azul-luz text-azul">
          {icono}
        </span>
        <h3 className="text-[0.95rem] font-semibold tracking-titular text-tinta">{titulo}</h3>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

/** Dos opciones en fila, la elegida resaltada en azul (Ticket / Factura, % / Gs.). */
export function Conmutador<T extends string>({
  opciones,
  valor,
  onChange,
  etiqueta,
}: {
  opciones: { value: T; label: string }[];
  valor: T;
  onChange: (v: T) => void;
  etiqueta: string;
}) {
  return (
    <div role="group" aria-label={etiqueta} className="flex gap-1 rounded-lg bg-papel-hundido p-1">
      {opciones.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === valor}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-md px-3 py-2 text-[0.84rem] font-semibold transition-colors duration-150 ${
            o.value === valor
              ? "bg-superficie text-azul-oscuro shadow-sm ring-1 ring-azul/25"
              : "text-tinta-media hover:text-tinta"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
