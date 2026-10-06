"use server";

import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal, siguienteNumeroPedido, upsertClienteFiscal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { armarPedido, type LineaPedida } from "@/lib/precio-pedido";
import { cargarCatalogoParaPedido } from "@/lib/catalogo-pedido";
import { registrarConsumoVenta } from "@/lib/movimientos-stock";
import { registrarBitacora } from "@/lib/bitacora";
import { limpiarTexto, validarDatosFiscales } from "@/lib/datos-fiscales";
import { extraerUbicacion } from "@/lib/ubicacion-mapa";
import { consumoParaGuardar } from "@/lib/pedido-abierto";
import { formatearGuarani, formatearNumero } from "@/lib/format";

/**
 * Lo que carga una persona del local cuando el cliente pidió por WhatsApp o por teléfono. Igual que en el checkout público, lo único
 * que se manda de los productos es QUÉ y cuántos: nombres, precios y textos de la comanda los pone el servidor.
 *
 * El pedido se carga ABIERTO: todavía no se cobra ni se factura. La forma de pago y el comprobante se eligen al final, con el botón
 * "Cobrar pedido" del detalle (ver `cobrarPedido`), cuando ya se corrigió lo que hubiera que corregir.
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
  /**
   * La ficha fiscal del cliente cargada en el paso 1 (número, tipo, razón social y correo): el cliente queda creado o actualizado en
   * el sistema y sus datos quedan en el pedido para completar la factura al cobrarlo (se pueden cambiar ahí).
   */
  clienteFiscal?: { tipoIdentificacion: string; numeroIdentificacion: string; razonSocial: string; email?: string };
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
 * Carga un pedido a mano (Pedidos → Nuevo pedido): el cliente pidió por WhatsApp (el menú digital solo arma ese mensaje) o por
 * teléfono, y la caja lo carga acá. Los precios salen de la base, se descuenta el stock de las recetas y el pedido nace en la
 * misma tabla, así que desde ahí sigue el circuito de siempre (en preparación, repartidor, en despacho, entregado).
 *
 * Nace ABIERTO y confirmado, como la cuenta de una mesa: la caja puede cargarle más productos, darle un descuento o cancelar un
 * producto (con motivo) mientras no se cobre. Cobrarlo —forma de pago, ticket o factura— es el último paso (`cobrarPedido`), y recién
 * ahí entra a la caja del turno abierto. Por eso crear el pedido NO exige turno de caja.
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
  if (!Array.isArray(datos.items) || datos.items.length === 0) {
    return { ok: false, error: "El pedido está vacío: agregá al menos un producto." };
  }

  const direccion = datos.tipoEntrega === "delivery" ? recortar(datos.direccion, LARGO.direccion) : undefined;
  if (datos.tipoEntrega === "delivery" && !direccion) {
    return { ok: false, error: "Para delivery hace falta la dirección: es lo que ve el repartidor." };
  }
  // La dirección puede ser el enlace de Google Maps con la ubicación del cliente (llega por WhatsApp): se leen sus coordenadas.
  const ubicacion = direccion ? extraerUbicacion(direccion) : null;

  // La ficha fiscal del cliente (paso 1): solo si trae algo escrito, y revisada con la misma validación mínima que la factura (el
  // RUC con su dígito, razón social de al menos 4 letras, correo con forma de correo).
  let fichaFiscal: { tipoIdentificacion: string; numeroIdentificacion: string; razonSocial: string | null; email: string | null } | null =
    null;
  const cf = datos.clienteFiscal;
  if (cf && (limpiarTexto(cf.numeroIdentificacion) || limpiarTexto(cf.razonSocial))) {
    const revisada = validarDatosFiscales({
      modo: "con_registro",
      tipoIdentificacion: cf.tipoIdentificacion,
      numeroIdentificacion: cf.numeroIdentificacion,
      razonSocial: cf.razonSocial,
      email: cf.email,
    });
    if (!revisada.ok) return { ok: false, error: `Datos de factura del cliente: ${revisada.error}` };
    fichaFiscal = revisada.datos;
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

  // En una transacción: si el pedido se crea, queda con el descuento de stock de su receta; nunca a medias.
  let orderId: string;
  try {
    orderId = await prisma.$transaction(
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
            // Cómo paga se decide al cobrar: ahí queda la forma real (formaPagoPos) y esta referencia se actualiza.
            metodoPagoReferencia: "otro",
            // Los datos del comprador cargados en el paso 1 quedan en el pedido, listos para completar la factura al cobrarlo. Mientras
            // no se cobre es "ticket": el comprobante se elige al cobrar.
            comprobanteTipo: "ticket",
            facturaTipoIdentificacion: fichaFiscal?.tipoIdentificacion,
            facturaRazonSocial: fichaFiscal?.razonSocial,
            facturaRuc: fichaFiscal?.numeroIdentificacion,
            facturaEmail: fichaFiscal?.email ?? undefined,
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
                // Lo que descuenta de cada insumo, para devolverlo exacto si el producto se cancela con el pedido abierto.
                consumo: consumoParaGuardar(l),
              })),
            },
          },
        });

        await registrarConsumoVenta(tx, storeId, armado.lineas, { orderId: nuevoPedido.id }, quien);

        // El cliente con datos fiscales (la ficha del paso 1) queda guardado, o se le actualiza el nombre y el correo, para la
        // próxima vez.
        if (fichaFiscal?.razonSocial) {
          await upsertClienteFiscal(tx, storeId, {
            tipoIdentificacion: fichaFiscal.tipoIdentificacion,
            numeroIdentificacion: fichaFiscal.numeroIdentificacion,
            razonSocial: fichaFiscal.razonSocial,
            email: fichaFiscal.email ?? "",
          });
        }

        return nuevoPedido.id;
      },
      { timeout: 20_000, maxWait: 10_000 }
    );
  } catch (e) {
    console.error("[pedidos] crearPedidoManual falló", e);
    return {
      ok: false,
      error: "No se pudo cargar el pedido. No se registró nada (ni stock ni pedido): probá de nuevo. Si insiste, fijate en Pedidos si quedó cargado.",
    };
  }

  // Quién cargó el pedido queda en la bitácora (se llama DESPUÉS de guardar: nunca frena un pedido).
  await registrarBitacora(storeId, sesion, {
    modulo: "pedidos",
    accion: "pedido_cargado",
    descripcion: `Cargó el pedido ${formatearNumero(numero)} (${formatearGuarani(total)}) para ${clienteNombre}. Queda abierto: se cobra al final.`,
    entidad: "Order",
    entidadId: orderId,
    detalle: {
      pedido: numero,
      total,
      subtotal,
      costoEnvio,
      costoDeLaZona: datos.tipoEntrega === "delivery" ? costoZona : null,
      tipoEntrega: datos.tipoEntrega,
      productos: armado.lineas.length,
    },
  });

  revalidatePath("/admin/pedidos");
  revalidatePath("/admin/stock/insumos");
  return { ok: true, orderId };
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
