import { prisma } from "@/lib/prisma";
import { formatearGuarani } from "@/lib/format";
import { EstadoSelect } from "./EstadoSelect";

export const dynamic = "force-dynamic";

export default async function AdminPedidosPage() {
  const pedidos = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: { items: true, deliveryZone: true },
    take: 100,
  });

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-neutral-900">Pedidos</h1>

      {pedidos.length === 0 && (
        <p className="text-neutral-500">Todavía no llegaron pedidos.</p>
      )}

      <div className="flex flex-col gap-3">
        {pedidos.map((pedido) => (
          <div
            key={pedido.id}
            className="rounded-xl border border-neutral-200 bg-white p-4"
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-semibold">
                  #{pedido.id.slice(-6).toUpperCase()}
                </span>{" "}
                <span className="text-sm text-neutral-500">
                  {new Date(pedido.createdAt).toLocaleString("es-PY")}
                </span>
              </div>
              <EstadoSelect orderId={pedido.id} estadoActual={pedido.estado} />
            </div>

            <p className="text-sm text-neutral-700">
              {pedido.clienteNombre} · {pedido.clienteTelefono}
            </p>
            <p className="text-sm text-neutral-500">
              {pedido.tipoEntrega === "delivery"
                ? `Delivery — ${pedido.deliveryZone?.nombre ?? ""} — ${pedido.direccion ?? ""}`
                : "Retiro en el local"}
            </p>

            <ul className="mt-2 text-sm text-neutral-600">
              {pedido.items.map((item) => (
                <li key={item.id}>
                  {item.cantidad}x {item.nombreProducto}
                  {item.opcionesTexto ? ` (${item.opcionesTexto})` : ""}
                </li>
              ))}
            </ul>

            <p className="mt-2 text-right font-semibold">
              {formatearGuarani(Number(pedido.total))}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
