import { notFound } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { formatearGuarani, formatearMiles, formatearNumero, formatearTelefonoLocal, sinAcentos } from "@/lib/format";
import { numeroALetras } from "@/lib/numero-a-letras";
import { etiquetaFormaPagoPos } from "@/lib/turno-pos";
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

// Mismo criterio que el ticket de pedidos: línea con tinta de verdad
// (guiones), no un borde CSS, porque algunas impresoras térmicas recortan el
// papel al contenido real y una separación solo visual se pierde.
//
// La factura usa "=" en vez de "-" (estructura de talonario/imprenta que
// pidió el dueño) — el ticket informal sigue con guiones.
function Separador({ factura = false }: { factura?: boolean }) {
  return <p className="py-1.5 text-center">{factura ? "=".repeat(ANCHO_RENGLON) : "- ".repeat(18).trim()}</p>;
}

// Se usa para las líneas de dos columnas del desglose de IVA — para el
// detalle de productos ver `filaTabla`, que calibra 3 columnas fijas.
//
// A diferencia de filaTabla, acá el monto va PEGADO a la etiqueta (no
// alineado a la derecha del renglón) — la etiqueta se rellena con espacios
// hasta `anchoEtiqueta` para que los ":" de un mismo bloque (Detalle fiscal,
// Liquidación IVA) queden alineados entre sí aunque las etiquetas midan
// distinto ("IVA 10%" vs "TOTAL IVA").
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

