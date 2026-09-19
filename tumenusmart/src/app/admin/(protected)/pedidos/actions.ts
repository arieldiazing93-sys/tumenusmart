"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { prismaDelLocal, type PrismaLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { normalizarFormaPagoPos } from "@/lib/turno-pos";
import { estacionActual } from "@/lib/estacion-actual";
import { desglosarIva, formatearNumeroFactura } from "@/lib/factura-pos";
import { turnoAbierto } from "../pos/turno-actual";

const ESTADOS_VALIDOS = [
  "pendiente",
  "confirmado",
  "en_preparacion",
  "en_despacho",
  "entregado",
  "cancelado",
];

export type ResultadoPedidoAccion =
  | { ok: true; aviso?: string; areasImpresion?: string[] }
  | { ok: false; error: string };

/**
 * Si este pedido pidió factura y todavía no se le emitió número, intenta
 * emitirlo con el punto de expedición de la estación vinculada a ESTA
 * computadora (mismo mecanismo de cookie que usa el Punto de Venta — sin
 * turno de caja de por medio, acá solo hace falta el punto de expedición
 * para numerar).
 *
 * Nunca lanza ni bloquea el cambio de estado: si no hay estación vinculada,
 * o su punto de expedición no está asignado o está vencido, el pedido sigue
 * avanzando igual como comprobante informal — pero devuelve un aviso para
 * que quien hizo el cambio sepa que no salió una factura de verdad.
 */
