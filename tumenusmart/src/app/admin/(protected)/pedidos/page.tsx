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
                ? `Delivery — ${pedido.deliveryZone?.nombre ?? "a coordinar"} — ${pedido.direccion ?? ""}`
                : "Retiro en el local"}
              {pedido.tipoEntrega === "delivery" &&
                pedido.clienteLat != null &&
                pedido.clienteLng != null && (
                  <>
                    {" · "}
                    <a
                      href={`https://www.google.com/maps?q=${pedido.clienteLat},${pedido.clienteLng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand hover:underline"
                    >
                      Ver ubicación
                    </a>
                  </>
                )}
            </p>

            {pedido.comprobanteTipo === "factura" && (
              <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-sm text-amber-800">
                Factura — {pedido.facturaRazonSocial} · RUC {pedido.facturaRuc}
                {pedido.facturaEmail ? ` · ${pedido.facturaEmail}` : ""}
              </p>
            )}

            <ul className="mt-2 text-sm text-neutral-600">
              {pedido.items.map((item) => (
                <li key={item.id}>
                  {item.cantidad}x {item.nombreProducto}
                  {item.opcionesTexto ? ` (${item.opcionesTexto})` : ""}
                  {item.ingredientesQuitadosTexto && (
                    <span className="text-red-500"> · {item.ingredientesQuitadosTexto}</span>
                  )}
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
