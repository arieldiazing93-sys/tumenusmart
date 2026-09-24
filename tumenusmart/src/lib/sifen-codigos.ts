/**
 * Traducción de los valores de TuMenuSmart a los CÓDIGOS del Documento
 * Electrónico de SIFEN (DNIT).
 *
 * En la base se guardan valores semánticos ("factura", "contado", "efectivo"…)
 * — mismo criterio que tipo-cliente.ts o iva.ts —; los códigos numéricos que
 * pide SIFEN se arman recién acá, en el borde con el proveedor de factura
 * electrónica. Así cambiar de proveedor, o corregir un código, no toca ni un
 * dato guardado.
 *
 * Todos los códigos están VERIFICADOS contra el esquema oficial de la DNIT
 * (DE_Types_v150.xsd: https://ekuatia.set.gov.py/sifen/xsd/DE_Types_v150.xsd),
 * cada uno con el nombre del campo del DE al que corresponde. Sin Prisma: se
 * puede importar desde cualquier lado.
 */

import { UNIDADES_MEDIDA } from "./unidad-medida";
import { normalizarFormaPagoPos } from "./turno-pos";

/** iTiDE — Tipo de documento electrónico. */
export const TIPO_DOCUMENTO_SIFEN = {
  factura: 1,
  autofactura: 4,
  nota_credito: 5,
  nota_debito: 6,
  nota_remision: 7,
} as const;

export type TipoComprobante = keyof typeof TIPO_DOCUMENTO_SIFEN;

/** iTipEmi — Tipo de emisión. */
export const TIPO_EMISION_SIFEN = { normal: 1, contingencia: 2 } as const;

/** iTipTra — Tipo de transacción (los tres que pueden darse en un local). */
export const TIPO_TRANSACCION_SIFEN = {
  venta_mercaderia: 1,
  prestacion_servicios: 2,
  mixto: 3,
} as const;

/** iIndPres — Indicador de presencia. */
export const PRESENCIA_SIFEN = {
  presencial: 1,
  electronica: 2,
  telemarketing: 3,
  domicilio: 4,
  bancaria: 5,
  ciclica: 6,
  otro: 9,
} as const;

/** iCondOpe — Condición de la operación. */
export const CONDICION_SIFEN = { contado: 1, credito: 2 } as const;

/** iTImp — Tipo de impuesto: 1 = IVA (lo único que se factura acá). */
export const TIPO_IMPUESTO_IVA = 1;

/** iTiPago — Tipo de pago (gPaConEIni), para cada forma de pago de una venta. */
export const TIPO_PAGO_SIFEN = {
  efectivo: 1,
  tarjeta_credito: 3,
  tarjeta_debito: 4,
  transferencia: 5,
} as const;

/** Código iTiPago de una forma de pago del POS. Lo desconocido cae en 99 ("otro"). */
export function codigoTipoPago(forma: string): number {
  // "a_credito" no es una forma de cobro: va como condición de la operación (crédito), no como pago.
  if (forma === "a_credito") return 99;
  return TIPO_PAGO_SIFEN[normalizarFormaPagoPos(forma)];
}

/**
 * gDatRec — cómo se identifica al comprador en el DE, a partir del tipo de
 * identificación de TuMenuSmart (ver tipo-cliente.ts):
 *
 *  - naturaleza (iNatRec): 1 = contribuyente (tiene RUC), 2 = no contribuyente.
 *  - tipoDocumento (iTipIDRec): solo si NO es contribuyente — 1 cédula
 *    paraguaya, 2 pasaporte, 3 cédula extranjera, 4 carnet de residencia,
 *    5 innominado, 6 tarjeta diplomática de exoneración fiscal, 9 otro.
 *    Un contribuyente va con su RUC (dRucRec + dDVRec), sin tipo de documento.
 */
export function receptorSifen(tipoIdentificacion: string): { naturaleza: 1 | 2; tipoDocumento: number | null } {
  switch (tipoIdentificacion) {
    case "ruc":
      return { naturaleza: 1, tipoDocumento: null };
    case "cedula":
      return { naturaleza: 2, tipoDocumento: 1 };
    case "pasaporte":
      return { naturaleza: 2, tipoDocumento: 2 };
    case "cedula_extranjera":
      return { naturaleza: 2, tipoDocumento: 3 };
    case "diplomatico":
      return { naturaleza: 2, tipoDocumento: 6 };
    case "sin_nombre":
      return { naturaleza: 2, tipoDocumento: 5 };
    default:
      return { naturaleza: 2, tipoDocumento: 9 };
  }
}

/**
 * Separa un RUC paraguayo "80012345-6" en número y dígito verificador
 * (dRucRec y dDVRec). Sin guion, el dígito queda vacío.
 */
export function separarRuc(ruc: string): { numero: string; dv: string } {
  const limpio = ruc.trim();
  const partes = limpio.split("-");
  return { numero: partes[0] ?? "", dv: partes[1] ?? "" };
}

/**
 * gCamIVA — afectación y tasa de IVA de una línea, a partir de Product.iva:
 * iAfecIVA 1 = gravado, 3 = exento; dTasaIVA 10 | 5 | 0.
 */
export function ivaSifen(iva: string): { afectacion: 1 | 3; tasa: 10 | 5 | 0 } {
  if (iva === "gravado10") return { afectacion: 1, tasa: 10 };
  if (iva === "gravado5") return { afectacion: 1, tasa: 5 };
  return { afectacion: 3, tasa: 0 };
}

/** cUniMed — código de la unidad de medida (Tabla 5). Lo desconocido cae en 77 (unidad). */
export function codigoUnidadMedida(unidad: string | null | undefined): number {
  return UNIDADES_MEDIDA.find((u) => u.valor === unidad)?.codigoSifen ?? 77;
}

/** iMotEmi — Motivo de una nota de crédito / débito. */
export const MOTIVO_NOTA_SIFEN = {
  devolucion_y_ajuste_de_precios: 1,
  devolucion: 2,
  descuento: 3,
  bonificacion: 4,
  credito_incobrable: 5,
  recupero_de_costo: 6,
  recupero_de_gasto: 7,
  ajuste_de_precio: 8,
} as const;
