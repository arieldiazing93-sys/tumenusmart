"use server";

import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal, siguienteNumeroPedido } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { armarPedido, type LineaPedida } from "@/lib/precio-pedido";
import { cargarCatalogoParaPedido } from "@/lib/catalogo-pedido";
import { puedeFacturarDesdeEstaEstacion, textoSinFactura } from "@/lib/factura-estacion";
import { registrarConsumoVenta } from "@/lib/movimientos-stock";
import { registrarBitacora } from "@/lib/bitacora";
import { METODOS_PAGO_PEDIDO, metodosPagoHabilitados } from "@/lib/metodos-pago";
import { SIN_REGISTRO_FISCAL, TIPOS_IDENTIFICACION_FISCAL } from "@/lib/tipo-cliente";
import { formatearGuarani, formatearNumero } from "@/lib/format";

/**
 * Lo que carga una persona del local cuando el cliente llama por teléfono. Igual que en el checkout público, lo único
 * que se manda de los productos es QUÉ y cuántos: nombres, precios y textos de la comanda los pone el servidor.
 */
export type DatosPedidoManual = {
  clienteNombre: string;
  clienteTelefono: string;
  tipoEntrega: "delivery" | "retiro";
  direccion?: string;
  /** La zona de envío elegida, si hay. Sin zona, el envío "se coordina". */
  deliveryZoneId?: string;
  /**
   * Lo que se le cobra de envío, acordado con el cliente. Si no viene, se usa el de la zona (o 0 si no hay zona).
   * Puede ser distinto del de la zona: por teléfono se arregla el precio, y queda en la bitácora.
   */
  costoEnvio?: number;
  metodoPago: string;
  comprobanteTipo: "ticket" | "factura";
  facturaTipoIdentificacion?: string;
  facturaRuc?: string;
  facturaRazonSocial?: string;
  facturaEmail?: string;
  notas?: string;
  items: LineaPedida[];
};

export type ResultadoPedidoManual = { ok: true; orderId: string } | { ok: false; error: string };

/** Largos máximos de los textos libres, los mismos que el checkout público. */
const LARGO = { nombre: 80, telefono: 30, direccion: 200, notas: 500, razonSocial: 120, ruc: 30, email: 120 };

/** Tope del envío: más que esto es un número mal tipeado, no un precio. */
const ENVIO_MAXIMO = 10000000;

function recortar(valor: string | undefined, max: number): string | undefined {
  const limpio = valor?.trim();
  return limpio ? limpio.slice(0, max) : undefined;
}

/**
 * Carga un pedido que llegó por teléfono, con la misma lógica que uno del menú digital: los precios salen de la
 * base, se descuenta el stock de las recetas y el pedido nace en la misma tabla, así que desde ahí sigue el mismo
 * circuito (en preparación, repartidor, en despacho, entregado, factura, rendición).
 *
 * Nace "confirmado": la persona que lo carga ya lo acordó con el cliente, así que no hay nada por confirmar ni
 * botón de WhatsApp que esperar. No se frena por "pedidos pausados" ni por el horario de la carta: eso es para el
 * cliente que pide solo; quien atiende el teléfono decide.
 *
 * Devuelve un resultado en vez de lanzar los errores de validación: Next.js oculta en producción el mensaje de
 * cualquier `throw` de una Server Action.
 */