export default async function TicketVentaPosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await pantallaConPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);
  const { id } = await params;

  const [venta, store] = await Promise.all([
    db.ventaPos.findUnique({
      where: { id },
      include: {
        items: true,
        // Solo hace falta cuando comprobanteTipo === "factura": ahí es
        // donde vive la razón social/RUC del EMISOR (quien tiene el
        // timbrado), distinta de Store.razonSocial/ruc (uso interno de
        // TuMenuSmart, no se imprime nunca en un ticket).
        turnoPos: { include: { estacion: { include: { puntoExpedicion: true } } } },
      },
    }),
    db.store.findUnique({ where: { id: storeId } }),
  ]);

  if (!venta) notFound();

  const puntoExpedicion = venta.turnoPos.estacion.puntoExpedicion;
  const esFactura = venta.comprobanteTipo === "factura";

  const fecha = venta.creadoEn.toLocaleString("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ZONA_NEGOCIO,
  });
  // Con segundos, solo para la factura — el ticket informal sigue con la
  // fecha corta de siempre.
  const fechaFactura = venta.creadoEn.toLocaleString("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: ZONA_NEGOCIO,
  });

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ESTILOS_IMPRESION }} />

      <div className="mx-auto max-w-[75mm] font-mono text-[9px] leading-tight text-black">
        <ImprimirAuto />

        <div className="mb-2 flex justify-center print:hidden">
          <a
            href={`/admin/pos/venta/${venta.id}/comanda`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 hover:border-neutral-400"
          >
            🍳 Ver comanda para cocina
          </a>
        </div>

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
            {puntoExpedicion && (
              <>
                <p>Razon social: {sinAcentos(puntoExpedicion.razonSocialEmisor)}</p>
                <p>RUC: {puntoExpedicion.rucEmisor}</p>
                <p className="mt-1">
                  Timbrado: {venta.facturaTimbrado}
                  {venta.facturaVencimiento && (
                    <>
                      {"  "}
                      Vto: {venta.facturaVencimiento.toLocaleDateString("es-PY", { timeZone: ZONA_NEGOCIO })}
                    </>
                  )}
                </p>
              </>
            )}
            <p className="mt-1">Factura: {venta.facturaNumero}</p>
            <p>Condicion de venta: CONTADO</p>
            <p>Fecha: {fechaFactura}</p>
            <p>Metodo de pago: {sinAcentos(etiquetaFormaPagoPos(venta.formaPago))}</p>
          </div>
        ) : (
          <div>
            <p>Servicio rapido</p>
            <p>{fecha}</p>
            <p className="mt-1">Venta {formatearNumero(venta.numero)}</p>
          </div>
        )}

        <Separador factura={esFactura} />

        {esFactura && (
          <>
            <div>
              {/* Siempre las dos líneas, con o sin registro fiscal — el
                  timbrado Autoimpresor obliga a facturar toda venta, así que
                  "sin nombre" también necesita su razón social y su RUC
                  impresos (Sin Nombre / X), no un texto aparte. */}
              <p>
                Razon social:{" "}
                {venta.facturaTipoIdentificacion === SIN_REGISTRO_FISCAL.tipo
                  ? SIN_REGISTRO_FISCAL.etiquetaDisplay
                  : sinAcentos(venta.facturaRazonSocial ?? "")}
              </p>
              <p>
                {venta.facturaTipoIdentificacion === SIN_REGISTRO_FISCAL.tipo
                  ? "RUC"
                  : sinAcentos(etiquetaTipoIdentificacion(venta.facturaTipoIdentificacion ?? "ruc"))}
                : {venta.facturaRuc}
              </p>
            </div>
            <Separador factura />
          </>
        )}

        <div>
          {esFactura && (
            <p className="mb-1 whitespace-pre-wrap">
              {filaTabla("Ctd", "Descripcion", "Importe")}
            </p>
          )}
          {venta.items.map((item) => (
            <div key={item.id} className="mb-1.5 last:mb-0">
              <p className="whitespace-pre-wrap">
                {filaTabla(
                  String(item.cantidad),
                  sinAcentos(item.nombreProducto),
                  formatearMiles(item.cantidad * Number(item.precioUnitario))
                )}
              </p>
              {item.opcionesTexto && <p className="pl-3">+ {sinAcentos(item.opcionesTexto)}</p>}
            </div>
          ))}
        </div>

        <Separador factura={esFactura} />

        <p>TOTAL: {formatearGuarani(Number(venta.total))}</p>
        {esFactura && (
          <p>
            SON: {numeroALetras(Number(venta.total))} GUARANIES
          </p>
        )}

        <Separador factura={esFactura} />

        {esFactura && (
          <>
            <p>DETALLE FISCAL</p>
            <div>
              {Number(venta.facturaGravado10 ?? 0) > 0 && (
                <p>{filaEtiqueta("GRAVADAS 10%", formatearGuarani(Number(venta.facturaGravado10)), 12)}</p>
              )}
              {Number(venta.facturaGravado5 ?? 0) > 0 && (
                <p>{filaEtiqueta("GRAVADAS 5%", formatearGuarani(Number(venta.facturaGravado5)), 12)}</p>
              )}
              {Number(venta.facturaExento ?? 0) > 0 && (
                <p>{filaEtiqueta("EXENTAS", formatearGuarani(Number(venta.facturaExento)), 12)}</p>
              )}
            </div>
            <Separador factura />
            <p>LIQUIDACION IVA</p>
            <div>
              {Number(venta.facturaIva10 ?? 0) > 0 && (
                <p>{filaEtiqueta("IVA 10%", formatearGuarani(Number(venta.facturaIva10)), 9)}</p>
              )}
              {Number(venta.facturaIva5 ?? 0) > 0 && (
                <p>{filaEtiqueta("IVA 5%", formatearGuarani(Number(venta.facturaIva5)), 9)}</p>
              )}
              <p>
                {filaEtiqueta(
                  "TOTAL IVA",
                  formatearGuarani(Number(venta.facturaIva10 ?? 0) + Number(venta.facturaIva5 ?? 0)),
                  9
                )}
              </p>
            </div>
            <Separador factura />
            <p className="mt-1">ORIGINAL: CLIENTE</p>
            <p>DUPLICADO: ARCHIVO TRIBUTARIO</p>
          </>
        )}

        {/* La forma de pago es un dato operativo del cobro, no del documento
            fiscal — la factura ya la muestra arriba junto con condición de
            venta; acá solo hace falta para el comprobante informal. */}
        {!esFactura && (
          <>
            <div>
              <p>Pago: {sinAcentos(etiquetaFormaPagoPos(venta.formaPago))}</p>
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
      </div>
    </>
  );
}
