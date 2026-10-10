import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AutoRefresh } from "@/components/AutoRefresh";
import { localPorSlug } from "@/lib/local-por-slug";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { METODOS_PAGO_PEDIDO } from "@/lib/metodos-pago";
import { construirLinkWhatsapp } from "@/lib/whatsapp";
import { sincronizarPedidosConCuentas } from "@/lib/pedido-web-servidor";
import {
  ESTADOS_PEDIDO_ABIERTOS,
  normalizarEstado,
  normalizarRubro,
  pasosDeSeguimiento,
  textoParaCliente,
  type LineaVisible,
  type TipoEntregaPedido,
} from "@/lib/pedido-web";

export const dynamic = "force-dynamic";

// El enlace es privado (lleva una llave larga): que ningún buscador lo guarde.
export const metadata: Metadata = { robots: { index: false, follow: false } };

const FORMATO_TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

/**
 * El seguimiento de un pedido para el cliente: en qué paso va, lo que pidió y cuánto es. La llave del enlace es larga y al azar:
 * quien no la tiene no puede ver nada. Se actualiza solo cada pocos segundos mientras el pedido sigue abierto.
 */
export default async function SeguimientoPedidoPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const local = await localPorSlug(slug);
  if (!FORMATO_TOKEN.test(token)) notFound();

  let p = await prisma.pedidoWeb.findFirst({ where: { storeId: local.id, token } });
  if (!p) notFound();
  // Si ya es una cuenta del delivery y se cobró o se canceló desde allá, el seguimiento lo refleja.
  if (p.estado === "aceptado" || p.estado === "listo") {
    await sincronizarPedidosConCuentas(local.id, p.id);
    p = (await prisma.pedidoWeb.findFirst({ where: { storeId: local.id, token } })) ?? p;
  }

  const estado = normalizarEstado(p.estado);
  const tipo: TipoEntregaPedido = p.tipoEntrega === "retiro" ? "retiro" : "delivery";
  const rubro = normalizarRubro(local.pedidosWebRubro);
  const texto = textoParaCliente(rubro, tipo, estado);
  const { pasos, actual } = pasosDeSeguimiento(rubro, tipo, estado);
  const abierto = ESTADOS_PEDIDO_ABIERTOS.includes(estado);
  const lineas = (Array.isArray(p.lineas) ? p.lineas : []) as LineaVisible[];
  const pago = METODOS_PAGO_PEDIDO.find((m) => m.value === p.metodoPago)?.label ?? p.metodoPago;
  const enlaceWhatsapp = local.whatsappNumero.replace(/\D/g, "")
    ? construirLinkWhatsapp(local.whatsappNumero, `Hola, te escribo por mi pedido N° ${formatearNumero(p.numero)}.`)
    : null;

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-4">
      {abierto && <AutoRefresh segundos={15} />}

      <header className="flex items-center gap-3">
        <Link
          href={`/${slug}`}
          aria-label="Volver al menú"
          className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-azul-luz text-[1.25rem] leading-none text-azul-oscuro transition-all hover:bg-azul hover:text-white active:scale-90"
        >
          ←
        </Link>
        <div className="min-w-0">
          <p className="truncate text-[0.7rem] font-semibold uppercase tracking-rotulo text-tinta-suave">{local.nombre}</p>
          <h1 className="text-[1.6rem] font-semibold leading-tight tracking-titular text-tinta">Pedido {formatearNumero(p.numero)}</h1>
        </div>
      </header>

      <section
        aria-live="polite"
        className={`mt-5 rounded-2xl p-5 ring-1 ${
          estado === "rechazado" || estado === "cancelado" ? "bg-peligro-luz/50 ring-peligro/30" : "bg-superficie ring-linea"
        }`}
      >
        <h2 className="text-[1.3rem] font-semibold tracking-titular text-tinta">{texto.titulo}</h2>
        <p className="mt-1 text-[0.92rem] leading-snug text-tinta-media">{texto.detalle}</p>

        {actual >= 0 && (
          <ol className="mt-5 grid grid-cols-4 gap-1.5" aria-label="Pasos del pedido">
            {pasos.map((nombre, i) => (
              <li key={nombre} className="flex flex-col gap-1.5">
                <span
                  className={`h-1.5 rounded-full ${i <= actual ? "bg-brand" : "bg-linea"}`}
                  aria-hidden="true"
                />
                <span className={`text-[0.72rem] leading-tight ${i === actual ? "font-semibold text-tinta" : "text-tinta-suave"}`}>
                  {nombre}
                </span>
              </li>
            ))}
          </ol>
        )}

        {estado === "rechazado" && p.motivoRechazo && (
          <p className="mt-4 rounded-xl bg-peligro-luz px-3.5 py-2.5 text-[0.88rem] font-medium text-peligro">Motivo: {p.motivoRechazo}</p>
        )}
      </section>

      <section aria-label="Tu pedido" className="mt-4 rounded-2xl bg-superficie p-5 shadow-sm ring-1 ring-linea">
        <p className="text-[0.74rem] font-semibold uppercase tracking-rotulo text-tinta-suave">Tu pedido</p>
        <ul className="mt-2.5 flex flex-col gap-2">
          {lineas.map((l, i) => (
            <li key={i} className="flex justify-between gap-3 text-[0.9rem]">
              <span className="min-w-0 text-tinta">
                {l.cantidad} × {l.nombre}
                {l.detalle && <span className="block text-[0.78rem] text-tinta-suave">{l.detalle}</span>}
              </span>
              <span className="cifra flex-none font-medium text-tinta-media">{formatearGuarani(l.precioUnitario * l.cantidad)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-col gap-1.5 border-t border-dashed border-linea pt-3 text-[0.86rem] text-tinta-media">
          <div className="flex justify-between gap-3">
            <span>Entrega</span>
            <span className="text-right font-medium text-tinta">
              {tipo === "retiro" ? "Retiro en el local" : `Delivery${p.zonaNombre ? ` · ${p.zonaNombre}` : ""}`}
            </span>
          </div>
          {tipo === "delivery" && (
            <div className="flex justify-between gap-3">
              <span>Envío</span>
              <span className="cifra text-right font-medium text-tinta">{p.envioACoordinar ? "A coordinar" : formatearGuarani(Number(p.costoEnvio))}</span>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <span>Pago</span>
            <span className="text-right font-medium text-tinta">{pago}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span>Comprobante</span>
            <span className="text-right font-medium text-tinta">{p.comprobanteTipo === "factura" ? "Factura" : "Ticket"}</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-3">
            <span className="text-[0.95rem] font-semibold text-tinta">Total</span>
            <span className="cifra text-[1.2rem] font-bold text-tinta">{formatearGuarani(Number(p.total))}</span>
          </div>
        </div>
      </section>

      {enlaceWhatsapp && (
        <a
          href={enlaceWhatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex h-12 w-full items-center justify-center rounded-2xl bg-superficie text-[0.92rem] font-semibold text-tinta shadow-sm ring-1 ring-linea transition-all hover:ring-brand active:scale-[0.98]"
        >
          Escribirle al local por WhatsApp
        </a>
      )}
    </main>
  );
}
