/**
 * Los datos de un Comprobante tal como los necesita el armado de la factura electrónica.
 *
 * Es la "foto" de lo facturado (emisor, comprador, líneas, condición) sin ninguna dependencia de la base: lo arma
 * quien lee el Comprobante y lo consume `src/lib/sifen/armar-de.ts`, que es donde se construye el Documento
 * Electrónico de SIFEN (con sus fórmulas y reglas, tomadas del Manual Técnico y sus notas técnicas).
 *
 * Antes este archivo tenía una vista previa propia del documento; quedó duplicada con la versión completa y se
 * eliminó: ahora hay un solo lugar donde viven las reglas.
 */

export type ItemParaDocumento = {
  codigo: string | null;
  descripcion: string;
  unidadMedida: string;
  cantidad: number;
  /** De lista, IVA incluido. */
  precioUnitario: number;
  /** El descuento general repartido a esta línea (total de la línea, no por unidad). */
  descuento: number;
  /** cantidad × precio − descuento. */
  total: number;
  iva: string;
};

export type ComprobanteParaDocumento = {
  tipo: string;
  modalidad: string;
  tipoEmision: string;
  timbrado: string;
  timbradoDesde: Date | null;
  establecimiento: string;
  punto: string;
  correlativo: number;
  numero: string;
  fechaEmision: Date;
  tipoTransaccion: string;
  moneda: string;
  emisorRuc: string;
  emisorRazonSocial: string;
  /** La copia de EmisorFiscal guardada en el comprobante (JSON), o null. */
  emisorDatos: unknown;
  receptorTipoIdentificacion: string;
  receptorNumeroIdentificacion: string;
  receptorRazonSocial: string | null;
  receptorEmail: string | null;
  presencia: string;
  condicion: string;
  fechaVencimientoCredito: Date | null;
  total: number;
  items: ItemParaDocumento[];
};

export type PagoParaDocumento = { forma: string; monto: number };
