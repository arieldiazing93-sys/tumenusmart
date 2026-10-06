"use server";

import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal, siguienteNumeroPedido, upsertClienteFiscal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { estacionActual } from "@/lib/estacion-actual";
import { armarPedido, type LineaPedida } from "@/lib/precio-pedido";
import { cargarCatalogoParaPedido } from "@/lib/catalogo-pedido";
import { puedeFacturarDesdeEstaEstacion, textoSinFactura } from "@/lib/factura-estacion";
import { registrarConsumoVenta } from "@/lib/movimientos-stock";
import { registrarBitacora } from "@/lib/bitacora";
import { METODOS_PAGO_PEDIDO, metodosPagoHabilitados } from "@/lib/metodos-pago";
import { SIN_REGISTRO_FISCAL } from "@/lib/tipo-cliente";
import { limpiarTexto, validarDatosFiscales } from "@/lib/datos-fiscales";
import { extraerUbicacion } from "@/lib/ubicacion-mapa";
import { FORMAS_PAGO_POS, etiquetaFormaPagoPos } from "@/lib/turno-pos";
import { SELECT_PEDIDO_PARA_EMISION, emitirFacturaDePedidoEnTransaccion } from "@/lib/emision-pedido";
import type { PuntoParaComprobante } from "@/lib/comprobante";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { turnoAbierto } from "../../pos/turno-actual";

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

/** `sinTurno`: cobrar el pedido exige el turno de caja abierto de esta computadora (sin turno no se vende). */
export type ResultadoPedidoManual =
  | { ok: true; orderId: string; facturaNumero: string | null }
  | { ok: false; error: string; sinTurno?: true };

/** Largos máximos de los textos libres, los mismos que el checkout público. */
const LARGO = { nombre: 80, telefono: 30, direccion: 200, notas: 500, razonSocial: 120, ruc: 30, email: 120 };

/** Tope del envío: más que esto es un número mal tipeado, no un precio. */
const ENVIO_MAXIMO = 10000000;

function recortar(valor: string | undefined, max: number): string | undefined {
  const limpio = valor?.trim();
  return limpio ? limpio.slice(0, max) : undefined;
}

