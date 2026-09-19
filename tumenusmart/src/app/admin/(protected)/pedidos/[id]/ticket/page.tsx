import { notFound } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { formatearGuarani, formatearMiles, formatearNumero, formatearTelefonoLocal, sinAcentos } from "@/lib/format";
import { numeroALetras } from "@/lib/numero-a-letras";
import { etiquetaMetodoPago } from "@/lib/metodos-pago";
import { SIN_REGISTRO_FISCAL, etiquetaTipoIdentificacion } from "@/lib/tipo-cliente";
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
// La factura usa "=" en vez de "-" (estructura de talonario/imprenta que
// pidió el dueño) — el ticket informal sigue con guiones.
//
// Se genera de sobra (60 "=", o 40 pares "- ") — mucho más de lo que puede
// llegar a entrar en una sola línea a este tamaño de letra — y se recorta
// con overflow-hidden + whitespace-nowrap: así la línea siempre llega justo
// hasta el borde real del papel, sin dejar un hueco a la derecha, sin
// depender de adivinar cuántos caracteres entran exactos a 9px — y como es
// siempre el mismo patrón repetido, cortar de más no se nota.
function Separador({ factura = false }: { factura?: boolean }) {
  return (
    <p className="overflow-hidden whitespace-nowrap py-1.5 text-center">
      {factura ? "=".repeat(60) : "- ".repeat(40)}
    </p>
  );
}

/**
 * Se usa para las líneas de dos columnas del desglose de IVA — para el
 * detalle de productos ver `filaTabla`, que calibra 3 columnas fijas.
 *
 * A diferencia de filaTabla, acá el monto va PEGADO a la etiqueta (no
 * alineado a la derecha del renglón) — la etiqueta se rellena con espacios
 * hasta `anchoEtiqueta` para que los ":" de un mismo bloque (Detalle fiscal,
 * Liquidación IVA) queden alineados entre sí aunque las etiquetas midan
 * distinto ("IVA 10%" vs "TOTAL IVA").
 */
