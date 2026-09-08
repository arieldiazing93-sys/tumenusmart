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

// Línea con tinta de verdad (guiones), no un borde CSS (`border-dashed`) ni
// un salto de línea en blanco. Algunas impresoras térmicas ajustan el papel
// al contenido real de cada impresión: cualquier separación que sea solo
// visual —un borde, un margen, un hueco de flexbox— se pierde, y lo mismo
// pasa con los saltos de línea que quedan completamente vacíos. Solo lo que
// es texto de verdad (caracteres con tinta) sobrevive sin importar cómo la
// impresora interprete la página, así que cada bloque del comprobante
// (cabecera, pedido, ítems, totales, pago, pie) separa del siguiente con
// esta línea en vez de con un borde.
function Separador() {
  return <p className="py-1.5 text-center text-xs">{"- ".repeat(18).trim()}</p>;
}

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

        <Separador />

        <div className="text-center">
          <p className="text-base font-bold uppercase leading-tight">
            {store?.nombre ?? "Comprobante"}
          </p>
          {store?.direccion && <p className="text-xs leading-tight">{store.direccion}</p>}
          {store?.whatsappNumero && (
            <p className="text-xs leading-tight">Tel: {store.whatsappNumero}</p>
          )}
        </div>

        <Separador />

        <div>
          <p className="text-[1.1rem] font-semibold tracking-titular">Pedido {formatearNumero(pedido.numero)}</p>
          <p className="text-xs">{fecha}</p>
          <p className="mt-1">Cliente: {pedido.clienteNombre}</p>
          <p>Tel: {pedido.clienteTelefono}</p>
        </div>

        {pedido.comprobanteTipo === "factura" && (
          <>
            <Separador />
            <div className="text-xs">
              <p className="font-bold uppercase">Datos para factura</p>
              <p>Razon social: {pedido.facturaRazonSocial}</p>
              <p>RUC: {pedido.facturaRuc}</p>
              {pedido.facturaEmail && <p>Correo: {pedido.facturaEmail}</p>}
            </div>
          </>
        )}

        <Separador />

        <div>
          {pedido.items.map((item) => (
            <div key={item.id} className="mb-1.5 last:mb-0">
              <p>
                {item.cantidad}x {item.nombreProducto}
              </p>
              <p className="pl-3 font-bold">
                {formatearGuarani(item.cantidad * Number(item.precioUnitario))}
              </p>
              {item.opcionesTexto && (
                <p className="pl-3 text-xs leading-tight">+ {item.opcionesTexto}</p>
              )}
              {item.ingredientesQuitadosTexto && (
                <p className="pl-3 text-xs leading-tight">{item.ingredientesQuitadosTexto}</p>
              )}
            </div>
          ))}
        </div>

        <Separador />

        {/*
          El monto va SIEMPRE en su propia línea, debajo del texto — nunca
          en la misma línea con espacios calculados para "alinear a la
          derecha". Cuántos caracteres entran por renglón depende del
          modelo de impresora de cada local (este sistema lo usan varios
          negocios, cada uno con la suya), así que cualquier número fijo que
          se elija va a quedar mal en alguna. Poniendo el monto en su propia
          línea, el resultado es el mismo sin importar el ancho real del
          papel.
        */}
        <div>
          <p>Subtotal</p>
          <p className="pl-3 font-bold">{formatearGuarani(Number(pedido.subtotal))}</p>
          {esDelivery && (
            <>
              <p className="mt-1">Envio</p>
              <p className="pl-3 font-bold">
                {Number(pedido.costoEnvio) > 0
                  ? formatearGuarani(Number(pedido.costoEnvio))
                  : "A coordinar"}
              </p>
            </>
          )}
          <p className="mt-1 text-[1.1rem] font-semibold tracking-titular">TOTAL</p>
          <p className="pl-3 text-[1.1rem] font-bold tracking-titular">
            {formatearGuarani(Number(pedido.total))}
          </p>
        </div>

        <Separador />

        <div className="text-xs">
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
          {esDelivery && pedido.direccion && <p>Direccion: {pedido.direccion}</p>}
          {esDelivery && pedido.repartidor && <p>Repartidor: {pedido.repartidor.nombre}</p>}
          {pedido.notas && <p className="mt-1">Nota: {pedido.notas}</p>}
        </div>

        <Separador />

        <p className="pt-1 text-center text-xs">
          Gracias por su compra!
          <br />
          Este comprobante no es una factura legal.
        </p>

        <Separador />
      </div>
    </>
  );
}
