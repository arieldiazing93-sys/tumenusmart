"use server";

import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal, upsertClienteFiscal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { estacionActual } from "@/lib/estacion-actual";
import { desglosarIva, formatearNumeroFactura } from "@/lib/factura-pos";
import { esDeMesAnterior, nombreDelMes } from "@/lib/mes-fiscal";
import { registrarBitacora } from "@/lib/bitacora";
import { cancelarVenta } from "../pos/actions";
import { cambiarEstadoPedido } from "../pedidos/actions";

export type ResultadoCancelarFactura = { ok: true } | { ok: false; error: string };

export type ItemDetalleFactura = {
  nombreProducto: string;
  cantidad: number;
  precioUnitario: number;
  opcionesTexto: string | null;
};

export type DetalleFactura = {
  facturaTimbrado: string | null;
  facturaVencimiento: Date | null;
  facturaRazonSocialEmisor: string | null;
  facturaRucEmisor: string | null;
  items: ItemDetalleFactura[];
  facturaGravado10: number;
  facturaGravado5: number;
  facturaExento: number;
  facturaIva10: number;
  facturaIva5: number;
  /** Descuento general de la cuenta, en guaraníes (solo ventas del mostrador; 0 si no hubo). */
  descuento: number;
};

/**
 * El contenido de la factura (productos, desglose de IVA, emisor) para
 * mostrar DENTRO del modal de "Ver" — sin esto, el modal solo repite lo que
 * ya se ve en la fila de la lista y obliga a un clic más (abrir el ticket
 * aparte) para ver de qué se trata de verdad.
 */
export async function obtenerDetalleFactura(
  origen: "pedido" | "venta",
  id: string
): Promise<DetalleFactura | null> {
  await exigirPermiso("pos.verHistorico");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const registro =
    origen === "venta"
      ? await db.ventaPos.findUnique({
          where: { id },
          select: {
            facturaTimbrado: true,
            facturaVencimiento: true,
            facturaRazonSocialEmisor: true,
            facturaRucEmisor: true,
            facturaGravado10: true,
            facturaGravado5: true,
            facturaExento: true,
            facturaIva10: true,
            facturaIva5: true,
            descuento: true,
            items: { select: { nombreProducto: true, cantidad: true, precioUnitario: true, opcionesTexto: true } },
          },
        })
      : await db.order.findUnique({
          where: { id },
          select: {
            facturaTimbrado: true,
            facturaVencimiento: true,
            facturaRazonSocialEmisor: true,
            facturaRucEmisor: true,
            facturaGravado10: true,
            facturaGravado5: true,
            facturaExento: true,
            facturaIva10: true,
            facturaIva5: true,
            items: { select: { nombreProducto: true, cantidad: true, precioUnitario: true, opcionesTexto: true } },
          },
        });
  if (!registro) return null;

  return {
    facturaTimbrado: registro.facturaTimbrado,
    facturaVencimiento: registro.facturaVencimiento,
    facturaRazonSocialEmisor: registro.facturaRazonSocialEmisor,
    facturaRucEmisor: registro.facturaRucEmisor,
    items: registro.items.map((i) => ({ ...i, precioUnitario: Number(i.precioUnitario) })),
    facturaGravado10: Number(registro.facturaGravado10 ?? 0),
    facturaGravado5: Number(registro.facturaGravado5 ?? 0),
    facturaExento: Number(registro.facturaExento ?? 0),
    facturaIva10: Number(registro.facturaIva10 ?? 0),
    facturaIva5: Number(registro.facturaIva5 ?? 0),
    // Solo la venta del mostrador tiene descuento general (el pedido online, no).
    descuento: "descuento" in registro ? Number(registro.descuento) : 0,
  };
}

export type ClienteEncontrado = {
  id: string;
  numero: number | null;
  nombre: string;
  email: string | null;
  tipoIdentificacion: string | null;
  numeroIdentificacion: string | null;
};