async function intentarEmitirFactura(
  prisma: PrismaLocal,
  pedido: {
    comprobanteTipo: string;
    facturaNumero: string | null;
    items: { precioUnitario: unknown; cantidad: number; iva: string }[];
    /** Costo de envío (delivery), gravado al 10% igual que cualquier
     *  servicio — si no se suma acá, Gravadas+Exentas queda por debajo del
     *  total real del pedido en la factura impresa. */
    costoEnvio?: unknown;
  }
): Promise<{ datos: Record<string, unknown>; aviso?: string }> {
  if (pedido.comprobanteTipo !== "factura" || pedido.facturaNumero) {
    // No pidió factura, o ya se emitió antes (idempotencia: nunca quema un
    // segundo número para el mismo pedido).
    return { datos: {} };
  }

  const estacion = await estacionActual(prisma);
  const conPunto = estacion
    ? await prisma.estacion.findUnique({ where: { id: estacion.id }, select: { puntoExpedicion: true } })
    : null;
  const pe = conPunto?.puntoExpedicion;
  if (!pe || !pe.activo || pe.timbradoHasta < new Date()) {
    return {
      datos: {},
      aviso:
        "El cliente pidió factura, pero esta computadora no tiene un punto de expedición vigente — se imprime como comprobante informal, no como factura.",
    };
  }

  const peActualizado = await prisma.puntoExpedicion.update({
    where: { id: pe.id },
    data: { ultimoNumeroFactura: { increment: 1 } },
    select: { ultimoNumeroFactura: true },
  });
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

  return {
    datos: {
      facturaNumero: formatearNumeroFactura(pe.establecimiento, pe.puntoExpedicion, peActualizado.ultimoNumeroFactura),
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
 * Devuelve un resultado en vez de lanzar los errores de validación: Next.js
 * oculta en producción el mensaje de cualquier `throw` que salga de una
 * Server Action, así que el motivo real solo llega si viaja en el retorno.
 */
export async function cambiarEstadoPedido(
  orderId: string,
  estado: string,
  formaPagoPos?: string,
  motivo?: string
): Promise<ResultadoPedidoAccion> {
  const sesion = await exigirPermiso("pedidos.cambiarEstado");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  if (!ESTADOS_VALIDOS.includes(estado)) {
    return { ok: false, error: "Estado inválido" };
  }

  let datosFactura: Record<string, unknown> = {};
  let aviso: string | undefined;
  // Áreas de Impresión presentes en este pedido — para la impresión
  // automática de comanda por área al pasar a "en preparación" (ver
  // src/lib/impresion-comprobantes.ts). Ítems sin producto (combo mitad y
  // mitad) o sin área asignada quedan afuera a propósito.
  let areasImpresion: string[] | undefined;

  // Mismo criterio que cancelarVenta del POS: motivo obligatorio, queda
  // quién y cuándo — para cualquier pedido, tenga factura o no. Si ya tenía
  // un facturaNumero asignado, ese número queda consumido para siempre (no
  // se revierte el contador del punto de expedición, igual que un
  // talonario de papel al que se le anula una hoja).
  //
  // Igual que cancelarVenta: una vez que este pedido ya quedó adentro de un
  // cierre firmado — el turno de caja (retiro/mesa) o la rendición del
  // repartidor (delivery) — no se puede cancelar. Esos montos ya se
  // declararon en el corte ciego/la rendición; permitir cancelar después
  // abriría la puerta a "cobrar, cerrar caja, y después borrar el pedido
  // para que no quede registro".
  if (estado === "cancelado") {
    if (!motivo?.trim()) {
      return { ok: false, error: "Decí por qué se cancela — queda en el historial." };
    }
    const pedidoActual = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        rendicionId: true,
        turnoPos: { select: { estado: true } },
        facturaNumero: true,
        facturaAnulada: true,
      },
    });
    if (pedidoActual?.rendicionId) {
      return {
        ok: false,
        error: "Este pedido ya está en una rendición cerrada. Una vez rendido, no se puede cancelar.",
      };
    }
    if (pedidoActual?.turnoPos && pedidoActual.turnoPos.estado !== "abierto") {
      return {
        ok: false,
        error: "El turno de este pedido ya está cerrado. Una vez cerrado el turno, no se puede cancelar.",
      };
    }
    const identidad = sesion.nombre?.trim() || sesion.email;
    const ahora = new Date();
    datosFactura = {
      canceladaPor: identidad,
      canceladaEn: ahora,
      motivoCancelacion: motivo.trim(),
      // Cancelar el pedido entero anula la factura de yapa: no puede quedar
      // un número de timbrado vigente sobre un pedido que ya no existe.
      ...(pedidoActual?.facturaNumero && !pedidoActual.facturaAnulada
        ? {
            facturaAnulada: true,
            facturaAnuladaPor: identidad,
            facturaAnuladaEn: ahora,
            facturaMotivoAnulacion: motivo.trim(),
          }
        : {}),
    };
  }

  if (estado === "en_preparacion") {
    const pedido = await prisma.order.findUnique({
      where: { id: orderId },
      select: { items: { select: { product: { select: { areaImpresionId: true } } } } },
    });
    areasImpresion = [
      ...new Set(
        (pedido?.items ?? []).map((i) => i.product?.areaImpresionId).filter((a): a is string => !!a)
      ),
    ];
  }

  if (estado === "en_despacho") {
    const pedido = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        tipoEntrega: true,
        repartidorId: true,
        comprobanteTipo: true,
        facturaNumero: true,
        costoEnvio: true,
        items: { select: { precioUnitario: true, cantidad: true, iva: true } },
      },
    });
    if (pedido?.tipoEntrega === "delivery" && !pedido.repartidorId) {
      return {
        ok: false,
        error: 'Asigná un repartidor antes de pasar el pedido a "En despacho".',
      };
    }
    // La factura de un delivery tiene que estar impresa ANTES de que el
    // repartidor se vaya — a "entregado" ya llega tarde, para entonces se
    // fue sin el papel. Retiro/mesa se numera más abajo, al entregar.
    if (pedido?.tipoEntrega === "delivery") {
      const resultado = await intentarEmitirFactura(prisma, pedido);
      datosFactura = resultado.datos;
      aviso = resultado.aviso;
    }
  }

  // Retiro y mesa se cobran en el mostrador, con la misma persona y la misma
  // caja que el Punto de Venta — así que van al mismo cierre, no a uno
  // aparte. El delivery queda afuera: ese cierre sigue siendo la Rendición
  // del repartidor (ahí sí conviene un cierre separado, porque es plata que
  // anduvo circulando fuera del local).
  let datosExtra: { formaPagoPos: string; turnoPosId: string } | Record<string, never> = {};
  if (estado === "entregado") {
    const pedido = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        tipoEntrega: true,
        estado: true,
        comprobanteTipo: true,
        facturaNumero: true,
        costoEnvio: true,
        items: { select: { precioUnitario: true, cantidad: true, iva: true } },
      },
    });
    if (pedido && pedido.tipoEntrega !== "delivery" && pedido.estado !== "entregado") {
      // Se ata al turno de la MISMA computadora desde la que se marca
      // entregado — misma cookie de estación que usa el Punto de Venta (ver
      // src/lib/estacion-actual.ts). Sin estación vinculada, o sin turno
      // abierto en esa estación, no hay a qué cierre atarlo: se marca
      // entregado igual, sin pedir forma de pago — no romper el flujo de
      // todos los días para quien mira Pedidos desde un dispositivo que no
      // es una caja.
      const estacion = await estacionActual(prisma);
      const turno = estacion ? await turnoAbierto(prisma, estacion.id) : null;
      if (turno) {
        if (!formaPagoPos) {
          return { ok: false, error: "Declará con qué se cobró antes de marcarlo entregado." };
        }
        datosExtra = { formaPagoPos: normalizarFormaPagoPos(formaPagoPos), turnoPosId: turno.id };
      }

      const resultado = await intentarEmitirFactura(prisma, pedido);
      datosFactura = resultado.datos;
      aviso = resultado.aviso;
    }
  }

  await prisma.order.update({
    where: { id: orderId },
    data: { estado, ...datosExtra, ...datosFactura },
  });
  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
  if ("turnoPosId" in datosExtra) {
    revalidatePath("/admin/pos");
    revalidatePath("/admin/pos/turnos");
  }
  return { ok: true, aviso, areasImpresion };
}

export async function asignarRepartidor(
  orderId: string,
  repartidorId: string
): Promise<ResultadoPedidoAccion> {
  await exigirPermiso("pedidos.asignarRepartidor");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  await prisma.order.update({
    where: { id: orderId },
    data: { repartidorId: repartidorId || null },
  });
  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
  return { ok: true };
}
