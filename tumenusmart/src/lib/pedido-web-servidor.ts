/**
 * Los pedidos del menú digital del lado del servidor: recibir el pedido del cliente (validado), y lo que hace el personal con él.
 *
 * El flujo (acordado con el dueño): el pedido entra YA validado y espera una sola decisión. Al ACEPTARLO se abre una cuenta de
 * delivery (o de retiro) con sus productos —se descuenta el stock y sale la comanda— y sigue por el Servicio delivery, donde se
 * asigna el repartidor y se cobra. El cobro y la factura NO son pasos del pedido.
 *
 * Reglas de seguridad de la parte pública (el cliente no inicia sesión):
 *  - el local sale SIEMPRE del enlace del menú, nunca de algo que mande el navegador;
 *  - los precios, la zona y el costo de envío los calcula el servidor: del navegador solo llega QUÉ eligió;
 *  - un envío repetido (se tocó dos veces, se cortó el internet) no duplica nada;
 *  - hay un tope de pedidos por persona y por dispositivo en un rato, para frenar un abuso.
 */

import { createHash, randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { prismaDelLocal } from "./prisma-local";
import { upsertClienteFiscal } from "./prisma-local";
import { registrarBitacora, type QuienHizo } from "./bitacora";
import { armarPedido, type LineaPedida } from "./precio-pedido";
import { cargarCatalogoParaPedido } from "./catalogo-pedido";
import { aplicarPromociones } from "./promociones";
import { cargarPromociones } from "./promociones-servidor";
import { segundoDeSemanaAsuncion } from "./precio-promocion";
import { totalDeLineas } from "./comedor";
import { distanciaKm, encontrarZonaPorDistancia } from "./geo";
import { obtenerEstadoTienda, motivoSinPedidos } from "./estado-tienda";
import { estaSuspendido } from "./local-por-slug";
import { metodosPagoHabilitados } from "./metodos-pago";
import { enlaceDeMapa } from "./ubicacion-mapa";
import { guardarRondaDelivery } from "./delivery-servidor";
import { ENVIO_MAXIMO } from "./delivery";
import { formatearGuarani, formatearNumero } from "./format";
import { calcularDvRuc, separarRuc } from "./sifen-codigos";
import { validarDatosFiscales } from "./datos-fiscales";
import {
  avisosDeStock,
  lineasVisibles,
  normalizarRubro,
  type EstadoPedidoWeb,
  type ItemPublicoPedido,
  type LineaVisible,
  type PedidoNormalizado,
  type TipoEntregaPedido,
} from "./pedido-web";

/** Cuántos pedidos puede mandar la misma persona (teléfono) o el mismo dispositivo en una ventana corta. */
export const TOPES_PEDIDO_WEB = { ventanaMin: 10, porTelefono: 3, porDispositivo: 6, pendientesDelLocal: 150 };

const OPCIONES_TX = { timeout: 15_000, maxWait: 10_000 } as const;

/** La huella del dispositivo (no su dirección): sirve para contar pedidos seguidos sin guardar el dato en claro. */
export function huellaDeDispositivo(ip: string | null | undefined, sal: string = process.env.SESSION_SECRET ?? ""): string | null {
  const limpia = String(ip ?? "").trim();
  if (!limpia) return null;
  return createHash("sha256").update(`${sal}|${limpia}`).digest("hex").slice(0, 32);
}

// ---------------------------------------------------------------------------------------------------------------------
//  Recibir el pedido (parte pública)
// ---------------------------------------------------------------------------------------------------------------------

export type ResultadoCrearPedidoWeb =
  | { ok: true; token: string; numero: number; estado: EstadoPedidoWeb; total: number; yaEnviado: boolean }
  | { ok: false; error: string; campo?: string };

export type ContextoCrearPedido = {
  ipHash: string | null;
  ahora?: Date;
};

/** Los datos del local que hacen falta para recibir un pedido (por la dirección del menú). */
export async function localParaPedidoWeb(slug: string) {
  const limpio = String(slug ?? "").trim().toLowerCase();
  if (!limpio || limpio.length > 80) return null;
  return prisma.store.findUnique({
    where: { slug: limpio },
    select: {
      id: true,
      slug: true,
      nombre: true,
      estado: true,
      vencimiento: true,
      pedidosWebActivo: true,
      pedidosWebAutoAceptar: true,
      pedidosWebRubro: true,
      aceptaDelivery: true,
      aceptaRetiro: true,
      aceptaEfectivo: true,
      aceptaTransferencia: true,
      aceptaTarjetaDebito: true,
      aceptaTarjetaCredito: true,
      envioModo: true,
      lat: true,
      lng: true,
    },
  });
}

type LocalPedido = NonNullable<Awaited<ReturnType<typeof localParaPedidoWeb>>>;

/**
 * Recibe un pedido del menú. `datos` ya salió de `normalizarPedidoPublico`. Devuelve el enlace de seguimiento (`token`).
 */
export async function crearPedidoWeb(local: LocalPedido, datos: PedidoNormalizado, ctx: ContextoCrearPedido): Promise<ResultadoCrearPedidoWeb> {
  const storeId = local.id;
  const ahora = ctx.ahora ?? new Date();

  if (estaSuspendido({ estado: local.estado, vencimiento: local.vencimiento })) {
    return { ok: false, error: "Este local no está recibiendo pedidos en este momento." };
  }
  if (!local.pedidosWebActivo) return { ok: false, error: "Este local todavía no recibe pedidos por el menú digital." };

  // Un reintento del mismo envío: se devuelve lo que ya se hizo, sin duplicar nada ni volver a contarlo en el tope.
  const previo = await prisma.pedidoWeb.findFirst({
    where: { storeId, envioId: datos.envioId },
    select: { token: true, numero: true, estado: true, total: true },
  });
  if (previo) {
    return { ok: true, token: previo.token, numero: previo.numero, estado: previo.estado as EstadoPedidoWeb, total: Number(previo.total), yaEnviado: true };
  }

  const estadoTienda = await obtenerEstadoTienda(storeId);
  if (!estadoTienda.aceptaPedidos) {
    return { ok: false, error: motivoSinPedidos(estadoTienda) ?? "En este momento no se pueden tomar pedidos." };
  }
  if (datos.tipoEntrega === "delivery" && !local.aceptaDelivery) return { ok: false, error: "Este local no hace delivery.", campo: "entrega" };
  if (datos.tipoEntrega === "retiro" && !local.aceptaRetiro) return { ok: false, error: "Este local no tiene retiro en el local.", campo: "entrega" };
  if (!metodosPagoHabilitados(local).some((m) => m.value === datos.metodoPago)) {
    return { ok: false, error: "Ese método de pago no está disponible en este local.", campo: "pago" };
  }

  // ------------------------------------------------------------------ tope contra el abuso (por persona y por dispositivo)
  const desde = new Date(ahora.getTime() - TOPES_PEDIDO_WEB.ventanaMin * 60_000);
  const [porTelefono, porDispositivo, pendientes] = await Promise.all([
    prisma.pedidoWeb.count({ where: { storeId, clienteTelefono: datos.telefono, createdAt: { gte: desde } } }),
    ctx.ipHash ? prisma.pedidoWeb.count({ where: { storeId, ipHash: ctx.ipHash, createdAt: { gte: desde } } }) : Promise.resolve(0),
    prisma.pedidoWeb.count({ where: { storeId, estado: "nuevo" } }),
  ]);
  if (porTelefono >= TOPES_PEDIDO_WEB.porTelefono || porDispositivo >= TOPES_PEDIDO_WEB.porDispositivo) {
    return { ok: false, error: "Mandaste varios pedidos seguidos. Esperá unos minutos antes de mandar otro." };
  }
  if (pendientes >= TOPES_PEDIDO_WEB.pendientesDelLocal) {
    return { ok: false, error: "El local tiene muchos pedidos esperando. Probá de nuevo en unos minutos." };
  }

  // ------------------------------------------------------------------------------------------------ el precio y la zona
  const db = prismaDelLocal(storeId);
  const pedidas: LineaPedida[] = datos.items.map((i: ItemPublicoPedido) => ({
    productId: i.productId,
    mitadYMitad: i.mitadYMitad,
    opcionIds: i.opcionIds,
    ingredientesQuitados: i.ingredientesQuitados,
    cantidad: i.cantidad,
  }));
  const catalogo = await cargarCatalogoParaPedido(db, storeId, pedidas, ahora);
  const armado = armarPedido(catalogo, pedidas);
  if (!armado.ok) return { ok: false, error: armado.motivo, campo: "carrito" };

  const promos = await cargarPromociones(db);
  const finales = aplicarPromociones(armado.lineas, promos, segundoDeSemanaAsuncion(ahora), undefined).lineas;
  const subtotal = totalDeLineas(finales.map((l) => ({ precioUnitario: l.precioUnitario, cantidad: l.cantidad })));
  if (!Number.isFinite(subtotal) || subtotal <= 0) return { ok: false, error: "El total del pedido tiene que ser mayor a cero.", campo: "carrito" };

  let costoEnvio = 0;
  let zonaId: string | null = null;
  let zonaNombre: string | null = null;
  let envioACoordinar = false;
  if (datos.tipoEntrega === "delivery") {
    zonaNombre = "A coordinar";
    envioACoordinar = true;
    if (local.envioModo === "zonas" && local.lat != null && local.lng != null && datos.clienteLat != null && datos.clienteLng != null) {
      const zonas = await db.deliveryZone.findMany({ where: { activo: true }, orderBy: { radioKm: "asc" } });
      const distancia = distanciaKm(local.lat, local.lng, datos.clienteLat, datos.clienteLng);
      const zona = encontrarZonaPorDistancia(
        zonas.map((z) => ({ id: z.id, nombre: z.nombre, radioKm: Number(z.radioKm), costoEnvio: Number(z.costoEnvio) })),
        distancia
      );
      if (zona) {
        zonaId = zona.id;
        zonaNombre = zona.nombre;
        costoEnvio = Math.min(Math.round(zona.costoEnvio), ENVIO_MAXIMO);
        envioACoordinar = false;
      }
    }
  }
  const total = subtotal + costoEnvio;

  // El cliente vio un total al armar el pedido: si ahora es MÁS alto (cambió un precio mientras tanto), se le avisa antes de tomarlo.
  if (datos.totalMostrado != null && total > datos.totalMostrado + 0.5 && !envioACoordinar) {
    return {
      ok: false,
      error: `Los precios cambiaron mientras armabas el pedido: ahora el total es ${formatearGuarani(total)}. Revisá tu pedido y volvé a enviarlo.`,
      campo: "carrito",
    };
  }

  // ------------------------------------------------------------------------------------------ avisos para quien atiende
  const avisos = await avisosDelPedido(storeId, armado.lineas);

  // ---------------------------------------------------------------------------------------------------------- guardar
  const token = randomBytes(24).toString("base64url");
  let creado: { id: string; numero: number; token: string };
  try {
    creado = await prisma.$transaction(async (tx) => {
      const { contadorPedidosWeb } = await tx.store.update({
        where: { id: storeId },
        data: { contadorPedidosWeb: { increment: 1 } },
        select: { contadorPedidosWeb: true },
      });
      return tx.pedidoWeb.create({
        data: {
          storeId,
          numero: contadorPedidosWeb,
          token,
          envioId: datos.envioId,
          estado: "nuevo",
          tipoEntrega: datos.tipoEntrega,
          clienteNombre: datos.nombre,
          clienteTelefono: datos.telefono,
          direccion: datos.direccion,
          clienteLat: datos.clienteLat,
          clienteLng: datos.clienteLng,
          deliveryZoneId: zonaId,
          zonaNombre,
          costoEnvio,
          envioACoordinar,
          notas: datos.notas,
          metodoPago: datos.metodoPago,
          comprobanteTipo: datos.comprobanteTipo,
          facturaTipoIdentificacion: datos.factura?.tipoIdentificacion ?? null,
          facturaRuc: datos.factura?.numeroIdentificacion ?? null,
          facturaRazonSocial: datos.factura?.razonSocial ?? null,
          facturaEmail: datos.factura?.email ?? null,
          items: datos.items as unknown as Prisma.InputJsonValue,
          lineas: lineasVisibles(finales) as unknown as Prisma.InputJsonValue,
          subtotal,
          total,
          avisos,
          ipHash: ctx.ipHash,
        },
        select: { id: true, numero: true, token: true },
      });
    }, OPCIONES_TX);
  } catch (e) {
    // Dos envíos iguales que llegaron a la vez: el segundo se encuentra con el primero.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const ya = await prisma.pedidoWeb.findFirst({
        where: { storeId, envioId: datos.envioId },
        select: { token: true, numero: true, estado: true, total: true },
      });
      if (ya) return { ok: true, token: ya.token, numero: ya.numero, estado: ya.estado as EstadoPedidoWeb, total: Number(ya.total), yaEnviado: true };
    }
    console.error("[pedido-web] crearPedidoWeb falló", e);
    return { ok: false, error: "No pudimos registrar tu pedido. Probá de nuevo en unos segundos." };
  }

  await registrarBitacora(storeId, { email: "menu-digital", nombre: "Menú digital", rol: "cliente" }, {
    modulo: "pedidos",
    accion: "pedido_web_recibido",
    descripcion: `Entró el pedido web ${formatearNumero(creado.numero)} de ${datos.nombre} (${formatearGuarani(total)}, ${datos.tipoEntrega === "delivery" ? "delivery" : "retiro"}).`,
    entidad: "PedidoWeb",
    entidadId: creado.id,
    detalle: { numero: creado.numero, total, tipoEntrega: datos.tipoEntrega, metodoPago: datos.metodoPago, comprobante: datos.comprobanteTipo },
  });

  let estado: EstadoPedidoWeb = "nuevo";
  // Aceptar solo: únicamente si el local lo pidió y el envío ya está definido (si es "a coordinar" lo tiene que fijar una persona).
  if (local.pedidosWebAutoAceptar && !envioACoordinar) {
    const r = await aceptarPedidoWeb(storeId, creado.id, { nombre: "Automático", email: "automatico", rol: "sistema" }, { automatico: true });
    if (r.ok) estado = "aceptado";
  }

  return { ok: true, token: creado.token, numero: creado.numero, estado, total, yaEnviado: false };
}

