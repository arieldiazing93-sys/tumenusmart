import Link from "next/link";
import { headers } from "next/headers";
import { prismaDelLocal } from "@/lib/prisma-local";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { ESTADOS_PEDIDO, etiquetaEstado, colorEstado } from "@/lib/estados-pedido";
import { calcularRangoFecha, type FiltroFecha } from "@/lib/rango-fecha";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { obtenerEstadoTienda } from "@/lib/estado-tienda";
import { linkWhatsappCliente } from "@/lib/whatsapp";
import { idLocalActual } from "@/lib/local-actual";
import { PausaPedidosToggle } from "../PausaPedidosToggle";
import { CompartirCarta } from "../CompartirCarta";
import { AvisoPedidosNuevos } from "./AvisoPedidosNuevos";

export const dynamic = "force-dynamic";

/** URL pública de la carta, tomada del dominio con el que se entró al panel. */
async function urlPublicaCarta(slug: string): Promise<string> {
  const cabeceras = await headers();
  const host = cabeceras.get("x-forwarded-host") ?? cabeceras.get("host") ?? "";
  if (!host) return "";
  const protocolo = host.startsWith("localhost") ? "http" : "https";
  return `${protocolo}://${host}/${slug}`;
}

const FILTROS_FECHA: { value: FiltroFecha; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "ayer", label: "Ayer" },
  { value: "7dias", label: "Últimos 7 días" },
  { value: "mes", label: "Este mes" },
];