/**
 * Busca clientes ya cargados por razón social/nombre o por número de
 * identificación (RUC, Cédula, etc.) — primer paso de "Nueva factura": el
 * cajero busca al cliente correcto ANTES de tocar nada de la cuenta a
 * remitir, en vez de partir de lo que decía la factura anulada (que puede
 * estar mal, es justo lo que se está por corregir).
 */
export async function buscarClientesFiscales(query: string): Promise<ClienteEncontrado[]> {
  await exigirPermiso("pos.verHistorico");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const texto = query.trim();
  if (!texto) return [];

  return db.customer.findMany({
    where: {
      OR: [
        { nombre: { contains: texto, mode: "insensitive" } },
        { numeroIdentificacion: { contains: texto, mode: "insensitive" } },
      ],
    },
    orderBy: { nombre: "asc" },
    select: {
      id: true,
      numero: true,
      nombre: true,
      email: true,
      tipoIdentificacion: true,
      numeroIdentificacion: true,
    },
    take: 10,
  });
}

/**
 * Anula una factura — con la cuenta que la sostiene, o sin ella.
 *
 * Con tambienCuenta=true, se reusan cancelarVenta/cambiarEstadoPedido tal
 * cual: esas dos acciones YA anulan la factura de yapa cuando cancelan algo
 * que tenía número (ver ahí) — no hay que repetir esa lógica acá.
 *
 * Con tambienCuenta=false, esta es la única acción que toca algo: la cuenta
 * sigue viva (mismo total, mismos ítems, mismo estado), solo el número de
 * factura queda consumido. Es el caso de una factura mal cargada —RUC
 * equivocado, razón social mal escrita— que hay que anular sin perder la
 * venta en sí.
 */
