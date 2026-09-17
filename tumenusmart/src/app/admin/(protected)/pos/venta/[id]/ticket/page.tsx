import { notFound } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { formatearGuarani, formatearNumero, formatearTelefonoLocal } from "@/lib/format";
import { etiquetaFormaPagoPos } from "@/lib/turno-pos";
import { SIN_REGISTRO_FISCAL, etiquetaTipoIdentificacion } from "@/lib/tipo-cliente";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { ImprimirAuto } from "@/components/ImprimirAuto";

export const dynamic = "force-dynamic";

const ESTILOS_IMPRESION = `
  @page { size: 80mm auto; margin: 4mm; }
  @media print {
    html, body { width: 72mm; background: #fff; }
  }
`;

// Mismo criterio que el ticket de pedidos: línea con tinta de verdad
// (guiones), no un borde CSS, porque algunas impresoras térmicas recortan el
// papel al contenido real y una separación solo visual se pierde.
function Separador() {
  return <p className="py-1.5 text-center text-xs">{"- ".repeat(18).trim()}</p>;
}

// Se usa para las líneas de dos columnas (desglose de IVA, encabezados) —
// para el detalle de productos ver `filaTabla`, que calibra 3 columnas fijas.
function filaConMonto(texto: string, monto: string, ancho: number): string {
  const espacio = ancho - texto.length - monto.length;
  if (espacio < 2) return `${texto}\n${monto}`;
  return texto + " ".repeat(espacio) + monto;
}

// Calibrado para una impresora térmica de 75mm a 40 caracteres por línea.
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

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ESTILOS_IMPRESION }} />

      <div className="mx-auto max-w-[76mm] font-mono text-sm text-black">
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
            {puntoExpedicion && (
              <>
                <p className="text-xs leading-tight">Razón social: {puntoExpedicion.razonSocialEmisor}</p>
                <p className="text-xs leading-tight">RUC: {puntoExpedicion.rucEmisor}</p>
              </>
            )}
            <p className="mt-1 text-xs leading-tight">Timbrado N°: {venta.facturaTimbrado}</p>
            {venta.facturaVencimiento && (
              <p className="text-xs leading-tight">
                Válido hasta:{" "}
                {venta.facturaVencimiento.toLocaleDateString("es-PY", { timeZone: ZONA_NEGOCIO })}
              </p>
            )}
            <p className="mt-1 text-[1rem] font-semibold tracking-titular">N°: {venta.facturaNumero}</p>
            <p className="text-xs">Fecha: {fecha}</p>
          </div>
        ) : (
          <div>
            <p className="text-[1.1rem] font-semibold tracking-titular">Servicio rápido</p>
            <p className="text-xs">{fecha}</p>
            <p className="mt-1">Venta {formatearNumero(venta.numero)}</p>
          </div>
        )}

        <Separador />

        {esFactura && (
          <>
            <div className="text-xs leading-tight">
              {venta.facturaTipoIdentificacion === SIN_REGISTRO_FISCAL.tipo ? (
                <p>Cliente: {SIN_REGISTRO_FISCAL.etiquetaDisplay}</p>
              ) : (
                <>
                  <p>Razón social: {venta.facturaRazonSocial}</p>
                  <p>
                    {etiquetaTipoIdentificacion(venta.facturaTipoIdentificacion ?? "ruc")}: {venta.facturaRuc}
                  </p>
                </>
              )}
            </div>
            <Separador />
          </>
        )}

        <div>
          {esFactura && (
            <p className="mb-1 whitespace-pre-wrap font-bold">
              {filaTabla("Cant", "Descripción", "Monto")}
            </p>
          )}
          {venta.items.map((item) => (
            <div key={item.id} className="mb-1.5 last:mb-0">
              <p className="whitespace-pre-wrap">
                {filaTabla(
                  String(item.cantidad),
                  item.nombreProducto,
                  formatearGuarani(item.cantidad * Number(item.precioUnitario))
                )}
              </p>
              {item.opcionesTexto && (
                <p className="pl-3 text-xs leading-tight">+ {item.opcionesTexto}</p>
              )}
            </div>
          ))}
        </div>

        <Separador />

        <p className="text-[1.1rem] font-semibold tracking-titular">
          TOTAL: {formatearGuarani(Number(venta.total))}
        </p>

        <Separador />

        {esFactura && (
          <>
            <div className="text-xs leading-tight">
              {Number(venta.facturaGravado10 ?? 0) > 0 && (
                <p>{filaConMonto("Gravadas 10%:", formatearGuarani(Number(venta.facturaGravado10)), ANCHO_RENGLON)}</p>
              )}
              {Number(venta.facturaGravado5 ?? 0) > 0 && (
                <p>{filaConMonto("Gravadas 5%:", formatearGuarani(Number(venta.facturaGravado5)), ANCHO_RENGLON)}</p>
              )}
              {Number(venta.facturaExento ?? 0) > 0 && (
                <p>{filaConMonto("Exentas:", formatearGuarani(Number(venta.facturaExento)), ANCHO_RENGLON)}</p>
              )}
              {Number(venta.facturaIva10 ?? 0) > 0 && (
                <p>{filaConMonto("IVA 10%:", formatearGuarani(Number(venta.facturaIva10)), ANCHO_RENGLON)}</p>
              )}
              {Number(venta.facturaIva5 ?? 0) > 0 && (
                <p>{filaConMonto("IVA 5%:", formatearGuarani(Number(venta.facturaIva5)), ANCHO_RENGLON)}</p>
              )}
            </div>
            <Separador />
          </>
        )}

        {/* La forma de pago es un dato operativo del cobro, no del documento
            fiscal — una factura de verdad no lo muestra, pero el
            comprobante informal (ticket normal) sí lo necesita. */}
        {!esFactura && (
          <>
            <div className="text-xs">
              <p>
                <span className="font-bold">Pago:</span> {etiquetaFormaPagoPos(venta.formaPago)}
              </p>
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
