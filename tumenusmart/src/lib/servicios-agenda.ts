/**
 * Los servicios de la Reserva de turnos (un corte, una barba, un color…).
 *
 * Un servicio es un Product con `esServicio = true`, así que se vende en el
 * punto de venta y se factura como cualquier producto — con su IVA y como
 * "prestación de servicios" en la factura electrónica. Lo propio de la agenda
 * (duración, búfer, color, quién lo realiza) vive en ServicioAgenda.
 *
 * Puro (sin Prisma): lo usan el formulario del navegador y las acciones del
 * servidor, para que lo que uno muestra y el otro valida digan siempre lo mismo.
 */

/** Un servicio como lo muestra la pantalla de Servicios. */
export type ServicioFila = {
  /** El id de ServicioAgenda (no el del producto). */
  id: string;
  productId: string;
  categoryId: string;
  nombre: string;
  precio: number;
  /** "gravado10" | "gravado5" | "exento" */
  iva: string;
  /** false = dejó de ofrecerse, pero se conserva (tiene ventas). */
  activo: boolean;
  duracionMin: number;
  bufferMin: number;
  tipoPrecio: TipoPrecio;
  color: string;
  /** Ids de los miembros del personal que lo realizan. */
  personalIds: string[];
};

/** Un miembro del personal como se ofrece para elegir quién realiza un servicio. */
export type PersonalOpcion = {
  id: string;
  /** Nombre y apellido. */
  nombre: string;
  fotoUrl: string | null;
  activo: boolean;
};

// ---------------------------------------------------------------------------
//  Precio
// ---------------------------------------------------------------------------

export type TipoPrecio = "fijo" | "desde";

export const TIPOS_PRECIO: { valor: TipoPrecio; etiqueta: string }[] = [
  { valor: "fijo", etiqueta: "Fijo" },
  { valor: "desde", etiqueta: "Desde" },
];

export function normalizarTipoPrecio(valor: unknown): TipoPrecio {
  return valor === "desde" ? "desde" : "fijo";
}

// ---------------------------------------------------------------------------
//  Duración y búfer
// ---------------------------------------------------------------------------

/** Lo máximo que puede durar un servicio: 12 horas. */
export const DURACION_MAXIMA_MIN = 12 * 60;

/** Las horas y los minutos que se pueden elegir en el formulario (los minutos, de a 5). */
export const HORAS_DURACION = Array.from({ length: 13 }, (_, i) => i);
export const MINUTOS_DURACION = Array.from({ length: 12 }, (_, i) => i * 5);

/** Los minutos de búfer que se ofrecen. */
export const MINUTOS_BUFER = [5, 10, 15, 20, 30, 45, 60] as const;

/** 100 → { horas: 1, minutos: 40 }. */
export function partirDuracion(minutosTotales: number): { horas: number; minutos: number } {
  return { horas: Math.floor(minutosTotales / 60), minutos: minutosTotales % 60 };
}

/** 40 → "40 min", 60 → "1 h", 100 → "1 h 40 min". */
export function textoDuracion(minutosTotales: number): string {
  const { horas, minutos } = partirDuracion(minutosTotales);
  if (horas === 0) return `${minutos} min`;
  return minutos === 0 ? `${horas} h` : `${horas} h ${minutos} min`;
}

// ---------------------------------------------------------------------------
//  Color
// ---------------------------------------------------------------------------

export const COLOR_POR_DEFECTO = "#3B82F6";

/** Los colores que se ofrecen de una: sirven para reconocer cada servicio de un vistazo. */
export const COLORES_SERVICIO = [
  "#3B82F6", // azul
  "#06B6D4", // turquesa
  "#10B981", // verde
  "#84CC16", // lima
  "#F59E0B", // ámbar
  "#F97316", // naranja
  "#EF4444", // rojo
  "#EC4899", // rosa
  "#8B5CF6", // violeta
  "#64748B", // gris azulado
] as const;

/** Un "#RRGGBB" válido, o el color por defecto. */
export function normalizarColor(valor: unknown): string {
  const texto = String(valor ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(texto) ? texto.toUpperCase() : COLOR_POR_DEFECTO;
}
