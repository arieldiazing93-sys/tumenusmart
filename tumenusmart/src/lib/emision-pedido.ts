/**
 * La factura de un pedido (delivery o retiro): cómo se arma y cómo se emite dentro de una transacción.
 *
 * Un pedido entra a la caja y se factura EN EL ACTO en que se carga a mano (Pedidos → Nuevo pedido) o se cobra (el botón "Cobrar"
 * de un pedido que todavía no estaba cobrado). Lo comparten las dos acciones, así las dos dan exactamente la misma factura.
 *
 * Sin React: lo usan acciones del servidor. El armado (`armarEmisionDePedido`) es puro y se puede probar sin base.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { desglosarIva, formatearNumeroFactura } from "./factura-pos";
import {
  crearComprobante,
  descripcionDeItem,
  type DatosNuevoComprobante,
  type ItemFuente,
  type PuntoParaComprobante,
} from "./comprobante";
import { SIN_REGISTRO_FISCAL } from "./tipo-cliente";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Lo que hace falta leer de un pedido para emitirle factura: los datos del comprador y las líneas, con la unidad de medida de
 * cada producto.
 */
export const SELECT_PEDIDO_PARA_EMISION = {
  tipoEntrega: true,
  comprobanteTipo: true,
  facturaNumero: true,
  facturaTipoIdentificacion: true,
  facturaRuc: true,
  facturaRazonSocial: true,
  facturaEmail: true,
  costoEnvio: true,
  items: {
    select: {
      productId: true,
      nombreProducto: true,
      opcionesTexto: true,
      precioUnitario: true,
      cantidad: true,
      iva: true,
      product: { select: { unidadMedida: true, esServicio: true } },
    },
  },
} as const;

/** El comprobante listo para guardar; solo falta decir de qué pedido es y quién lo emitió. */
export type ComprobanteAEmitir = Omit<DatosNuevoComprobante, "storeId" | "origen" | "emitidoPor">;

/** Un pedido con lo necesario para armarle la factura (los datos del comprador y las líneas). */
export type PedidoParaEmision = {
  comprobanteTipo: string;
  facturaNumero: string | null;
  tipoEntrega: string;
  facturaTipoIdentificacion: string | null;
  facturaRuc: string | null;
  facturaRazonSocial: string | null;
  facturaEmail: string | null;
  items: {
    productId: string | null;
    nombreProducto: string;
    opcionesTexto: string | null;
    precioUnitario: unknown;
    cantidad: number;
    iva: string;
    product: { unidadMedida: string; esServicio: boolean } | null;
  }[];
  /** Costo de envío (delivery), gravado al 10% igual que cualquier
   *  servicio — si no se suma acá, Gravadas+Exentas queda por debajo del
   *  total real del pedido en la factura impresa. */
  costoEnvio?: unknown;
};

/**
 * Lo que sale de emitir la factura de un pedido con el número de factura ya tomado: los datos que se guardan en el pedido y su
 * Comprobante (la foto fiscal).
 */
export function armarEmisionDePedido(
  pedido: PedidoParaEmision,
  pe: PuntoParaComprobante,
  correlativo: number
): { datos: Record<string, unknown>; comprobante: ComprobanteAEmitir } {
  // pedido.items.precioUnitario llega como Decimal de Prisma — desglosarIva
  // pide number. El envío entra como una línea más, gravada al 10%.
  const lineas = pedido.items.map((i) => ({
    precioUnitario: Number(i.precioUnitario),
    cantidad: i.cantidad,
    iva: i.iva,
  }));
  const costoEnvio = Number(pedido.costoEnvio ?? 0);
  if (costoEnvio > 0) {
    lineas.push({ precioUnitario: costoEnvio, cantidad: 1, iva: "gravado10" });
  }
  const desglose = desglosarIva(lineas);

  // La foto fiscal de esta factura (ver Comprobante): se guarda en la misma
  // transacción que marca el pedido con su número. El envío entra como una
  // línea más, igual que en el desglose de IVA de arriba.
  const itemsComprobante: ItemFuente[] = pedido.items.map((i) => ({
    productId: i.productId,
    descripcion: descripcionDeItem(i.nombreProducto, i.opcionesTexto),
    unidadMedida: i.product?.unidadMedida ?? null,
    esServicio: i.product?.esServicio ?? false,
    cantidad: i.cantidad,
    precioUnitario: Number(i.precioUnitario),
    iva: i.iva,
  }));
  if (costoEnvio > 0) {
    itemsComprobante.push({
      productId: null,
      descripcion: "Costo de envío",
      unidadMedida: "unidad",
      cantidad: 1,
      precioUnitario: costoEnvio,
      iva: "gravado10",
    });
  }
  const sinNombre = pedido.facturaTipoIdentificacion === SIN_REGISTRO_FISCAL.tipo;

  return {
    comprobante: {
      punto: pe,
      correlativo,
      receptor: {
        tipoIdentificacion: pedido.facturaTipoIdentificacion ?? "ruc",
        numeroIdentificacion: pedido.facturaRuc ?? SIN_REGISTRO_FISCAL.numero,
        razonSocial: sinNombre ? null : pedido.facturaRazonSocial,
        email: sinNombre ? null : pedido.facturaEmail || null,
      },
      presencia: pedido.tipoEntrega === "delivery" ? "domicilio" : "presencial",
      condicion: "contado",
      fechaVencimientoCredito: null,
      items: itemsComprobante,
      descuento: 0,
    },
    datos: {
      facturaNumero: formatearNumeroFactura(pe.establecimiento, pe.puntoExpedicion, correlativo),
      facturaTimbrado: pe.numeroTimbrado,
      facturaVencimiento: pe.timbradoHasta,
      facturaGravado10: desglose.gravado10,
      facturaGravado5: desglose.gravado5,
      facturaExento: desglose.exento,
      facturaIva10: desglose.iva10,
      facturaIva5: desglose.iva5,
      facturaRazonSocialEmisor: pe.razonSocialEmisor,
      facturaRucEmisor: pe.rucEmisor,
    },
  };
}

/**
 * Emite la factura de un pedido DENTRO de la transacción que lo cobra: consume el número del punto de expedición (se incrementa
 * primero y se usa el valor ya incrementado, así dos cobros a la vez no toman el mismo), guarda en el pedido los datos de la
 * factura y crea su Comprobante. Si algo falla, la transacción entera se deshace y no se consume ningún número.
 *
 * `pedido` es el pedido ya guardado (con `comprobanteTipo = "factura"` y los datos del comprador). Devuelve el número de factura.
 */
export async function emitirFacturaDePedidoEnTransaccion(
  tx: Db,
  datos: {
    storeId: string;
    orderId: string;
    pedido: PedidoParaEmision;
    punto: PuntoParaComprobante;
    emitidoPor: string;
  }
): Promise<string> {
  const { storeId, orderId, pedido, punto, emitidoPor } = datos;
  const actualizado = await tx.puntoExpedicion.update({
    where: { id: punto.id },
    data: { ultimoNumeroFactura: { increment: 1 } },
    select: { ultimoNumeroFactura: true },
  });
  const emision = armarEmisionDePedido(pedido, punto, actualizado.ultimoNumeroFactura);
  await tx.order.update({
    where: { id: orderId, storeId },
    data: { comprobanteTipo: "factura", ...emision.datos },
  });
  await crearComprobante(tx, { ...emision.comprobante, storeId, origen: { orderId }, emitidoPor });
  return String(emision.datos.facturaNumero);
}
