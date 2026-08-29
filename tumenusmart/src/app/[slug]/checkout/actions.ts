"use server";

import { localPorSlug, estaSuspendido } from "@/lib/local-por-slug";
import { prisma } from "@/lib/prisma";
import { siguienteNumeroPedido } from "@/lib/prisma-local";
import { distanciaKm, encontrarZonaPorDistancia } from "@/lib/geo";
import { obtenerEstadoTienda, motivoSinPedidos } from "@/lib/estado-tienda";
import {
  armarPedido,
  totalSinCambios,
  type LineaPedida,
  type ProductoBase,
} from "@/lib/precio-pedido";

export type DatosCheckout = {
  /** de qué local es el pedido, tomado de la URL que visitó el cliente */
  slug: string;
  clienteNombre: string;
  clienteTelefono: string;
  tipoEntrega: "delivery" | "retiro";
  clienteLat?: number;
  clienteLng?: number;
  direccion?: string;
  metodoPagoReferencia: string;
  comprobanteTipo: "ticket" | "factura";
  facturaRazonSocial?: string;
  facturaRuc?: string;
  facturaEmail?: string;
  notas?: string;
  /**
   * Qué eligió el cliente: identificadores y cantidades, nada más. Los
   * precios, los nombres y los textos de la comanda los pone el servidor
   * leyendo la carta — ver `src/lib/precio-pedido.ts`.
   */
  items: LineaPedida[];
  /**
   * El total que el cliente tenía en pantalla al apretar enviar. NO se guarda
   * ni se usa para cobrar: solo sirve para darse cuenta de que el local
   * cambió un precio mientras él completaba sus datos, y avisarle en vez de
   * cobrarle otra cosa.
   */
  totalMostrado?: number;
};

/** Largos máximos de los textos libres, para que no entre una novela en la comanda. */
const LARGO = { nombre: 80, telefono: 30, direccion: 200, notas: 500, razonSocial: 120, ruc: 30, email: 120 };

function recortar(valor: string | undefined, max: number): string | undefined {
  const limpio = valor?.trim();
  return limpio ? limpio.slice(0, max) : undefined;
}

