import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Las piezas del panel.
 *
 * Están todas acá por un motivo concreto: antes cada pantalla escribía sus
 * propios botones y tarjetas a mano, y ya había cinco botones distintos que
 * hacían lo mismo. Con las piezas en un solo archivo, arreglar el foco o el
 * contraste una vez lo arregla en las veintiséis pantallas.
 *
 * El panel es una herramienta de trabajo, no una página de venta: la densidad
 * es alta, el texto chico pero legible, y las animaciones cortas. Quien lo usa
 * está con la cocina llena y no tiene tiempo de mirar transiciones.
 */

// ===========================================================================
//  Botón
// ===========================================================================

type Tono = "principal" | "suave" | "navegar" | "peligro" | "fantasma";

const TONOS: Record<Tono, string> = {
  // Naranja: avanzar, guardar, confirmar. Uno por pantalla, no más.
  principal:
    "bg-brand text-white hover:bg-brand-dark focus-visible:outline-brand-dark",
  // Lo mismo pero sin gritar, para acciones secundarias frecuentes.
  suave:
    "border border-linea bg-white text-tinta hover:border-brand hover:text-brand",
  // Azul: volver, ir a otro lado. Nunca confirma nada.
  navegar:
    "border border-azul/35 bg-azul-luz text-azul-oscuro hover:border-azul hover:bg-azul hover:text-white",
  peligro:
    "border border-peligro/30 bg-peligro-luz text-peligro hover:bg-peligro hover:text-white",
  fantasma: "text-tinta-media hover:bg-papel-hundido hover:text-tinta",
};

const TAMANOS = {
  sm: "h-8 px-3 text-[0.82rem]",
  md: "h-10 px-4 text-[0.88rem]",
  lg: "h-12 px-6 text-[0.95rem]",
} as const;

const BASE_BOTON =
  "inline-flex flex-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold " +
  "transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] " +
  "disabled:pointer-events-none disabled:opacity-45";

export function clasesBoton(tono: Tono = "principal", tam: keyof typeof TAMANOS = "md") {
  return `${BASE_BOTON} ${TAMANOS[tam]} ${TONOS[tono]}`;
}

export function Boton({
  tono = "principal",
  tam = "md",
  className = "",
  ...resto
}: {
  tono?: Tono;
  tam?: keyof typeof TAMANOS;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...resto} className={`${clasesBoton(tono, tam)} ${className}`} />;
}

export function BotonEnlace({
  href,
  tono = "principal",
  tam = "md",
  className = "",
  children,
}: {
  href: string;
  tono?: Tono;
  tam?: keyof typeof TAMANOS;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`${clasesBoton(tono, tam)} ${className}`}>
      {children}
    </Link>
  );
}

// ===========================================================================
//  Cabecera de pantalla
// ===========================================================================

/**
 * El título de cada sección, con su explicación y sus acciones a la derecha.
 *
 * La bajada no es decorativa: es donde se dice para qué sirve la pantalla, y
 * evita la mitad de las preguntas en la capacitación.
 */
export function Cabecera({
  titulo,
  bajada,
  acciones,
}: {
  titulo: string;
  bajada?: ReactNode;
  acciones?: ReactNode;
}) {
  return (
    <header className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2.5 border-b border-linea pb-3">
      <div className="min-w-0">
        <h1 className="text-[1.3rem] font-semibold tracking-titular text-tinta">{titulo}</h1>
        {bajada && (
          <p className="mt-0.5 max-w-2xl text-[0.83rem] leading-snug text-tinta-media">{bajada}</p>
        )}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </header>
  );
}

// ===========================================================================
//  Superficies
// ===========================================================================

