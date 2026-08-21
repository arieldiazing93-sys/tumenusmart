import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { construirMensajePedido, construirLinkWhatsapp } from "@/lib/whatsapp";
import { formatearGuarani } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ConfirmacionPedidoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [order, store] = await Promise.all([
    prisma.order.findUnique({
      where: { id },
      include: { items: true, deliveryZone: true },
    }),
    prisma.store.findFirst(),
  ]);

  if (!order || !store) notFound();

  const mensaje = construirMensajePedido({
    pedidoId: order.id,
    saludo: store.mensajeSaludo,
    clienteNombre: order.clienteNombre,
    tipoEntrega: order.tipoEntrega,
    direccion: order.direccion,
    zonaNombre: order.deliveryZone?.nombre,
    clienteLat: order.clienteLat,
    clienteLng: order.clienteLng,
    metodoPagoReferencia: order.metodoPagoReferencia,
    comprobanteTipo: order.comprobanteTipo,
    facturaRazonSocial: order.facturaRazonSocial,
    facturaRuc: order.facturaRuc,
    facturaEmail: order.facturaEmail,
    notas: order.notas,
    items: order.items.map((i) => ({
      nombreProducto: i.nombreProducto,
      cantidad: i.cantidad,
      precioUnitario: Number(i.precioUnitario),
      opcionesTexto: i.opcionesTexto,
    })),
    subtotal: Number(order.subtotal),
    costoEnvio: Number(order.costoEnvio),
    total: Number(order.total),
  });

  const linkWhatsapp = construirLinkWhatsapp(store.whatsappNumero, mensaje);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-center">
      <div className="mb-6 text-5xl">✅</div>
      <h1 className="mb-2 text-xl font-bold text-neutral-900">
        Pedido #{order.id.slice(-6).toUpperCase()} generado
      </h1>
      <p className="mb-8 text-neutral-600">
        Un último paso: enviá el pedido por WhatsApp para que {store.nombre} lo confirme.
      </p>

      <a
        href={linkWhatsapp}
        target="_blank"
        rel="noopener noreferrer"
        className="mb-8 inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-6 py-3 font-medium text-white hover:opacity-90"
      >
        Enviar por WhatsApp
      </a>

      <div className="rounded-lg border border-neutral-200 bg-white p-4 text-left text-sm text-neutral-700">
        <pre className="whitespace-pre-wrap font-sans">{mensaje}</pre>
      </div>

      <p className="mt-4 text-sm text-neutral-500">
        Total: {formatearGuarani(Number(order.total))}
      </p>

      <Link href="/" className="mt-8 inline-block text-sm text-brand">
        Volver al menú
      </Link>
    </main>
  );
}
