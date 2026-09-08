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

// Espacios reales entre la hora y "DELIVERY"/"RETIRO", en vez de depender
// del hueco que genera `justify-between`. Algunas impresoras térmicas (o su
// driver en Windows en modo "Genérico / Solo texto") ignoran esa separación
// visual y pegan los dos textos — con espacios de verdad en el documento,
// sobrevive sin importar cómo la impresora interprete la página.
function espacioAlineado(izquierda: string, derecha: string, ancho: number): string {
  const cantidad = Math.max(2, ancho - izquierda.length - derecha.length);
  return " ".repeat(cantidad);
}

const ANCHO_RENGLON = 40;

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

        {/*
          Líneas en blanco REALES (no margen/padding CSS) antes y después de
          la comanda. Si se imprime justo después de otra impresión (comanda
          + ticket seguidos) y la impresora no deja suficiente papel en
          blanco entre un trabajo y el siguiente, el final de uno queda
          pegado al principio del otro — visto en un caso real donde
          "Cliente: Jose" terminó fundido con el encabezado "COMANDA" de la
          impresión siguiente. Un `<br>` es contenido de verdad, no un hueco
          generado por diseño, así que sobrevive aunque la impresora ignore
          los márgenes de @page.
        */}
        <br />
        <br />

        <div className="border-y-4 border-double border-black py-2 text-center">
          <p className="text-[1.1rem] font-semibold tracking-titular tracking-widest">COMANDA</p>
          <p className="text-3xl font-bold leading-tight">
            {formatearNumero(pedido.numero)}
          </p>
        </div>

        <p className="whitespace-pre-wrap border-b border-dashed border-black py-1.5 text-sm font-bold">
          {hora}
          {espacioAlineado(hora, esDelivery ? "DELIVERY" : "RETIRO", ANCHO_RENGLON)}
          {esDelivery ? "DELIVERY" : "RETIRO"}
        </p>

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

        <br />
        <br />
        <br />
      </div>
    </>
  );
}
