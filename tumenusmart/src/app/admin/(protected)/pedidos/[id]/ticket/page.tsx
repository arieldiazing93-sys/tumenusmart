import { notFound } from "next/navigation";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { ImprimirAuto } from "@/components/ImprimirAuto";

export const dynamic = "force-dynamic";

const ESTILOS_IMPRESION = `
  @page { size: 80mm auto; margin: 4mm; }
  @media print {
    html, body { width: 72mm; background: #fff; }
  }
`;

const ETIQUETAS_PAGO: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta (POS al recibir)",
  otro: "A coordinar",
};

export default async function TicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  const { id } = await params;

  const [pedido, store] = await Promise.all([
    prisma.order.findUnique({
      where: { id },
      include: { items: true, deliveryZone: true, repartidor: true },
    }),
    prisma.store.findUnique({ where: { id: await idLocalActual() } }),
  ]);

  if (!pedido) notFound();

  const fecha = new Date(pedido.createdAt).toLocaleString("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ZONA_NEGOCIO,
  });

  const esDelivery = pedido.tipoEntrega === "delivery";

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ESTILOS_IMPRESION }} />

      <div className="mx-auto max-w-[76mm] font-mono text-sm text-black">
        <ImprimirAuto />

        <div className="border-b border-dashed border-black pb-2 text-center">
          <p className="text-base font-bold uppercase leading-tight">
            {store?.nombre ?? "Comprobante"}
          </p>
          {store?.direccion && <p className="text-xs leading-tight">{store.direccion}</p>}
          {store?.whatsappNumero && (
            <p className="text-xs leading-tight">Tel: {store.whatsappNumero}</p>
          )}
        </div>

        <div className="border-b border-dashed border-black py-2">
          <p className="text-lg font-bold">Pedido {formatearNumero(pedido.numero)}</p>
          <p className="text-xs">{fecha}</p>
          <p className="mt-1">Cliente: {pedido.clienteNombre}</p>
          <p>Tel: {pedido.clienteTelefono}</p>
        </div>

        {pedido.comprobanteTipo === "factura" && (
          <div className="border-b border-dashed border-black py-2 text-xs">
            <p className="font-bold uppercase">Datos para factura</p>
            <p>Razón social: {pedido.facturaRazonSocial}</p>
            <p>RUC: {pedido.facturaRuc}</p>
            {pedido.facturaEmail && <p>Correo: {pedido.facturaEmail}</p>}
          </div>
        )}

        <div className="border-b border-dashed border-black py-2">
          {pedido.items.map((item) => (
            <div key={item.id} className="mb-1.5 last:mb-0">
              <div className="flex justify-between gap-2">
                <span className="flex-1">
                  {item.cantidad}x {item.nombreProducto}
                </span>
                <span className="whitespace-nowrap font-bold">
                  {formatearGuarani(item.cantidad * Number(item.precioUnitario))}
                </span>
              </div>
              {item.opcionesTexto && (
                <p className="pl-3 text-xs leading-tight">+ {item.opcionesTexto}</p>
              )}
              {item.ingredientesQuitadosTexto && (
                <p className="pl-3 text-xs leading-tight">{item.ingredientesQuitadosTexto}</p>
              )}
            </div>
          ))}
        </div>

        <div className="border-b border-dashed border-black py-2">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatearGuarani(Number(pedido.subtotal))}</span>
          </div>
          {esDelivery && (
            <div className="flex justify-between">
              <span>Envío</span>
              <span>
                {Number(pedido.costoEnvio) > 0
                  ? formatearGuarani(Number(pedido.costoEnvio))
                  : "A coordinar"}
              </span>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t border-black pt-1 text-lg font-bold">
            <span>TOTAL</span>
            <span>{formatearGuarani(Number(pedido.total))}</span>
          </div>
        </div>

        <div className="border-b border-dashed border-black py-2 text-xs">
          <p>
            <span className="font-bold">Pago:</span>{" "}
            {ETIQUETAS_PAGO[pedido.metodoPagoReferencia] ?? pedido.metodoPagoReferencia}
          </p>
          <p>
            <span className="font-bold">Entrega:</span>{" "}
            {esDelivery
              ? `Delivery — ${pedido.deliveryZone?.nombre ?? "a coordinar"}`
              : "Retiro en el local"}
          </p>
          {esDelivery && pedido.direccion && <p>Dirección: {pedido.direccion}</p>}
          {esDelivery && pedido.repartidor && <p>Repartidor: {pedido.repartidor.nombre}</p>}
          {pedido.notas && <p className="mt-1">Nota: {pedido.notas}</p>}
        </div>

        <p className="py-3 text-center text-xs">
          ¡Gracias por su compra!
          <br />
          Este comprobante no es una factura legal.
        </p>
      </div>
    </>
  );
}
