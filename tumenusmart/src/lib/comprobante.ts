/**
 * El Comprobante: la foto de un documento fiscal emitido (hoy la Factura
 * Autoimpresor; mañana la factura electrónica de SIFEN). Ver el modelo en el
 * schema — acá está lo que lo arma: repartir el descuento entre las líneas,
 * sacar los totales de esas líneas y guardarlo.
 *
 * Lo que devuelve `totalesDeItems` sale de las líneas y no de otro cálculo, así
 * los subtotales por tasa, el IVA y el total nunca se contradicen entre sí ni
 * con el detalle que recibe el proveedor de factura electrónica.
 *
 * Se llama SIEMPRE con el `tx` de la transacción que emite o anula la factura:
 * el comprobante y el número que consumió quedan como una sola cosa.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { formatearNumeroFactura, repartirDescuentoEnLineas } from "./factura-pos";
import { emisorDesdeFila } from "./emisor-fiscal";
import { esElectronico } from "./modalidad-punto";
import type { ComprobanteParaDocumento, PagoParaDocumento } from "./documento-electronico";
import { ErrorFacturaElectronica, firmarDocumentoAlVender } from "./sifen/servidor";
import { solicitarCancelacion } from "./sifen/solicitudes";

type Db = PrismaClient | Prisma.TransactionClient;

function redondear2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** El punto de expedición del que sale el número (lo que hace falta para armar el comprobante). */
export type PuntoParaComprobante = {
  id: string;
  establecimiento: string;
  puntoExpedicion: string;
  numeroTimbrado: string;
  timbradoDesde: Date;
  timbradoHasta: Date;
  razonSocialEmisor: string;
  rucEmisor: string;
  /** "autoimpresor" | "electronico": el tipo de timbrado del punto. Con "electronico" la factura se firma al emitirla. */
  modalidad: string;
};

/** Una línea tal como sale de la venta o del pedido, antes de repartirle el descuento. */
export type ItemFuente = {
  /** Id del producto de la carta; null en un combo mitad y mitad y en el costo de envío. */
  productId: string | null;
  descripcion: string;
  /** "unidad" | "kilogramo" | "litro" (la del producto); sin dato cae en "unidad". */
  unidadMedida: string | null;
  /**
   * true si es un servicio, false si es una mercadería. Sin dato (null o sin
   * poner — como el costo de envío, que acompaña a la venta) no cuenta para
   * decidir el tipo de transacción del comprobante.
   */
  esServicio?: boolean | null;
  cantidad: number;
  /** Precio de UNA unidad de lista, IVA incluido. */
  precioUnitario: number;
  /** "gravado10" | "gravado5" | "exento". */
  iva: string;
  /** true en el costo de envío de un delivery: el descuento general es sobre los productos y esta línea no recibe nada de él. */
  sinDescuento?: boolean;
};

export type ItemCalculado = ItemFuente & {
  unidadMedida: string;
  /** Lo que le toca del descuento general de la cuenta. */
  descuento: number;
  /** cantidad × precio − descuento. */
  total: number;
};

export type TotalesComprobante = {
  gravado10: number;
  gravado5: number;
  exento: number;
  iva10: number;
  iva5: number;
  descuento: number;
  total: number;
};

/** "Hamburguesa (queso extra)": el nombre con sus agregados entre paréntesis. */
export function descripcionDeItem(nombreProducto: string, opcionesTexto: string | null | undefined): string {
  return opcionesTexto?.trim() ? `${nombreProducto} (${opcionesTexto.trim()})` : nombreProducto;
}

/**
 * Reparte el descuento general de la cuenta entre las líneas, en proporción a
 * lo que vale cada una y en guaraníes ENTEROS (ver `repartirDescuentoEnLineas`):
 * la suma da EXACTAMENTE el descuento y cada línea queda con un total entero,
 * así la factura electrónica —que redondea línea por línea— suma justo lo que
 * se cobró.
 */
