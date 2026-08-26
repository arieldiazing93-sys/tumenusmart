import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { sesionActual } from "@/lib/auth";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { formatearGuarani } from "@/lib/format";
import { construirLinkWhatsapp } from "@/lib/whatsapp";
import {
  estadoSuscripcion,
  mensajeRecordatorio,
  type EstadoSuscripcion,
} from "@/lib/suscripcion";
import { AltaLocal } from "./AltaLocal";
import { AccionesLocal } from "./AccionesLocal";

export const dynamic = "force-dynamic";

const DIAS_DE_ACTIVIDAD = 7;
/** Sin pedidos ni ingresos al panel en este plazo, el local se está apagando. */
const DIAS_PARA_ALARMA = 14;

const ESTILO_ESTADO: Record<EstadoSuscripcion["clase"], { chip: string; borde: string }> = {
  vencido: { chip: "bg-red-100 text-red-700", borde: "border-l-red-400" },
  suspendido: { chip: "bg-neutral-800 text-white", borde: "border-l-neutral-700" },
  por_vencer: { chip: "bg-amber-100 text-amber-800", borde: "border-l-amber-400" },
  al_dia: { chip: "bg-green-100 text-green-700", borde: "border-l-green-400" },
  sin_vencimiento: { chip: "bg-neutral-100 text-neutral-600", borde: "border-l-neutral-300" },
};

/** Primero lo que hay que atender. */
const URGENCIA: Record<EstadoSuscripcion["clase"], number> = {
  vencido: 0,
  por_vencer: 1,
  suspendido: 2,
  sin_vencimiento: 3,
  al_dia: 4,
};

function fechaCorta(valor: Date | null): string {
  if (!valor) return "—";
  return new Date(valor).toLocaleDateString("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: ZONA_NEGOCIO,
  });
}

function hace(valor: Date | null, ahora: Date): string {
  if (!valor) return "nunca";
  const dias = Math.floor((ahora.getTime() - valor.getTime()) / 86400000);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  return `hace ${dias} días`;
}

