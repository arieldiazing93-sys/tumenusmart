import { Cabecera } from "@/components/ui";
import Link from "next/link";
import { headers } from "next/headers";
import { pantallaConPermiso } from "@/lib/auth";
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
import { TarjetaIdeaSemana } from "../TarjetaIdeaSemana";
import { ideaDeLaSemana } from "@/lib/idea-semanal";
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

const FILTROS_TIPO: { value: "delivery" | "retiro" | "mesa"; label: string }[] = [
  { value: "delivery", label: "Delivery" },
  { value: "retiro", label: "Retiro" },
  { value: "mesa", label: "Mesa" },
];

export default async function AdminPedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; fecha?: string; desde?: string; hasta?: string; tipo?: string }>;
}) {
  // Sin este chequeo acá (y no solo en el layout), una sesión vencida con
  // esta pantalla abierta terminaba en un error real: el layout y la página
  // se renderizan en paralelo, así que el redirect del layout no siempre
  // gana la carrera contra el `throw` de idLocalActual() de acá abajo — el
  // aviso sonoro de pedidos nuevos hace router.refresh() cada 15s, y ese
  // refresh es justo lo que disparaba el error cuando la sesión ya había
  // vencido con la pestaña abierta.
  await pantallaConPermiso("pedidos.ver");

  // Todas las consultas de acá abajo quedan atadas a este local. El id se
  // guarda aparte porque además hace falta para consultar el propio local
  // (Store no lleva la columna, así que el filtro automático no lo alcanza).
  const storeId = await idLocalActual();
  const prisma = prismaDelLocal(storeId);

  const { estado, fecha, desde, hasta, tipo } = await searchParams;
  const estadoActivo = estado && estado !== "todos" ? estado : null;
  const rangoFecha = calcularRangoFecha(fecha, desde, hasta);
  const fechaActiva = rangoFecha ? fecha : null;
  // "todos" es un valor EXPLÍCITO (pastilla "Todos" de tipo): ahí sí se
  // mezclan los tres. Sin filtro de tipo en la URL (entrando por "Pedidos"
  // del menú, como toda la vida) se sigue mostrando delivery + retiro nada
  // más — los pedidos de mesa quedan afuera salvo que se pidan a propósito,
  // que es justo lo que el dueño pidió.
  const tipoActivo =
    tipo === "delivery" || tipo === "retiro" || tipo === "mesa" || tipo === "todos"
      ? tipo
      : null;
  // null → default (delivery+retiro, mesa afuera) · "todos" → sin filtro ·
  // cualquier otro valor → exactamente ese tipo.
  const filtroTipo =
    tipoActivo == null
      ? { tipoEntrega: { not: "mesa" } }
      : tipoActivo === "todos"
        ? {}
        : { tipoEntrega: tipoActivo };

  const [pedidos, store, estadoTienda, pedidosEnviados] = await Promise.all([
    prisma.order.findMany({
      where: {
        storeId,
        ...(estadoActivo ? { estado: estadoActivo } : {}),
        ...(rangoFecha ? { createdAt: rangoFecha } : {}),
        ...filtroTipo,
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

  // La idea de la semana se muestra acá porque Pedidos es la pantalla que el
  // encargado abre todos los días.
  const ideaSemana = await ideaDeLaSemana(storeId).catch(() => null);

  // Arma un querystring preservando los otros filtros activos, para que
  // cambiar de estado no te haga perder el filtro de fecha y viceversa.
  function hrefEstado(nuevoEstado: string | null) {
    const params = new URLSearchParams();
    if (nuevoEstado) params.set("estado", nuevoEstado);
    if (fechaActiva) params.set("fecha", fechaActiva);
    if (fechaActiva === "rango" && desde) params.set("desde", desde);
    if (fechaActiva === "rango" && hasta) params.set("hasta", hasta);
    if (tipoActivo) params.set("tipo", tipoActivo);
    const qs = params.toString();
    return qs ? `/admin/pedidos?${qs}` : "/admin/pedidos";
  }

  function hrefFecha(nuevaFecha: FiltroFecha | null) {
    const params = new URLSearchParams();
    if (estadoActivo) params.set("estado", estadoActivo);
    if (nuevaFecha) params.set("fecha", nuevaFecha);
    if (tipoActivo) params.set("tipo", tipoActivo);
    const qs = params.toString();
    return qs ? `/admin/pedidos?${qs}` : "/admin/pedidos";
  }

  function hrefTipo(nuevoTipo: "delivery" | "retiro" | "mesa" | "todos" | null) {
    const params = new URLSearchParams();
    if (estadoActivo) params.set("estado", estadoActivo);
    if (fechaActiva) params.set("fecha", fechaActiva);
    if (nuevoTipo) params.set("tipo", nuevoTipo);
    const qs = params.toString();
    return qs ? `/admin/pedidos?${qs}` : "/admin/pedidos";
  }

  /**
   * El estado de los pedidos, en un solo lugar.
   *
   * Están pausados, o el local está fuera de horario, o se está tomando
   * pedidos. Son excluyentes y en ese orden de prioridad: pausado manda sobre
   * el horario, porque es una decisión que alguien tomó recién.
   */
  const estadoPedidos = store?.pedidosPausados
    ? {
        color: "aviso" as const,
        titulo: "Pedidos pausados",
        detalle:
          store.mensajePausa?.trim() ||
          "Los clientes ven la carta pero no pueden confirmar.",
      }
    : !estadoTienda.abierto
      ? {
          color: "neutro" as const,
          titulo: "Fuera de horario",
          detalle: estadoTienda.proximaApertura
            ? `No se toman pedidos hasta que abra ${estadoTienda.proximaApertura}.`
            : "No se toman pedidos fuera del horario cargado.",
        }
      : {
          color: "exito" as const,
          titulo: "Tomando pedidos",
          detalle:
            estadoTienda.horarioDeHoy && estadoTienda.horarioDeHoy !== "Cerrado"
              ? `Hoy ${estadoTienda.horarioDeHoy}`
              : "",
        };

  return (
    <div>
      {/*
        Mismo título que ve el header cuando se entra por el link "Mesas" del
        menú: sin esto, la pantalla seguía diciendo "Pedidos" con el filtro de
        mesa ya aplicado, y parecía que el link no había hecho nada.
      */}
      <Cabecera
        titulo={tipoActivo === "mesa" ? "Mesas" : "Pedidos"}
        bajada={
          tipoActivo === "mesa"
            ? "Pedidos para comer en el local. No se mezclan con delivery ni retiro."
            : "Lo que entró por la carta. Los nuevos aparecen arriba y avisan solos."
        }
        acciones={
          urlCarta ? (
            <CompartirCarta nombreNegocio={store?.nombre ?? "Nuestra carta"} url={urlCarta} />
          ) : null
        }
      />

      {ideaSemana && !ideaSemana.vista && <TarjetaIdeaSemana idea={ideaSemana} />}

      {/*
        Una sola línea de estado, no tres bloques.

        Antes esto ocupaba media pantalla ANTES del primer pedido, que es lo
        único que se viene a ver acá. Y peor: se contradecía — la tarjeta decía
        "acepta pedidos con normalidad" justo arriba de "el menú no está
        tomando pedidos". Eran dos piezas distintas contando la misma historia
        sin hablarse. Ahora el estado se decide en un solo lugar.
      */}
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-linea bg-white px-3.5 py-2">
        <span className="flex flex-none items-center gap-2 text-[0.86rem] font-semibold text-tinta">
          <span
            aria-hidden="true"
            className={`h-2 w-2 flex-none rounded-full ${
              estadoPedidos.color === "exito"
                ? "bg-exito"
                : estadoPedidos.color === "aviso"
                  ? "bg-aviso"
                  : "bg-tinta-suave"
            }`}
          />
          {estadoPedidos.titulo}
        </span>

        {estadoPedidos.detalle && (
          <span className="min-w-0 flex-1 truncate text-[0.82rem] text-tinta-media">
            {estadoPedidos.detalle}
          </span>
        )}

        <div className="ml-auto flex flex-none items-center gap-2">
          <AvisoPedidosNuevos enviadosIniciales={pedidosEnviados} />
          <PausaPedidosToggle
            pausado={store?.pedidosPausados ?? false}
            mensaje={store?.mensajePausa ?? null}
            compacto
            variante="barra"
          />
        </div>
      </div>

      {/*
        Estados en su propia fila: por sí solos ya llenan el ancho, así que
        compartir renglón con fecha los partía a la mitad (una pastilla de
        fecha sí, la siguiente en el renglón de abajo).
      */}
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-2">
        <Link
          href={hrefEstado(null)}
          className={`rounded-full border px-3.5 py-1.5 text-[0.82rem] font-semibold transition-colors duration-100 ${
            !estadoActivo
              ? "border-tinta bg-tinta text-white"
              : "border-linea bg-white text-tinta-media hover:border-brand hover:text-brand"
          }`}
        >
          Todos
        </Link>
        {ESTADOS_PEDIDO.map((e) => (
          <Link
            key={e.value}
            href={hrefEstado(e.value)}
            className={`rounded-full border px-3.5 py-1.5 text-[0.82rem] font-semibold transition-colors duration-100 ${
              estadoActivo === e.value
                ? "border-tinta bg-tinta text-white"
                : "border-linea bg-white text-tinta-media hover:border-brand hover:text-brand"
            }`}
          >
            {e.emoji} {e.label}
          </Link>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-2">
        <Link
          href={hrefFecha(null)}
          className={`rounded-full border px-3 py-1.5 text-[0.82rem] font-semibold transition-colors duration-100 ${
            !fechaActiva
              ? "border-tinta bg-tinta text-white"
              : "border-linea bg-white text-tinta-media hover:border-brand hover:text-brand"
          }`}
        >
          Todas
        </Link>
        {FILTROS_FECHA.map((f) => (
          <Link
            key={f.value}
            href={hrefFecha(f.value)}
            className={`rounded-full border px-3 py-1.5 text-[0.82rem] font-semibold transition-colors duration-100 ${
              fechaActiva === f.value
                ? "border-tinta bg-tinta text-white"
                : "border-linea bg-white text-tinta-media hover:border-brand hover:text-brand"
            }`}
          >
            {f.label}
          </Link>
        ))}

        <details className="group relative flex-none" open={fechaActiva === "rango"}>
          <summary
            className={`flex cursor-pointer list-none items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.82rem] font-semibold transition-colors duration-100 ${
              fechaActiva === "rango"
                ? "border-tinta bg-tinta text-white"
                : "border-linea bg-white text-tinta-media hover:border-brand hover:text-brand"
            }`}
          >
            Rango
            <span
              aria-hidden="true"
              className="text-[0.6rem] transition-transform duration-150 group-open:rotate-180"
            >
              ▼
            </span>
          </summary>

          {/*
            Se despliega por encima y no empujando la fila: si empujara, abrir
            el rango correría los pedidos hacia abajo, que es justo lo que
            estamos tratando de evitar.
          */}
          <form
            method="get"
            action="/admin/pedidos"
            className="absolute left-0 top-full z-20 mt-1.5 flex items-center gap-1.5 rounded-xl border border-linea bg-white p-2 shadow-media"
          >
            {estadoActivo && <input type="hidden" name="estado" value={estadoActivo} />}
            {tipoActivo && <input type="hidden" name="tipo" value={tipoActivo} />}
            <input type="hidden" name="fecha" value="rango" />
            <input
              type="date"
              name="desde"
              aria-label="Desde"
              defaultValue={fechaActiva === "rango" ? desde : ""}
              required
              className="rounded-lg border border-linea px-2 py-1.5 text-[0.78rem]"
            />
            <span className="text-tinta-suave">–</span>
            <input
              type="date"
              name="hasta"
              aria-label="Hasta"
              defaultValue={fechaActiva === "rango" ? hasta : ""}
              required
              className="rounded-lg border border-linea px-2 py-1.5 text-[0.78rem]"
            />
            <button
              type="submit"
              className="flex-none rounded-lg bg-tinta px-3 py-1.5 text-[0.78rem] font-semibold text-white transition-opacity hover:opacity-90"
            >
              Filtrar
            </button>
          </form>
        </details>

        {/*
          Tipo de entrega, en la misma fila que la fecha (separado con una
          línea vertical) y empujado a la derecha con "ml-auto" — es un
          filtro de otra dimensión (por dónde entró el pedido, no cuándo),
          pero comparte renglón para no ocupar una fila entera aparte.
          Por defecto ("Delivery + Retiro" de acá sin tocar, o entrando por
          "Pedidos" del menú) se ven delivery y retiro mezclados como
          siempre — los de mesa quedan afuera salvo que se pidan a propósito
          con estas pastillas o con "Mesas" del menú.
        */}
        <span aria-hidden="true" className="mx-1 h-5 w-px flex-none bg-linea" />

        <div className="ml-auto flex flex-wrap items-center gap-x-2 gap-y-2">
          <Link
            href={hrefTipo(null)}
            className={`rounded-full border px-3.5 py-1.5 text-[0.82rem] font-semibold transition-colors duration-100 ${
              !tipoActivo
                ? "border-tinta bg-tinta text-white"
                : "border-linea bg-white text-tinta-media hover:border-brand hover:text-brand"
            }`}
          >
            Delivery + Retiro
          </Link>
          {FILTROS_TIPO.map((t) => (
            <Link
              key={t.value}
              href={hrefTipo(t.value)}
              className={`rounded-full border px-3.5 py-1.5 text-[0.82rem] font-semibold transition-colors duration-100 ${
                tipoActivo === t.value
                  ? "border-tinta bg-tinta text-white"
                  : "border-linea bg-white text-tinta-media hover:border-brand hover:text-brand"
              }`}
            >
              {t.label}
            </Link>
          ))}
          <Link
            href={hrefTipo("todos")}
            className={`rounded-full border px-3.5 py-1.5 text-[0.82rem] font-semibold transition-colors duration-100 ${
              tipoActivo === "todos"
                ? "border-tinta bg-tinta text-white"
                : "border-linea bg-white text-tinta-media hover:border-brand hover:text-brand"
            }`}
          >
            Todos los tipos
          </Link>
        </div>
      </div>

      {pedidos.length === 0 && (
        <p className="text-tinta-media">No hay pedidos con estos filtros.</p>
      )}

      {pedidos.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-linea bg-white">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-linea bg-papel-suave text-xs uppercase tracking-wide text-tinta-media">
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
                    className="cursor-pointer border-b border-linea-fina last:border-0 hover:bg-papel-suave"
                  >
                    <td className="px-3 py-3">
                      {/*
                        prefetch={false} en todos los enlaces de la fila.

                        Next precarga cada enlace apenas entra en pantalla, y
                        esta pantalla es force-dynamic: cada precarga es un
                        render COMPLETO en el servidor, con sus consultas a la
                        base. Con hasta 100 pedidos en la lista, desplazarse
                        disparaba cientos de renders para terminar abriendo uno.
                        En los registros de Vercel se veían cinco GET a
                        /admin/pedidos/<id> en 70 milisegundos sin que nadie
                        tocara nada.

                        Y con connection_limit=1 es peor: esas precargas
                        compiten por la misma conexión que necesita la pantalla
                        que estás mirando.

                        El costo es que abrir un pedido ya no viene adelantado.
                        Se paga una vez al abrir, en lugar de cientos de veces
                        al desplazarse.
                      */}
                      <Link prefetch={false} href={`/admin/pedidos/${pedido.id}`} className="block font-medium text-tinta-media">
                        {formatearNumero(pedido.numero)}
                        {!pedido.enviadoWhatsapp && pedido.estado === "pendiente" && (
                          <span
                            title="El cliente armó el pedido pero nunca apretó 'Enviar por WhatsApp'"
                            className="mt-0.5 block text-[10px] font-medium uppercase text-aviso"
                          >
                            sin enviar
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Link prefetch={false} href={`/admin/pedidos/${pedido.id}`} className="block">
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
                      <Link prefetch={false} href={`/admin/pedidos/${pedido.id}`} className="block font-medium">
                        {pedido.clienteNombre}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Link prefetch={false} href={`/admin/pedidos/${pedido.id}`} className="block">
                        {pedido.clienteTelefono}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Link prefetch={false} href={`/admin/pedidos/${pedido.id}`} className="block max-w-[220px] truncate">
                        {resumenProductos}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Link prefetch={false} href={`/admin/pedidos/${pedido.id}`} className="block font-semibold">
                        {formatearGuarani(Number(pedido.total))}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Link prefetch={false} href={`/admin/pedidos/${pedido.id}`} className="block">
                        {pedido.tipoEntrega === "delivery"
                          ? pedido.deliveryZone?.nombre ?? "A coordinar"
                          : pedido.tipoEntrega === "mesa"
                            ? `Mesa ${pedido.mesaNumero ?? "-"}`
                            : "Retiro"}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Link prefetch={false} href={`/admin/pedidos/${pedido.id}`} className="block">
                        {pedido.repartidor?.nombre ?? "—"}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Link prefetch={false} href={`/admin/pedidos/${pedido.id}`} className="block">
                        {pedido.metodoPagoReferencia}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Link prefetch={false} href={`/admin/pedidos/${pedido.id}`}>
                        <span
                          className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[0.74rem] font-semibold ${colorEstado(pedido.estado)}`}
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
