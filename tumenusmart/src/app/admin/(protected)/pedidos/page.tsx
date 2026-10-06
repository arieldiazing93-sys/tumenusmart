import { BotonEnlace, Cabecera } from "@/components/ui";
import Link from "next/link";
import { headers } from "next/headers";
import { pantallaConPermiso } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { prismaDelLocal } from "@/lib/prisma-local";
import { ESTADOS_PEDIDO } from "@/lib/estados-pedido";
import { calcularRangoFecha, type FiltroFecha } from "@/lib/rango-fecha";
import { obtenerEstadoTienda } from "@/lib/estado-tienda";
import { idLocalActual } from "@/lib/local-actual";
import { PedidosMaestro } from "./PedidosMaestro";
import { cargarContextoPedidos } from "./contexto-pedidos";
import { aFilaDePedido } from "./tipos-pedido";
import { PausaPedidosToggle } from "../PausaPedidosToggle";
import { CompartirCarta } from "../CompartirCarta";
import { TarjetaIdeaSemana } from "../TarjetaIdeaSemana";
import { ideaDeLaSemana } from "@/lib/idea-semanal";

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

const FILTROS_TIPO: { value: "delivery" | "retiro"; label: string }[] = [
  { value: "delivery", label: "Delivery" },
  { value: "retiro", label: "Retiro" },
];