export async function cancelarFactura(
  origen: "pedido" | "venta",
  id: string,
  motivo: string,
  tambienCuenta: boolean,
  /** El dueño vio la alerta de "factura de un mes ya cerrado" y aceptó anularla igual. */
  confirmoMesAnterior = false
): Promise<ResultadoCancelarFactura> {
  // Mismo permiso que la pantalla de Facturas — es información y una acción
  // del dueño, no del día a día de un cajero.
  const sesion = await exigirPermiso("pos.verHistorico");

  if (!motivo.trim()) {
    return { ok: false, error: "Decí por qué se anula — queda en el historial." };
  }

  // Una factura de un mes que ya terminó probablemente ya se presentó en
  // Marangatú (RG 90): anularla ahora no cambia lo que se le informó a la DNIT.
  // La pantalla muestra una alerta grande y pide confirmar; acá se exige de
  // nuevo, porque lo que viene del navegador no es de fiar. La fecha sale de
  // la base, nunca del navegador (es la misma que usa el registro RG 90).
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);
  const datosDeLaFactura =
    origen === "venta"
      ? await db.ventaPos
          .findUnique({ where: { id }, select: { creadoEn: true, facturaNumero: true } })
          .then((v) => (v ? { fecha: v.creadoEn, factura: v.facturaNumero } : null))
      : await db.order
          .findUnique({ where: { id }, select: { createdAt: true, facturaNumero: true } })
          .then((p) => (p ? { fecha: p.createdAt, factura: p.facturaNumero } : null));
  const fechaFactura = datosDeLaFactura?.fecha;
  const mesAnterior = !!fechaFactura && esDeMesAnterior(fechaFactura);
  if (fechaFactura && mesAnterior && !confirmoMesAnterior) {
    return {
      ok: false,
      error: `Esta factura es de ${nombreDelMes(fechaFactura)}, un mes que ya terminó. Confirmá que entendés el aviso antes de anularla.`,
    };
  }

  // Lo que queda en la bitácora: sobre todo si era de un mes ya terminado.
  const anotarEnBitacora = () =>
    registrarBitacora(storeId, sesion, {
      modulo: "facturas",
      accion: "factura_anulada",
      descripcion: `Anuló la factura ${datosDeLaFactura?.factura ?? "(sin número)"}${
        tambienCuenta ? " y canceló la cuenta" : " (la cuenta sigue vigente)"
      }. Motivo: ${motivo.trim()}.${
        mesAnterior && fechaFactura ? ` ATENCIÓN: era de ${nombreDelMes(fechaFactura)}, un mes ya terminado.` : ""
      }`,
      entidad: origen === "venta" ? "VentaPos" : "Order",
      entidadId: id,
      detalle: {
        factura: datosDeLaFactura?.factura ?? null,
        origen,
        tambien_cancela_la_cuenta: tambienCuenta,
        de_un_mes_anterior: mesAnterior,
        motivo: motivo.trim(),
      },
    });

  if (tambienCuenta) {
    const resultado =
      origen === "venta"
        ? await cancelarVenta(id, motivo)
        : await cambiarEstadoPedido(id, "cancelado", undefined, motivo);
    if (!resultado.ok) return resultado;
    await anotarEnBitacora();
    revalidatePath("/admin/facturas");
    return { ok: true };
  }

  const identidad = sesion.nombre?.trim() || sesion.email;
  const datosAnulacion = {
    facturaAnulada: true,
    facturaAnuladaPor: identidad,
    facturaAnuladaEn: new Date(),
    facturaMotivoAnulacion: motivo.trim(),
  };

  if (origen === "venta") {
    const venta = await db.ventaPos.findUnique({
      where: { id },
      select: { facturaNumero: true, facturaAnulada: true, cancelada: true },
    });
    if (!venta || !venta.facturaNumero) return { ok: false, error: "Esa venta no tiene factura." };
    if (venta.cancelada) {
      return { ok: false, error: "Esa cuenta ya está cancelada — la factura ya quedó anulada con ella." };
    }
    if (venta.facturaAnulada) return { ok: false, error: "Esa factura ya estaba anulada." };
    await db.ventaPos.update({ where: { id }, data: datosAnulacion });
    revalidatePath(`/admin/pos/venta/${id}`);
  } else {
    const pedido = await db.order.findUnique({
      where: { id },
      select: { facturaNumero: true, facturaAnulada: true, estado: true },
    });
    if (!pedido || !pedido.facturaNumero) return { ok: false, error: "Ese pedido no tiene factura." };
    if (pedido.estado === "cancelado") {
      return { ok: false, error: "Ese pedido ya está cancelado — la factura ya quedó anulada con él." };
    }
    if (pedido.facturaAnulada) return { ok: false, error: "Esa factura ya estaba anulada." };
    await db.order.update({ where: { id }, data: datosAnulacion });
    revalidatePath(`/admin/pedidos/${id}`);
  }

  await anotarEnBitacora();
  revalidatePath("/admin/facturas");
  return { ok: true };
}

// ===========================================================================
//  Remisión: emitir una factura nueva para una cuenta cuya factura se anuló
//  sola (cancelarFactura de arriba, tambienCuenta=false) — mismo pedido/
//  venta, mismos ítems, número de timbrado nuevo. Ver Fase 11 del plan.
// ===========================================================================

export type ResumenParaRemision = {
  origen: "pedido" | "venta";
  id: string;
  numero: number;
  cliente: string;
  total: number;
  facturaNumeroAnterior: string;
  facturaAnuladaEn: Date;
  facturaMotivoAnulacion: string;
  tipoIdentificacion: string;
  numeroIdentificacion: string;
  razonSocial: string;
  email: string;
};

export type ResultadoBuscarParaRemision =
  | { ok: true; resumen: ResumenParaRemision }
  | { ok: false; error: string };

/**
 * Busca por número de pedido o de venta de mostrador (el que ve el cliente,
 * no el id interno) y valida que sea elegible: factura anulada SOLA (la
 * cuenta sigue vigente). Devuelve un resumen con los datos viejos, para
 * precargar el formulario de remisión y que el dueño solo corrija lo que
 * estaba mal.
 */
