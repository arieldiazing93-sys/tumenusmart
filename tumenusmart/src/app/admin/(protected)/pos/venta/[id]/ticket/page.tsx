import { notFound } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { etiquetaFormaPagoPos } from "@/lib/turno-pos";
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

function filaConMonto(texto: string, monto: string, ancho: number): string {
  const espacio = ancho - texto.length - monto.length;
  if (espacio < 2) return `${texto}\n${monto}`;
  return texto + " ".repeat(espacio) + monto;
}

const ANCHO_RENGLON = 32;

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
    db.ventaPos.findUnique({ where: { id }, include: { items: true } }),
    db.store.findUnique({ where: { id: storeId } }),
  ]);

  if (!venta) notFound();

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
            <p className="text-xs leading-tight">Tel: {store.whatsappNumero}</p>
          )}
        </div>

        <Separador />

        <div>
          <p className="text-[1.1rem] font-semibold tracking-titular">Servicio rápido</p>
          <p className="text-xs">{fecha}</p>
          <p className="mt-1">Venta {formatearNumero(venta.numero)}</p>
        </div>

        <Separador />

        <div>
          {venta.items.map((item) => (
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
            </div>
          ))}
        </div>

        <Separador />

        <p className="text-[1.1rem] font-semibold tracking-titular">
          TOTAL: {formatearGuarani(Number(venta.total))}
        </p>

        <Separador />

        <div className="text-xs">
          <p>
            <span className="font-bold">Pago:</span> {etiquetaFormaPagoPos(venta.formaPago)}
          </p>
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
