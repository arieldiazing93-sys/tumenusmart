import { notFound } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { formatearGuarani, formatearMiles, formatearNumero, formatearTelefonoLocal, sinAcentos } from "@/lib/format";
import { numeroALetras } from "@/lib/numero-a-letras";
import { textoPorcentaje } from "@/lib/descuento-venta";
import { esVentaACredito, etiquetaFormaPagoPos } from "@/lib/turno-pos";
import { SIN_REGISTRO_FISCAL, etiquetaTipoIdentificacion } from "@/lib/tipo-cliente";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { ImprimirAuto } from "@/components/ImprimirAuto";
import { VolverAutomatico } from "@/components/VolverAutomatico";

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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ silencioso?: string; comandasFallidas?: string; volver?: string }>;
}) {
  await pantallaConPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);
  const { id } = await params;
  // Presente cuando QZ Tray pide este HTML para imprimir solo — ver
  // src/lib/impresion-comprobantes.ts. Oculta los controles manuales
  // (ImprimirAuto, el link a la comanda), que no tienen sentido en un
  // documento que ya se manda directo a la impresora.
  const { silencioso, comandasFallidas, volver } = await searchParams;
  const esSilencioso = silencioso === "1";
  // Áreas cuya comanda NO se pudo imprimir sola al cobrar (ver
  // PantallaVenta.tsx confirmarCobro) — se avisa acá, con un link manual
  // por área, en vez de un window.open automático que el navegador podría
  // bloquear.
  const idsComandasFallidas = comandasFallidas ? comandasFallidas.split(",").filter(Boolean) : [];
  const areasFallidas =
    idsComandasFallidas.length > 0
      ? await db.areaImpresion.findMany({ where: { id: { in: idsComandasFallidas } }, select: { id: true, nombre: true } })
      : [];
  // Solo viene de cobrar en el Punto de Venta (PantallaVenta): ahí, ya impreso
  // el ticket, se vuelve solo al mostrador. Si alguna comanda no salió sola se
  // queda: hay que tocar su link, y volver de golpe taparía ese aviso. Al abrir
  // el ticket de una venta vieja desde Cuentas no viene, y no se mueve.
  const volverAlPos = volver === "1" && areasFallidas.length === 0;

  const [venta, store] = await Promise.all([
    db.ventaPos.findUnique({ where: { id }, include: { items: true, pagos: { orderBy: { orden: "asc" } } } }),
    db.store.findUnique({ where: { id: storeId } }),
  ]);

  if (!venta) notFound();

  // Una factura anulada sola (cuenta viva) ya no cuenta como vigente para
  // imprimir — cae al bloque informal, con el aviso de más abajo.
  const esFactura = venta.comprobanteTipo === "factura" && !venta.facturaAnulada;

  // Descuento general de la cuenta: los ítems de arriba están a precio de
  // lista, y el TOTAL ya viene con el descuento restado.
  const descuento = Number(venta.descuento);
  const etiquetaDescuento =
    venta.descuentoPorcentaje != null
      ? `DESCUENTO ${textoPorcentaje(Number(venta.descuentoPorcentaje))}%`
      : "DESCUENTO";

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

      <div id="comprobante-imprimible" className="mx-auto max-w-[75mm] font-mono text-[9px] leading-tight text-black">
        {!esSilencioso ? (
          <ImprimirAuto volverA={volverAlPos ? "/admin/pos" : undefined} />
        ) : (
          volverAlPos && <VolverAutomatico a="/admin/pos" segundos={2} />
        )}

        {venta.cancelada && (
          <div className="mb-2 text-center">
            <p className="text-[16px] font-bold">*** ANULADA ***</p>
            <p>Venta cancelada — no es un comprobante valido.</p>
          </div>
        )}

        {!esSilencioso && (
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
        )}

        {areasFallidas.length > 0 && (
          <div className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-center text-xs text-amber-800 print:hidden">
            <p className="mb-1 font-medium">No se imprimió sola la comanda de:</p>
            {areasFallidas.map((a) => (
              <a
                key={a.id}
                href={`/admin/pos/venta/${venta.id}/comanda?area=${a.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mr-2 underline"
              >
                {a.nombre}
              </a>
            ))}
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
            {venta.facturaRazonSocialEmisor && (
              <>
                <p>Razon social: {sinAcentos(venta.facturaRazonSocialEmisor)}</p>
                <p>RUC: {venta.facturaRucEmisor}</p>
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
            <p>Condicion de venta: {esVentaACredito(venta.formaPago) ? "CREDITO" : "CONTADO"}</p>
            <p>Fecha: {fechaFactura}</p>
            {esVentaACredito(venta.formaPago) ? (
              venta.fechaVencimientoCredito && (
                <p>Vence: {venta.fechaVencimientoCredito.toLocaleDateString("es-PY", { timeZone: "UTC" })}</p>
              )
            ) : venta.pagos.length > 1 ? (
              // Pago dividido: cada forma con lo que se cobró con ella.
              <>
                <p>Metodo de pago: Mixto</p>
                {venta.pagos.map((p) => (
                  <p key={p.id}>
                    - {sinAcentos(etiquetaFormaPagoPos(p.forma))}: {formatearGuarani(Number(p.monto))}
                  </p>
                ))}
              </>
            ) : (
              <p>Metodo de pago: {sinAcentos(etiquetaFormaPagoPos(venta.formaPago))}</p>
            )}
          </div>
        ) : (
          <div>
            <p>Servicio rapido</p>
            <p>{fecha}</p>
            <p className="mt-1">Venta {formatearNumero(venta.numero)}</p>
            {venta.facturaAnulada && venta.facturaNumero && (
              <p className="mt-1">
                Factura {venta.facturaNumero} ANULADA — no vale como comprobante fiscal.
              </p>
            )}
          </div>
        )}

        <Separador factura={esFactura} />

        {venta.comprobanteTipo === "factura" && (
          <>
            <div>
              {!esFactura && <p className="uppercase">Datos para factura</p>}
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
            <Separador factura={esFactura} />
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

        {descuento > 0 && (
          <>
            <p>SUBTOTAL: {formatearGuarani(Number(venta.total) + descuento)}</p>
            <p>
              {etiquetaDescuento}: -{formatearGuarani(descuento)}
            </p>
          </>
        )}
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
              {venta.pagos.length > 1 ? (
                <>
                  <p>Pago: Mixto</p>
                  {venta.pagos.map((p) => (
                    <p key={p.id}>
                      - {sinAcentos(etiquetaFormaPagoPos(p.forma))}: {formatearGuarani(Number(p.monto))}
                    </p>
                  ))}
                </>
              ) : (
                <p>Pago: {sinAcentos(etiquetaFormaPagoPos(venta.formaPago))}</p>
              )}
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

        {venta.cancelada && (
          <div className="mt-2 text-center">
            <p className="text-[16px] font-bold">*** ANULADA ***</p>
            <p>Venta cancelada — no es un comprobante valido.</p>
          </div>
        )}
      </div>
    </>
  );
}