/**
 * Carga un pedido a mano (Pedidos → Nuevo pedido): el cliente pidió por WhatsApp (el menú digital solo arma ese mensaje) o por
 * teléfono, y la caja lo carga acá. Los precios salen de la base, se descuenta el stock de las recetas y el pedido nace en la
 * misma tabla, así que desde ahí sigue el circuito de siempre (en preparación, repartidor, en despacho, entregado).
 *
 * Nace COBRADO y confirmado: la forma de pago que se elige acá es con la que se cobra, y en ese mismo momento el pedido entra
 * a la caja del turno abierto de esta computadora (formaPagoPos + turnoPosId + cobradoEn) y, si es con factura, se emite en el
 * acto con los datos que la caja cargó (los comparó antes en la DNIT). Todo en una sola transacción: o queda el pedido cobrado,
 * con su stock y su factura, o no queda nada. Sin turno de caja abierto no se vende: se devuelve `sinTurno`.
 *
 * No se frena por "pedidos pausados" ni por el horario de la carta: eso es para el cliente que pide solo; quien atiende decide.
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
  // El pedido se COBRA acá: la forma de pago tiene que ser una de las cuatro que entran a la caja (nada de "otro", que se
  // contaría como efectivo sin serlo).
  const formaPago = FORMAS_PAGO_POS.find((f) => f.valor === datos.metodoPago)?.valor;
  if (!formaPago) {
    return { ok: false, error: "Elegí con qué se cobra: efectivo, tarjeta de débito, tarjeta de crédito o transferencia." };
  }
  if (!Array.isArray(datos.items) || datos.items.length === 0) {
    return { ok: false, error: "El pedido está vacío: agregá al menos un producto." };
  }

  const direccion = datos.tipoEntrega === "delivery" ? recortar(datos.direccion, LARGO.direccion) : undefined;
  if (datos.tipoEntrega === "delivery" && !direccion) {
    return { ok: false, error: "Para delivery hace falta la dirección: es lo que ve el repartidor." };
  }
  // La dirección puede ser el enlace de Google Maps con la ubicación del cliente (llega por WhatsApp): se leen sus coordenadas.
  const ubicacion = direccion ? extraerUbicacion(direccion) : null;

  // ------------------------------------------------------------------- la caja
  // Cobrar es entrar a la caja del turno abierto de ESTA computadora (misma cookie de estación que usa el Punto de Venta). Sin
  // turno abierto no se vende: no habría a qué cierre atar el cobro y la plata quedaría fuera de la caja.
  const estacion = await estacionActual(db);
  if (!estacion) {
    return {
      ok: false,
      error: "Esta computadora no está vinculada a una caja. Vinculala en Estaciones (punto de venta) para poder cobrar el pedido.",
    };
  }
  const turno = await turnoAbierto(db, estacion.id);
  if (!turno) {
    return {
      ok: false,
      error: "No hay un turno de caja abierto en esta computadora. Abrilo (Punto de venta → Abrir turno) y volvé a cargar el pedido.",
      sinTurno: true,
    };
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

  // Los datos del comprador que tipeó la caja, revisados con la validación mínima (el RUC con su dígito, razón social de al
  // menos 4 letras, correo con forma de correo). Lo que se guarda es el texto ya limpio.
  let comprador: { tipoIdentificacion: string; numeroIdentificacion: string; razonSocial: string | null; email: string | null } | null =
    null;
  if (quiereFactura) {
    const revisado = validarDatosFiscales(
      sinNombre
        ? { modo: "sin_nombre" }
        : {
            modo: "con_registro",
            tipoIdentificacion: datos.facturaTipoIdentificacion,
            numeroIdentificacion: datos.facturaRuc,
            razonSocial: datos.facturaRazonSocial,
            email: datos.facturaEmail,
          }
    );
    if (!revisado.ok) return { ok: false, error: revisado.error };
    comprador = revisado.datos;
    if (!facturacion.puedeFacturar && facturacion.motivo) {
      return { ok: false, error: `${textoSinFactura(facturacion.motivo)} Cargalo como ticket.` };
    }
  }
  const comprobanteTipoFinal = quiereFactura ? "factura" : "ticket";
  const consumidorFinal = sinNombre;

  // El punto de expedición de esta computadora, para emitir la factura en el acto (con el número consumido dentro de la
  // transacción del cobro).
  let punto: (PuntoParaComprobante & { activo: boolean }) | null = null;
  if (comprobanteTipoFinal === "factura") {
    const conPunto = await db.estacion.findUnique({ where: { id: estacion.id }, select: { puntoExpedicion: true } });
    punto = conPunto?.puntoExpedicion ?? null;
    if (!punto || !punto.activo || punto.timbradoHasta < new Date()) {
      return {
        ok: false,
        error: "Esta computadora no tiene un punto de expedición vigente: no se puede emitir la factura. Cargalo como ticket o asignalo en Puntos de expedición.",
      };
    }
  }

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
  // porque se usa el cliente global).
  const customer = await prisma.customer.upsert({
    where: { storeId_telefono: { storeId, telefono: clienteTelefono } },
    update: { nombre: clienteNombre },
    create: { storeId, nombre: clienteNombre, telefono: clienteTelefono },
  });

  // El número se pide justo antes de crear el pedido: si algo falló en las validaciones de arriba, no se gasta.
  const numero = await siguienteNumeroPedido(storeId);
  const quien = sesion.nombre?.trim() || sesion.email;
  const ahora = new Date();

  // En una transacción: si el pedido se crea, queda cobrado en la caja, con el descuento de stock de su receta y (si es con
  // factura) con su factura emitida; nunca a medias. Si falla la factura, no queda nada y no se consume ningún número.
  let resultado: { orderId: string; facturaNumero: string | null };
  try {
    resultado = await prisma.$transaction(
      async (tx) => {
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
            // Si la dirección trae el enlace de ubicación que el cliente mandó por WhatsApp (se copia y se pega tal cual), se
            // guardan sus coordenadas: el repartidor abre el mapa con un toque desde su ruta.
            clienteLat: ubicacion?.lat,
            clienteLng: ubicacion?.lng,
            metodoPagoReferencia: datos.metodoPago,
            // Cobrado en este momento: entra a la caja del turno abierto.
            formaPagoPos: formaPago,
            turnoPosId: turno.id,
            cobradoEn: ahora,
            comprobanteTipo: comprobanteTipoFinal,
            facturaTipoIdentificacion: comprador?.tipoIdentificacion,
            facturaRazonSocial: consumidorFinal ? null : comprador?.razonSocial,
            facturaRuc: comprador?.numeroIdentificacion,
            facturaEmail: consumidorFinal ? undefined : (comprador?.email ?? undefined),
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

        // La factura se emite en el acto, con el punto de expedición de esta computadora.
        let facturaNumero: string | null = null;
        if (punto && comprador) {
          // Un cliente con datos fiscales queda guardado (o se le actualiza el nombre y el correo) para la próxima vez.
          if (!consumidorFinal && comprador.razonSocial) {
            await upsertClienteFiscal(tx, storeId, {
              tipoIdentificacion: comprador.tipoIdentificacion,
              numeroIdentificacion: comprador.numeroIdentificacion,
              razonSocial: comprador.razonSocial,
              email: comprador.email ?? "",
            });
          }
          const paraEmitir = await tx.order.findUniqueOrThrow({
            where: { id: nuevoPedido.id },
            select: SELECT_PEDIDO_PARA_EMISION,
          });
          facturaNumero = await emitirFacturaDePedidoEnTransaccion(tx, {
            storeId,
            orderId: nuevoPedido.id,
            pedido: paraEmitir,
            punto,
            emitidoPor: quien,
          });
        }

        return { orderId: nuevoPedido.id, facturaNumero };
      },
      { timeout: 20_000, maxWait: 10_000 }
    );
  } catch (e) {
    console.error("[pedidos] crearPedidoManual falló", e);
    return {
      ok: false,
      error: "No se pudo cargar el pedido. No se registró nada (ni cobro, ni factura, ni stock): probá de nuevo. Si insiste, fijate en Pedidos si quedó cargado.",
    };
  }

  // Quién cargó y cobró el pedido queda en la bitácora (se llama DESPUÉS de guardar: nunca frena un pedido).
  await registrarBitacora(storeId, sesion, {
    modulo: "pedidos",
    accion: "pedido_cargado_y_cobrado",
    descripcion: `Cargó y cobró el pedido ${formatearNumero(numero)} (${formatearGuarani(total)}) con ${etiquetaFormaPagoPos(formaPago)} para ${clienteNombre}${
      resultado.facturaNumero ? `; emitió la factura N° ${resultado.facturaNumero}` : ""
    }.`,
    entidad: "Order",
    entidadId: resultado.orderId,
    detalle: {
      pedido: numero,
      total,
      subtotal,
      costoEnvio,
      costoDeLaZona: datos.tipoEntrega === "delivery" ? costoZona : null,
      tipoEntrega: datos.tipoEntrega,
      productos: armado.lineas.length,
      comprobante: comprobanteTipoFinal,
      factura: resultado.facturaNumero,
      formaPago,
      turno: turno.id,
    },
  });

  revalidatePath("/admin/pedidos");
  revalidatePath("/admin/stock/insumos");
  revalidatePath("/admin/pos");
  revalidatePath("/admin/pos/turnos");
  if (resultado.facturaNumero) revalidatePath("/admin/facturas");
  return { ok: true, orderId: resultado.orderId, facturaNumero: resultado.facturaNumero };
}

export type ClienteFiscalEncontrado = {
  tipoIdentificacion: string;
  numeroIdentificacion: string;
  razonSocial: string;
  email: string | null;
};

/**
 * La lupa del número de documento (RUC, cédula…): busca si el cliente ya existe en el sistema, para traer su razón social y su
 * correo en vez de volver a tipearlos. Si no existe, se crea al cobrar el pedido. Solo busca en los clientes de ESTE local y
 * devuelve unos pocos; nunca crea nada.
 */
