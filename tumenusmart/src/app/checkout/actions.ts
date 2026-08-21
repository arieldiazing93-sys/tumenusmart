"use server";

import { prisma } from "@/lib/prisma";

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
  deliveryZoneId?: string;
  direccion?: string;
  metodoPagoReferencia: string;
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

  let costoEnvio = 0;
  let zonaId: string | undefined;
  if (datos.tipoEntrega === "delivery" && datos.deliveryZoneId) {
    const zona = await prisma.deliveryZone.findUnique({
      where: { id: datos.deliveryZoneId },
    });
    if (zona) {
      costoEnvio = Number(zona.costoEnvio);
      zonaId = zona.id;
    }
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
      metodoPagoReferencia: datos.metodoPagoReferencia,
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