export async function buscarParaRemision(
  origen: "pedido" | "venta",
  numero: number
): Promise<ResultadoBuscarParaRemision> {
  await exigirPermiso("pos.verHistorico");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  if (origen === "venta") {
    const venta = await db.ventaPos.findFirst({
      where: { numero },
      select: {
        id: true,
        numero: true,
        total: true,
        clienteNombre: true,
        cancelada: true,
        facturaAnulada: true,
        facturaNumero: true,
        facturaAnuladaEn: true,
        facturaMotivoAnulacion: true,
        facturaTipoIdentificacion: true,
        facturaRuc: true,
        facturaRazonSocial: true,
      },
    });
    if (!venta) return { ok: false, error: "No se encontró esa venta." };
    if (venta.cancelada) {
      return { ok: false, error: "Esa cuenta está cancelada — no se puede remitir." };
    }
    if (!venta.facturaAnulada || !venta.facturaNumero) {
      return { ok: false, error: "Esa venta no tiene una factura anulada para remitir." };
    }
    return {
      ok: true,
      resumen: {
        origen: "venta",
        id: venta.id,
        numero: venta.numero,
        cliente: venta.clienteNombre?.trim() || "Cliente de mostrador",
        total: Number(venta.total),
        facturaNumeroAnterior: venta.facturaNumero,
        facturaAnuladaEn: venta.facturaAnuladaEn!,
        facturaMotivoAnulacion: venta.facturaMotivoAnulacion ?? "",
        tipoIdentificacion: venta.facturaTipoIdentificacion ?? "",
        numeroIdentificacion: venta.facturaRuc ?? "",
        razonSocial: venta.facturaRazonSocial ?? "",
        email: "",
      },
    };
  }

  const pedido = await db.order.findUnique({
    where: { storeId_numero: { storeId, numero } },
    select: {
      id: true,
      numero: true,
      total: true,
      clienteNombre: true,
      estado: true,
      facturaAnulada: true,
      facturaNumero: true,
      facturaAnuladaEn: true,
      facturaMotivoAnulacion: true,
      facturaTipoIdentificacion: true,
      facturaRuc: true,
      facturaRazonSocial: true,
      facturaEmail: true,
    },
  });
  if (!pedido) return { ok: false, error: "No se encontró ese pedido." };
  if (pedido.estado === "cancelado") {
    return { ok: false, error: "Ese pedido está cancelado — no se puede remitir." };
  }
  if (!pedido.facturaAnulada || !pedido.facturaNumero) {
    return { ok: false, error: "Ese pedido no tiene una factura anulada para remitir." };
  }
  return {
    ok: true,
    resumen: {
      origen: "pedido",
      id: pedido.id,
      numero: pedido.numero,
      cliente: pedido.clienteNombre,
      total: Number(pedido.total),
      facturaNumeroAnterior: pedido.facturaNumero,
      facturaAnuladaEn: pedido.facturaAnuladaEn!,
      facturaMotivoAnulacion: pedido.facturaMotivoAnulacion ?? "",
      tipoIdentificacion: pedido.facturaTipoIdentificacion ?? "",
      numeroIdentificacion: pedido.facturaRuc ?? "",
      razonSocial: pedido.facturaRazonSocial ?? "",
      email: pedido.facturaEmail ?? "",
    },
  };
}

export type ResultadoRemitirFactura = { ok: true; url: string } | { ok: false; error: string };

/**
 * Emite una factura nueva para un pedido/venta cuya factura anterior se
 * anuló sola — mismos ítems, mismo total, número de timbrado nuevo y datos
 * del cliente corregidos. La factura vieja queda congelada en
 * FacturaReemplazada antes de pisarse (nunca se pierde el rastro de qué
 * número tuvo antes, aunque ese número en sí nunca se reutiliza).
 *
 * Vuelve a validar todo server-side — nunca confía en lo que ya validó
 * buscarParaRemision del lado del cliente, que pudo quedar desactualizado
 * mientras se completaba el formulario.
 */
