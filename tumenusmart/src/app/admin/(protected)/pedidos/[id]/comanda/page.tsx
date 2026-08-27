import { notFound } from "next/navigation";
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

export default async function ComandaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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

        <div className="border-y-4 border-double border-black py-2 text-center">
          <p className="text-[1.1rem] font-semibold tracking-titular tracking-widest">COMANDA</p>
          <p className="text-3xl font-bold leading-tight">
            {formatearNumero(pedido.numero)}
          </p>
        </div>

        <div className="flex justify-between border-b border-dashed border-black py-1.5 text-sm font-bold">
          <span>{hora}</span>
          <span>{esDelivery ? "DELIVERY" : "RETIRO"}</span>
        </div>

        <ul className="divide-y divide-dashed divide-black">
          {pedido.items.map((item) => (
            <li key={item.id} className="py-2.5">
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
          <div className="border-t-2 border-black pt-2">
            <p className="text-sm font-bold uppercase">Nota del cliente</p>
            <p className="text-base leading-tight">{pedido.notas}</p>
          </div>
        )}

        <div className="mt-2 border-t-4 border-double border-black pt-2 text-center text-sm">
          <p className="font-bold">
            {pedido.items.reduce((suma, i) => suma + i.cantidad, 0)} unidades en total
          </p>
          <p className="mt-1">Cliente: {pedido.clienteNombre}</p>
        </div>
      </div>
    </>
  );
}
