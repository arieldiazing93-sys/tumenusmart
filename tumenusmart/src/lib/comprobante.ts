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
import { formatearNumeroFactura } from "./factura-pos";

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
};

/** Una línea tal como sale de la venta o del pedido, antes de repartirle el descuento. */
export type ItemFuente = {
  /** Id del producto de la carta; null en un combo mitad y mitad y en el costo de envío. */
  productId: string | null;
  descripcion: string;
  /** "unidad" | "kilogramo" | "litro" (la del producto); sin dato cae en "unidad". */
  unidadMedida: string | null;
  cantidad: number;
  /** Precio de UNA unidad de lista, IVA incluido. */
  precioUnitario: number;
  /** "gravado10" | "gravado5" | "exento". */
  iva: string;
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
 * lo que vale cada una. La última se lleva el resto, para que la suma dé
 * EXACTAMENTE el descuento (sin un centavo perdido por el redondeo).
 */
export function repartirDescuento(items: ItemFuente[], descuentoTotal: number): ItemCalculado[] {
  const brutos = items.map((i) => redondear2(i.cantidad * i.precioUnitario));
  const totalBruto = brutos.reduce((s, b) => s + b, 0);
  const descuento = Math.min(Math.max(descuentoTotal, 0), totalBruto);

  let repartido = 0;
  return items.map((it, idx) => {
    const esUltimo = idx === items.length - 1;
    let d = 0;
    if (descuento > 0 && totalBruto > 0) {
      d = esUltimo ? redondear2(descuento - repartido) : redondear2((descuento * brutos[idx]) / totalBruto);
    }
    d = Math.min(Math.max(d, 0), brutos[idx]);
    repartido += d;
    return { ...it, unidadMedida: it.unidadMedida ?? "unidad", descuento: d, total: redondear2(brutos[idx] - d) };
  });
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
    iva10: redondear2(gravado10 / 11),
    iva5: redondear2(gravado5 / 21),
    descuento: redondear2(descuento),
    total: redondear2(gravado10 + gravado5 + exento),
  };
}

export type DatosNuevoComprobante = {
  storeId: string;
  /** De qué cuenta sale: exactamente una de las dos. */
  origen: { ventaPosId: string } | { orderId: string };
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

/** Guarda el comprobante con sus líneas. Devuelve su id y su número ("001-001-0000001"). */
export async function crearComprobante(db: Db, datos: DatosNuevoComprobante): Promise<{ id: string; numero: string }> {
  const { punto, receptor } = datos;
  const items = repartirDescuento(datos.items, datos.descuento);
  const totales = totalesDeItems(items);
  const numero = formatearNumeroFactura(punto.establecimiento, punto.puntoExpedicion, datos.correlativo);

  return db.comprobante.create({
    data: {
      storeId: datos.storeId,
      ventaPosId: "ventaPosId" in datos.origen ? datos.origen.ventaPosId : null,
      orderId: "orderId" in datos.origen ? datos.origen.orderId : null,
      tipo: "factura",
      modalidad: "autoimpresor",
      puntoExpedicionId: punto.id,
      timbrado: punto.numeroTimbrado,
      timbradoDesde: punto.timbradoDesde,
      timbradoHasta: punto.timbradoHasta,
      establecimiento: punto.establecimiento,
      punto: punto.puntoExpedicion,
      correlativo: datos.correlativo,
      numero,
      fechaEmision: datos.fechaEmision ?? new Date(),
      emisorRuc: punto.rucEmisor,
      emisorRazonSocial: punto.razonSocialEmisor,
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
    origen: { ventaPosId: string } | { orderId: string };
    por: string;
    en: Date;
    motivo: string | null;
  }
): Promise<void> {
  await db.comprobante.updateMany({
    where: {
      storeId: datos.storeId,
      ...("ventaPosId" in datos.origen ? { ventaPosId: datos.origen.ventaPosId } : { orderId: datos.origen.orderId }),
      estado: "vigente",
    },
    data: { estado: "anulado", anuladoPor: datos.por, anuladoEn: datos.en, motivoAnulacion: datos.motivo },
  });
}

/** El último comprobante anulado de una venta o pedido: el que va a reemplazar una remisión. */
export async function ultimoComprobanteAnulado(
  db: Db,
  storeId: string,
  origen: { ventaPosId: string } | { orderId: string }
): Promise<{ id: string } | null> {
  return db.comprobante.findFirst({
    where: {
      storeId,
      ...("ventaPosId" in origen ? { ventaPosId: origen.ventaPosId } : { orderId: origen.orderId }),
      estado: "anulado",
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
}
