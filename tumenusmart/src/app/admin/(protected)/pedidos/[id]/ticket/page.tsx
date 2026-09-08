import { notFound } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
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

/**
 * Espacio entre un texto y un importe, como espacios REALES y no como hueco
 * generado por CSS (`justify-between`).
 *
 * En el navegador las dos formas se ven exactamente igual. Pero algunas
 * impresoras térmicas (o su driver en Windows configurado en modo "Genérico
 * / Solo texto") no interpretan el documento como lo renderiza el navegador:
 * agarran el texto tal cual está y descartan cualquier separación que venga
 * únicamente del diseño visual, así que "Subtotal" y "Gs. 60.000" terminaban
 * pegados en el papel aunque en la vista previa se vieran perfectamente
 * alineados. Con espacios de verdad en el texto, esa separación sobrevive
 * sin importar cómo la impresora interprete la página.
 */
function espacioAlineado(izquierda: string, derecha: string, ancho: number): string {
  const cantidad = Math.max(2, ancho - izquierda.length - derecha.length);
  return " ".repeat(cantidad);
}

const ANCHO_RENGLON = 40;
const ANCHO_RENGLON_TOTAL = 30;

export default async function TicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Layout y página se renderizan en paralelo: sin este chequeo acá, una
  // sesión vencida podía terminar en el `throw` de idLocalActual() de acá
  // abajo antes de que el layout redirigiera a /admin/login.
  await pantallaConPermiso("pedidos.ver");

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

        {/*
          Líneas en blanco REALES (no margen/padding CSS) antes y después del
          comprobante. Si esta impresora se imprime justo después de otra
          (comanda + ticket seguidos) y no deja suficiente papel en blanco
          entre un trabajo y el siguiente, el final de uno queda pegado al
          principio del otro — visto en un caso real donde "Cliente: Jose"
          terminó fundido con el encabezado del comprobante siguiente. Un
          `<br>` es contenido de verdad, no un hueco generado por diseño, así
          que sobrevive aunque la impresora ignore los márgenes de @page.
        */}
        <br />
        <br />

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
          <p className="text-[1.1rem] font-semibold tracking-titular">Pedido {formatearNumero(pedido.numero)}</p>
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
          {pedido.items.map((item) => {
            const nombre = `${item.cantidad}x ${item.nombreProducto}`;
            const importe = formatearGuarani(item.cantidad * Number(item.precioUnitario));
            return (
              <div key={item.id} className="mb-1.5 last:mb-0">
                <p className="whitespace-pre-wrap break-words">
                  {nombre}
                  {espacioAlineado(nombre, importe, ANCHO_RENGLON)}
                  <span className="font-bold">{importe}</span>
                </p>
                {item.opcionesTexto && (
                  <p className="pl-3 text-xs leading-tight">+ {item.opcionesTexto}</p>
                )}
                {item.ingredientesQuitadosTexto && (
                  <p className="pl-3 text-xs leading-tight">{item.ingredientesQuitadosTexto}</p>
                )}
              </div>
            );
          })}
        </div>

        <div className="border-b border-dashed border-black py-2">
          <p className="whitespace-pre-wrap">
            Subtotal
            {espacioAlineado("Subtotal", formatearGuarani(Number(pedido.subtotal)), ANCHO_RENGLON)}
            {formatearGuarani(Number(pedido.subtotal))}
          </p>
          {esDelivery && (
            <p className="whitespace-pre-wrap">
              Envio
              {espacioAlineado(
                "Envio",
                Number(pedido.costoEnvio) > 0
                  ? formatearGuarani(Number(pedido.costoEnvio))
                  : "A coordinar",
                ANCHO_RENGLON
              )}
              {Number(pedido.costoEnvio) > 0
                ? formatearGuarani(Number(pedido.costoEnvio))
                : "A coordinar"}
            </p>
          )}
          <p className="mt-1 whitespace-pre-wrap border-t border-black pt-1 text-[1.1rem] font-semibold tracking-titular">
            TOTAL
            {espacioAlineado("TOTAL", formatearGuarani(Number(pedido.total)), ANCHO_RENGLON_TOTAL)}
            {formatearGuarani(Number(pedido.total))}
          </p>
        </div>

        <div className="border-b border-dashed border-black py-2 text-xs">
          <p>
            <span className="font-bold">Pago:</span>{" "}
            {ETIQUETAS_PAGO[pedido.metodoPagoReferencia] ?? pedido.metodoPagoReferencia}
          </p>
          <p>
            <span className="font-bold">Entrega:</span>{" "}
            {esDelivery
              ? `Delivery - ${pedido.deliveryZone?.nombre ?? "a coordinar"}`
              : "Retiro en el local"}
          </p>
          {esDelivery && pedido.direccion && <p>Dirección: {pedido.direccion}</p>}
          {esDelivery && pedido.repartidor && <p>Repartidor: {pedido.repartidor.nombre}</p>}
          {pedido.notas && <p className="mt-1">Nota: {pedido.notas}</p>}
        </div>

        <p className="py-3 text-center text-xs">
          Gracias por su compra!
          <br />
          Este comprobante no es una factura legal.
        </p>

        <br />
        <br />
        <br />
      </div>
    </>
  );
}