/** Compara lo que va a consumir el pedido con lo que hay de cada insumo cuyo stock se lleva. */
async function avisosDelPedido(
  storeId: string,
  lineas: { cantidad: number; consumo: { insumoId: string; cantidad: number }[] }[]
): Promise<string[]> {
  const consumos = lineas.flatMap((l) => l.consumo.map((c) => ({ insumoId: c.insumoId, cantidad: c.cantidad * l.cantidad })));
  const ids = [...new Set(consumos.map((c) => c.insumoId))];
  if (ids.length === 0) return [];
  const [insumos, conMovimientos] = await Promise.all([
    prisma.insumo.findMany({ where: { storeId, id: { in: ids } }, select: { id: true, nombre: true, unidadMedida: true, stockActual: true } }),
    prisma.movimientoStock.groupBy({ by: ["insumoId"], where: { storeId, insumoId: { in: ids } }, _count: { _all: true } }),
  ]);
  const controlados = new Set((conMovimientos as { insumoId: string }[]).map((m) => m.insumoId));
  const existencias = new Map(
    insumos.map((i) => [i.id, { nombre: i.nombre, unidad: i.unidadMedida, stock: Number(i.stockActual), controlado: controlados.has(i.id) }])
  );
  return avisosDeStock(consumos, existencias).slice(0, 5);
}

