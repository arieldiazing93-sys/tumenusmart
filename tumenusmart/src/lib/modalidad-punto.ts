/**
 * El tipo de timbrado de un punto de expedición.
 *
 * Un local factura con UN solo tipo de timbrado: o el talonario autoimpresor autorizado por la DNIT (con vencimiento), o el
 * timbrado de facturador electrónico (SIFEN), que no vence y cuyas facturas se firman. Por eso todos los puntos ACTIVOS de un
 * local son del mismo tipo (los viejos, desactivados, pueden ser de otro: así se pasa de uno al otro).
 */

export type ModalidadPunto = "autoimpresor" | "electronico";

export const MODALIDADES_PUNTO: { valor: ModalidadPunto; etiqueta: string; detalle: string }[] = [
  { valor: "autoimpresor", etiqueta: "Autoimpresor", detalle: "Talonario autorizado por la DNIT, con fecha de vencimiento." },
  { valor: "electronico", etiqueta: "Electrónico (SIFEN)", detalle: "Facturador electrónico: el timbrado no vence y cada factura se firma digitalmente." },
];

/** Un texto cualquiera (lo que haya en la base o llegue de un formulario) a una modalidad conocida; ante la duda, autoimpresor. */
export function normalizarModalidad(valor: unknown): ModalidadPunto {
  return valor === "electronico" ? "electronico" : "autoimpresor";
}

export function esElectronico(valor: unknown): boolean {
  return normalizarModalidad(valor) === "electronico";
}

export function etiquetaModalidad(valor: unknown): string {
  return esElectronico(valor) ? "Electrónico" : "Autoimpresor";
}

/**
 * El timbrado electrónico no vence. Para que todo lo que ya compara contra la fecha de vencimiento (facturar, avisos de
 * "vence en N días") siga funcionando sin cambios, se guarda una fecha lejana: nunca llega.
 */
export const FIN_TIMBRADO_ELECTRONICO = new Date("2999-12-31T00:00:00.000Z");

/** ¿Es la fecha "sin vencimiento" del timbrado electrónico? */
export function esSinVencimiento(fin: Date): boolean {
  return fin.getUTCFullYear() >= 2900;
}