export function repartirDescuento(items: ItemFuente[], descuentoTotal: number): ItemCalculado[] {
  const brutos = items.map((i) => redondear2(i.cantidad * i.precioUnitario));
  // Una línea "sin descuento" (el envío) queda fuera del reparto: con monto 0 no le toca nada.
  const descuentos = repartirDescuentoEnLineas(
    brutos.map((b, i) => (items[i].sinDescuento ? 0 : b)),
    descuentoTotal
  );
  return items.map((it, idx) => ({
    ...it,
    unidadMedida: it.unidadMedida ?? "unidad",
    descuento: descuentos[idx],
    total: redondear2(brutos[idx] - descuentos[idx]),
  }));
}

/**
 * Los totales del comprobante, sumando las líneas ya con su descuento. El IVA
 * se extrae del monto gravado (÷11 al 10%, ÷21 al 5%): la misma fórmula del
 * Decreto 3107/2019, Art. 41, que usa desglosarIva (factura-pos.ts).
 */
export function totalesDeItems(items: ItemCalculado[]): TotalesComprobante {
  let gravado10 = 0;
  let gravado5 = 0;
  let exento = 0;
  let descuento = 0;
  for (const it of items) {
    if (it.iva === "gravado10") gravado10 += it.total;
    else if (it.iva === "gravado5") gravado5 += it.total;
    else exento += it.total;
    descuento += it.descuento;
  }
  return {
    gravado10: redondear2(gravado10),
    gravado5: redondear2(gravado5),
    exento: redondear2(exento),
    // En guaraníes enteros, igual que en la venta (ver desglosarIva): 70.000 ÷ 11 = 6.363,64 → 6.364.
    iva10: Math.round(gravado10 / 11),
    iva5: Math.round(gravado5 / 21),
    descuento: redondear2(descuento),
    total: redondear2(gravado10 + gravado5 + exento),
  };
}

/**
 * El tipo de transacción del comprobante (iTipTra): solo servicios →
 * "prestacion_servicios"; mezcla de servicios y mercadería → "mixto"; el resto,
 * "venta_mercaderia".
 */
export function tipoTransaccionDe(items: Pick<ItemFuente, "esServicio">[]): "venta_mercaderia" | "prestacion_servicios" | "mixto" {
  const conDato = items.filter((i) => typeof i.esServicio === "boolean");
  const servicios = conDato.filter((i) => i.esServicio === true).length;
  if (conDato.length === 0 || servicios === 0) return "venta_mercaderia";
  if (servicios === conDato.length) return "prestacion_servicios";
  return "mixto";
}

export type DatosNuevoComprobante = {
  storeId: string;
  /** De qué cuenta sale: exactamente una (la cuenta de delivery, en la "factura rápida": la factura sale antes de que exista la venta). */
  origen: { ventaPosId: string } | { orderId: string } | { cuentaDeliveryId: string };
  punto: PuntoParaComprobante;
  /** El correlativo que ya se incrementó en el punto de expedición (1, 2, 3…). */
  correlativo: number;
  fechaEmision?: Date;
  receptor: {
    tipoIdentificacion: string;
    numeroIdentificacion: string;
    razonSocial: string | null;
    email: string | null;
  };
  /** Ver Comprobante.presencia. */
  presencia: "presencial" | "electronica" | "telemarketing" | "domicilio" | "bancaria" | "ciclica" | "otro";
  condicion: "contado" | "credito";
  fechaVencimientoCredito: Date | null;
  items: ItemFuente[];
  /** Descuento general de la cuenta, en guaraníes. */
  descuento: number;
  /** Solo en una remisión: el comprobante anulado al que reemplaza. */
  reemplazaAId?: string | null;
  emitidoPor: string;
};

/**
 * Cómo se pagó la venta, para el documento electrónico (la forma de pago va dentro de la factura). Solo se lee de la base
 * cuando la factura es al contado; a crédito el documento lleva el plazo y no las formas de pago.
 */