// ---------------------------------------------------------------------------------------------------------------------
//  Lo que hace el personal
// ---------------------------------------------------------------------------------------------------------------------

export type ResultadoAccionPedido = { ok: true } | { ok: false; error: string };
export type ResultadoAceptarPedido =
  | { ok: true; cuentaId: string; cuentaNumero: number; areas: string[] }
  | { ok: false; error: string };

const nombreDe = (q: QuienHizo): string => (q.nombre?.trim() || q.email).slice(0, 80);

/** El pedido tal como lo ve la pantalla de la caja. */
export type PedidoWebFila = {
  id: string;
  numero: number;
  estado: EstadoPedidoWeb;
  tipoEntrega: TipoEntregaPedido;
  clienteNombre: string;
  clienteTelefono: string;
  direccion: string | null;
  clienteLat: number | null;
  clienteLng: number | null;
  zonaNombre: string | null;
  costoEnvio: number;
  envioACoordinar: boolean;
  notas: string | null;
  metodoPago: string;
  comprobanteTipo: string;
  facturaTipoIdentificacion: string | null;
  facturaRuc: string | null;
  facturaRazonSocial: string | null;
  facturaEmail: string | null;
  lineas: LineaVisible[];
  subtotal: number;
  total: number;
  avisos: string[];
  cuentaDeliveryId: string | null;
  cuentaNumero: number | null;
  motivoRechazo: string | null;
  creadoEn: string;
  aceptadoEn: string | null;
  listoEn: string | null;
  entregadoEn: string | null;
};