export function Tarjeta({
  children,
  className = "",
  padding = true,
}: {
  children: ReactNode;
  className?: string;
  padding?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-linea bg-white ${padding ? "p-4" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

/** Un número grande con su rótulo. Para las cifras de arriba de una pantalla. */
export function Cifra({
  valor,
  rotulo,
  detalle,
}: {
  valor: ReactNode;
  rotulo: string;
  detalle?: string;
}) {
  return (
    <div className="rounded-xl border border-linea bg-white px-4 py-3.5">
      <p className="rotulo">{rotulo}</p>
      <p className="cifra mt-1.5 text-[1.5rem] font-semibold leading-none text-tinta">{valor}</p>
      {detalle && <p className="mt-1.5 text-[0.76rem] text-tinta-suave">{detalle}</p>}
    </div>
  );
}

/**
 * Lo que se muestra cuando todavía no hay nada.
 *
 * Una lista vacía sin explicación se lee como algo roto. Acá siempre se dice
 * qué falta y cuál es el próximo paso.
 */
export function Vacio({
  titulo,
  detalle,
  accion,
}: {
  titulo: string;
  detalle?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-linea bg-papel-suave px-6 py-12 text-center">
      <p className="text-[0.95rem] font-semibold tracking-titular text-tinta">{titulo}</p>
      {detalle && (
        <p className="mx-auto mt-1.5 max-w-md text-[0.85rem] leading-snug text-tinta-media">
          {detalle}
        </p>
      )}
      {accion && <div className="mt-4 flex justify-center">{accion}</div>}
    </div>
  );
}

// ===========================================================================
//  Estado
// ===========================================================================

type ColorEstado = "neutro" | "exito" | "aviso" | "peligro" | "marca" | "azul";

const ESTADOS: Record<ColorEstado, string> = {
  neutro: "bg-papel-hundido text-tinta-media",
  exito: "bg-exito-luz text-exito",
  aviso: "bg-aviso-luz text-aviso",
  peligro: "bg-peligro-luz text-peligro",
  marca: "bg-brand-light text-brand-texto",
  azul: "bg-azul-luz text-azul-oscuro",
};

/** Etiqueta de estado: "Pendiente", "Entregado", "Vencido". */
export function Pastilla({
  children,
  color = "neutro",
  punto = false,
}: {
  children: ReactNode;
  color?: ColorEstado;
  punto?: boolean;
}) {
  return (
    <span
      className={`inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[0.74rem] font-semibold ${ESTADOS[color]}`}
    >
      {punto && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** Cartel de aviso dentro de una pantalla. */
export function Aviso({
  titulo,
  children,
  color = "aviso",
}: {
  titulo?: string;
  children: ReactNode;
  color?: Exclude<ColorEstado, "neutro">;
}) {
  const bordes: Record<string, string> = {
    exito: "border-exito/25 bg-exito-luz",
    aviso: "border-aviso/25 bg-aviso-luz",
    peligro: "border-peligro/25 bg-peligro-luz",
    marca: "border-brand/25 bg-brand-light",
    azul: "border-azul/25 bg-azul-luz",
  };
  const tintas: Record<string, string> = {
    exito: "text-exito",
    aviso: "text-aviso",
    peligro: "text-peligro",
    marca: "text-brand-texto",
    azul: "text-azul-oscuro",
  };
  return (
    <div className={`rounded-xl border p-4 ${bordes[color]}`}>
      {titulo && (
        <p className={`text-[0.9rem] font-semibold tracking-titular ${tintas[color]}`}>{titulo}</p>
      )}
      <div className="mt-1 text-[0.85rem] leading-relaxed text-tinta-media">{children}</div>
    </div>
  );
}

// ===========================================================================
//  Formularios
// ===========================================================================

const BASE_CAMPO =
  "w-full rounded-lg border border-linea bg-white px-3 py-2.5 text-[0.88rem] text-tinta " +
  "transition-colors duration-150 placeholder:text-tinta-suave " +
  "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15 " +
  "disabled:bg-papel-hundido disabled:text-tinta-suave";

export const clasesCampo = BASE_CAMPO;

/** Etiqueta + campo + ayuda, siempre en el mismo orden y con el mismo aire. */
export function Campo({
  etiqueta,
  ayuda,
  children,
  className = "",
}: {
  etiqueta: string;
  ayuda?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[0.82rem] font-semibold text-tinta">{etiqueta}</span>
      {ayuda && <span className="mb-1.5 block text-[0.78rem] text-tinta-suave">{ayuda}</span>}
      {children}
    </label>
  );
}

export function Entrada(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...resto } = props;
  return <input {...resto} className={`${BASE_CAMPO} ${className}`} />;
}

export function Area(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...resto } = props;
  return <textarea {...resto} className={`${BASE_CAMPO} ${className}`} />;
}

export function Selector(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", ...resto } = props;
  return <select {...resto} className={`${BASE_CAMPO} ${className}`} />;
}

// ===========================================================================
//  Tablas
// ===========================================================================

/**
 * Envoltura de tabla que se desplaza sola cuando no entra.
 *
 * Sin esto, una tabla ancha en el celular estira la página entera y todo el
 * panel queda corrido para el costado.
 */
export function Tabla({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-linea bg-white">
      <table className="w-full min-w-[34rem] border-collapse text-left">{children}</table>
    </div>
  );
}

export function Th({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`border-b border-linea px-3.5 py-2.5 text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className = "",
  colSpan,
}: {
  children: ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`border-b border-linea-fina px-3.5 py-3 align-middle text-[0.86rem] text-tinta-media ${className}`}
    >
      {children}
    </td>
  );
}

/** Fila con realce al pasar por encima, para listas largas. */
export function Tr({ children }: { children: ReactNode }) {
  return (
    <tr className="transition-colors duration-100 last:[&>td]:border-0 hover:bg-papel-suave">
      {children}
    </tr>
  );
}