export async function crearPedidoManual(datos: DatosPedidoManual): Promise<ResultadoPedidoManual> {
  const sesion = await exigirPermiso("pedidos.crear");
  const storeId = await idLocalActual();
  // Todas las consultas hechas con `db` quedan atadas a este local.
  const db = prismaDelLocal(storeId);

  const clienteNombre = recortar(datos.clienteNombre, LARGO.nombre);
  const clienteTelefono = recortar(datos.clienteTelefono, LARGO.telefono);
  if (!clienteNombre || !clienteTelefono) {
    return { ok: false, error: "Cargá el nombre y el teléfono del cliente." };
  }
  if (datos.tipoEntrega !== "delivery" && datos.tipoEntrega !== "retiro") {
    return { ok: false, error: "Elegí si es delivery o retiro." };
  }
  if (!METODOS_PAGO_PEDIDO.some((m) => m.value === datos.metodoPago)) {
    return { ok: false, error: "Elegí la forma de pago." };
  }
  if (!Array.isArray(datos.items) || datos.items.length === 0) {
    return { ok: false, error: "El pedido está vacío: agregá al menos un producto." };
  }

  const direccion = datos.tipoEntrega === "delivery" ? recortar(datos.direccion, LARGO.direccion) : undefined;
  if (datos.tipoEntrega === "delivery" && !direccion) {
    return { ok: false, error: "Para delivery hace falta la dirección: es lo que ve el repartidor." };
  }

  // Store no pertenece a ningún local (no está en MODELOS_POR_LOCAL): se lee con el cliente global.
  const local = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      facturaObligatoria: true,
      aceptaEfectivo: true,
      aceptaTransferencia: true,
      aceptaTarjetaDebito: true,
      aceptaTarjetaCredito: true,
    },
  });

  // El local pudo destildar una forma de pago en Configuración: se vuelve a comprobar acá, no solo en la pantalla.
  if (!metodosPagoHabilitados(local).some((m) => m.value === datos.metodoPago)) {
    return { ok: false, error: "Esa forma de pago no está habilitada en este local. Elegí otra." };
  }

  // ------------------------------------------------------------- comprobante
  // Las mismas reglas que el cobro del Punto de Venta (registrarVenta). La pantalla ya las respeta, pero esto es lo
  // que de verdad vale: una acción del servidor se puede llamar sin pasar por ella.
  const quiereFactura = datos.comprobanteTipo === "factura";
  const sinNombre = quiereFactura && datos.facturaTipoIdentificacion === SIN_REGISTRO_FISCAL.tipo;
  const facturaObligatoria = local?.facturaObligatoria ?? false;
  const facturacion = await puedeFacturarDesdeEstaEstacion(db);

  // Si el local exige facturar toda venta (timbrado Autoimpresor, RG 90/2021): sin un punto de expedición vigente en
  // esta computadora no hay forma legal de cargar el pedido, y con punto vigente no se puede colar un "ticket".
  if (facturaObligatoria) {
    if (!facturacion.puedeFacturar) {
      return {
        ok: false,
        error:
          "Este local exige facturar todas las ventas y esta computadora no tiene un punto de expedición vigente asignado. Pedile al dueño que lo asigne en Puntos de expedición.",
      };
    }
    if (!quiereFactura) {
      return { ok: false, error: "Este local exige facturar todas las ventas — no se puede cargar como ticket." };
    }
  }

  if (quiereFactura) {
    if (!sinNombre) {
      if (!TIPOS_IDENTIFICACION_FISCAL.some((t) => t.valor === datos.facturaTipoIdentificacion)) {
        return { ok: false, error: "Elegí con o sin registro fiscal, y el tipo de documento." };
      }
      if (!datos.facturaRuc?.trim() || !datos.facturaRazonSocial?.trim()) {
        return { ok: false, error: "Para factura con registro fiscal hacen falta el número y la razón social." };
      }
      if (datos.facturaEmail?.trim() && !datos.facturaEmail.includes("@")) {
        return { ok: false, error: "El correo electrónico no es válido." };
      }
    }
    if (!facturacion.puedeFacturar && facturacion.motivo) {
      return { ok: false, error: `${textoSinFactura(facturacion.motivo)} Cargalo como ticket.` };
    }
  }
  const comprobanteTipoFinal = quiereFactura ? "factura" : "ticket";
  const consumidorFinal = sinNombre;

  // ---------------------------------------------------------------- el precio
  // La carta REAL del local: lo que mandó el navegador solo dice qué productos y cuántos.
  const catalogo = await cargarCatalogoParaPedido(db, storeId, datos.items);
  const armado = armarPedido(catalogo, datos.items);
  if (!armado.ok) return { ok: false, error: armado.motivo };
  if (armado.subtotal <= 0) return { ok: false, error: "El total tiene que ser mayor a cero." };

  // ----------------------------------------------------------------- el envío
  let zonaId: string | undefined;
  let costoZona = 0;
  if (datos.tipoEntrega === "delivery" && datos.deliveryZoneId) {
    const zona = await db.deliveryZone.findFirst({ where: { id: datos.deliveryZoneId, activo: true } });
    if (!zona) {
      return { ok: false, error: "La zona de envío que elegiste ya no existe. Elegí otra." };
    }
    zonaId = zona.id;
    costoZona = Number(zona.costoEnvio);
  }

  let costoEnvio = 0;
  if (datos.tipoEntrega === "delivery") {
    if (datos.costoEnvio === undefined) {
      costoEnvio = costoZona;
    } else if (Number.isFinite(datos.costoEnvio) && datos.costoEnvio >= 0 && datos.costoEnvio <= ENVIO_MAXIMO) {
      costoEnvio = Math.round(datos.costoEnvio);
    } else {
      return { ok: false, error: "El costo de envío no es válido." };
    }
  }

  const subtotal = armado.subtotal;
  const total = subtotal + costoEnvio;

  // El cliente es de este local: cada negocio tiene su propia ficha de esa persona (se completa storeId a mano
  // porque se usa el cliente global, igual que en el checkout público).
  const customer = await prisma.customer.upsert({
    where: { storeId_telefono: { storeId, telefono: clienteTelefono } },
    update: { nombre: clienteNombre },
    create: { storeId, nombre: clienteNombre, telefono: clienteTelefono },
  });

  // El número se pide justo antes de crear el pedido: si algo falló en las validaciones de arriba, no se gasta.
  const numero = await siguienteNumeroPedido(storeId);
  const quien = sesion.nombre?.trim() || sesion.email;

  // En una transacción: si el pedido se crea, el descuento de stock de su receta queda creado de yapa, nunca a medias.
  const order = await prisma.$transaction(async (tx) => {
    const nuevoPedido = await tx.order.create({
      data: {
        storeId,
        numero,
        customerId: customer.id,
        clienteNombre,
        clienteTelefono,
        tipoEntrega: datos.tipoEntrega,
        origen: "telefono",
        estado: "confirmado",
        deliveryZoneId: zonaId,
        direccion,
        metodoPagoReferencia: datos.metodoPago,
        comprobanteTipo: comprobanteTipoFinal,
        facturaTipoIdentificacion:
          comprobanteTipoFinal === "factura"
            ? consumidorFinal
              ? SIN_REGISTRO_FISCAL.tipo
              : datos.facturaTipoIdentificacion
            : undefined,
        facturaRazonSocial: consumidorFinal
          ? null
          : comprobanteTipoFinal === "factura"
            ? recortar(datos.facturaRazonSocial, LARGO.razonSocial)
            : undefined,
        facturaRuc: consumidorFinal
          ? SIN_REGISTRO_FISCAL.numero
          : comprobanteTipoFinal === "factura"
            ? recortar(datos.facturaRuc, LARGO.ruc)
            : undefined,
        facturaEmail:
          comprobanteTipoFinal === "factura" && !consumidorFinal ? recortar(datos.facturaEmail, LARGO.email) : undefined,
        notas: recortar(datos.notas, LARGO.notas),
        subtotal,
        costoEnvio,
        total,
        items: {
          create: armado.lineas.map((l) => ({
            storeId,
            productId: l.productId,
            nombreProducto: l.nombreProducto,
            cantidad: l.cantidad,
            precioUnitario: l.precioUnitario,
            iva: l.iva,
            opcionesTexto: l.opcionesTexto,
            ingredientesQuitadosTexto: l.ingredientesQuitadosTexto,
            costoAgregados: l.costoAgregados,
            costoProducto: l.costoProducto,
            precioAgregados: l.precioAgregados,
          })),
        },
      },
    });

    await registrarConsumoVenta(tx, storeId, armado.lineas, { orderId: nuevoPedido.id }, quien);

    return nuevoPedido;
  });

  // Quién cargó el pedido queda en la bitácora (se llama DESPUÉS de guardar: nunca frena un pedido).
  await registrarBitacora(storeId, sesion, {
    modulo: "pedidos",
    accion: "pedido_cargado_por_telefono",
    descripcion: `Cargó el pedido ${formatearNumero(numero)} por teléfono (${formatearGuarani(total)}) para ${clienteNombre}.`,
    entidad: "Order",
    entidadId: order.id,
    detalle: {
      pedido: numero,
      total,
      subtotal,
      costoEnvio,
      costoDeLaZona: datos.tipoEntrega === "delivery" ? costoZona : null,
      tipoEntrega: datos.tipoEntrega,
      productos: armado.lineas.length,
      comprobante: comprobanteTipoFinal,
    },
  });

  revalidatePath("/admin/pedidos");
  revalidatePath("/admin/stock/insumos");
  return { ok: true, orderId: order.id };
}