export default async function AdminPedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; fecha?: string; desde?: string; hasta?: string }>;
}) {
  // Todas las consultas de acá abajo quedan atadas a este local. El id se
  // guarda aparte porque además hace falta para consultar el propio local
  // (Store no lleva la columna, así que el filtro automático no lo alcanza).
  const storeId = await idLocalActual();
  const prisma = prismaDelLocal(storeId);

  const { estado, fecha, desde, hasta } = await searchParams;
  const estadoActivo = estado && estado !== "todos" ? estado : null;
  const rangoFecha = calcularRangoFecha(fecha, desde, hasta);
  const fechaActiva = rangoFecha ? fecha : null;

  
  const [pedidos, store, estadoTienda, pedidosEnviados] = await Promise.all([
    prisma.order.findMany({
      where: {
        storeId,
        ...(estadoActivo ? { estado: estadoActivo } : {}),
        ...(rangoFecha ? { createdAt: rangoFecha } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { items: true, deliveryZone: true, repartidor: true },
      take: 100,
    }),
    prisma.store.findUnique({ where: { id: storeId } }),
    obtenerEstadoTienda(storeId),
    // Punto de partida del vigilante de pedidos nuevos: si este número
    // sube mientras la pantalla está abierta, es que entró un pedido.
    prisma.order.count({ where: { storeId, enviadoWhatsapp: true } }),
  ]);

  const urlCarta = store ? await urlPublicaCarta(store.slug) : "";

  // Arma un querystring preservando los otros filtros activos, para que
  // cambiar de estado no te haga perder el filtro de fecha y viceversa.
  function hrefEstado(nuevoEstado: string | null) {
    const params = new URLSearchParams();
    if (nuevoEstado) params.set("estado", nuevoEstado);
    if (fechaActiva) params.set("fecha", fechaActiva);
    if (fechaActiva === "rango" && desde) params.set("desde", desde);
    if (fechaActiva === "rango" && hasta) params.set("hasta", hasta);
    const qs = params.toString();
    return qs ? `/admin/pedidos?${qs}` : "/admin/pedidos";
  }

  function hrefFecha(nuevaFecha: FiltroFecha | null) {
    const params = new URLSearchParams();
    if (estadoActivo) params.set("estado", estadoActivo);
    if (nuevaFecha) params.set("fecha", nuevaFecha);
    const qs = params.toString();
    return qs ? `/admin/pedidos?${qs}` : "/admin/pedidos";
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-neutral-900">Pedidos</h1>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <AvisoPedidosNuevos enviadosIniciales={pedidosEnviados} />
        {urlCarta && (
          <div className="text-right">
            <CompartirCarta
              nombreNegocio={store?.nombre ?? "Nuestra carta"}
              url={urlCarta}
            />
            <p className="mt-1 text-xs text-neutral-400">Link público · QR imprimible</p>
          </div>
        )}
      </div>

      <div className="mb-6">
        <PausaPedidosToggle
          pausado={store?.pedidosPausados ?? false}
          mensaje={store?.mensajePausa ?? null}
          compacto
        />
        {!estadoTienda.abierto && !estadoTienda.pausado && (
          <p className="mt-2 text-sm text-amber-700">
            🕒 Fuera de horario: el menú no está tomando pedidos
            {estadoTienda.proximaApertura ? ` — abre ${estadoTienda.proximaApertura}` : ""}.
          </p>
        )}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <Link
          href={hrefEstado(null)}
          className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
            !estadoActivo
              ? "border-brand bg-brand text-white"
              : "border-neutral-300 text-neutral-600 hover:border-brand hover:text-brand"
          }`}
        >
          Todos
        </Link>
        {ESTADOS_PEDIDO.map((e) => (
          <Link
            key={e.value}
            href={hrefEstado(e.value)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
              estadoActivo === e.value
                ? "border-brand bg-brand text-white"
                : "border-neutral-300 text-neutral-600 hover:border-brand hover:text-brand"
            }`}
          >
            {e.emoji} {e.label}
          </Link>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2 border-t border-neutral-200 pt-3">
        <Link
          href={hrefFecha(null)}
          className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
            !fechaActiva
              ? "border-brand bg-brand text-white"
              : "border-neutral-300 text-neutral-600 hover:border-brand hover:text-brand"
          }`}
        >
          Todas las fechas
        </Link>
        {FILTROS_FECHA.map((f) => (
          <Link
            key={f.value}
            href={hrefFecha(f.value)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
              fechaActiva === f.value
                ? "border-brand bg-brand text-white"
                : "border-neutral-300 text-neutral-600 hover:border-brand hover:text-brand"
            }`}
          >
            {f.label}
          </Link>
        ))}

        <form
          method="get"
          action="/admin/pedidos"
          className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-sm ${
            fechaActiva === "rango"
              ? "border-brand bg-brand-light"
              : "border-neutral-300"
          }`}
        >
          {estadoActivo && <input type="hidden" name="estado" value={estadoActivo} />}
          <input type="hidden" name="fecha" value="rango" />
          <input
            type="date"
            name="desde"
            defaultValue={fechaActiva === "rango" ? desde : ""}
            required
            className="rounded-md border border-neutral-300 px-1.5 py-1 text-xs"
          />
          <span className="text-neutral-400">–</span>
          <input
            type="date"
            name="hasta"
            defaultValue={fechaActiva === "rango" ? hasta : ""}
            required
            className="rounded-md border border-neutral-300 px-1.5 py-1 text-xs"
          />
          <button
            type="submit"
            className="rounded-full bg-neutral-800 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-700"
          >
            Filtrar
          </button>
        </form>
      </div>

      {pedidos.length === 0 && (
        <p className="text-neutral-500">No hay pedidos con estos filtros.</p>
      )}

      {pedidos.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2">N°</th>
                <th className="px-3 py-2">Hora</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Teléfono</th>
                <th className="px-3 py-2">Productos</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Entrega</th>
                <th className="px-3 py-2">Repartidor</th>
                <th className="px-3 py-2">Pago</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2 text-center">Escribir</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((pedido) => {
                const resumenProductos = pedido.items
                  .map((i) => `${i.cantidad}x ${i.nombreProducto}`)
                  .join(", ");
                return (
                  <tr
                    key={pedido.id}
                    className="cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-neutral-50"
                  >
                    <td className="px-3 py-3">
                      <Link href={`/admin/pedidos/${pedido.id}`} className="block font-medium text-neutral-500">
                        {formatearNumero(pedido.numero)}
                        {!pedido.enviadoWhatsapp && pedido.estado === "pendiente" && (
                          <span
                            title="El cliente armó el pedido pero nunca apretó 'Enviar por WhatsApp'"
                            className="mt-0.5 block text-[10px] font-medium uppercase text-amber-600"
                          >
                            sin enviar
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/admin/pedidos/${pedido.id}`} className="block">
                        {new Date(pedido.createdAt).toLocaleDateString("es-PY", {
                          day: "2-digit",
                          month: "2-digit",
                          timeZone: ZONA_NEGOCIO,
                        })}{" "}
                        {new Date(pedido.createdAt).toLocaleTimeString("es-PY", {
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: ZONA_NEGOCIO,
                        })}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/admin/pedidos/${pedido.id}`} className="block font-medium">
                        {pedido.clienteNombre}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/admin/pedidos/${pedido.id}`} className="block">
                        {pedido.clienteTelefono}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/admin/pedidos/${pedido.id}`} className="block max-w-[220px] truncate">
                        {resumenProductos}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/admin/pedidos/${pedido.id}`} className="block font-semibold">
                        {formatearGuarani(Number(pedido.total))}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/admin/pedidos/${pedido.id}`} className="block">
                        {pedido.tipoEntrega === "delivery"
                          ? pedido.deliveryZone?.nombre ?? "A coordinar"
                          : "Retiro"}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/admin/pedidos/${pedido.id}`} className="block">
                        {pedido.repartidor?.nombre ?? "—"}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/admin/pedidos/${pedido.id}`} className="block">
                        {pedido.metodoPagoReferencia}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/admin/pedidos/${pedido.id}`}>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${colorEstado(pedido.estado)}`}
                        >
                          {etiquetaEstado(pedido.estado)}
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {/* Fuera del <Link> de la fila a propósito: acá el clic
                          abre WhatsApp, no el detalle del pedido. */}
                      <a
                        href={linkWhatsappCliente(
                          pedido.clienteTelefono,
                          `Hola ${pedido.clienteNombre}, te escribimos de ${
                            store?.nombre ?? "el local"
                          } por tu pedido ${formatearNumero(pedido.numero)}.`
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Escribirle a ${pedido.clienteNombre} por WhatsApp`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#25D366]/10 text-base text-[#128C7E] hover:bg-[#25D366]/20"
                      >
                        💬
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
