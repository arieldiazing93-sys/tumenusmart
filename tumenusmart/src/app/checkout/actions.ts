"use server";

import { prisma } from "@/lib/prisma";
import { distanciaKm, encontrarZonaPorDistancia } from "@/lib/geo";

type ItemEntrada = {
  productId: string;
  nombreProducto: string;
  cantidad: number;
  precioUnitario: number;
  opcionesTexto?: string;
};

export type DatosCheckout = {
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
  if (!datos.clienteNombre?.trim() || !datos.clienteTelefono?.trim()) {
    throw new Error("Faltan datos de contacto");
  }
  if (!datos.items || datos.items.length === 0) {
    throw new Error("El carrito está vacío");
  }
  if (datos.tipoEntrega === "delivery" && !datos.direccion?.trim()) {
    throw new Error("Falta la dirección de entrega");
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
    const store = await prisma.store.findFirst();

    if (store?.envioModo === "zonas" && store.lat != null && store.lng != null) {
      const zonas = await prisma.deliveryZone.findMany({ where: { activo: true } });
      const distancia = distanciaKm(store.lat, store.lng, datos.clienteLat, datos.clienteLng);
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
    where: { telefono: datos.clienteTelefono },
    update: { nombre: datos.clienteNombre },
    create: { nombre: datos.clienteNombre, telefono: datos.clienteTelefono },
  });

  const order = await prisma.order.create({
    data: {
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
          productId: i.productId,
          nombreProducto: i.nombreProducto,
          cantidad: i.cantidad,
          precioUnitario: i.precioUnitario,
          opcionesTexto: i.opcionesTexto,
        })),
      },
    },
  });

  return { orderId: order.id };
}
