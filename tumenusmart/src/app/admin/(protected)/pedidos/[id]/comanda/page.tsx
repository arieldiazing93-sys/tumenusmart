import { notFound } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { formatearNumero } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { ImprimirAuto } from "@/components/ImprimirAuto";

export const dynamic = "force-dynamic";

// Pensado para rollo térmico de 80 mm, que es lo que usan casi todos los
// locales. Si se imprime en hoja común sale como una tira angosta, que
// también sirve para cortar y colgar en la cocina. Mismo tamaño/tipografía
// que el ticket (9px, sin negritas) — pedido explícito del dueño, para que
// comanda y ticket se vean parejos.
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
// impresora interprete la página, así que cada bloque de la comanda
// (cabecera, hora/tipo, ítems, nota, pie) separa del siguiente con esta
// línea en vez de con un borde.
function Separador() {
  return <p className="py-1.5 text-center">{"- ".repeat(18).trim()}</p>;
}

export default async function ComandaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ area?: string; silencioso?: string }>;
}) {
  // Layout y página se renderizan en paralelo: sin este chequeo acá, una
  // sesión vencida podía terminar en el `throw` de idLocalActual() de acá
  // abajo antes de que el layout redirigiera a /admin/login.
  await pantallaConPermiso("pedidos.ver");

  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  const { id } = await params;
  // `area`: filtra a solo los ítems de esa Área de Impresión (impresión
  // automática por área — ver src/lib/impresion-comprobantes.ts). Sin
  // `area`, se sigue mostrando TODO (link manual "Ver comanda completa").
  // `silencioso`: oculta ImprimirAuto cuando QZ Tray pide este HTML.
  const { area, silencioso } = await searchParams;
  const esSilencioso = silencioso === "1";

  const [pedido, areaImpresion] = await Promise.all([
    prisma.order.findUnique({
      where: { id },
      include: { items: { include: { product: { select: { areaImpresionId: true } } } }, deliveryZone: true },
    }),
    area ? prisma.areaImpresion.findUnique({ where: { id: area }, select: { nombre: true } }) : Promise.resolve(null),
  ]);

  if (!pedido) notFound();

  const items = area ? pedido.items.filter((i) => i.product?.areaImpresionId === area) : pedido.items;

  const hora = new Date(pedido.createdAt).toLocaleString("es-PY", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ZONA_NEGOCIO,
  });

  const esDelivery = pedido.tipoEntrega === "delivery";

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ESTILOS_IMPRESION }} />

      <div id="comprobante-imprimible" className="mx-auto max-w-[76mm] font-mono text-[9px] leading-tight text-black">
        {!esSilencioso && <ImprimirAuto />}

        <Separador />

        <div className="text-center">
          <p>{formatearNumero(pedido.numero)}</p>
          {areaImpresion && <p className="uppercase">{areaImpresion.nombre}</p>}
        </div>

        <Separador />

        <div>
          <p>{hora}</p>
          <p>
            {esDelivery
              ? "DELIVERY"
              : pedido.tipoEntrega === "mesa"
                ? `MESA ${pedido.mesaNumero ?? "-"}`
                : "RETIRO"}
          </p>
        </div>

        <Separador />

        <ul>
          {items.map((item) => (
            <li key={item.id} className="mb-1.5 last:mb-0">
              <p className="uppercase">
                {item.cantidad} x {item.nombreProducto}
              </p>
              {item.opcionesTexto && <p>+ {item.opcionesTexto}</p>}
              {item.ingredientesQuitadosTexto && (
                <p className="font-bold uppercase">** {item.ingredientesQuitadosTexto} **</p>
              )}
            </li>
          ))}
        </ul>

        {pedido.notas && (
          <>
            <Separador />
            <div>
              <p className="uppercase">Nota del cliente</p>
              <p>{pedido.notas}</p>
            </div>
          </>
        )}

        <Separador />

        <p className="text-center">Cliente: {pedido.clienteNombre}</p>

        <Separador />
      </div>
    </>
  );
}
