import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatearGuarani } from "@/lib/format";
import { ESTADOS_PEDIDO, etiquetaEstado, colorEstado } from "@/lib/estados-pedido";

export const dynamic = "force-dynamic";

export default async function AdminPedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado } = await searchParams;
  const estadoActivo = estado && estado !== "todos" ? estado : null;

  const pedidos = await prisma.order.findMany({
    where: estadoActivo ? { estado: estadoActivo } : undefined,
    orderBy: { createdAt: "desc" },
    include: { items: true, deliveryZone: true, repartidor: true },
    take: 100,
  });

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-neutral-900">Pedidos</h1>

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/admin/pedidos"
          className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
            !estadoActivo
              ? "border-brand bg-brand text-white"
              : "border-neutral-300 text-neutral-600 hover:border-brand hover:text-brand"
          }`}
        >
          Todos
        </Link>
        {ESTADOS_PEDIDO.map((e) => (
          <Link
            key={e.value}
            href={`/admin/pedidos?estado=${e.value}`}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
              estadoActivo === e.value
                ? "border-brand bg-brand text-white"
                : "border-neutral-300 text-neutral-600 hover:border-brand hover:text-brand"
            }`}
          >
            {e.emoji} {e.label}
          </Link>
        ))}
      </div>

      {pedidos.length === 0 && (
        <p className="text-neutral-500">No hay pedidos en este estado.</p>
      )}

      {pedidos.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2">Hora</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Teléfono</th>
                <th className="px-3 py-2">Productos</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Entrega</th>
                <th className="px-3 py-2">Repartidor</th>
                <th className="px-3 py-2">Pago</th>
                <th className="px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((pedido) => {
                const resumenProductos = pedido.items
                  .map((i) => `${i.cantidad}x ${i.nombreProducto}`)
                  .join(", ");
                return (
                  <tr
                    key={pedido.id}
                    className="cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-neutral-50"
                  >
                    <td className="px-3 py-3">
                      <Link href={`/admin/pedidos/${pedido.id}`} className="block">
                        {new Date(pedido.createdAt).toLocaleTimeString("es-PY", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/admin/pedidos/${pedido.id}`} className="block font-medium">
                        {pedido.clienteNombre}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/admin/pedidos/${pedido.id}`} className="block">
                        {pedido.clienteTelefono}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/admin/pedidos/${pedido.id}`} className="block max-w-[220px] truncate">
                        {resumenProductos}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/admin/pedidos/${pedido.id}`} className="block font-semibold">
                        {formatearGuarani(Number(pedido.total))}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/admin/pedidos/${pedido.id}`} className="block">
                        {pedido.tipoEntrega === "delivery"
                          ? pedido.deliveryZone?.nombre ?? "A coordinar"
                          : "Retiro"}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/admin/pedidos/${pedido.id}`} className="block">
                        {pedido.repartidor?.nombre ?? "—"}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/admin/pedidos/${pedido.id}`} className="block">
                        {pedido.metodoPagoReferencia}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/admin/pedidos/${pedido.id}`}>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${colorEstado(pedido.estado)}`}
                        >
                          {etiquetaEstado(pedido.estado)}
                        </span>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
