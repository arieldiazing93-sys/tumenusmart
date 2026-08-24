import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { construirMensajePedido, construirLinkWhatsapp } from "@/lib/whatsapp";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { pasosSeguimiento, indicePaso } from "@/lib/seguimiento-pedido";
import { AutoRefresh } from "@/components/AutoRefresh";
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
        <h1 className="text-xl font-bold text-neutral-900">
          Pedido {formatearNumero(order.numero)}
        </h1>
        <p className="text-sm text-neutral-500">{store.nombre}</p>
      </div>

      {!order.enviadoWhatsapp && !cancelado && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-center">
          <p className="font-semibold text-amber-900">Falta un paso</p>
          <p className="mt-0.5 text-sm text-amber-800">
            Enviá el pedido por WhatsApp para que {store.nombre} lo reciba y lo confirme.
          </p>
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
        <div className="mb-8 rounded-xl border border-red-200 bg-red-50 p-5 text-center">
          <p className="text-2xl">❌</p>
          <p className="mt-1 font-semibold text-red-800">Pedido cancelado</p>
          <p className="mt-0.5 text-sm text-red-700">
            Si creés que es un error, escribinos por WhatsApp.
          </p>
        </div>
      ) : (
        <div className="mb-8 rounded-xl border border-neutral-200 bg-white p-5">
          <p className="mb-4 text-sm font-semibold text-neutral-700">Estado de tu pedido</p>
          <ol className="flex flex-col gap-1">
            {pasos.map((paso, i) => {
              const cumplido = actual >= 0 && i <= actual;
              const esActual = i === actual;
              return (
                <li key={paso.estado} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-8 w-8 flex-none items-center justify-center rounded-full text-sm ${
                        cumplido ? "bg-brand text-white" : "bg-neutral-100 text-neutral-400"
                      }`}
                    >
                      {cumplido ? paso.emoji : "•"}
                    </div>
                    {i < pasos.length - 1 && (
                      <div
                        className={`w-0.5 flex-1 ${
                          actual > i ? "bg-brand" : "bg-neutral-200"
                        }`}
                        style={{ minHeight: "18px" }}
                      />
                    )}
                  </div>
                  <div className={`pb-4 ${i === pasos.length - 1 ? "pb-0" : ""}`}>
                    <p
                      className={`text-sm font-medium ${
                        esActual
                          ? "text-brand-dark"
                          : cumplido
                            ? "text-neutral-900"
                            : "text-neutral-400"
                      }`}
                    >
                      {paso.titulo}
                      {esActual && " ←"}
                    </p>
                    {esActual && (
                      <p className="text-xs text-neutral-500">{paso.detalle}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {!finalizado && (
            <p className="mt-3 border-t border-neutral-100 pt-3 text-center text-xs text-neutral-400">
              Esta pantalla se actualiza sola — podés dejarla abierta.
            </p>
          )}
        </div>
      )}

      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <p className="mb-3 text-sm font-semibold text-neutral-700">Detalle</p>
        <div className="flex flex-col gap-1.5 text-sm">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between gap-3">
              <span className="text-neutral-700">
                {item.cantidad}x {item.nombreProducto}
                {item.opcionesTexto && (
                  <span className="text-neutral-400"> ({item.opcionesTexto})</span>
                )}
              </span>
              <span className="flex-none text-neutral-900">
                {formatearGuarani(item.cantidad * Number(item.precioUnitario))}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-between border-t border-neutral-200 pt-3 font-semibold">
          <span>Total</span>
          <span>{formatearGuarani(Number(order.total))}</span>
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          {order.tipoEntrega === "delivery"
            ? `Entrega a domicilio: ${order.direccion ?? "-"}`
            : "Retiro en el local"}
        </p>
      </div>

      <div className="mt-8 text-center">
        <Link href={`/${slug}`} className="text-sm text-brand">
          Volver al menú
        </Link>
      </div>
    </main>
  );
}
