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
// también sirve para cortar y colgar en la cocina.
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
  return <p className="py-1.5 text-center text-xs">{"- ".repeat(18).trim()}</p>;
}

export default async function ComandaPage({
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
  const pedido = await prisma.order.findUnique({
    where: { id },
    include: { items: true, deliveryZone: true },
  });

  if (!pedido) notFound();

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

      <div className="mx-auto max-w-[76mm] font-mono text-black">
        <ImprimirAuto />

        <Separador />

        <div className="text-center">
          <p className="text-[1.1rem] font-semibold tracking-titular tracking-widest">COMANDA</p>
          <p className="text-3xl font-bold leading-tight">
            {formatearNumero(pedido.numero)}
          </p>
        </div>

        <Separador />

        <div className="text-sm font-bold">
          <p>{hora}</p>
          <p>{esDelivery ? "DELIVERY" : "RETIRO"}</p>
        </div>

        <Separador />

        <ul>
          {pedido.items.map((item) => (
            <li key={item.id} className="mb-2.5 last:mb-0">
              <p className="text-[1.4rem] font-semibold tracking-titular uppercase leading-tight">
                {item.cantidad} x {item.nombreProducto}
              </p>
              {item.opcionesTexto && (
                <p className="mt-0.5 text-base leading-tight">+ {item.opcionesTexto}</p>
              )}
              {item.ingredientesQuitadosTexto && (
                <p className="mt-0.5 text-base font-bold uppercase leading-tight">
                  ** {item.ingredientesQuitadosTexto} **
                </p>
              )}
            </li>
          ))}
        </ul>

        {pedido.notas && (
          <>
            <Separador />
            <div>
              <p className="text-sm font-bold uppercase">Nota del cliente</p>
              <p className="text-base leading-tight">{pedido.notas}</p>
            </div>
          </>
        )}

        <Separador />

        <p className="text-center text-sm">Cliente: {pedido.clienteNombre}</p>

        <Separador />
      </div>
    </>
  );
}
