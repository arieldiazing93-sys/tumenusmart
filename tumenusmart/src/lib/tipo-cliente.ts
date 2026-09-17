/**
 * Clasificación fiscal del comprador para la Factura Autoimpresor, según la
 * Tabla 3 "Códigos de Tipos de Identificación" de la Especificación Técnica
 * de Importación de Comprobantes de la SET/DNIT (RG 90/2021).
 *
 * Se guardan valores semánticos en la base (mismo criterio que `iva.ts` o
 * `turno-pos.ts`), no los códigos numéricos de la SET directo — `codigoSet`
 * de cada entrada es la traducción, para cuando haga falta armar el reporte
 * de Marangatú.
 */

export type TipoIdentificacionFiscal =
  | "ruc"
  | "cedula"
  | "diplomatico"
  | "pasaporte"
  | "cedula_extranjera"
  | "identificacion_tributaria";

// Orden pedido por el dueño: los tipos más comunes primero, para que estén
// más cerca en el selector.
export const TIPOS_IDENTIFICACION_FISCAL: {
  valor: TipoIdentificacionFiscal;
  etiqueta: string;
  codigoSet: string;
}[] = [
  { valor: "ruc", etiqueta: "RUC", codigoSet: "11" },
  { valor: "cedula", etiqueta: "Cédula de identidad", codigoSet: "12" },
  { valor: "diplomatico", etiqueta: "Diplomático", codigoSet: "16" },
  { valor: "pasaporte", etiqueta: "Pasaporte", codigoSet: "13" },
  { valor: "cedula_extranjera", etiqueta: "Cédula extranjera", codigoSet: "14" },
  { valor: "identificacion_tributaria", etiqueta: "Identificación tributaria", codigoSet: "17" },
];

/**
 * "Sin registro fiscal" no es una opción elegible del selector de arriba —
 * es el otro camino del toggle Con/Sin registro fiscal, con estos valores
 * siempre fijos (el timbrado Autoimpresor obliga a facturar toda venta,
 * incluso sin ningún dato del comprador).
 */
export const SIN_REGISTRO_FISCAL = {
  tipo: "sin_nombre" as const,
  numero: "X",
  codigoSet: "15",
  etiquetaDisplay: "Consumidor Final",
};

export function etiquetaTipoIdentificacion(valor: string): string {
  if (valor === SIN_REGISTRO_FISCAL.tipo) return "Sin nombre";
  return TIPOS_IDENTIFICACION_FISCAL.find((t) => t.valor === valor)?.etiqueta ?? "RUC";
}