export async function remitirFactura(
  origen: "pedido" | "venta",
  id: string,
  datosCliente: {
    tipoIdentificacion: string;
    numeroIdentificacion: string;
    razonSocial: string;
    email: string;
  },
  motivo: string
): Promise<ResultadoRemitirFactura> {
  const sesion = await exigirPermiso("pos.verHistorico");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  if (!motivo.trim()) {
    return { ok: false, error: "Decí por qué se remite — queda en el historial." };
  }
  const tipoIdentificacion = datosCliente.tipoIdentificacion.trim();
  const numeroIdentificacion = datosCliente.numeroIdentificacion.trim();
  const razonSocial = datosCliente.razonSocial.trim();
  const email = datosCliente.email.trim();
  if (!tipoIdentificacion || !numeroIdentificacion || !razonSocial) {
    return { ok: false, error: "Completá tipo, número y razón social del cliente." };
  }

  // La remisión se emite desde el punto de expedición vigente de ESTA
  // computadora, no el que emitió el número viejo — ese turno/estación
  // puede estar cerrado hace rato, o ser directamente otro. A diferencia de
  // una venta normal, acá no hay salida de "se imprime como informal": si
  // se pidió remisión es porque hace falta un número real.
  const estacion = await estacionActual(db);
  const conPunto = estacion
    ? await db.estacion.findUnique({ where: { id: estacion.id }, select: { puntoExpedicion: true } })
    : null;
  const pe = conPunto?.puntoExpedicion;
  if (!pe || !pe.activo || pe.timbradoHasta < new Date()) {
    return {
      ok: false,
      error:
        "Esta computadora no tiene un punto de expedición vigente — no se puede generar una factura nueva desde acá.",
    };
  }

  const identidad = sesion.nombre?.trim() || sesion.email;
  const ahora = new Date();

  if (origen === "venta") {
    const venta = await db.ventaPos.findUnique({
      where: { id },
      select: {
        cancelada: true,
        facturaAnulada: true,
        facturaNumero: true,
        facturaTimbrado: true,
        facturaVencimiento: true,
        facturaRazonSocial: true,
        facturaRuc: true,
        facturaTipoIdentificacion: true,
        facturaAnuladaPor: true,
        facturaAnuladaEn: true,
        facturaMotivoAnulacion: true,
        descuento: true,
        items: { select: { precioUnitario: true, cantidad: true, iva: true } },
      },
    });
    if (!venta) return { ok: false, error: "Esa venta no existe." };
    if (venta.cancelada) return { ok: false, error: "Esa cuenta está cancelada — no se puede remitir." };
    if (!venta.facturaAnulada || !venta.facturaNumero) {
      return { ok: false, error: "Esa venta no tiene una factura anulada para remitir." };
    }

    // Se recalcula desde los ítems reales en vez de copiar los montos
    // viejos — la venta en sí no cambió, pero es la fuente de verdad. Con el
    // descuento general de la cuenta, si tuvo: los ítems guardan el precio sin
    // descuento, y el IVA tiene que salir sobre lo que se cobró.
    const desglose = desglosarIva(
      venta.items.map((i) => ({ precioUnitario: Number(i.precioUnitario), cantidad: i.cantidad, iva: i.iva })),
      Number(venta.descuento)
    );

    try {
      await prisma.$transaction(async (tx) => {
        await upsertClienteFiscal(tx, storeId, { tipoIdentificacion, numeroIdentificacion, razonSocial, email });

        // Atómico: se incrementa PRIMERO y se usa el valor YA incrementado.
        const peActualizado = await tx.puntoExpedicion.update({
          where: { id: pe.id },
          data: { ultimoNumeroFactura: { increment: 1 } },
          select: { ultimoNumeroFactura: true },
        });
        const facturaNumeroNueva = formatearNumeroFactura(
          pe.establecimiento,
          pe.puntoExpedicion,
          peActualizado.ultimoNumeroFactura
        );

        await tx.facturaReemplazada.create({
          data: {
            storeId,
            origen: "venta",
            ventaId: id,
            facturaNumero: venta.facturaNumero!,
            facturaTimbrado: venta.facturaTimbrado,
            facturaVencimiento: venta.facturaVencimiento,
            facturaRazonSocial: venta.facturaRazonSocial,
            facturaRuc: venta.facturaRuc,
            facturaTipoIdentificacion: venta.facturaTipoIdentificacion,
            anuladaPor: venta.facturaAnuladaPor ?? identidad,
            anuladaEn: venta.facturaAnuladaEn ?? ahora,
            motivoAnulacion: venta.facturaMotivoAnulacion ?? "",
            facturaNuevaNumero: facturaNumeroNueva,
            remitidaPor: identidad,
          },
        });

        // updateMany con el mismo guard de elegibilidad que arriba: si algo
        // cambió el estado de esta venta justo mientras se armaba la
        // remisión (otra pestaña la canceló, o ya la remitieron), no se
        // pisa nada — y al tirar el error, TODA la transacción se deshace,
        // incluido el número ya incrementado, que no queda desperdiciado.
        const actualizada = await tx.ventaPos.updateMany({
          where: { id, cancelada: false, facturaAnulada: true },
          data: {
            facturaNumero: facturaNumeroNueva,
            facturaTimbrado: pe.numeroTimbrado,
            facturaVencimiento: pe.timbradoHasta,
            facturaGravado10: desglose.gravado10,
            facturaGravado5: desglose.gravado5,
            facturaExento: desglose.exento,
            facturaIva10: desglose.iva10,
            facturaIva5: desglose.iva5,
            facturaRazonSocialEmisor: pe.razonSocialEmisor,
            facturaRucEmisor: pe.rucEmisor,
            facturaTipoIdentificacion: tipoIdentificacion,
            facturaRazonSocial: razonSocial,
            facturaRuc: numeroIdentificacion,
            facturaAnulada: false,
            facturaAnuladaPor: null,
            facturaAnuladaEn: null,
            facturaMotivoAnulacion: null,
          },
        });
        if (actualizada.count === 0) {
          throw new Error("Esa cuenta cambió mientras se armaba la remisión. Volvé a intentar.");
        }
      });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "No se pudo generar la factura." };
    }

    await registrarBitacora(storeId, sesion, {
      modulo: "facturas",
      accion: "factura_remitida",
      descripcion: `Emitió una factura nueva (remisión) de una venta del mostrador, en lugar de la anulada. Cliente: ${razonSocial} (${numeroIdentificacion}). Motivo: ${motivo.trim()}.`,
      entidad: "VentaPos",
      entidadId: id,
      detalle: { origen, cliente: razonSocial, identificacion: numeroIdentificacion, motivo: motivo.trim() },
    });

    revalidatePath("/admin/facturas");
    revalidatePath(`/admin/pos/venta/${id}`);
    return { ok: true, url: `/admin/pos/venta/${id}/ticket` };
  }

  const pedido = await db.order.findUnique({
    where: { id },
    select: {
      estado: true,
      facturaAnulada: true,
      facturaNumero: true,
      facturaTimbrado: true,
      facturaVencimiento: true,
      facturaRazonSocial: true,
      facturaRuc: true,
      facturaTipoIdentificacion: true,
      facturaAnuladaPor: true,
      facturaAnuladaEn: true,
      facturaMotivoAnulacion: true,
      costoEnvio: true,
      items: { select: { precioUnitario: true, cantidad: true, iva: true } },
    },
  });
  if (!pedido) return { ok: false, error: "Ese pedido no existe." };
  if (pedido.estado === "cancelado") {
    return { ok: false, error: "Ese pedido está cancelado — no se puede remitir." };
  }
  if (!pedido.facturaAnulada || !pedido.facturaNumero) {
    return { ok: false, error: "Ese pedido no tiene una factura anulada para remitir." };
  }

  const lineas = pedido.items.map((i) => ({
    precioUnitario: Number(i.precioUnitario),
    cantidad: i.cantidad,
    iva: i.iva,
  }));
  const costoEnvio = Number(pedido.costoEnvio ?? 0);
  if (costoEnvio > 0) lineas.push({ precioUnitario: costoEnvio, cantidad: 1, iva: "gravado10" });
  const desglose = desglosarIva(lineas);

  try {
    await prisma.$transaction(async (tx) => {
      await upsertClienteFiscal(tx, storeId, { tipoIdentificacion, numeroIdentificacion, razonSocial, email });

      const peActualizado = await tx.puntoExpedicion.update({
        where: { id: pe.id },
        data: { ultimoNumeroFactura: { increment: 1 } },
        select: { ultimoNumeroFactura: true },
      });
      const facturaNumeroNueva = formatearNumeroFactura(
        pe.establecimiento,
        pe.puntoExpedicion,
        peActualizado.ultimoNumeroFactura
      );

      await tx.facturaReemplazada.create({
        data: {
          storeId,
          origen: "pedido",
          orderId: id,
          facturaNumero: pedido.facturaNumero!,
          facturaTimbrado: pedido.facturaTimbrado,
          facturaVencimiento: pedido.facturaVencimiento,
          facturaRazonSocial: pedido.facturaRazonSocial,
          facturaRuc: pedido.facturaRuc,
          facturaTipoIdentificacion: pedido.facturaTipoIdentificacion,
          anuladaPor: pedido.facturaAnuladaPor ?? identidad,
          anuladaEn: pedido.facturaAnuladaEn ?? ahora,
          motivoAnulacion: pedido.facturaMotivoAnulacion ?? "",
          facturaNuevaNumero: facturaNumeroNueva,
          remitidaPor: identidad,
        },
      });

      const actualizado = await tx.order.updateMany({
        where: { id, estado: { not: "cancelado" }, facturaAnulada: true },
        data: {
          facturaNumero: facturaNumeroNueva,
          facturaTimbrado: pe.numeroTimbrado,
          facturaVencimiento: pe.timbradoHasta,
          facturaGravado10: desglose.gravado10,
          facturaGravado5: desglose.gravado5,
          facturaExento: desglose.exento,
          facturaIva10: desglose.iva10,
          facturaIva5: desglose.iva5,
          facturaRazonSocialEmisor: pe.razonSocialEmisor,
          facturaRucEmisor: pe.rucEmisor,
          facturaTipoIdentificacion: tipoIdentificacion,
          facturaRazonSocial: razonSocial,
          facturaRuc: numeroIdentificacion,
          facturaEmail: email || null,
          facturaAnulada: false,
          facturaAnuladaPor: null,
          facturaAnuladaEn: null,
          facturaMotivoAnulacion: null,
        },
      });
      if (actualizado.count === 0) {
        throw new Error("Ese pedido cambió mientras se armaba la remisión. Volvé a intentar.");
      }
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo generar la factura." };
  }

  await registrarBitacora(storeId, sesion, {
    modulo: "facturas",
    accion: "factura_remitida",
    descripcion: `Emitió una factura nueva (remisión) de un pedido, en lugar de la anulada. Cliente: ${razonSocial} (${numeroIdentificacion}). Motivo: ${motivo.trim()}.`,
    entidad: "Order",
    entidadId: id,
    detalle: { origen, cliente: razonSocial, identificacion: numeroIdentificacion, motivo: motivo.trim() },
  });

  revalidatePath("/admin/facturas");
  revalidatePath(`/admin/pedidos/${id}`);
  return { ok: true, url: `/admin/pedidos/${id}/ticket` };
}