export default async function SuperPage() {
  const sesion = await sesionActual();
  if (!sesion || sesion.rol !== "superadmin") redirect("/admin/pedidos");

  const ahora = new Date();
  const desdeActividad = new Date(ahora.getTime() - DIAS_DE_ACTIVIDAD * 86400000);

  const cabeceras = await headers();
  const host =
    cabeceras.get("x-forwarded-host") ?? cabeceras.get("host") ?? "tumenusmart.vercel.app";
  const dominio = `${host.startsWith("localhost") ? "http" : "https"}://${host}`;

  // Se traen las filas y se cuenta en memoria en vez de agrupar en la base:
  // con decenas de locales el volumen es chico y el código queda mucho más
  // simple de leer. Si algún día son cientos, esto pasa a un agrupado.
  const [locales, pedidosRecientes, productos, usuarios, pagos] = await Promise.all([
    prisma.store.findMany({ orderBy: { nombre: "asc" } }),
    prisma.order.findMany({
      where: { createdAt: { gte: desdeActividad }, enviadoWhatsapp: true },
      select: { storeId: true },
    }),
    prisma.product.findMany({ select: { storeId: true } }),
    prisma.usuario.findMany({ select: { storeId: true, ultimoIngreso: true, email: true } }),
    prisma.pago.findMany({
      orderBy: { fecha: "desc" },
      select: { storeId: true, monto: true, fecha: true },
    }),
  ]);

  const contar = (filas: { storeId: string | null }[]) => {
    const mapa = new Map<string, number>();
    for (const f of filas) {
      if (!f.storeId) continue;
      mapa.set(f.storeId, (mapa.get(f.storeId) ?? 0) + 1);
    }
    return mapa;
  };

  const pedidosPorLocal = contar(pedidosRecientes);
  const productosPorLocal = contar(productos);

  const ultimoIngresoPorLocal = new Map<string, Date | null>();
  const correoPorLocal = new Map<string, string>();
  for (const u of usuarios) {
    if (!u.storeId) continue;
    const previo = ultimoIngresoPorLocal.get(u.storeId) ?? null;
    if (u.ultimoIngreso && (!previo || u.ultimoIngreso > previo)) {
      ultimoIngresoPorLocal.set(u.storeId, u.ultimoIngreso);
    } else if (!ultimoIngresoPorLocal.has(u.storeId)) {
      ultimoIngresoPorLocal.set(u.storeId, previo);
    }
    if (!correoPorLocal.has(u.storeId)) correoPorLocal.set(u.storeId, u.email);
  }

  const ultimoPagoPorLocal = new Map<string, { monto: number; fecha: Date }>();
  for (const p of pagos) {
    if (!ultimoPagoPorLocal.has(p.storeId)) {
      ultimoPagoPorLocal.set(p.storeId, { monto: Number(p.monto), fecha: p.fecha });
    }
  }

  const filas = locales
    .map((local) => {
      const estado = estadoSuscripcion(local, ahora, ZONA_NEGOCIO);
      const ultimoIngreso = ultimoIngresoPorLocal.get(local.id) ?? null;
      const pedidos = pedidosPorLocal.get(local.id) ?? 0;
      const cantidadProductos = productosPorLocal.get(local.id) ?? 0;

      const diasSinIngresar = ultimoIngreso
        ? Math.floor((ahora.getTime() - ultimoIngreso.getTime()) / 86400000)
        : Infinity;

      // Un local que no recibe pedidos y en el que nadie entra al panel se
      // está yendo, aunque esté al día con el pago.
      const seEstaApagando =
        pedidos === 0 && diasSinIngresar > DIAS_PARA_ALARMA && estado.clase !== "suspendido";

      const cartaIncompleta = cantidadProductos < 3;

      return {
        local,
        estado,
        pedidos,
        cantidadProductos,
        ultimoIngreso,
        seEstaApagando,
        cartaIncompleta,
        correo: correoPorLocal.get(local.id) ?? null,
        ultimoPago: ultimoPagoPorLocal.get(local.id) ?? null,
      };
    })
    .sort((a, b) => {
      const porUrgencia = URGENCIA[a.estado.clase] - URGENCIA[b.estado.clase];
      if (porUrgencia !== 0) return porUrgencia;
      return a.local.nombre.localeCompare(b.local.nombre);
    });

  const cuenta = (clase: EstadoSuscripcion["clase"]) =>
    filas.filter((f) => f.estado.clase === clase).length;

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-neutral-900">Cartera de locales</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Todos tus clientes, ordenados por lo que hay que atender primero.
      </p>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tarjeta etiqueta="Locales" valor={filas.length} />
        <Tarjeta etiqueta="Vencidos" valor={cuenta("vencido")} alerta={cuenta("vencido") > 0} />
        <Tarjeta
          etiqueta="Por vencer"
          valor={cuenta("por_vencer")}
          aviso={cuenta("por_vencer") > 0}
        />
        <Tarjeta
          etiqueta="Se están apagando"
          valor={filas.filter((f) => f.seEstaApagando).length}
          aviso={filas.some((f) => f.seEstaApagando)}
        />
      </div>

      <details className="mb-6 rounded-lg border border-neutral-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-neutral-800">
          Dar de alta un local nuevo
        </summary>
        <div className="border-t border-neutral-200 p-4">
          <AltaLocal dominio={dominio} />
        </div>
      </details>

      <div className="flex flex-col gap-2">
        {filas.map((f) => {
          const estilo = ESTILO_ESTADO[f.estado.clase];
          const link = f.local.whatsappNumero
            ? construirLinkWhatsapp(
                f.local.whatsappNumero,
                mensajeRecordatorio(f.local.nombre, f.estado)
              )
            : null;

          return (
            <div
              key={f.local.id}
              className={`flex flex-wrap items-start justify-between gap-3 rounded-lg border border-neutral-200 border-l-4 bg-white px-4 py-3 ${estilo.borde}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-neutral-900">{f.local.nombre}</span>
                  <span className="font-mono text-xs text-neutral-400">
                    /{f.local.slug}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${estilo.chip}`}>
                    {f.estado.etiqueta}
                  </span>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                    {f.local.plan}
                  </span>
                </div>

                <p className="mt-1 text-xs text-neutral-500">
                  Vence {fechaCorta(f.local.vencimiento)}
                  {" · "}
                  {f.pedidos} {f.pedidos === 1 ? "pedido" : "pedidos"} en {DIAS_DE_ACTIVIDAD} días
                  {" · "}
                  {f.cantidadProductos} productos
                  {" · "}
                  entró {hace(f.ultimoIngreso, ahora)}
                  {f.ultimoPago && (
                    <>
                      {" · "}
                      último pago {formatearGuarani(f.ultimoPago.monto)} el{" "}
                      {fechaCorta(f.ultimoPago.fecha)}
                    </>
                  )}
                </p>

                {(f.seEstaApagando || f.cartaIncompleta) && (
                  <p className="mt-1 text-xs font-medium text-amber-700">
                    {f.cartaIncompleta && "Casi no tiene productos cargados. "}
                    {f.seEstaApagando &&
                      "Sin pedidos y nadie entra al panel: está por darse de baja."}
                  </p>
                )}
              </div>

              <AccionesLocal
                storeId={f.local.id}
                nombre={f.local.nombre}
                suspendidoAMano={f.local.estado === "suspendido"}
                linkRecordatorio={link}
              />
            </div>
          );
        })}

        {filas.length === 0 && (
          <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-6 text-center text-sm text-neutral-500">
            Todavía no hay locales cargados.
          </p>
        )}
      </div>
    </div>
  );
}

function Tarjeta({
  etiqueta,
  valor,
  alerta,
  aviso,
}: {
  etiqueta: string;
  valor: number;
  alerta?: boolean;
  aviso?: boolean;
}) {
  const color = alerta
    ? "text-red-600"
    : aviso
      ? "text-amber-700"
      : "text-neutral-900";
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
      <p className="text-xs text-neutral-500">{etiqueta}</p>
      <p className={`text-2xl font-bold ${color}`}>{valor}</p>
    </div>
  );
}