/** Convierte una fila de la base a lo que viaja a la pantalla (fechas en texto, montos en número). */
export function filaDePedido(
  p: {
    id: string;
    numero: number;
    estado: string;
    tipoEntrega: string;
    clienteNombre: string;
    clienteTelefono: string;
    direccion: string | null;
    clienteLat: number | null;
    clienteLng: number | null;
    zonaNombre: string | null;
    costoEnvio: Prisma.Decimal | number | string;
    envioACoordinar: boolean;
    notas: string | null;
    metodoPago: string;
    comprobanteTipo: string;
    facturaTipoIdentificacion: string | null;
    facturaRuc: string | null;
    facturaRazonSocial: string | null;
    facturaEmail: string | null;
    lineas: unknown;
    subtotal: Prisma.Decimal | number | string;
    total: Prisma.Decimal | number | string;
    avisos: string[];
    cuentaDeliveryId: string | null;
    motivoRechazo: string | null;
    createdAt: Date;
    aceptadoEn: Date | null;
    listoEn: Date | null;
    entregadoEn: Date | null;
  },
  cuentaNumero: number | null = null
): PedidoWebFila {
  const lineas = Array.isArray(p.lineas) ? (p.lineas as LineaVisible[]) : [];
  return {
    id: p.id,
    numero: p.numero,
    estado: p.estado as EstadoPedidoWeb,
    tipoEntrega: p.tipoEntrega === "retiro" ? "retiro" : "delivery",
    clienteNombre: p.clienteNombre,
    clienteTelefono: p.clienteTelefono,
    direccion: p.direccion,
    clienteLat: p.clienteLat,
    clienteLng: p.clienteLng,
    zonaNombre: p.zonaNombre,
    costoEnvio: Number(p.costoEnvio),
    envioACoordinar: p.envioACoordinar,
    notas: p.notas,
    metodoPago: p.metodoPago,
    comprobanteTipo: p.comprobanteTipo,
    facturaTipoIdentificacion: p.facturaTipoIdentificacion,
    facturaRuc: p.facturaRuc,
    facturaRazonSocial: p.facturaRazonSocial,
    facturaEmail: p.facturaEmail,
    lineas,
    subtotal: Number(p.subtotal),
    total: Number(p.total),
    avisos: p.avisos ?? [],
    cuentaDeliveryId: p.cuentaDeliveryId,
    cuentaNumero,
    motivoRechazo: p.motivoRechazo,
    creadoEn: p.createdAt.toISOString(),
    aceptadoEn: p.aceptadoEn ? p.aceptadoEn.toISOString() : null,
    listoEn: p.listoEn ? p.listoEn.toISOString() : null,
    entregadoEn: p.entregadoEn ? p.entregadoEn.toISOString() : null,
  };
}