export type ResultadoBuscarClienteParaPedido =
  | { ok: true; nombre: string; direcciones: string[] }
  | { ok: false };

/**
 * Cuando se busca el teléfono: si ya es cliente del local, devuelve su nombre y hasta tres direcciones distintas de
 * sus últimos deliveries, para ofrecerlas como opciones. Solo lee; nunca crea nada.
 *
 * A propósito NO devuelve la zona ni el costo de envío de pedidos anteriores: el mismo cliente puede pedir hoy desde
 * otro lugar (cerca del local, lejos, el trabajo) y arrastrar el envío de la vez pasada sería cobrarle mal. La zona
 * y el costo se eligen siempre a mano, según de dónde pide hoy.
 */
export async function buscarClienteParaPedido(telefono: string): Promise<ResultadoBuscarClienteParaPedido> {
  await exigirPermiso("pedidos.crear");
  const db = prismaDelLocal(await idLocalActual());

  const numero = telefono.trim().slice(0, LARGO.telefono);
  if (!numero) return { ok: false };

  const cliente = await db.customer.findFirst({ where: { telefono: numero }, select: { id: true, nombre: true } });
  if (!cliente) return { ok: false };

  const anteriores = await db.order.findMany({
    where: { customerId: cliente.id, tipoEntrega: "delivery", direccion: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { direccion: true },
  });

  // Las más recientes primero, sin repetir (aunque cambie una mayúscula), hasta tres.
  const vistas = new Set<string>();
  const direcciones: string[] = [];
  for (const o of anteriores) {
    const direccion = o.direccion?.trim();
    if (!direccion) continue;
    const clave = direccion.toLowerCase();
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    direcciones.push(direccion);
    if (direcciones.length === 3) break;
  }

  return { ok: true, nombre: cliente.nombre, direcciones };
}
