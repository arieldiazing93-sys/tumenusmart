/**
 * El rubro de un local, tal como se elige en Cartera al darlo de alta.
 *
 * Es solo para la cartera de TuMenuSmart (saber qué tipo de clientes hay); no
 * cambia nada de cómo funciona el local. Se guarda la `clave`, no la etiqueta,
 * para poder corregir un texto sin tocar los datos ya guardados.
 *
 * Archivo sin Prisma a propósito: lo importan tanto pantallas de servidor como
 * componentes de cliente.
 */
export const TIPOS_DE_NEGOCIO = [
  { clave: "comidas_rapidas", etiqueta: "Comidas rápidas" },
  { clave: "barberia_peluqueria", etiqueta: "Barbería y peluquería" },
  { clave: "salon_belleza", etiqueta: "Salón de belleza" },
  { clave: "taller", etiqueta: "Taller" },
  { clave: "heladeria", etiqueta: "Heladería" },
  { clave: "bodega", etiqueta: "Bodega" },
  { clave: "veterinaria", etiqueta: "Veterinaria" },
] as const;

export type ClaveTipoNegocio = (typeof TIPOS_DE_NEGOCIO)[number]["clave"];

/** ¿Es una clave que existe? Sirve para no guardar lo que mande el navegador tal cual. */
export function esTipoNegocio(valor: string): valor is ClaveTipoNegocio {
  return TIPOS_DE_NEGOCIO.some((t) => t.clave === valor);
}

/** El texto para mostrar, o null si el local todavía no tiene tipo (o la clave es desconocida). */
export function etiquetaTipoNegocio(clave: string | null | undefined): string | null {
  if (!clave) return null;
  return TIPOS_DE_NEGOCIO.find((t) => t.clave === clave)?.etiqueta ?? null;
}
