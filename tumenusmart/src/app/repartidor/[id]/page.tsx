import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatearGuarani } from "@/lib/format";
import { ZONA_NEGOCIO, inicioDeHoyEnAsuncion } from "@/lib/timezone";
import { EntregarBoton } from "./EntregarBoton";

export const dynamic = "force-dynamic";

const ETIQUETAS_PAGO: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta (POS al recibir)",
  otro: "A coordinar",
};

export default async function RepartidorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const repartidor = await prisma.repartidor.findUnique({ where: { id } });
  if (!repartidor) notFound();

  // Todo lo que sigue queda atado al local de ESTE repartidor: aunque su
  // enlace circule, nunca muestra pedidos de otro negocio.
  const storeId = repartidor.storeId;

  const [pendientes, entregadosHoy] = await Promise.all([
    prisma.order.findMany({
      where: { storeId, repartidorId: id, estado: "en_despacho" },
      include: { items: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.order.findMany({
      where: {
        storeId,
        repartidorId: id,
        estado: "entregado",
        updatedAt: { gte: inicioDeHoyEnAsuncion() },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <h1 className="text-xl font-bold text-neutral-900">Hola, {repartidor.nombre} 👋</h1>
      <p className="mb-6 text-sm text-neutral-500">
        {pendientes.length === 0
          ? "No tenés pedidos asignados en este momento."
          : `Tenés ${pendientes.length} pedido(s) para entregar.`}
      </p>

      <div className="flex flex-col gap-4">
        {pendientes.map((pedido) => {
          const resumenProductos = pedido.items
            .map((i) => `${i.cantidad}x ${i.nombreProducto}`)
            .join(", ");
          const linkUbicacion =
            pedido.clienteLat != null && pedido.clienteLng != null
              ? `https://www.google.com/maps?q=${pedido.clienteLat},${pedido.clienteLng}`
              : null;

          return (
            <div
              key={pedido.id}
              className="rounded-xl border border-brand bg-white p-4 shadow-sm"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-semibold text-neutral-900">{pedido.clienteNombre}</span>
                <span className="text-xs text-neutral-400">
                  {new Date(pedido.createdAt).toLocaleTimeString("es-PY", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: ZONA_NEGOCIO,
                  })}
                </span>
              </div>

              <a href={`tel:${pedido.clienteTelefono}`} className="mb-2 block text-sm text-brand">
                📞 {pedido.clienteTelefono}
              </a>

              <p className="mb-1 text-sm text-neutral-700">
                📍 {pedido.direccion || "Sin referencia de dirección"}
              </p>

              {linkUbicacion && (
                <a
                  href={linkUbicacion}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mb-3 inline-block text-sm font-medium text-brand hover:underline"
                >
                  Ver ubicación en el mapa →
                </a>
              )}

              <div className="mb-3 rounded-lg bg-neutral-50 p-2 text-xs text-neutral-600">
                {resumenProductos}
              </div>

              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="font-semibold text-neutral-900">
                  {formatearGuarani(Number(pedido.total))}
                </span>
                <span className="text-neutral-500">
                  {ETIQUETAS_PAGO[pedido.metodoPagoReferencia] ?? pedido.metodoPagoReferencia}
                </span>
              </div>

              <EntregarBoton repartidorId={id} orderId={pedido.id} />
            </div>
          );
        })}
      </div>

      {entregadosHoy.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-neutral-500">Entregados hoy</h2>
          <div className="flex flex-col gap-2">
            {entregadosHoy.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500"
              >
                <span>{p.clienteNombre}</span>
                <span>✓ Entregado</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
