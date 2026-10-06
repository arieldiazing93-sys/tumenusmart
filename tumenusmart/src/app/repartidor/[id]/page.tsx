import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatearGuarani } from "@/lib/format";
import { descuentoDeCuenta } from "@/lib/comedor";
import { totalesDeDelivery } from "@/lib/delivery";
import { enlaceDeMapa, extraerUbicacion, primerEnlace, textoSinEnlaces } from "@/lib/ubicacion-mapa";
import { ZONA_NEGOCIO, inicioDeHoyEnAsuncion } from "@/lib/timezone";
import { EntregarBoton } from "./EntregarBoton";

export const dynamic = "force-dynamic";

/**
 * La ruta de un repartidor: las cuentas de delivery que la caja mandó con él (en ruta) y las que entregó hoy. Es una página pública
 * que se abre con el enlace del repartidor (su id hace de llave): solo muestra y marca cuentas de SU local y asignadas a él.
 */
export default async function RepartidorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const repartidor = await prisma.repartidor.findUnique({ where: { id } });
  // Quien ya no trabaja como repartidor (dado de baja) deja de ver los pedidos con el mismo enlace: el enlace no se puede
  // cambiar, así que dar de baja es la forma de cortarlo.
  if (!repartidor || !repartidor.activo) notFound();

  // Todo lo que sigue queda atado al local de ESTE repartidor: aunque su enlace circule, nunca muestra pedidos de otro negocio.
  const storeId = repartidor.storeId;

  const [pendientes, entregadosHoy] = await Promise.all([
    prisma.cuentaDelivery.findMany({
      where: { storeId, repartidorId: id, entrega: "en_ruta", estado: { not: "anulada" } },
      include: { items: { where: { estado: "activo" }, orderBy: [{ ronda: "asc" }, { linea: "asc" }] } },
      orderBy: { salioEn: "asc" },
    }),
    prisma.cuentaDelivery.findMany({
      where: {
        storeId,
        repartidorId: id,
        entrega: "entregada",
        estado: { not: "anulada" },
        entregadaEn: { gte: inicioDeHoyEnAsuncion() },
      },
      select: { id: true, clienteNombre: true },
      orderBy: { entregadaEn: "desc" },
    }),
  ]);

  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <h1 className="text-xl font-bold text-neutral-900">Hola, {repartidor.nombre} 👋</h1>
      <p className="mb-6 text-sm text-neutral-500">
        {pendientes.length === 0
          ? "No tenés pedidos asignados en este momento."
          : `Tenés ${pendientes.length} pedido(s) para entregar.`}
      </p>

      <div className="flex flex-col gap-4">
        {pendientes.map((cuenta) => {
          const resumenProductos = cuenta.items.map((i) => `${i.cantidad}x ${i.nombreProducto}`).join(", ");
          // Lo que se cobra: los productos con su descuento y el envío (la misma cuenta que la caja).
          const totales = totalesDeDelivery(
            cuenta.items.map((i) => ({ precioUnitario: Number(i.precioUnitario), cantidad: i.cantidad })),
            Number(cuenta.costoEnvio),
            descuentoDeCuenta(cuenta)
          );
          // La ubicación del cliente: el punto marcado o pegado (coordenadas) o, si solo hay un enlace corto de Google Maps, ese
          // enlace tal cual. El repartidor la abre con un toque desde su ruta.
          const coordenadas =
            cuenta.clienteLat != null && cuenta.clienteLng != null
              ? { lat: cuenta.clienteLat, lng: cuenta.clienteLng }
              : extraerUbicacion(cuenta.direccion);
          const linkUbicacion = coordenadas ? enlaceDeMapa(coordenadas) : primerEnlace(cuenta.direccion);
          const direccionEscrita = textoSinEnlaces(cuenta.direccion);

          return (
            <div key={cuenta.id} className="rounded-xl border border-brand bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-semibold text-neutral-900">{cuenta.clienteNombre}</span>
                <span className="text-xs text-neutral-400">
                  {new Date(cuenta.salioEn ?? cuenta.abiertaEn).toLocaleTimeString("es-PY", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: ZONA_NEGOCIO,
                  })}
                </span>
              </div>

              <a href={`tel:${cuenta.clienteTelefono}`} className="mb-2 block text-sm text-brand">
                📞 {cuenta.clienteTelefono}
              </a>

              {direccionEscrita ? (
                <p className="mb-2 text-sm text-neutral-700">📍 {direccionEscrita}</p>
              ) : (
                !linkUbicacion && <p className="mb-2 text-sm text-neutral-700">📍 Sin referencia de dirección</p>
              )}

              {/* Botón grande: con un toque abre el mapa con la ubicación del cliente. */}
              {linkUbicacion && (
                <a
                  href={linkUbicacion}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mb-3 flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white hover:bg-brand-dark"
                >
                  📍 Abrir la ubicación del cliente en el mapa
                </a>
              )}

              <div className="mb-3 rounded-lg bg-neutral-50 p-2 text-xs text-neutral-600">{resumenProductos}</div>
              {cuenta.notas && <p className="mb-3 text-xs text-neutral-600">Nota: {cuenta.notas}</p>}

              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="font-semibold text-neutral-900">{formatearGuarani(totales.total)}</span>
                <span className="text-xs text-neutral-500">incluye {formatearGuarani(totales.envio)} de envío</span>
              </div>

              {/* La caja cobra la cuenta: si ya está paga, el repartidor solo entrega; si no, cobra al cliente y trae la plata. */}
              {cuenta.estado === "pagada" ? (
                <p className="mb-3 rounded-md bg-exito-luz px-2.5 py-2 text-[0.82rem] font-medium text-exito">
                  Ya está pago: no cobres nada, solo entregá.
                </p>
              ) : (
                <p className="mb-3 rounded-md bg-aviso-luz px-2.5 py-2 text-[0.82rem] font-medium text-aviso">
                  Todavía no está cobrado: cobrale {formatearGuarani(totales.total)} al cliente y traelo a la caja.
                </p>
              )}

              <EntregarBoton repartidorId={id} cuentaId={cuenta.id} />
            </div>
          );
        })}
      </div>

      {entregadosHoy.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-neutral-500">Entregados hoy</h2>
          <div className="flex flex-col gap-2">
            {entregadosHoy.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500"
              >
                <span>{c.clienteNombre}</span>
                <span>✓ Entregado</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