async function pagosDeLaVenta(db: Db, datos: DatosNuevoComprobante): Promise<PagoParaDocumento[]> {
  if (datos.condicion === "credito") return [];
  if ("ventaPosId" in datos.origen) {
    const filas = await db.pagoVenta.findMany({
      where: { ventaPosId: datos.origen.ventaPosId },
      orderBy: { orden: "asc" },
      select: { forma: true, monto: true },
    });
    return filas.map((p) => ({ forma: p.forma, monto: Number(p.monto) }));
  }
  if ("cuentaDeliveryId" in datos.origen) {
    // La factura rápida sale ANTES de cobrar: todavía no se sabe cómo se paga, y la factura electrónica lo lleva adentro.
    throw new ErrorFacturaElectronica("Con facturación electrónica la factura del delivery se emite al cobrar la cuenta, cuando ya se sabe la forma de pago.");
  }
  throw new ErrorFacturaElectronica("Esta factura no se puede emitir de forma electrónica desde un pedido: usá una venta del punto de venta.");
}

/** Guarda el comprobante con sus líneas. Devuelve su id y su número ("001-001-0000001"). */
export async function crearComprobante(db: Db, datos: DatosNuevoComprobante): Promise<{ id: string; numero: string }> {
  const { punto, receptor } = datos;
  const items = repartirDescuento(datos.items, datos.descuento);
  const totales = totalesDeItems(items);
  const numero = formatearNumeroFactura(punto.establecimiento, punto.puntoExpedicion, datos.correlativo);
  const electronico = esElectronico(punto.modalidad);
  const fechaEmision = datos.fechaEmision ?? new Date();

  // Los datos del emisor que pide la factura electrónica (dirección,
  // actividades…), si el local los cargó: se copian al comprobante para que
  // quede completo aunque después cambien. Sin cargar, queda en null — la
  // autoimpresor no los usa.
  const emisor = await db.emisorFiscal.findUnique({ where: { storeId: datos.storeId } });
  const emisorDatos = emisor ? (emisorDesdeFila(emisor) as unknown as Prisma.InputJsonValue) : null;

  const creado = await db.comprobante.create({
    data: {
      storeId: datos.storeId,
      ventaPosId: "ventaPosId" in datos.origen ? datos.origen.ventaPosId : null,
      orderId: "orderId" in datos.origen ? datos.origen.orderId : null,
      cuentaDeliveryId: "cuentaDeliveryId" in datos.origen ? datos.origen.cuentaDeliveryId : null,
      tipo: "factura",
      modalidad: electronico ? "electronico" : "autoimpresor",
      puntoExpedicionId: punto.id,
      timbrado: punto.numeroTimbrado,
      timbradoDesde: punto.timbradoDesde,
      timbradoHasta: punto.timbradoHasta,
      establecimiento: punto.establecimiento,
      punto: punto.puntoExpedicion,
      correlativo: datos.correlativo,
      numero,
      fechaEmision,
      tipoTransaccion: tipoTransaccionDe(datos.items),
      emisorRuc: punto.rucEmisor,
      emisorRazonSocial: punto.razonSocialEmisor,
      ...(emisorDatos ? { emisorDatos } : {}),
      receptorTipoIdentificacion: receptor.tipoIdentificacion,
      receptorNumeroIdentificacion: receptor.numeroIdentificacion,
      receptorRazonSocial: receptor.razonSocial,
      receptorEmail: receptor.email,
      presencia: datos.presencia,
      condicion: datos.condicion,
      fechaVencimientoCredito: datos.fechaVencimientoCredito,
      gravado10: totales.gravado10,
      gravado5: totales.gravado5,
      exento: totales.exento,
      iva10: totales.iva10,
      iva5: totales.iva5,
      descuento: totales.descuento,
      total: totales.total,
      reemplazaAId: datos.reemplazaAId ?? null,
      emitidoPor: datos.emitidoPor,
      items: {
        create: items.map((it, i) => ({
          storeId: datos.storeId,
          orden: i,
          codigo: it.productId,
          descripcion: it.descripcion,
          unidadMedida: it.unidadMedida,
          cantidad: it.cantidad,
          precioUnitario: it.precioUnitario,
          descuento: it.descuento,
          total: it.total,
          iva: it.iva,
        })),
      },
    },
    select: { id: true, numero: true },
  });

  // Local con timbrado electrónico: la factura se firma en este mismo momento y dentro de la misma transacción de la venta.
  // Así el comprobante impreso (con su código QR, que depende de la firma) sale al instante, y no queda una venta facturada
  // sin su documento. Si algo falla (falta el certificado, datos del emisor incompletos…) la venta entera se deshace.
  if (electronico) {
    const pagos = await pagosDeLaVenta(db, datos);
    const paraDocumento: ComprobanteParaDocumento = {
      tipo: "factura",
      modalidad: "electronico",
      tipoEmision: "normal",
      timbrado: punto.numeroTimbrado,
      timbradoDesde: punto.timbradoDesde,
      establecimiento: punto.establecimiento,
      punto: punto.puntoExpedicion,
      correlativo: datos.correlativo,
      numero,
      fechaEmision,
      tipoTransaccion: tipoTransaccionDe(datos.items),
      moneda: "PYG",
      emisorRuc: punto.rucEmisor,
      emisorRazonSocial: punto.razonSocialEmisor,
      emisorDatos: emisorDatos,
      receptorTipoIdentificacion: receptor.tipoIdentificacion,
      receptorNumeroIdentificacion: receptor.numeroIdentificacion,
      receptorRazonSocial: receptor.razonSocial,
      receptorEmail: receptor.email,
      presencia: datos.presencia,
      condicion: datos.condicion,
      fechaVencimientoCredito: datos.fechaVencimientoCredito,
      total: totales.total,
      items: items.map((it) => ({
        codigo: it.productId,
        descripcion: it.descripcion,
        unidadMedida: it.unidadMedida,
        cantidad: it.cantidad,
        precioUnitario: it.precioUnitario,
        descuento: it.descuento,
        total: it.total,
        iva: it.iva,
      })),
    };
    await firmarDocumentoAlVender(db, datos.storeId, creado.id, paraDocumento, pagos, datos.emitidoPor);
  }

  return creado;
}