export async function buscarClienteFiscalPorNumero(numero: string): Promise<ClienteFiscalEncontrado[]> {
  await exigirPermiso("pedidos.crear");
  const db = prismaDelLocal(await idLocalActual());

  const texto = limpiarTexto(numero);
  if (texto.length < 3 || texto.length > 30) return [];

  const filas = await db.customer.findMany({
    where: { numeroIdentificacion: { contains: texto, mode: "insensitive" } },
    orderBy: { nombre: "asc" },
    select: { tipoIdentificacion: true, numeroIdentificacion: true, nombre: true, email: true },
    take: 6,
  });
  return filas.flatMap((f) =>
    f.numeroIdentificacion
      ? [
          {
            tipoIdentificacion: f.tipoIdentificacion ?? "ruc",
            numeroIdentificacion: f.numeroIdentificacion,
            razonSocial: f.nombre,
            email: f.email,
          },
        ]
      : []
  );
}

export type ResultadoBuscarClienteParaPedido =
  | {
      ok: true;
      nombre: string;
      direcciones: string[];
      /** Los datos de la última factura con registro fiscal de este cliente (para completarlos al elegir "Factura"), o null. */
      facturaAnterior: ClienteFiscalEncontrado | null;
    }
  | { ok: false };

/**
 * Cuando se busca el teléfono: si ya es cliente del local, devuelve su nombre, hasta tres direcciones distintas de
 * sus últimos deliveries (para ofrecerlas como opciones) y los datos de su última factura con registro fiscal, para que un
 * cliente recurrente no tenga que buscarse de nuevo. Solo lee; nunca crea nada.
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

  // La última factura vigente con registro fiscal (no "Sin Nombre": esa no tiene razón social) de este cliente.
  const ultimaFactura = await db.order.findFirst({
    where: {
      customerId: cliente.id,
      comprobanteTipo: "factura",
      facturaAnulada: false,
      facturaRuc: { not: null },
      facturaRazonSocial: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: { facturaTipoIdentificacion: true, facturaRuc: true, facturaRazonSocial: true, facturaEmail: true },
  });
  const facturaAnterior: ClienteFiscalEncontrado | null =
    ultimaFactura?.facturaRuc && ultimaFactura.facturaRazonSocial
      ? {
          tipoIdentificacion: ultimaFactura.facturaTipoIdentificacion ?? "ruc",
          numeroIdentificacion: ultimaFactura.facturaRuc,
          razonSocial: ultimaFactura.facturaRazonSocial,
          email: ultimaFactura.facturaEmail,
        }
      : null;

  return { ok: true, nombre: cliente.nombre, direcciones, facturaAnterior };
}