function filaEtiqueta(etiqueta: string, monto: string, anchoEtiqueta: number): string {
  return `${etiqueta.padEnd(anchoEtiqueta)}: ${monto}`;
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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ silencioso?: string }>;
}) {
  // Layout y página se renderizan en paralelo: sin este chequeo acá, una
  // sesión vencida podía terminar en el `throw` de idLocalActual() de acá
  // abajo antes de que el layout redirigiera a /admin/login.
  await pantallaConPermiso("pedidos.ver");
  // Presente cuando QZ Tray pide este HTML para imprimir solo — ver
  // src/lib/impresion-comprobantes.ts. Oculta ImprimirAuto, que no tiene
  // sentido en un documento que ya se manda directo a la impresora.
  const { silencioso } = await searchParams;
  const esSilencioso = silencioso === "1";

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
  // Con segundos, solo para la factura — el ticket informal sigue con la
  // fecha corta de siempre.
  const fechaFactura = new Date(pedido.createdAt).toLocaleString("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: ZONA_NEGOCIO,
  });

  const esDelivery = pedido.tipoEntrega === "delivery";
  // Una factura anulada (ver src/app/admin/(protected)/facturas/actions.ts)
  // ya no cuenta como factura vigente para IMPRIMIR, aunque el pedido en sí
  // siga vivo — cae al mismo bloque informal que "pidió factura pero no se
  // pudo emitir", con el aviso de más abajo explicando qué pasó.
  const esFactura = pedido.comprobanteTipo === "factura" && !!pedido.facturaNumero && !pedido.facturaAnulada;
  const esSinNombre = pedido.facturaTipoIdentificacion === SIN_REGISTRO_FISCAL.tipo;
  const esAnulado = pedido.estado === "cancelado";

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ESTILOS_IMPRESION }} />

      <div id="comprobante-imprimible" className="mx-auto max-w-[75mm] font-mono text-[9px] leading-tight text-black">
        {!esSilencioso && <ImprimirAuto />}

        {esAnulado && (
          <div className="mb-2 text-center">
            <p className="text-[16px] font-bold">*** ANULADA ***</p>
            <p>Pedido cancelado — no es un comprobante valido.</p>
          </div>
        )}

        <Separador factura={esFactura} />

        <div className="text-center">
          <p className="uppercase">{sinAcentos(store?.nombre ?? "Comprobante")}</p>
          {store?.direccion && <p>{sinAcentos(store.direccion)}</p>}
          {store?.whatsappNumero && <p>Tel: {formatearTelefonoLocal(store.whatsappNumero)}</p>}
        </div>

        <Separador factura={esFactura} />

        {esFactura ? (
          <div>
            <p className="text-center">FACTURA</p>
            <p>Razon social: {sinAcentos(pedido.facturaRazonSocialEmisor ?? "")}</p>
            <p>RUC: {pedido.facturaRucEmisor}</p>
            <p className="mt-1">
              Timbrado: {pedido.facturaTimbrado}
              {pedido.facturaVencimiento && (
                <>
                  {"  "}
                  Vto: {pedido.facturaVencimiento.toLocaleDateString("es-PY", { timeZone: ZONA_NEGOCIO })}
                </>
              )}
            </p>
            <p className="mt-1">Factura: {pedido.facturaNumero}</p>
            <p>Condicion de venta: CONTADO</p>
            <p>Fecha: {fechaFactura}</p>
            <p>Metodo de pago: {sinAcentos(etiquetaMetodoPago(pedido.metodoPagoReferencia))}</p>
          </div>
        ) : (
          <div>
            <p>Pedido {formatearNumero(pedido.numero)}</p>
            <p>{fecha}</p>
            <p className="mt-1">Cliente: {sinAcentos(pedido.clienteNombre)}</p>
            <p>Tel: {pedido.clienteTelefono}</p>
          </div>
        )}

        {pedido.comprobanteTipo === "factura" && (
          <>
            <Separador factura={esFactura} />
            <div>
              {esFactura ? (
                <>
                  <p>
                    Razon social: {esSinNombre ? SIN_REGISTRO_FISCAL.etiquetaDisplay : sinAcentos(pedido.facturaRazonSocial ?? "")}
                  </p>
                  <p>
                    {esSinNombre ? "RUC" : sinAcentos(etiquetaTipoIdentificacion(pedido.facturaTipoIdentificacion ?? "ruc"))}
                    : {pedido.facturaRuc}
                  </p>
                </>
              ) : (
                <>
                  <p className="uppercase">Datos para factura</p>
                  {pedido.facturaAnulada && pedido.facturaNumero && (
                    <p>Factura {pedido.facturaNumero} ANULADA — no vale como comprobante fiscal.</p>
                  )}
                  <p>
                    Razon social: {esSinNombre ? SIN_REGISTRO_FISCAL.etiquetaDisplay : sinAcentos(pedido.facturaRazonSocial ?? "")}
                  </p>
                  <p>
                    {esSinNombre ? "RUC" : sinAcentos(etiquetaTipoIdentificacion(pedido.facturaTipoIdentificacion ?? "ruc"))}
                    : {pedido.facturaRuc}
                  </p>
                  {pedido.facturaEmail && <p>Correo: {pedido.facturaEmail}</p>}
                </>
              )}
            </div>
          </>
        )}

        <Separador factura={esFactura} />

        <div>
          {esFactura && (
            <p className="mb-1 whitespace-pre-wrap">
              {filaTabla("Ctd", "Descripcion", "Importe")}
            </p>
          )}
          {pedido.items.map((item) => (
            <div key={item.id} className="mb-1.5 last:mb-0">
              <p className="whitespace-pre-wrap">
                {filaTabla(
                  String(item.cantidad),
                  sinAcentos(item.nombreProducto),
                  formatearMiles(item.cantidad * Number(item.precioUnitario))
                )}
              </p>
              {item.opcionesTexto && <p className="pl-3">+ {sinAcentos(item.opcionesTexto)}</p>}
              {item.ingredientesQuitadosTexto && (
                <p className="pl-3">{sinAcentos(item.ingredientesQuitadosTexto)}</p>
              )}
            </div>
          ))}
        </div>

        <Separador factura={esFactura} />

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
          {esFactura && <p>SON: {numeroALetras(Number(pedido.total))} GUARANIES</p>}
        </div>

        <Separador factura={esFactura} />

        {esFactura && (
          <>
            <p>DETALLE FISCAL</p>
            <div>
              {Number(pedido.facturaGravado10 ?? 0) > 0 && (
                <p>{filaEtiqueta("GRAVADAS 10%", formatearGuarani(Number(pedido.facturaGravado10)), 12)}</p>
              )}
              {Number(pedido.facturaGravado5 ?? 0) > 0 && (
                <p>{filaEtiqueta("GRAVADAS 5%", formatearGuarani(Number(pedido.facturaGravado5)), 12)}</p>
              )}
              {Number(pedido.facturaExento ?? 0) > 0 && (
                <p>{filaEtiqueta("EXENTAS", formatearGuarani(Number(pedido.facturaExento)), 12)}</p>
              )}
            </div>
            <Separador factura />
            <p>LIQUIDACION IVA</p>
            <div>
              {Number(pedido.facturaIva10 ?? 0) > 0 && (
                <p>{filaEtiqueta("IVA 10%", formatearGuarani(Number(pedido.facturaIva10)), 9)}</p>
              )}
              {Number(pedido.facturaIva5 ?? 0) > 0 && (
                <p>{filaEtiqueta("IVA 5%", formatearGuarani(Number(pedido.facturaIva5)), 9)}</p>
              )}
              <p>
                {filaEtiqueta(
                  "TOTAL IVA",
                  formatearGuarani(Number(pedido.facturaIva10 ?? 0) + Number(pedido.facturaIva5 ?? 0)),
                  9
                )}
              </p>
            </div>
            <Separador factura />
            <p className="mt-1">ORIGINAL: CLIENTE</p>
            <p>DUPLICADO: ARCHIVO TRIBUTARIO</p>
          </>
        )}

        {/* Pago/entrega/repartidor: son datos operativos del pedido, no del
            documento fiscal — la factura ya muestra el método de pago
            arriba junto con condición de venta; entrega/repartidor siguen
            siendo exclusivos del comprobante informal. */}
        {!esFactura && (
          <>
            <div>
              <p>Pago: {sinAcentos(etiquetaMetodoPago(pedido.metodoPagoReferencia))}</p>
              <p>
                Entrega:{" "}
                {esDelivery
                  ? `Delivery - ${sinAcentos(pedido.deliveryZone?.nombre ?? "a coordinar")}`
                  : pedido.tipoEntrega === "mesa"
                    ? `Mesa ${pedido.mesaNumero ?? "-"}`
                    : "Retiro en el local"}
              </p>
              {esDelivery && pedido.direccion && <p>Direccion: {sinAcentos(pedido.direccion)}</p>}
              {esDelivery && pedido.repartidor && <p>Repartidor: {sinAcentos(pedido.repartidor.nombre)}</p>}
              {pedido.notas && <p className="mt-1">Nota: {sinAcentos(pedido.notas)}</p>}
            </div>

            <Separador factura={esFactura} />
          </>
        )}

        <p className="pt-1 text-center">
          Gracias por su compra!
          <br />
          {esFactura
            ? "Documento valido como Factura Autoimpresor."
            : "Este comprobante no es una factura legal."}
        </p>

        <Separador factura={esFactura} />

        {esAnulado && (
          <div className="mt-2 text-center">
            <p className="text-[16px] font-bold">*** ANULADA ***</p>
            <p>Pedido cancelado — no es un comprobante valido.</p>
          </div>
        )}
      </div>
    </>
  );
}
