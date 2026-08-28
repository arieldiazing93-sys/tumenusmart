"use server";

import { localPorSlug, estaSuspendido } from "@/lib/local-por-slug";
import { prisma } from "@/lib/prisma";
import { siguienteNumeroPedido } from "@/lib/prisma-local";
import { distanciaKm, encontrarZonaPorDistancia } from "@/lib/geo";
import { obtenerEstadoTienda, motivoSinPedidos } from "@/lib/estado-tienda";

type ItemEntrada = {
  /** ausente cuando el ítem es un combo "mitad y mitad" (no corresponde a un único producto) */
  productId?: string;
  nombreProducto: string;
  cantidad: number;
  precioUnitario: number;
  opcionesTexto?: string;
  ingredientesQuitadosTexto?: string;
};

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
  items: ItemEntrada[];
};

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

  if (!datos.clienteNombre?.trim() || !datos.clienteTelefono?.trim()) {
    throw new Error("Faltan datos de contacto");
  }
  if (!datos.items || datos.items.length === 0) {
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

  const subtotal = datos.items.reduce(
    (suma, i) => suma + i.precioUnitario * i.cantidad,
    0
  );
  const total = subtotal + costoEnvio;

  const customer = await prisma.customer.upsert({
    // El mismo número puede ser cliente de varios locales: cada negocio
    // tiene su propia ficha de esa persona.
    where: { storeId_telefono: { storeId, telefono: datos.clienteTelefono } },
    update: { nombre: datos.clienteNombre },
    create: { storeId, nombre: datos.clienteNombre, telefono: datos.clienteTelefono },
  });

  // El número se pide justo antes de crear el pedido, no antes: así, si algo
  // falla en las validaciones de más arriba, no se gasta un número al pedo.
  const numero = await siguienteNumeroPedido(storeId);

  const order = await prisma.order.create({
    data: {
      storeId,
      numero,
      customerId: customer.id,
      clienteNombre: datos.clienteNombre,
      clienteTelefono: datos.clienteTelefono,
      tipoEntrega: datos.tipoEntrega,
      deliveryZoneId: zonaId,
      direccion: datos.direccion,
      clienteLat: datos.clienteLat,
      clienteLng: datos.clienteLng,
      metodoPagoReferencia: datos.metodoPagoReferencia,
      comprobanteTipo: datos.comprobanteTipo,
      facturaRazonSocial: datos.comprobanteTipo === "factura" ? datos.facturaRazonSocial : undefined,
      facturaRuc: datos.comprobanteTipo === "factura" ? datos.facturaRuc : undefined,
      facturaEmail: datos.comprobanteTipo === "factura" ? datos.facturaEmail : undefined,
      notas: datos.notas,
      subtotal,
      costoEnvio,
      total,
      items: {
        create: datos.items.map((i) => ({
          storeId,
          productId: i.productId,
          nombreProducto: i.nombreProducto,
          cantidad: i.cantidad,
          precioUnitario: i.precioUnitario,
          opcionesTexto: i.opcionesTexto,
          ingredientesQuitadosTexto: i.ingredientesQuitadosTexto,
        })),
      },
    },
  });

  return { orderId: order.id };
}
