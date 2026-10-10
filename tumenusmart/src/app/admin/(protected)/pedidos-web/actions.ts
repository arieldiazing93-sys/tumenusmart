"use server";

import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal } from "@/lib/prisma-local";
import { registrarBitacora } from "@/lib/bitacora";
import { SIN_REGISTRO_FISCAL } from "@/lib/tipo-cliente";
import { descuentoDeCuenta, lineasDeCobro } from "@/lib/comedor";
import { totalesDeDelivery } from "@/lib/delivery";
import { formatearNumero } from "@/lib/format";
import {
  aceptarPedidoWeb,
  editarDatosPedidoWeb,
  marcarListoPedidoWeb,
  quitarLineaPedidoWeb,
  rechazarPedidoWeb,
} from "@/lib/pedido-web-servidor";
import { pagarCuentaDelivery } from "../delivery/actions";

/**
 * Lo que el personal hace con los pedidos del menú digital desde la bandeja: aceptar (abre la cuenta y manda la comanda), rechazar,
 * quitar un producto que no hay, corregir los datos del cliente y de la factura, marcar listo y entregar-y-cobrar de un toque.
 *
 * Cada acción exige su permiso al empezar y trabaja SOLO dentro del local de la sesión. Devuelven un resultado en vez de lanzar: Next
 * oculta en producción el mensaje de una excepción de una acción del servidor.
 */

export type ResultadoPedido = { ok: true } | { ok: false; error: string };

function refrescar() {
  revalidatePath("/admin/pedidos-web");
  revalidatePath("/admin/delivery");
}

const nombreDe = (sesion: { nombre?: string | null; email: string }): string => (sesion.nombre?.trim() || sesion.email).slice(0, 80);

/** Aceptar: abre la cuenta, carga los productos (stock y comanda). `costoEnvio` solo hace falta si el envío era «a coordinar». */
export async function aceptarPedido(pedidoId: string, costoEnvio?: number): Promise<ResultadoPedido> {
  const sesion = await exigirPermiso("delivery.gestionar");
  const storeId = await idLocalActual();
  const r = await aceptarPedidoWeb(storeId, String(pedidoId), sesion, { costoEnvio });
  refrescar();
  revalidatePath("/admin/stock/insumos");
  return r.ok ? { ok: true } : r;
}

export async function rechazarPedido(pedidoId: string, motivo: string): Promise<ResultadoPedido> {
  const sesion = await exigirPermiso("delivery.gestionar");
  const storeId = await idLocalActual();
  const r = await rechazarPedidoWeb(storeId, String(pedidoId), motivo, sesion);
  refrescar();
  return r;
}

/** «Falta un producto»: saca una línea de un pedido nuevo y recalcula. */
export async function quitarProductoDelPedido(pedidoId: string, posicion: number): Promise<ResultadoPedido> {
  const sesion = await exigirPermiso("delivery.gestionar");
  const storeId = await idLocalActual();
  const r = await quitarLineaPedidoWeb(storeId, String(pedidoId), Number(posicion), sesion);
  refrescar();
  return r;
}

export type DatosCorreccionPedido = {
  clienteNombre: string;
  clienteTelefono: string;
  comprobanteTipo: "ticket" | "factura";
  facturaTipoIdentificacion?: string;
  facturaRuc?: string;
  facturaRazonSocial?: string;
  facturaEmail?: string;
  costoEnvio?: number;
};

/** Corrige el nombre, el teléfono y los datos de factura de un pedido nuevo (por ejemplo, un RUC mal tipeado). */
export async function corregirDatosDelPedido(pedidoId: string, datos: DatosCorreccionPedido): Promise<ResultadoPedido> {
  const sesion = await exigirPermiso("delivery.gestionar");
  const storeId = await idLocalActual();
  const r = await editarDatosPedidoWeb(storeId, String(pedidoId), datos, sesion);
  refrescar();
  return r;
}

export async function marcarPedidoListo(pedidoId: string): Promise<ResultadoPedido> {
  const sesion = await exigirPermiso("delivery.gestionar");
  const storeId = await idLocalActual();
  const r = await marcarListoPedidoWeb(storeId, String(pedidoId), sesion);
  refrescar();
  return r;
}

export type ResultadoEntrega =
  | { ok: true; ventaId: string; total: number }
  /** `sinTurno`: no hay turno de caja abierto; la pantalla manda directo a abrirlo. */
  | { ok: false; error: string; sinTurno?: true };

/**
 * «Entregado y cobrado»: de un toque. Cobra la cuenta del pedido con lo que el cliente dejó cargado (la forma de pago que eligió, y
 * ticket o factura con los datos que dio) usando el mismo cobro del Servicio delivery: entra en el turno de caja de esta estación,
 * sale el comprobante y el pedido queda entregado. Si algo no cuadra (sin turno, datos de factura mal) lo dice, y el cobro completo
 * sigue disponible en la cuenta del Servicio delivery para cambiar la forma de pago o dividirla.
 */
