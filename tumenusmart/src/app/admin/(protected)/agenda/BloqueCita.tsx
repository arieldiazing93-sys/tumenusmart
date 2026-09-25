import type { ReactNode } from "react";

/**
 * Las piezas visuales del detalle de la cita: tarjetas con su propio color y un
 * conmutador de dos opciones. Cada tarjeta lleva el color de lo que trata (el cliente
 * en violeta, el día y la hora en celeste, los servicios en rosa, el cobro en verde)
 * para ubicarse de un vistazo.
 *
 * Las clases van completas: Tailwind solo genera las que ve escritas.
 */

const TONOS = {
  violeta: {
    tarjeta: "border-violet-200 border-t-violet-400",
    icono: "bg-violet-100 text-violet-600",
  },
  cielo: {
    tarjeta: "border-sky-200 border-t-sky-400",
    icono: "bg-sky-100 text-sky-600",
  },
  rosa: {
    tarjeta: "border-pink-200 border-t-pink-400",
    icono: "bg-pink-100 text-pink-600",
  },
  esmeralda: {
    tarjeta: "border-emerald-200 border-t-emerald-400",
    icono: "bg-emerald-100 text-emerald-600",
  },
  ambar: {
    tarjeta: "border-amber-200 border-t-amber-400",
    icono: "bg-amber-100 text-amber-600",
  },
} as const;

export type TonoBloque = keyof typeof TONOS;

/**
 * Una tarjeta del detalle: título con su ícono de color, y el contenido. Entra
 * deslizándose; `retraso` (en milisegundos) hace que las tarjetas entren una tras otra.
 */
export function BloqueCita({
  titulo,
  icono,
  tono,
  retraso = 0,
  children,
}: {
  titulo: string;
  icono: ReactNode;
  tono: TonoBloque;
  retraso?: number;
  children: ReactNode;
}) {
  const t = TONOS[tono];
  return (
    <section
      className={`animate-deslizar rounded-2xl border border-t-[3px] bg-superficie p-4 shadow-sm transition-shadow duration-200 hover:shadow-md ${t.tarjeta}`}
      style={{ animationDelay: `${retraso}ms` }}
    >
      <div className="mb-3 flex items-center gap-2.5">
        <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-xl ${t.icono}`}>{icono}</span>
        <h3 className="text-[0.95rem] font-semibold tracking-titular text-tinta">{titulo}</h3>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

const ACENTOS = {
  indigo: "bg-superficie text-indigo-700 shadow-md ring-1 ring-indigo-200",
  esmeralda: "bg-superficie text-emerald-700 shadow-md ring-1 ring-emerald-200",
  ambar: "bg-superficie text-amber-700 shadow-md ring-1 ring-amber-200",
} as const;

/** Dos o tres opciones en fila, la elegida resaltada con su color (Ticket / Factura, % / Gs.). */
export function Conmutador<T extends string>({
  opciones,
  valor,
  onChange,
  acento = "indigo",
  etiqueta,
}: {
  opciones: { value: T; label: string }[];
  valor: T;
  onChange: (v: T) => void;
  acento?: keyof typeof ACENTOS;
  etiqueta: string;
}) {
  return (
    <div role="group" aria-label={etiqueta} className="flex gap-1 rounded-xl bg-papel-hundido p-1">
      {opciones.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === valor}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg px-3 py-2 text-[0.84rem] font-semibold transition-all duration-200 active:scale-95 ${
            o.value === valor ? ACENTOS[acento] : "text-tinta-media hover:bg-superficie/70 hover:text-tinta"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
