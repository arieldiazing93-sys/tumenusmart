import { VolverAlMenu } from "@/components/Volver";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { pasosSeguimiento, indicePaso } from "@/lib/seguimiento-pedido";
import { AutoRefresh } from "@/components/AutoRefresh";
import { SeguimientoTracker } from "@/components/SeguimientoTracker";
import { SelloFidelidad } from "@/components/SelloFidelidad";
import { Tarjeta, Aviso } from "@/components/ui";
import { localPorSlug } from "@/lib/local-por-slug";
import { progresoDeCliente } from "@/lib/fidelidad";

export const dynamic = "force-dynamic";

export default async function SeguimientoPedidoPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const store = await localPorSlug(slug);

  // El pedido se busca DENTRO de este local: el id de otro negocio,
  // aunque se escriba a mano en la barra, no aparece. Los pedidos los carga la caja a mano (el menú digital solo manda el mensaje de
  // WhatsApp): esta pantalla es para seguir el estado de uno que ya está cargado.
  const order = await prisma.order.findFirst({
    where: { id, storeId: store.id },
    include: { items: true, deliveryZone: true },
  });

  if (!order) notFound();

  const cancelado = order.estado === "cancelado";
  const pasos = pasosSeguimiento(order.tipoEntrega);
  const actual = indicePaso(order.estado, order.tipoEntrega);
  const finalizado = order.estado === "entregado";

  const progresoFidelidad = store.fidelizacionActiva
    ? await progresoDeCliente(store.id, order.clienteTelefono, {
        umbral: store.fidelizacionUmbral,
        montoMinimo: store.fidelizacionMontoMinimo,
      })
    : null;
  const nombrePremio = store.fidelizacionPremio || "un premio especial";

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      {/* Mientras el pedido sigue en curso, la pantalla se actualiza sola. */}
      {!finalizado && !cancelado && <AutoRefresh segundos={25} />}

      <div className="mb-8 text-center">
        <h1 className="text-[1.3rem] font-semibold tracking-titular text-tinta">
          Pedido {formatearNumero(order.numero)}
        </h1>
        <p className="text-[0.85rem] text-tinta-suave">{store.nombre}</p>
      </div>

      {cancelado ? (
        <div className="mb-8">
          <Aviso titulo="Pedido cancelado" color="peligro">
            Si creés que es un error, escribinos por WhatsApp.
          </Aviso>
        </div>
      ) : (
        <div className="mb-8">
          <SeguimientoTracker pasos={pasos} actual={actual} finalizado={finalizado} />
        </div>
      )}

      {progresoFidelidad && (
        <div className="mb-8">
          {progresoFidelidad.listo ? (
            <Aviso titulo="¡Llegaste a tu premio!" color="exito">
              <SelloFidelidad progreso={progresoFidelidad.progreso} umbral={store.fidelizacionUmbral} />
              <p className="mt-3">
                Mostrale esto al local: <strong className="font-semibold text-exito">{nombrePremio}</strong>.
              </p>
            </Aviso>
          ) : (
            <Aviso titulo="Fidelización" color="marca">
              <SelloFidelidad progreso={progresoFidelidad.progreso} umbral={store.fidelizacionUmbral} />
              <p className="mt-3">
                Te faltan {store.fidelizacionUmbral - progresoFidelidad.progreso} pedidos
                entregados para tu premio: <strong className="font-semibold text-exito">{nombrePremio}</strong>.
              </p>
            </Aviso>
          )}
        </div>
      )}

      <Tarjeta>
        <p className="mb-3 text-[0.85rem] font-semibold text-tinta-media">Detalle</p>
        <div className="flex flex-col gap-1.5 text-[0.88rem]">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between gap-3">
              <span className="text-tinta-media">
                {item.cantidad}x {item.nombreProducto}
                {item.opcionesTexto && (
                  <span className="text-tinta-suave"> ({item.opcionesTexto})</span>
                )}
              </span>
              <span className="cifra flex-none text-tinta">
                {formatearGuarani(item.cantidad * Number(item.precioUnitario))}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-between border-t border-linea pt-3 font-semibold text-tinta">
          <span>Total</span>
          <span className="cifra">{formatearGuarani(Number(order.total))}</span>
        </div>
        <p className="mt-3 text-[0.78rem] text-tinta-suave">
          {order.tipoEntrega === "delivery" ? `Entrega a domicilio: ${order.direccion ?? "-"}` : "Retiro en el local"}
        </p>
      </Tarjeta>

      <div className="mt-8 text-center">
        <VolverAlMenu slug={slug} />
      </div>
    </main>
  );
}
