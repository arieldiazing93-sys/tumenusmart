import { Volver } from "@/components/Volver";
import { notFound } from "next/navigation";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { EstadoBotones } from "../EstadoBotones";
import { RepartidorSelect } from "../RepartidorSelect";
import { ZONA_NEGOCIO } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export default async function DetallePedidoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  const { id } = await params;

  const [pedido, repartidores] = await Promise.all([
    prisma.order.findUnique({
      where: { id },
      include: { items: true, deliveryZone: true, repartidor: true },
    }),
    prisma.repartidor.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } }),
  ]);

  if (!pedido) notFound();

  return (
    <div>
      <div className="mb-4">
        <Volver href="/admin/pedidos" texto="Volver a pedidos" />
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[1.4rem] font-semibold tracking-titular text-tinta">
            Pedido {formatearNumero(pedido.numero)}
          </h1>
          <p className="text-sm text-tinta-media">
            {new Date(pedido.createdAt).toLocaleString("es-PY", { timeZone: ZONA_NEGOCIO })}
          </p>
        </div>

        {/* Se abren en una pestaña aparte y disparan la impresión solas, para
            no perder de vista el pedido que se está atendiendo. */}
        <div className="flex flex-wrap gap-2">
          <a
            href={`/admin/pedidos/${pedido.id}/comanda`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-noche px-3 py-2 text-sm font-semibold text-white hover:bg-noche-panel"
          >
            👨‍🍳 Comanda de cocina
          </a>
          <a
            href={`/admin/pedidos/${pedido.id}/ticket`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-linea px-3 py-2 text-sm font-semibold text-tinta-media hover:border-brand hover:text-brand"
          >
            🧾 Ticket
          </a>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-linea bg-white p-4">
        <p className="font-medium text-tinta">{pedido.clienteNombre}</p>
        <p className="text-sm text-tinta-media">{pedido.clienteTelefono}</p>
      </div>

      <div className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-tinta-media">Estado del pedido</h2>
        <EstadoBotones
          orderId={pedido.id}
          estadoActual={pedido.estado}
          tipoEntrega={pedido.tipoEntrega}
          repartidorId={pedido.repartidorId}
        />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-linea bg-white p-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-tinta-suave">
            Entrega
          </p>
          <p className="text-sm text-tinta">
            {pedido.tipoEntrega === "delivery"
              ? `Delivery — ${pedido.deliveryZone?.nombre ?? "a coordinar"}`
              : "Retiro en el local"}
          </p>
          {pedido.tipoEntrega === "delivery" && pedido.direccion && (
            <p className="text-sm text-tinta-media">{pedido.direccion}</p>
          )}
          {pedido.tipoEntrega === "delivery" &&
            pedido.clienteLat != null &&
            pedido.clienteLng != null && (
              <a
                href={`https://www.google.com/maps?q=${pedido.clienteLat},${pedido.clienteLng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-brand hover:underline"
              >
                Ver ubicación en el mapa
              </a>
            )}

          {pedido.tipoEntrega === "delivery" && (
            <div className="mt-3 border-t border-linea-fina pt-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-tinta-suave">
                Repartidor
              </p>
              <RepartidorSelect
                orderId={pedido.id}
                repartidorIdActual={pedido.repartidorId}
                repartidores={repartidores}
              />
            </div>
          )}
        </div>

        <div className="rounded-lg border border-linea bg-white p-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-tinta-suave">
            Pago
          </p>
          <p className="text-sm text-tinta">{pedido.metodoPagoReferencia}</p>

          {pedido.comprobanteTipo === "factura" && (
            <div className="mt-3 rounded bg-aviso-luz px-2 py-1.5 text-sm text-aviso">
              <p className="font-medium">Factura</p>
              <p>Razón social: {pedido.facturaRazonSocial}</p>
              <p>RUC: {pedido.facturaRuc}</p>
              {pedido.facturaEmail && <p>Correo: {pedido.facturaEmail}</p>}
            </div>
          )}

          {pedido.notas && (
            <div className="mt-3 border-t border-linea-fina pt-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-tinta-suave">
                Nota del cliente
              </p>
              <p className="text-sm text-tinta-media">{pedido.notas}</p>
            </div>
          )}
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-linea bg-white p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-tinta-suave">
          Productos
        </p>
        <ul className="flex flex-col gap-2">
          {pedido.items.map((item) => (
            <li key={item.id} className="flex items-start justify-between text-sm">
              <div>
                <p className="text-tinta">
                  {item.cantidad}x {item.nombreProducto}
                </p>
                {item.opcionesTexto && (
                  <p className="text-tinta-media">{item.opcionesTexto}</p>
                )}
                {item.ingredientesQuitadosTexto && (
                  <p className="text-peligro">{item.ingredientesQuitadosTexto}</p>
                )}
              </div>
              <span className="whitespace-nowrap font-medium text-tinta">
                {formatearGuarani(item.cantidad * Number(item.precioUnitario))}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-col gap-1 border-t border-linea-fina pt-3 text-sm">
          <div className="flex justify-between text-tinta-media">
            <span>Subtotal</span>
            <span>{formatearGuarani(Number(pedido.subtotal))}</span>
          </div>
          {pedido.tipoEntrega === "delivery" && (
            <div className="flex justify-between text-tinta-media">
              <span>Envío</span>
              <span>{formatearGuarani(Number(pedido.costoEnvio))}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-semibold text-tinta">
            <span>Total</span>
            <span>{formatearGuarani(Number(pedido.total))}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
