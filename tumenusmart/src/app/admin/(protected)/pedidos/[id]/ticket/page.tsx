import { notFound } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { formatearGuarani, formatearNumero, formatearTelefonoLocal } from "@/lib/format";
import { etiquetaMetodoPago } from "@/lib/metodos-pago";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { ImprimirAuto } from "@/components/ImprimirAuto";

export const dynamic = "force-dynamic";

const ESTILOS_IMPRESION = `
  @page { size: 80mm auto; margin: 4mm; }
  @media print {
    html, body { width: 72mm; background: #fff; }
  }
`;

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

/**
 * Cantidad + producto a la izquierda, monto a la derecha, en un solo
 * renglón — con espacios de verdad para separarlos (ver nota de más abajo
 * sobre por qué no alcanza con el hueco que genera `flex`).
 *
 * El ancho está calibrado con una impresión real de 80 mm: "1x 2 Lomito
 * mixto +1 Coca cola" (31 caracteres) entró en un renglón sin cortarse, y
 * agregarle "500cc" (36 en total) ya no entraba. 32 es conservador a
 * propósito, para dejar un margen de error entre distintas impresoras.
 * Si un nombre de producto es tan largo que ya no deja lugar ni para dos
 * espacios antes del monto, el monto pasa solo a la línea de abajo en vez
 * de superponerse o cortar el papel.
 */
function filaConMonto(texto: string, monto: string, ancho: number): string {
  const espacio = ancho - texto.length - monto.length;
  if (espacio < 2) return `${texto}\n${monto}`;
  return texto + " ".repeat(espacio) + monto;
}

const ANCHO_RENGLON = 32;

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
  const esFactura = pedido.comprobanteTipo === "factura" && !!pedido.facturaNumero;

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
            <p className="text-xs leading-tight">Tel: {formatearTelefonoLocal(store.whatsappNumero)}</p>
          )}
        </div>

        <Separador />

        {esFactura ? (
          <div className="text-center">
            <p className="text-[1.05rem] font-bold tracking-titular">FACTURA</p>
            <p className="text-xs leading-tight">Razón social: {pedido.facturaRazonSocialEmisor}</p>
            <p className="text-xs leading-tight">RUC: {pedido.facturaRucEmisor}</p>
            <p className="mt-1 text-xs leading-tight">Timbrado N°: {pedido.facturaTimbrado}</p>
            {pedido.facturaVencimiento && (
              <p className="text-xs leading-tight">
                Válido hasta:{" "}
                {pedido.facturaVencimiento.toLocaleDateString("es-PY", { timeZone: ZONA_NEGOCIO })}
              </p>
            )}
            <p className="mt-1 text-[1rem] font-semibold tracking-titular">N°: {pedido.facturaNumero}</p>
            <p className="text-xs">Fecha: {fecha}</p>
          </div>
        ) : (
          <div>
            <p className="text-[1.1rem] font-semibold tracking-titular">Pedido {formatearNumero(pedido.numero)}</p>
            <p className="text-xs">{fecha}</p>
            <p className="mt-1">Cliente: {pedido.clienteNombre}</p>
            <p>Tel: {pedido.clienteTelefono}</p>
          </div>
        )}

        {pedido.comprobanteTipo === "factura" && (
          <>
            <Separador />
            <div className="text-xs">
              {esFactura ? (
                <>
                  <p>Razón social: {pedido.facturaRazonSocial}</p>
                  <p>RUC: {pedido.facturaRuc}</p>
                </>
              ) : (
                <>
                  <p className="font-bold uppercase">Datos para factura</p>
                  <p>Razon social: {pedido.facturaRazonSocial}</p>
                  <p>RUC: {pedido.facturaRuc}</p>
                  {pedido.facturaEmail && <p>Correo: {pedido.facturaEmail}</p>}
                </>
              )}
            </div>
          </>
        )}

        <Separador />

        <div>
          {esFactura && (
            <p className="mb-1 whitespace-pre-wrap font-bold">
              {filaConMonto("Cant. Descripción", "Monto", ANCHO_RENGLON)}
            </p>
          )}
          {pedido.items.map((item) => (
            <div key={item.id} className="mb-1.5 last:mb-0">
              <p className="whitespace-pre-wrap">
                {filaConMonto(
                  `${item.cantidad}x ${item.nombreProducto}`,
                  formatearGuarani(item.cantidad * Number(item.precioUnitario)),
                  ANCHO_RENGLON
                )}
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

        <div>
          <p>Subtotal: {formatearGuarani(Number(pedido.subtotal))}</p>
          {esDelivery && (
            <p className="mt-1">
              Envio:{" "}
              {Number(pedido.costoEnvio) > 0
                ? formatearGuarani(Number(pedido.costoEnvio))
                : "A coordinar"}
            </p>
          )}
          <p className="mt-1 text-[1.1rem] font-semibold tracking-titular">
            TOTAL: {formatearGuarani(Number(pedido.total))}
          </p>
        </div>

        <Separador />

        {esFactura && (
          <>
            <div className="text-xs leading-tight">
              {Number(pedido.facturaGravado10 ?? 0) > 0 && (
                <p>{filaConMonto("Gravadas 10%:", formatearGuarani(Number(pedido.facturaGravado10)), ANCHO_RENGLON)}</p>
              )}
              {Number(pedido.facturaGravado5 ?? 0) > 0 && (
                <p>{filaConMonto("Gravadas 5%:", formatearGuarani(Number(pedido.facturaGravado5)), ANCHO_RENGLON)}</p>
              )}
              {Number(pedido.facturaExento ?? 0) > 0 && (
                <p>{filaConMonto("Exentas:", formatearGuarani(Number(pedido.facturaExento)), ANCHO_RENGLON)}</p>
              )}
              {Number(pedido.facturaIva10 ?? 0) > 0 && (
                <p>{filaConMonto("IVA 10%:", formatearGuarani(Number(pedido.facturaIva10)), ANCHO_RENGLON)}</p>
              )}
              {Number(pedido.facturaIva5 ?? 0) > 0 && (
                <p>{filaConMonto("IVA 5%:", formatearGuarani(Number(pedido.facturaIva5)), ANCHO_RENGLON)}</p>
              )}
            </div>
            <Separador />
          </>
        )}

        {/* Pago/entrega/repartidor: son datos operativos del pedido, no del
            documento fiscal — una factura de verdad no los muestra, pero el
            comprobante informal (ticket normal) sí los necesita. */}
        {!esFactura && (
          <>
            <div className="text-xs">
              <p>
                <span className="font-bold">Pago:</span>{" "}
                {etiquetaMetodoPago(pedido.metodoPagoReferencia)}
              </p>
              <p>
                <span className="font-bold">Entrega:</span>{" "}
                {esDelivery
                  ? `Delivery - ${pedido.deliveryZone?.nombre ?? "a coordinar"}`
                  : pedido.tipoEntrega === "mesa"
                    ? `Mesa ${pedido.mesaNumero ?? "-"}`
                    : "Retiro en el local"}
              </p>
              {esDelivery && pedido.direccion && <p>Direccion: {pedido.direccion}</p>}
              {esDelivery && pedido.repartidor && <p>Repartidor: {pedido.repartidor.nombre}</p>}
              {pedido.notas && <p className="mt-1">Nota: {pedido.notas}</p>}
            </div>

            <Separador />
          </>
        )}

        <p className="pt-1 text-center text-xs">
          Gracias por su compra!
          <br />
          {esFactura
            ? "Documento válido como Factura Autoimpresor."
            : "Este comprobante no es una factura legal."}
        </p>

        <Separador />
      </div>
    </>
  );
}