/** El pedazo de `where` que dice de qué cuenta es el comprobante. */
function filtroDeOrigen(
  origen: { ventaPosId: string } | { orderId: string } | { cuentaDeliveryId: string }
): { ventaPosId: string } | { orderId: string } | { cuentaDeliveryId: string } {
  if ("ventaPosId" in origen) return { ventaPosId: origen.ventaPosId };
  if ("orderId" in origen) return { orderId: origen.orderId };
  return { cuentaDeliveryId: origen.cuentaDeliveryId };
}

/**
 * Marca como anulados los comprobantes vigentes de una venta o pedido. Sin
 * ninguno vigente (una factura de antes de que existiera esta tabla) no hace
 * nada. No borra: el número queda consumido para siempre, con quién lo anuló y
 * por qué.
 */
export async function anularComprobantes(
  db: Db,
  datos: {
    storeId: string;
    origen: { ventaPosId: string } | { orderId: string } | { cuentaDeliveryId: string };
    por: string;
    en: Date;
    motivo: string | null;
  }
): Promise<void> {
  // Los comprobantes electrónicos que se anulan: la DNIT tiene que enterarse (evento de cancelación). Solo se deja pedido; la tarea
  // programada lo firma y lo envía cuando el documento esté aprobado (y dentro de las 48 horas que da la DNIT).
  const electronicos = await db.comprobante.findMany({
    where: { storeId: datos.storeId, ...filtroDeOrigen(datos.origen), estado: "vigente", modalidad: "electronico" },
    select: { documentoElectronico: { select: { id: true } } },
  });
  await db.comprobante.updateMany({
    where: {
      storeId: datos.storeId,
      ...filtroDeOrigen(datos.origen),
      estado: "vigente",
    },
    data: { estado: "anulado", anuladoPor: datos.por, anuladoEn: datos.en, motivoAnulacion: datos.motivo },
  });
  for (const c of electronicos) {
    if (c.documentoElectronico) {
      await solicitarCancelacion(db, { storeId: datos.storeId, documentoId: c.documentoElectronico.id, motivo: datos.motivo, creadoPor: datos.por });
    }
  }
}

/** El último comprobante anulado de una venta o pedido: el que va a reemplazar una remisión. */
export async function ultimoComprobanteAnulado(
  db: Db,
  storeId: string,
  origen: { ventaPosId: string } | { orderId: string } | { cuentaDeliveryId: string }
): Promise<{ id: string } | null> {
  return db.comprobante.findFirst({
    where: {
      storeId,
      ...filtroDeOrigen(origen),
      estado: "anulado",
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
}
