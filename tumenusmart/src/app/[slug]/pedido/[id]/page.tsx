import { VolverAlMenu } from "@/components/Volver";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { construirMensajePedido, construirLinkWhatsapp } from "@/lib/whatsapp";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { pasosSeguimiento, indicePaso } from "@/lib/seguimiento-pedido";
import { AutoRefresh } from "@/components/AutoRefresh";
import { SeguimientoTracker } from "@/components/SeguimientoTracker";
import { Tarjeta, Aviso } from "@/components/ui";
import { BotonWhatsapp } from "./BotonWhatsapp";
import { localPorSlug } from "@/lib/local-por-slug";

export const dynamic = "force-dynamic";

/** URL pública de esta misma pantalla, para mandársela al cliente por WhatsApp. */
async function urlSeguimiento(slug: string, orderId: string): Promise<string> {
  const cabeceras = await headers();
  const host = cabeceras.get("x-forwarded-host") ?? cabeceras.get("host");
  if (!host) return "";
  const protocolo = host.startsWith("localhost") ? "http" : "https";
  return `${protocolo}://${host}/${slug}/pedido/${orderId}`;
}

export default async function SeguimientoPedidoPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const store = await localPorSlug(slug);

  // El pedido se busca DENTRO de este local: el id de otro negocio,
  // aunque se escriba a mano en la barra, no aparece.
  const order = await prisma.order.findFirst({
    where: { id, storeId: store.id },
    include: { items: true, deliveryZone: true },
  });

  if (!order) notFound();

  const linkSeguimiento = await urlSeguimiento(slug, order.id);

  const mensaje = construirMensajePedido({
    numero: order.numero,
    saludo: store.mensajeSaludo,
    clienteNombre: order.clienteNombre,
    tipoEntrega: order.tipoEntrega,
    direccion: order.direccion,
    zonaNombre: order.deliveryZone?.nombre,
    clienteLat: order.clienteLat,
    clienteLng: order.clienteLng,
    metodoPagoReferencia: order.metodoPagoReferencia,
    comprobanteTipo: order.comprobanteTipo,
    facturaRazonSocial: order.facturaRazonSocial,
    facturaRuc: order.facturaRuc,
    facturaEmail: order.facturaEmail,
    notas: order.notas,
    items: order.items.map((i) => ({
      nombreProducto: i.nombreProducto,
      cantidad: i.cantidad,
      precioUnitario: Number(i.precioUnitario),
      opcionesTexto: i.opcionesTexto,
      ingredientesQuitadosTexto: i.ingredientesQuitadosTexto,
    })),
    subtotal: Number(order.subtotal),
    costoEnvio: Number(order.costoEnvio),
    total: Number(order.total),
    linkSeguimiento: linkSeguimiento || null,
  });

  const linkWhatsapp = construirLinkWhatsapp(store.whatsappNumero, mensaje);

  const cancelado = order.estado === "cancelado";
  const pasos = pasosSeguimiento(order.tipoEntrega);
  const actual = indicePaso(order.estado, order.tipoEntrega);
  const finalizado = order.estado === "entregado";

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

      {!order.enviadoWhatsapp && !cancelado && (
        <div className="mb-6">
          <Aviso titulo="Falta un paso" color="aviso">
            Enviá el pedido por WhatsApp para que {store.nombre} lo reciba y lo confirme.
          </Aviso>
        </div>
      )}

      <div className="mb-8 flex justify-center">
        <BotonWhatsapp
          slug={slug}
          orderId={order.id}
          link={linkWhatsapp}
          yaEnviado={order.enviadoWhatsapp}
        />
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
          {order.tipoEntrega === "delivery"
            ? `Entrega a domicilio: ${order.direccion ?? "-"}`
            : "Retiro en el local"}
        </p>
      </Tarjeta>

      <div className="mt-8 text-center">
        <VolverAlMenu slug={slug} />
      </div>
    </main>
  );
}
