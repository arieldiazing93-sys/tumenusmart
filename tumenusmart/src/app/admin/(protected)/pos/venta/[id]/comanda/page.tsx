import { notFound } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { formatearNumero } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { ImprimirAuto } from "@/components/ImprimirAuto";

export const dynamic = "force-dynamic";

// Mismo criterio que la comanda de pedidos: pensado para rollo térmico de
// 80mm, letra grande para leer de un vistazo en la cocina.
const ESTILOS_IMPRESION = `
  @page { size: 80mm auto; margin: 4mm; }
  @media print {
    html, body { width: 72mm; background: #fff; }
  }
`;

// Línea con tinta de verdad (guiones), no un borde CSS — ver el mismo
// comentario en la comanda de pedidos: algunas impresoras térmicas recortan
// el papel al contenido real, y un borde o un salto en blanco se pierde.
function Separador() {
  return <p className="py-1.5 text-center text-xs">{"- ".repeat(18).trim()}</p>;
}

export default async function ComandaVentaPosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ area?: string; silencioso?: string }>;
}) {
  await pantallaConPermiso("pos.vender");
  const db = prismaDelLocal(await idLocalActual());
  const { id } = await params;
  // `area`: filtra a solo los ítems de esa Área de Impresión (impresión
  // automática por área — ver src/lib/impresion-comprobantes.ts). Sin
  // `area`, se sigue mostrando TODO (link manual "Ver comanda completa").
  // `silencioso`: oculta ImprimirAuto cuando QZ Tray pide este HTML.
  const { area, silencioso } = await searchParams;
  const esSilencioso = silencioso === "1";

  const [venta, areaImpresion] = await Promise.all([
    db.ventaPos.findUnique({
      where: { id },
      include: {
        items: { orderBy: { id: "asc" }, include: { product: { select: { areaImpresionId: true } } } },
      },
    }),
    area ? db.areaImpresion.findUnique({ where: { id: area }, select: { nombre: true } }) : Promise.resolve(null),
  ]);
  if (!venta) notFound();

  const items = area ? venta.items.filter((i) => i.product?.areaImpresionId === area) : venta.items;

  const hora = venta.creadoEn.toLocaleString("es-PY", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ZONA_NEGOCIO,
  });

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ESTILOS_IMPRESION }} />

      <div id="comprobante-imprimible" className="mx-auto max-w-[76mm] font-mono text-black">
        {!esSilencioso && <ImprimirAuto />}

        <Separador />

        <div className="text-center">
          <p className="text-[1.1rem] font-semibold tracking-titular tracking-widest">COMANDA</p>
          <p className="text-3xl font-bold leading-tight">{formatearNumero(venta.numero)}</p>
          {areaImpresion && <p className="text-sm font-bold uppercase">{areaImpresion.nombre}</p>}
        </div>

        <Separador />

        <div className="text-sm font-bold">
          <p>{hora}</p>
          {/* En mayúscula y solo, para que el cocinero lo vea sin tener que
              buscarlo entre el resto del texto: es el dato que decide si
              sirve en un plato o empaca para llevar. */}
          <p>{venta.tipoEntrega === "llevar" ? "PARA LLEVAR" : "EN EL LOCAL"}</p>
        </div>

        <Separador />

        <ul>
          {items.map((item) => (
            <li key={item.id} className="mb-2.5 last:mb-0">
              <p className="text-[1.4rem] font-semibold tracking-titular uppercase leading-tight">
                {item.cantidad} x {item.nombreProducto}
              </p>
              {item.opcionesTexto && (
                <p className="mt-0.5 text-base leading-tight">+ {item.opcionesTexto}</p>
              )}
            </li>
          ))}
        </ul>

        {venta.nota && (
          <>
            <Separador />
            <div>
              <p className="text-sm font-bold uppercase">Nota</p>
              <p className="text-base leading-tight">{venta.nota}</p>
            </div>
          </>
        )}

        {venta.clienteNombre && (
          <>
            <Separador />
            <p className="text-center text-sm">Cliente: {venta.clienteNombre}</p>
          </>
        )}

        <Separador />
      </div>
    </>
  );
}
