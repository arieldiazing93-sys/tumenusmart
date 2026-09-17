import { notFound } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { formatearGuarani, formatearMiles, formatearNumero, formatearTelefonoLocal } from "@/lib/format";
import { etiquetaMetodoPago } from "@/lib/metodos-pago";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { ImprimirAuto } from "@/components/ImprimirAuto";

export const dynamic = "force-dynamic";

// El papel de la impresora es de 75mm (no 80mm) — con el mismo margen de
// 4mm de cada lado, el ancho real disponible para imprimir es 67mm.
const ESTILOS_IMPRESION = `
  @page { size: 75mm auto; margin: 4mm; }
  @media print {
    html, body { width: 67mm; background: #fff; }
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
  return <p className="py-1.5 text-center">{"- ".repeat(18).trim()}</p>;
}

/**
 * Texto a la izquierda, monto a la derecha, en un solo renglón — con
 * espacios de verdad para separarlos (ver nota de más abajo sobre por qué
 * no alcanza con el hueco que genera `flex`). Se usa para las líneas de dos
 * columnas (desglose de IVA, encabezados) — para el detalle de productos
 * ver `filaTabla`, que calibra 3 columnas fijas.
 */
function filaConMonto(texto: string, monto: string, ancho: number): string {
  const espacio = ancho - texto.length - monto.length;
  if (espacio < 2) return `${texto}\n${monto}`;
  return texto + " ".repeat(espacio) + monto;
}

// Calibrado para una impresora térmica de 75mm (67mm imprimibles) a 40
// caracteres por línea, con TODO el ticket al mismo tamaño de letra fijo
// (9px, ver el contenedor de más abajo) — a un tamaño más grande (como el
// que tenía antes la tabla, heredado del texto normal del ticket) 40
// caracteres reales no entran y la fila se corta a la mitad.
const ANCHO_RENGLON = 40;
const COL_CANTIDAD = 3; // columnas 1-3
const COL_DESCRIPCION = 5; // la descripción arranca acá (columna 4 = espacio)
const COL_MONTO = 32; // el monto arranca acá

/**
 * Fila de la tabla de productos con 3 columnas fijas: cantidad (3
 * caracteres), descripción (arranca en la columna 5, se corta si no entra
 * antes de la columna 32) y monto (arranca en la columna 32). Nunca se le
 * corta un dígito al monto: si no entra en lo que queda del renglón, se
 * imprime completo igual, aunque la línea se pase de 40 caracteres — es
 * preferible eso a mostrar una cifra de dinero incompleta.
 */
function filaTabla(cantidad: string, descripcion: string, monto: string): string {
  const anchoDescripcion = COL_MONTO - COL_DESCRIPCION;
  const colCantidad = cantidad.padEnd(COL_CANTIDAD).slice(0, COL_CANTIDAD);
  const espacio = " ".repeat(COL_DESCRIPCION - COL_CANTIDAD - 1);
  const colDescripcion =
    descripcion.length > anchoDescripcion
      ? descripcion.slice(0, anchoDescripcion)
      : descripcion.padEnd(anchoDescripcion);
  const anchoMonto = ANCHO_RENGLON - COL_MONTO + 1;
  const colMonto = monto.length >= anchoMonto ? monto : monto.padStart(anchoMonto);
  return colCantidad + espacio + colDescripcion + colMonto;
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
  const esFactura = pedido.comprobanteTipo === "factura" && !!pedido.facturaNumero;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ESTILOS_IMPRESION }} />

      <div className="mx-auto max-w-[75mm] font-mono text-[9px] leading-tight text-black">
        <ImprimirAuto />

        <Separador />

        <div className="text-center">
          <p className="uppercase">{store?.nombre ?? "Comprobante"}</p>
          {store?.direccion && <p>{store.direccion}</p>}
          {store?.whatsappNumero && <p>Tel: {formatearTelefonoLocal(store.whatsappNumero)}</p>}
        </div>

        <Separador />

        {esFactura ? (
          <div>
            <p className="text-center">FACTURA</p>
            <p>Razón social: {pedido.facturaRazonSocialEmisor}</p>
            <p>RUC: {pedido.facturaRucEmisor}</p>
            <p className="mt-1">Timbrado N°: {pedido.facturaTimbrado}</p>
            {pedido.facturaVencimiento && (
              <p>
                Válido hasta:{" "}
                {pedido.facturaVencimiento.toLocaleDateString("es-PY", { timeZone: ZONA_NEGOCIO })}
              </p>
            )}
            <p className="mt-1">Factura N°: {pedido.facturaNumero}</p>
            <p>Fecha: {fecha}</p>
          </div>
        ) : (
          <div>
            <p>Pedido {formatearNumero(pedido.numero)}</p>
            <p>{fecha}</p>
            <p className="mt-1">Cliente: {pedido.clienteNombre}</p>
            <p>Tel: {pedido.clienteTelefono}</p>
          </div>
        )}

        {pedido.comprobanteTipo === "factura" && (
          <>
            <Separador />
            <div>
              {esFactura ? (
                <>
                  <p>Razón social: {pedido.facturaRazonSocial}</p>
                  <p>RUC: {pedido.facturaRuc}</p>
                </>
              ) : (
                <>
                  <p className="uppercase">Datos para factura</p>
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
            <p className="mb-1 whitespace-pre-wrap">
              {filaTabla("Ctd", "Descripción", "Monto")}
            </p>
          )}
          {pedido.items.map((item) => (
            <div key={item.id} className="mb-1.5 last:mb-0">
              <p className="whitespace-pre-wrap">
                {filaTabla(
                  String(item.cantidad),
                  item.nombreProducto,
                  formatearMiles(item.cantidad * Number(item.precioUnitario))
                )}
              </p>
              {item.opcionesTexto && <p className="pl-3">+ {item.opcionesTexto}</p>}
              {item.ingredientesQuitadosTexto && <p className="pl-3">{item.ingredientesQuitadosTexto}</p>}
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
          <p className="mt-1">TOTAL: {formatearGuarani(Number(pedido.total))}</p>
        </div>

        <Separador />

        {esFactura && (
          <>
            <div>
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
            <div>
              <p>Pago: {etiquetaMetodoPago(pedido.metodoPagoReferencia)}</p>
              <p>
                Entrega:{" "}
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

        <p className="pt-1 text-center">
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