/**
 * Acepta un pedido nuevo: abre su cuenta de delivery (o de retiro), le carga los productos (precios recalculados, stock que baja,
 * comanda a cocina) y lo deja "en preparación". Si algo falla a mitad de camino, el pedido vuelve a "nuevo" y la cuenta a medio armar
 * se cancela: nunca queda un pedido aceptado sin cuenta ni una cuenta vacía suelta.
 */
export async function aceptarPedidoWeb(
  storeId: string,
  pedidoId: string,
  quien: QuienHizo,
  opciones: { costoEnvio?: number; automatico?: boolean } = {}
): Promise<ResultadoAceptarPedido> {
  const db = prismaDelLocal(storeId);
  const pedido = await db.pedidoWeb.findFirst({ where: { id: String(pedidoId) } });
  if (!pedido) return { ok: false, error: "No encontré ese pedido." };
  if (pedido.estado !== "nuevo") return { ok: false, error: "Ese pedido ya lo atendió otra persona. Actualizá la pantalla." };

  let costoEnvio = Number(pedido.costoEnvio);
  if (opciones.costoEnvio !== undefined) {
    const c = Number(opciones.costoEnvio);
    if (!Number.isFinite(c) || c < 0 || c > ENVIO_MAXIMO) return { ok: false, error: "El costo de envío no es válido." };
    costoEnvio = Math.round(c);
  }
  const esRetiro = pedido.tipoEntrega === "retiro";
  if (esRetiro) costoEnvio = 0;
  if (!esRetiro && pedido.envioACoordinar && opciones.costoEnvio === undefined) {
    return { ok: false, error: "El envío es “a coordinar”: poné el costo de envío antes de aceptar (o 0 si es gratis)." };
  }

  // Se "reserva" el pedido antes de hacer nada: si dos personas lo aceptan a la vez, solo una sigue.
  const ahora = new Date();
  const reservado = await prisma.pedidoWeb.updateMany({
    where: { id: pedido.id, storeId, estado: "nuevo" },
    data: { estado: "aceptado", aceptadoPor: nombreDe(quien), aceptadoEn: ahora, costoEnvio, envioACoordinar: false },
  });
  if (reservado.count !== 1) return { ok: false, error: "Ese pedido ya lo atendió otra persona. Actualizá la pantalla." };

  const volverANuevo = async (motivo: string) => {
    await prisma.pedidoWeb.updateMany({
      where: { id: pedido.id, storeId },
      data: { estado: "nuevo", aceptadoPor: null, aceptadoEn: null, avisos: [motivo] },
    });
  };

  // ------------------------------------------------------------------------------------------------ la cuenta
  const referencia = pedido.direccion ? pedido.direccion : null;
  const ubicacion = pedido.clienteLat != null && pedido.clienteLng != null ? { lat: pedido.clienteLat, lng: pedido.clienteLng } : null;
  const direccionCuenta = esRetiro
    ? "Retiro en el local"
    : [referencia, ubicacion ? enlaceDeMapa(ubicacion) : null].filter(Boolean).join(" · ") || "A coordinar";
  const notas = [`Pedido web ${formatearNumero(pedido.numero)}`, esRetiro ? "Retiro en el local" : null, pedido.notas].filter(Boolean).join(" · ").slice(0, 500);

  let cuenta: { id: string; numero: number };
  try {
    cuenta = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.upsert({
        where: { storeId_telefono: { storeId, telefono: pedido.clienteTelefono } },
        update: { nombre: pedido.clienteNombre },
        create: { storeId, nombre: pedido.clienteNombre, telefono: pedido.clienteTelefono },
      });
      if (pedido.comprobanteTipo === "factura" && pedido.facturaRuc && pedido.facturaRazonSocial) {
        await upsertClienteFiscal(tx, storeId, {
          tipoIdentificacion: pedido.facturaTipoIdentificacion ?? "ruc",
          numeroIdentificacion: pedido.facturaRuc,
          razonSocial: pedido.facturaRazonSocial,
          email: pedido.facturaEmail ?? "",
        });
      }
      const { contadorCuentasDelivery } = await tx.store.update({
        where: { id: storeId },
        data: { contadorCuentasDelivery: { increment: 1 } },
        select: { contadorCuentasDelivery: true },
      });
      return tx.cuentaDelivery.create({
        data: {
          storeId,
          numero: contadorCuentasDelivery,
          customerId: customer.id,
          clienteNombre: pedido.clienteNombre,
          clienteTelefono: pedido.clienteTelefono,
          facturaTipoIdentificacion: pedido.comprobanteTipo === "factura" ? pedido.facturaTipoIdentificacion : null,
          facturaRuc: pedido.comprobanteTipo === "factura" ? pedido.facturaRuc : null,
          facturaRazonSocial: pedido.comprobanteTipo === "factura" ? pedido.facturaRazonSocial : null,
          facturaEmail: pedido.comprobanteTipo === "factura" ? pedido.facturaEmail : null,
          direccion: direccionCuenta,
          clienteLat: esRetiro ? null : pedido.clienteLat,
          clienteLng: esRetiro ? null : pedido.clienteLng,
          deliveryZoneId: esRetiro ? null : pedido.deliveryZoneId,
          zonaNombre: esRetiro ? "Retiro en el local" : pedido.zonaNombre ?? "A coordinar",
          costoEnvio,
          notas,
        },
        select: { id: true, numero: true },
      });
    }, OPCIONES_TX);
  } catch (e) {
    console.error("[pedido-web] aceptar: no se pudo abrir la cuenta", e);
    await volverANuevo("No se pudo abrir la cuenta. Probá de nuevo.");
    return { ok: false, error: "No se pudo abrir la cuenta del pedido. Probá de nuevo." };
  }

  // -------------------------------------------------------------------------------- los productos (stock + comanda)
  const items = (Array.isArray(pedido.items) ? pedido.items : []) as ItemPublicoPedido[];
  const ronda = await guardarRondaDelivery({
    storeId,
    cuentaId: cuenta.id,
    envioId: pedido.envioId,
    items: items.map((i) => ({ ...i })),
    quien: opciones.automatico ? "Pedido web (automático)" : `Pedido web - ${nombreDe(quien)}`,
    cargadoPor: opciones.automatico ? "Pedido web (automático)" : nombreDe(quien),
  });
  if (!ronda.ok) {
    // No se pudo cargar (un producto se agotó o cambió): la cuenta a medio armar se cancela y el pedido espera a una persona.
    await prisma.cuentaDelivery.updateMany({
      where: { id: cuenta.id, storeId },
      data: { estado: "cancelada", cerradaEn: new Date(), cerradaPor: nombreDe(quien), motivoCierre: `Pedido web: ${ronda.error}`.slice(0, 200) },
    });
    await volverANuevo(ronda.error);
    return { ok: false, error: ronda.error };
  }

  await prisma.pedidoWeb.updateMany({ where: { id: pedido.id, storeId }, data: { cuentaDeliveryId: cuenta.id } });
  await registrarBitacora(storeId, quien, {
    modulo: "pedidos",
    accion: "pedido_web_aceptado",
    descripcion: `Aceptó el pedido web ${formatearNumero(pedido.numero)} de ${pedido.clienteNombre}${opciones.automatico ? " (automático)" : ""}: cuenta ${formatearNumero(cuenta.numero)} de delivery.`,
    entidad: "PedidoWeb",
    entidadId: pedido.id,
    detalle: { pedido: pedido.numero, cuenta: cuenta.numero, total: Number(pedido.total), costoEnvio, automatico: !!opciones.automatico },
  });
  return { ok: true, cuentaId: cuenta.id, cuentaNumero: cuenta.numero, areas: ronda.areas };
}