export default async function AdminPedidosPage({
  searchParams,
}: {
  searchParams: Promise<{
    estado?: string;
    fecha?: string;
    desde?: string;
    hasta?: string;
    tipo?: string;
    buscar?: string;
  }>;
}) {
  // Sin este chequeo acá (y no solo en el layout), una sesión vencida con
  // esta pantalla abierta terminaba en un error real: el layout y la página
  // se renderizan en paralelo, así que el redirect del layout no siempre
  // gana la carrera contra el `throw` de idLocalActual() de acá abajo — el
  // aviso sonoro de pedidos nuevos hace router.refresh() cada 15s, y ese
  // refresh es justo lo que disparaba el error cuando la sesión ya había
  // vencido con la pestaña abierta.
  const sesion = await pantallaConPermiso("pedidos.ver");

  // Todas las consultas de acá abajo quedan atadas a este local. El id se
  // guarda aparte porque además hace falta para consultar el propio local
  // (Store no lleva la columna, así que el filtro automático no lo alcanza).
  const storeId = await idLocalActual();
  const prisma = prismaDelLocal(storeId);

  const { estado, fecha, desde, hasta, tipo, buscar } = await searchParams;
  const busquedaActiva = (buscar ?? "").trim();
  // Si es todo dígitos, también puede ser un número de pedido — buscarlo
  // exacto (el "#0072" que ve el cliente es solo el formato con ceros a la
  // izquierda; el número real guardado es 72). El teléfono se busca por
  // coincidencia parcial siempre, sea cual sea lo que se haya escrito.
  const numeroBuscado = /^\d+$/.test(busquedaActiva) ? parseInt(busquedaActiva, 10) : null;
  const filtroBusqueda = busquedaActiva
    ? {
        OR: [
          { clienteTelefono: { contains: busquedaActiva } },
          ...(numeroBuscado != null ? [{ numero: numeroBuscado }] : []),
        ],
      }
    : {};
  const estadoActivo = estado && estado !== "todos" ? estado : null;
  const rangoFecha = calcularRangoFecha(fecha, desde, hasta);
  const fechaActiva = rangoFecha ? fecha : null;
  // Los pedidos de la carta son de delivery o de retiro (comer en el local se atiende en Servicio comedor). Sin filtro de
  // tipo se ven los dos mezclados; cualquier otro valor de la URL (un enlace viejo con "mesa" o "todos") se ignora.
  const tipoActivo = tipo === "delivery" || tipo === "retiro" ? tipo : null;
  const filtroTipo = tipoActivo ? { tipoEntrega: tipoActivo } : {};

  const [pedidos, store, estadoTienda] = await Promise.all([
    prisma.order.findMany({
      where: {
        storeId,
        ...(estadoActivo ? { estado: estadoActivo } : {}),
        ...(rangoFecha ? { createdAt: rangoFecha } : {}),
        ...filtroTipo,
        ...filtroBusqueda,
      },
      orderBy: { createdAt: "desc" },
      include: { items: true, deliveryZone: true, repartidor: true },
      // Con búsqueda activa no tiene sentido cortar en 100: si el pedido que
      // se busca es viejo dentro del rango, tiene que aparecer igual.
      take: busquedaActiva ? undefined : 100,
    }),
    prisma.store.findUnique({ where: { id: storeId } }),
    obtenerEstadoTienda(storeId),
  ]);

  const urlCarta = store ? await urlPublicaCarta(store.slug) : "";

  // El detalle de cada pedido (a la derecha de la lista) necesita los repartidores y las impresoras de esta computadora, la carta
  // (para cargarle productos) y lo necesario para cobrar (formas de pago y si esta computadora factura).
  const contexto = await cargarContextoPedidos(prisma, storeId, sesion.rol);
  const filas = pedidos.map(aFilaDePedido);

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
    if (busquedaActiva) params.set("buscar", busquedaActiva);
    const qs = params.toString();
    return qs ? `/admin/pedidos?${qs}` : "/admin/pedidos";
  }

  function hrefFecha(nuevaFecha: FiltroFecha | null) {
    const params = new URLSearchParams();
    if (estadoActivo) params.set("estado", estadoActivo);
    if (nuevaFecha) params.set("fecha", nuevaFecha);
    if (tipoActivo) params.set("tipo", tipoActivo);
    if (busquedaActiva) params.set("buscar", busquedaActiva);
    const qs = params.toString();
    return qs ? `/admin/pedidos?${qs}` : "/admin/pedidos";
  }

  function hrefTipo(nuevoTipo: "delivery" | "retiro" | null) {
    const params = new URLSearchParams();
    if (estadoActivo) params.set("estado", estadoActivo);
    if (fechaActiva) params.set("fecha", fechaActiva);
    if (nuevoTipo) params.set("tipo", nuevoTipo);
    if (busquedaActiva) params.set("buscar", busquedaActiva);
    const qs = params.toString();
    return qs ? `/admin/pedidos?${qs}` : "/admin/pedidos";
  }

  // Igual que las de arriba, pero para el propio buscador: preserva estado,
  // fecha y tipo activos al escribir o al limpiar la búsqueda.
  function hrefBase() {
    const params = new URLSearchParams();
    if (estadoActivo) params.set("estado", estadoActivo);
    if (fechaActiva) params.set("fecha", fechaActiva);
    if (fechaActiva === "rango" && desde) params.set("desde", desde);
    if (fechaActiva === "rango" && hasta) params.set("hasta", hasta);
    if (tipoActivo) params.set("tipo", tipoActivo);
    return params;
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
      <Cabecera
        titulo="Pedidos"
        bajada="Lo que el cliente pidió por WhatsApp o por teléfono y se cargó a mano. El pedido queda abierto: se corrige si hace falta (más productos, descuento, cancelar algo) y al final se cobra."
        acciones={
          <>
            {/* El pedido que llega por WhatsApp o teléfono se carga acá: queda abierto hasta cobrarlo. */}
            {puede(sesion.rol, "pedidos.crear") && (
              <BotonEnlace href="/admin/pedidos/nuevo" tono="nuevo" tam="md">
                + Nuevo pedido
              </BotonEnlace>
            )}

            {/*
              Busca por número de pedido o teléfono, siempre dentro del
              rango de fecha/estado/tipo que ya esté seleccionado — no es
              una búsqueda aparte, es un filtro más sobre lo mismo que se
              está mirando.
            */}
            <form
              method="get"
              action="/admin/pedidos"
              className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-sm ${
                busquedaActiva ? "border-brand bg-brand-light" : "border-linea"
              }`}
            >
              {estadoActivo && <input type="hidden" name="estado" value={estadoActivo} />}
              {fechaActiva && <input type="hidden" name="fecha" value={fechaActiva} />}
              {fechaActiva === "rango" && desde && <input type="hidden" name="desde" value={desde} />}
              {fechaActiva === "rango" && hasta && <input type="hidden" name="hasta" value={hasta} />}
              {tipoActivo && <input type="hidden" name="tipo" value={tipoActivo} />}
              <input
                type="search"
                name="buscar"
                defaultValue={busquedaActiva}
                placeholder="N° de pedido o teléfono"
                className="w-44 rounded-md border border-linea px-2 py-1 text-xs"
              />
              <button
                type="submit"
                className="rounded-full bg-noche-panel px-3 py-1 text-xs font-medium text-white hover:bg-noche-panel"
              >
                Buscar
              </button>
              {busquedaActiva && (
                <Link
                  href={`/admin/pedidos?${hrefBase().toString()}`}
                  className="text-xs text-tinta-suave hover:text-tinta-media"
                  title="Quitar búsqueda"
                >
                  ✕
                </Link>
              )}
            </form>

            {urlCarta && (
              <CompartirCarta nombreNegocio={store?.nombre ?? "Nuestra carta"} url={urlCarta} />
            )}
          </>
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
          Por defecto ("Todos", o entrando por "Pedidos" del menú) se ven
          delivery y retiro mezclados.
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
            Todos
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
        </div>
      </div>

      {/* Los pedidos como las cuentas del Servicio comedor: la lista a la izquierda (con el botón Ver) y, con doble clic en uno, todo lo
          que lo compone a la derecha, con sus botones. */}
      <PedidosMaestro pedidos={filas} contexto={contexto} />
    </div>
  );
}