export async function entregarYCobrarPedido(pedidoId: string): Promise<ResultadoEntrega> {
  const sesion = await exigirPermiso("delivery.gestionar");
  await exigirPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const pedido = await db.pedidoWeb.findFirst({ where: { id: String(pedidoId) } });
  if (!pedido) return { ok: false, error: "No encontré ese pedido." };
  if (pedido.estado !== "aceptado" && pedido.estado !== "listo") {
    return { ok: false, error: "Este pedido ya no está en curso. Actualizá la pantalla." };
  }
  if (!pedido.cuentaDeliveryId) return { ok: false, error: "El pedido todavía no tiene su cuenta. Actualizá la pantalla." };

  const cuenta = await db.cuentaDelivery.findFirst({
    where: { id: pedido.cuentaDeliveryId },
    include: { items: { where: { estado: "activo" }, orderBy: [{ ronda: "asc" }, { linea: "asc" }] } },
  });
  if (!cuenta) return { ok: false, error: "No encontré la cuenta de este pedido en el Servicio delivery." };
  if (cuenta.estado === "pagada") {
    await prisma.pedidoWeb.updateMany({
      where: { id: pedido.id, storeId, estado: { in: ["aceptado", "listo"] } },
      data: { estado: "entregado", entregadoEn: new Date() },
    });
    refrescar();
    return { ok: false, error: "La cuenta ya estaba cobrada en el Servicio delivery: el pedido quedó como entregado." };
  }
  if (cuenta.estado !== "abierta" && cuenta.estado !== "por_cobrar") {
    return { ok: false, error: "La cuenta de este pedido está cancelada. Revisala en el Servicio delivery." };
  }
  if (cuenta.items.length === 0) return { ok: false, error: "La cuenta no tiene productos para cobrar." };

  // Lo que se cobra: el mismo cálculo que hace el cobro del delivery (productos − descuento + envío, con los precios de la cuenta).
  const filas = lineasDeCobro(
    cuenta.items.map((i) => ({
      productId: i.productId,
      nombreProducto: i.nombreProducto,
      cantidad: i.cantidad,
      precioUnitario: Number(i.precioUnitario),
      iva: i.iva,
      opcionesTexto: i.opcionesTexto,
      costoProducto: i.costoProducto == null ? null : Number(i.costoProducto),
      costoAgregados: i.costoAgregados == null ? null : Number(i.costoAgregados),
      precioAgregados: Number(i.precioAgregados),
      promocionId: i.promocionId,
      cortesia: i.cortesia,
      precioAntesPromo: i.precioAntesPromo == null ? null : Number(i.precioAntesPromo),
    }))
  );
  const totales = totalesDeDelivery(filas, Number(cuenta.costoEnvio), descuentoDeCuenta(cuenta));
  if (totales.descuentoInvalido) {
    return { ok: false, error: `El descuento de la cuenta ya no corresponde (${totales.descuentoInvalido}). Corregilo en el Servicio delivery.` };
  }

  // El cliente ya vio el total al pedir: la cuenta pasa directo a "por cobrar" sin imprimirla (el cobro lo exige en ese estado).
  const veniaAbierta = cuenta.estado === "abierta";
  if (veniaAbierta) {
    await prisma.cuentaDelivery.updateMany({
      where: { id: cuenta.id, storeId, estado: "abierta" },
      data: { estado: "por_cobrar", impresaEn: new Date(), impresaPor: nombreDe(sesion) },
    });
  }

  // Un local que exige facturar todo: el «ticket» del cliente se cobra como factura a Consumidor Final.
  const local = await prisma.store.findUnique({ where: { id: storeId }, select: { facturaObligatoria: true } });
  const quiereFactura = pedido.comprobanteTipo === "factura" && !!(cuenta.facturaRuc && cuenta.facturaRazonSocial);
  const comoFactura = quiereFactura || (local?.facturaObligatoria ?? false);
  const r = await pagarCuentaDelivery(cuenta.id, {
    pagos: [{ forma: pedido.metodoPago, monto: totales.total }],
    comprobanteTipo: comoFactura ? "factura" : "ticket",
    facturaTipoIdentificacion: comoFactura ? (quiereFactura ? (cuenta.facturaTipoIdentificacion ?? "ruc") : SIN_REGISTRO_FISCAL.tipo) : undefined,
    facturaNumeroIdentificacion: quiereFactura ? (cuenta.facturaRuc ?? undefined) : undefined,
    facturaRazonSocial: quiereFactura ? (cuenta.facturaRazonSocial ?? undefined) : undefined,
    facturaEmail: quiereFactura ? (cuenta.facturaEmail ?? undefined) : undefined,
    totalMostrado: totales.total,
  });

  if (!r.ok) {
    // No se cobró: la cuenta vuelve a como estaba (abierta), para poder seguir cargándole productos si hace falta.
    if (veniaAbierta) {
      await prisma.cuentaDelivery.updateMany({
        where: { id: cuenta.id, storeId, estado: "por_cobrar" },
        data: { estado: "abierta", impresaEn: null, impresaPor: null },
      });
    }
    return { ok: false, error: r.error, sinTurno: r.sinTurno };
  }

  await prisma.pedidoWeb.updateMany({
    where: { id: pedido.id, storeId, estado: { in: ["aceptado", "listo"] } },
    data: { estado: "entregado", entregadoEn: new Date() },
  });
  await registrarBitacora(storeId, sesion, {
    modulo: "pedidos",
    accion: "pedido_web_entregado",
    descripcion: `Entregó y cobró el pedido web ${formatearNumero(pedido.numero)} de ${pedido.clienteNombre} (${pedido.metodoPago}).`,
    entidad: "PedidoWeb",
    entidadId: pedido.id,
    detalle: { pedido: pedido.numero, total: r.total, ventaId: r.ventaId, metodoPago: pedido.metodoPago, comprobante: comoFactura ? "factura" : "ticket" },
  });
  refrescar();
  return { ok: true, ventaId: r.ventaId, total: r.total };
}