/** Rechaza un pedido nuevo con un motivo (el cliente lo lee en su pantalla de seguimiento). */
export async function rechazarPedidoWeb(storeId: string, pedidoId: string, motivo: string, quien: QuienHizo): Promise<ResultadoAccionPedido> {
  const texto = String(motivo ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (texto.length < 3) return { ok: false, error: "Elegí o escribí el motivo." };
  const r = await prisma.pedidoWeb.updateMany({
    where: { id: String(pedidoId), storeId, estado: "nuevo" },
    data: { estado: "rechazado", motivoRechazo: texto, resueltoPor: nombreDe(quien), resueltoEn: new Date() },
  });
  if (r.count !== 1) return { ok: false, error: "Ese pedido ya lo atendió otra persona. Actualizá la pantalla." };
  const p = await prisma.pedidoWeb.findFirst({ where: { id: String(pedidoId), storeId }, select: { numero: true, clienteNombre: true } });
  await registrarBitacora(storeId, quien, {
    modulo: "pedidos",
    accion: "pedido_web_rechazado",
    descripcion: `Rechazó el pedido web ${formatearNumero(p?.numero ?? 0)} de ${p?.clienteNombre ?? "un cliente"}. Motivo: ${texto}`,
    entidad: "PedidoWeb",
    entidadId: String(pedidoId),
    detalle: { motivo: texto },
  });
  return { ok: true };
}

/** Marca el pedido como listo (aceptado → listo). */
export async function marcarListoPedidoWeb(storeId: string, pedidoId: string, quien: QuienHizo): Promise<ResultadoAccionPedido> {
  const r = await prisma.pedidoWeb.updateMany({
    where: { id: String(pedidoId), storeId, estado: "aceptado" },
    data: { estado: "listo", listoEn: new Date() },
  });
  if (r.count !== 1) return { ok: false, error: "El pedido ya no está en preparación. Actualizá la pantalla." };
  const p = await prisma.pedidoWeb.findFirst({ where: { id: String(pedidoId), storeId }, select: { numero: true, tipoEntrega: true } });
  await registrarBitacora(storeId, quien, {
    modulo: "pedidos",
    accion: "pedido_web_listo",
    descripcion: `Marcó listo el pedido web ${formatearNumero(p?.numero ?? 0)}.`,
    entidad: "PedidoWeb",
    entidadId: String(pedidoId),
  });
  return { ok: true };
}

/**
 * «Falta un producto»: saca una línea de un pedido NUEVO y recalcula el total. Las líneas de un pedido son las que el cliente
 * armó; se quita por posición (la pantalla muestra el mismo orden) y siempre queda al menos una.
 */
export async function quitarLineaPedidoWeb(storeId: string, pedidoId: string, posicion: number, quien: QuienHizo): Promise<ResultadoAccionPedido> {
  const db = prismaDelLocal(storeId);
  const pedido = await db.pedidoWeb.findFirst({ where: { id: String(pedidoId) } });
  if (!pedido) return { ok: false, error: "No encontré ese pedido." };
  if (pedido.estado !== "nuevo") return { ok: false, error: "Solo se puede quitar un producto de un pedido nuevo." };
  const items = (Array.isArray(pedido.items) ? pedido.items : []) as ItemPublicoPedido[];
  if (!Number.isInteger(posicion) || posicion < 0 || posicion >= items.length) return { ok: false, error: "No encontré ese producto." };
  if (items.length <= 1) return { ok: false, error: "Es el único producto: si no lo podés preparar, rechazá el pedido." };

  const restantes = items.filter((_, i) => i !== posicion);
  const pedidas: LineaPedida[] = restantes.map((i) => ({
    productId: i.productId,
    mitadYMitad: i.mitadYMitad,
    opcionIds: i.opcionIds,
    ingredientesQuitados: i.ingredientesQuitados,
    cantidad: i.cantidad,
  }));
  const catalogo = await cargarCatalogoParaPedido(db, storeId, pedidas);
  const armado = armarPedido(catalogo, pedidas);
  // Un producto de los que quedan ya no se puede armar (se agotó mientras tanto): se dice cuál y no se toca nada.
  if (!armado.ok) return { ok: false, error: armado.motivo };
  const promos = await cargarPromociones(db);
  const finales = aplicarPromociones(armado.lineas, promos, segundoDeSemanaAsuncion(new Date()), undefined).lineas;
  const subtotal = totalDeLineas(finales.map((l) => ({ precioUnitario: l.precioUnitario, cantidad: l.cantidad })));
  const quitada = (Array.isArray(pedido.lineas) ? (pedido.lineas as LineaVisible[]) : [])[posicion];
  const avisos = await avisosDelPedido(storeId, armado.lineas);

  const r = await prisma.pedidoWeb.updateMany({
    where: { id: pedido.id, storeId, estado: "nuevo" },
    data: {
      items: restantes as unknown as Prisma.InputJsonValue,
      lineas: lineasVisibles(finales) as unknown as Prisma.InputJsonValue,
      subtotal,
      total: subtotal + Number(pedido.costoEnvio),
      avisos,
    },
  });
  if (r.count !== 1) return { ok: false, error: "El pedido cambió mientras lo editabas. Actualizá la pantalla." };
  await registrarBitacora(storeId, quien, {
    modulo: "pedidos",
    accion: "pedido_web_producto_quitado",
    descripcion: `Quitó “${quitada?.nombre ?? "un producto"}” del pedido web ${formatearNumero(pedido.numero)} (no había): ahora es de ${formatearGuarani(subtotal + Number(pedido.costoEnvio))}.`,
    entidad: "PedidoWeb",
    entidadId: pedido.id,
    detalle: { producto: quitada?.nombre ?? null, totalAnterior: Number(pedido.total), totalNuevo: subtotal + Number(pedido.costoEnvio) },
  });
  return { ok: true };
}

/** Corrige los datos del cliente y de la factura de un pedido NUEVO (antes de aceptarlo). El RUC mal tipeado se arregla acá. */
export async function editarDatosPedidoWeb(
  storeId: string,
  pedidoId: string,
  datos: {
    clienteNombre: string;
    clienteTelefono: string;
    comprobanteTipo: "ticket" | "factura";
    facturaTipoIdentificacion?: string;
    facturaRuc?: string;
    facturaRazonSocial?: string;
    facturaEmail?: string;
    costoEnvio?: number;
  },
  quien: QuienHizo
): Promise<ResultadoAccionPedido> {
  const nombre = String(datos.clienteNombre ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const telefono = String(datos.clienteTelefono ?? "").replace(/[^\d+]/g, "").slice(0, 20);
  if (nombre.length < 2) return { ok: false, error: "Escribí el nombre del cliente." };
  if (telefono.replace(/\D/g, "").length < 6) return { ok: false, error: "Escribí un teléfono válido." };

  let factura: { tipoIdentificacion: string; numeroIdentificacion: string; razonSocial: string | null; email: string | null } | null = null;
  if (datos.comprobanteTipo === "factura") {
    const r = validarDatosFiscales({
      modo: "con_registro",
      tipoIdentificacion: String(datos.facturaTipoIdentificacion ?? "ruc"),
      numeroIdentificacion: String(datos.facturaRuc ?? ""),
      razonSocial: String(datos.facturaRazonSocial ?? ""),
      email: String(datos.facturaEmail ?? ""),
    });
    if (!r.ok) return { ok: false, error: r.error };
    // Un RUC con el dígito mal lo rechaza la DNIT: se frena acá, con el número que corresponde.
    if (r.datos.tipoIdentificacion === "ruc") {
      const { numero, dv } = separarRuc(r.datos.numeroIdentificacion);
      if (Number(dv) !== calcularDvRuc(numero)) {
        return { ok: false, error: `El RUC no parece correcto: para ${numero} el dígito verificador es ${calcularDvRuc(numero)}.` };
      }
    }
    factura = r.datos;
  }

  const cambios: {
    clienteNombre: string;
    clienteTelefono: string;
    comprobanteTipo: string;
    facturaTipoIdentificacion: string | null;
    facturaRuc: string | null;
    facturaRazonSocial: string | null;
    facturaEmail: string | null;
    costoEnvio?: number;
    envioACoordinar?: boolean;
    total?: number;
  } = {
    clienteNombre: nombre,
    clienteTelefono: telefono,
    comprobanteTipo: factura ? "factura" : "ticket",
    facturaTipoIdentificacion: factura?.tipoIdentificacion ?? null,
    facturaRuc: factura?.numeroIdentificacion ?? null,
    facturaRazonSocial: factura?.razonSocial ?? null,
    facturaEmail: factura?.email ?? null,
  };
  const pedido = await prisma.pedidoWeb.findFirst({ where: { id: String(pedidoId), storeId }, select: { numero: true, subtotal: true, tipoEntrega: true, estado: true } });
  if (!pedido) return { ok: false, error: "No encontré ese pedido." };
  if (pedido.estado !== "nuevo") return { ok: false, error: "Solo se pueden corregir los datos de un pedido nuevo. Después, en la cuenta del delivery." };
  if (datos.costoEnvio !== undefined && pedido.tipoEntrega === "delivery") {
    const c = Number(datos.costoEnvio);
    if (!Number.isFinite(c) || c < 0 || c > ENVIO_MAXIMO) return { ok: false, error: "El costo de envío no es válido." };
    cambios.costoEnvio = Math.round(c);
    cambios.envioACoordinar = false;
    cambios.total = Number(pedido.subtotal) + Math.round(c);
  }
  const r = await prisma.pedidoWeb.updateMany({ where: { id: String(pedidoId), storeId, estado: "nuevo" }, data: cambios });
  if (r.count !== 1) return { ok: false, error: "El pedido cambió mientras lo editabas. Actualizá la pantalla." };
  await registrarBitacora(storeId, quien, {
    modulo: "pedidos",
    accion: "pedido_web_datos_editados",
    descripcion: `Corrigió los datos del pedido web ${formatearNumero(pedido.numero)} (${nombre}${factura ? `, factura a ${factura.razonSocial}` : ""}).`,
    entidad: "PedidoWeb",
    entidadId: String(pedidoId),
  });
  return { ok: true };
}

/**
 * Un pedido aceptado ya es una cuenta del Servicio delivery, y esa cuenta se puede cobrar o cancelar desde allá. Esto hace que el
 * pedido lo refleje (cobrada → entregado, cancelada → cancelado) sin que nadie tenga que tocarlo dos veces. Se llama al mostrar la
 * bandeja y el seguimiento del cliente; es barato (una consulta y, si algo cambió, una actualización).
 */
export async function sincronizarPedidosConCuentas(storeId: string, soloPedidoId?: string): Promise<void> {
  const abiertos = await prisma.pedidoWeb.findMany({
    where: { storeId, estado: { in: ["aceptado", "listo"] }, cuentaDeliveryId: { not: null }, ...(soloPedidoId ? { id: soloPedidoId } : {}) },
    select: { id: true, cuentaDeliveryId: true },
  });
  if (abiertos.length === 0) return;
  const idsDeCuentas = abiertos.map((p) => p.cuentaDeliveryId).filter((x): x is string => !!x);
  const cuentas = await prisma.cuentaDelivery.findMany({
    where: { storeId, id: { in: idsDeCuentas }, estado: { in: ["pagada", "cancelada"] } },
    select: { id: true, estado: true, cerradaEn: true },
  });
  const porId = new Map(cuentas.map((c) => [c.id, c]));
  for (const p of abiertos) {
    const c = p.cuentaDeliveryId ? porId.get(p.cuentaDeliveryId) : undefined;
    if (!c) continue;
    await prisma.pedidoWeb.updateMany({
      where: { id: p.id, storeId, estado: { in: ["aceptado", "listo"] } },
      data: c.estado === "pagada" ? { estado: "entregado", entregadoEn: c.cerradaEn ?? new Date() } : { estado: "cancelado" },
    });
  }
}

/** El texto del cliente para el seguimiento: el rubro del local y lo que corresponde a su pedido. */
export function rubroDelLocal(local: { pedidosWebRubro: string }) {
  return normalizarRubro(local.pedidosWebRubro);
}