export async function crearPedido(datos: DatosCheckout): Promise<{ orderId: string }> {
  // El local se resuelve en el servidor a partir del nombre en la URL: el
  // navegador dice a qué menú entró, pero nunca manda un identificador de
  // local que podamos usar a ciegas.
  const local = await localPorSlug(datos.slug);
  const storeId = local.id;

  if (estaSuspendido(local)) {
    throw new Error("Este menú no está tomando pedidos en este momento.");
  }

  // Se vuelve a chequear acá, no solo en el formulario: si el local cerró o
  // pausó mientras el cliente completaba sus datos, el pedido no entra.
  const estadoTienda = await obtenerEstadoTienda(storeId);
  if (!estadoTienda.aceptaPedidos) {
    throw new Error(motivoSinPedidos(estadoTienda) ?? "En este momento no se pueden tomar pedidos.");
  }

  const clienteNombre = recortar(datos.clienteNombre, LARGO.nombre);
  const clienteTelefono = recortar(datos.clienteTelefono, LARGO.telefono);
  if (!clienteNombre || !clienteTelefono) {
    throw new Error("Faltan datos de contacto");
  }
  if (!Array.isArray(datos.items) || datos.items.length === 0) {
    throw new Error("El carrito está vacío");
  }
  // El pin del mapa es obligatorio para delivery; la referencia escrita, no.
  //
  // Es al revés de como estaba. El pin es un dato exacto que el repartidor
  // abre y sigue; la referencia es texto que puede estar mal, incompleto o
  // decir "la casa de al lado del almacén". Además el costo de envío por
  // zonas se calcula con las coordenadas: sin pin no hay forma de cobrarlo.
  //
  // El formulario ya lo exige del lado del navegador. Esta comprobación es la
  // que vale: una acción del servidor se puede llamar sin pasar por él.
  if (
    datos.tipoEntrega === "delivery" &&
    (datos.clienteLat == null || datos.clienteLng == null)
  ) {
    throw new Error("Marcá tu ubicación en el mapa para poder entregarte el pedido");
  }
  if (
    datos.comprobanteTipo === "factura" &&
    (!datos.facturaRazonSocial?.trim() || !datos.facturaRuc?.trim())
  ) {
    throw new Error("Para factura hacen falta la razón social y el RUC");
  }

  // ---------------------------------------------------------------- el precio
  //
  // Acá está el punto del asunto: se lee la carta REAL del local y con eso se
  // arman las líneas. Lo que mandó el navegador se usa solamente para saber
  // qué productos y cuántos; el precio sale de la base, siempre.
  const idsPedidos = new Set<string>();
  for (const item of datos.items) {
    if (item?.productId) idsPedidos.add(item.productId);
    if (item?.mitadYMitad) {
      idsPedidos.add(item.mitadYMitad.productIdA);
      idsPedidos.add(item.mitadYMitad.productIdB);
    }
  }
  if (idsPedidos.size === 0) {
    throw new Error("El carrito está vacío");
  }

  // Los productos se buscan por local Y por categoría activa: uno de otro
  // negocio, o de una categoría que el local dio de baja, no aparece y el
  // pedido se rechaza solo. No se filtra por `disponible` a propósito, para
  // poder decirle al cliente QUÉ producto se quedó sin stock.
  const productos = await prisma.product.findMany({
    where: { storeId, id: { in: [...idsPedidos] }, category: { activa: true } },
    orderBy: { orden: "asc" },
    include: { opciones: { orderBy: { orden: "asc" } } },
  });

  const catalogo: ProductoBase[] = productos.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    precio: p.precio,
    disponible: p.disponible,
    ingredientes: p.ingredientes,
    mitadYMitadGrupo: p.mitadYMitadGrupo,
    mitadYMitadModo: p.mitadYMitadModo,
    opciones: p.opciones.map((o) => ({
      id: o.id,
      nombre: o.nombre,
      tipo: o.tipo,
      precioExtra: o.precioExtra,
    })),
  }));

  const armado = armarPedido(catalogo, datos.items);
  if (!armado.ok) throw new Error(armado.motivo);

  // El costo de envío SIEMPRE se recalcula acá (nunca se confía en lo que
  // mande el navegador), comparando la ubicación del cliente contra las
  // zonas reales guardadas en la base de datos.
  let costoEnvio = 0;
  let zonaId: string | undefined;

  if (datos.tipoEntrega === "delivery" && datos.clienteLat != null && datos.clienteLng != null) {
    if (local.envioModo === "zonas" && local.lat != null && local.lng != null) {
      const zonas = await prisma.deliveryZone.findMany({
        where: { storeId, activo: true },
      });
      const distancia = distanciaKm(local.lat, local.lng, datos.clienteLat, datos.clienteLng);
      const zona = encontrarZonaPorDistancia(
        zonas.map((z) => ({
          id: z.id,
          nombre: z.nombre,
          radioKm: Number(z.radioKm),
          costoEnvio: Number(z.costoEnvio),
        })),
        distancia
      );
      if (zona) {
        costoEnvio = zona.costoEnvio;
        zonaId = zona.id;
      }
      // Si no matchea ninguna zona, queda costoEnvio = 0 y zonaId sin
      // definir — el pedido pasa como "a coordinar" en vez de bloquearse.
    }
    // Si el negocio usa envioModo "coordinar" (o no tiene ubicación propia
    // configurada), costoEnvio queda en 0 y se coordina directo por WhatsApp.
  }

  const subtotal = armado.subtotal;
  const total = subtotal + costoEnvio;

  // Si el local movió un precio mientras el cliente llenaba sus datos, el
  // pedido no entra con el número viejo NI con el nuevo por sorpresa: se
  // corta y se le muestra la carta actualizada. El precio bueno es siempre el
  // de la base; esto es para que no le llegue un WhatsApp con otro total del
  // que vio en pantalla.
  if (datos.totalMostrado !== undefined && !totalSinCambios(total, datos.totalMostrado)) {
    throw new Error(
      "Los precios de este local se actualizaron mientras armabas el pedido. Revisá tu carrito antes de enviarlo."
    );
  }

  const customer = await prisma.customer.upsert({
    // El mismo número puede ser cliente de varios locales: cada negocio
    // tiene su propia ficha de esa persona.
    where: { storeId_telefono: { storeId, telefono: clienteTelefono } },
    update: { nombre: clienteNombre },
    create: { storeId, nombre: clienteNombre, telefono: clienteTelefono },
  });

  // El número se pide justo antes de crear el pedido, no antes: así, si algo
  // falla en las validaciones de más arriba, no se gasta un número al pedo.
  const numero = await siguienteNumeroPedido(storeId);

  const order = await prisma.order.create({
    data: {
      storeId,
      numero,
      customerId: customer.id,
      clienteNombre,
      clienteTelefono,
      tipoEntrega: datos.tipoEntrega,
      deliveryZoneId: zonaId,
      direccion: datos.tipoEntrega === "delivery" ? recortar(datos.direccion, LARGO.direccion) : undefined,
      clienteLat: datos.clienteLat,
      clienteLng: datos.clienteLng,
      metodoPagoReferencia: datos.metodoPagoReferencia,
      comprobanteTipo: datos.comprobanteTipo,
      facturaRazonSocial:
        datos.comprobanteTipo === "factura" ? recortar(datos.facturaRazonSocial, LARGO.razonSocial) : undefined,
      facturaRuc: datos.comprobanteTipo === "factura" ? recortar(datos.facturaRuc, LARGO.ruc) : undefined,
      facturaEmail: datos.comprobanteTipo === "factura" ? recortar(datos.facturaEmail, LARGO.email) : undefined,
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
          opcionesTexto: l.opcionesTexto,
          ingredientesQuitadosTexto: l.ingredientesQuitadosTexto,
        })),
      },
    },
  });

  return { orderId: order.id };
}
