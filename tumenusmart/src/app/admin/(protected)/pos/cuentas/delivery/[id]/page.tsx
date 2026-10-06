import { notFound } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera, Pastilla, Tabla, Tarjeta, Td, Th, Tr, BotonEnlace } from "@/components/ui";
import { Volver } from "@/components/Volver";
import { formatearCantidad, formatearGuarani, formatearNumero } from "@/lib/format";
import { textoPorcentaje } from "@/lib/descuento-venta";
import { descuentoDeCuenta, textoEstadoCuenta } from "@/lib/comedor";
import { textoEntrega, totalesDeDelivery } from "@/lib/delivery";
import { itemsAlCancelar, totalCargado } from "@/lib/cuentas-canceladas";
import { enlaceDeMapa, extraerUbicacion, primerEnlace, textoSinEnlaces } from "@/lib/ubicacion-mapa";
import { ZONA_NEGOCIO } from "@/lib/timezone";

export const dynamic = "force-dynamic";

function fechaHora(d: Date): string {
  return d.toLocaleString("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ZONA_NEGOCIO,
  });
}

/**
 * El detalle de una cuenta de delivery que NO llegó a cobrarse: la que se canceló (o que sigue abierta). Muestra todo lo que tenía,
 * quién la imprimió, quién la canceló, cuándo y por qué, y producto por producto lo que se canceló y quién lo hizo. Las cuentas
 * cobradas se ven como venta (Historial de cuentas → Ver); esta pantalla existe para que una cuenta cancelada antes de cobrarse no
 * desaparezca sin dejar rastro.
 */
export default async function DetalleCuentaDeliveryPage({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await pantallaConPermiso("pos.vender");
  const db = prismaDelLocal(await idLocalActual());
  const { id } = await params;

  const cuenta = await db.cuentaDelivery.findUnique({
    where: { id },
    select: {
      id: true,
      numero: true,
      estado: true,
      clienteNombre: true,
      clienteTelefono: true,
      direccion: true,
      clienteLat: true,
      clienteLng: true,
      zonaNombre: true,
      costoEnvio: true,
      notas: true,
      entrega: true,
      repartidor: { select: { nombre: true } },
      abiertaEn: true,
      cerradaEn: true,
      cerradaPor: true,
      motivoCierre: true,
      impresaEn: true,
      impresaPor: true,
      descuentoTipo: true,
      descuentoValor: true,
      descuentoMotivo: true,
      descuentoPor: true,
      ventaPosId: true,
      items: {
        orderBy: [{ ronda: "asc" }, { linea: "asc" }],
        select: {
          id: true,
          ronda: true,
          cantidad: true,
          nombreProducto: true,
          opcionesTexto: true,
          nota: true,
          precioUnitario: true,
          estado: true,
          anuladoPor: true,
          anuladoEn: true,
          motivoAnulacion: true,
          enviadoEn: true,
        },
      },
    },
  });
  if (!cuenta) notFound();

  // El rastro de quién hizo qué con esta cuenta, de la Bitácora: solo para quien tiene ese permiso.
  const verBitacora = puede(sesion.rol, "bitacora.ver");
  const movimientos = verBitacora
    ? await db.bitacora.findMany({
        where: { entidad: "CuentaDelivery", entidadId: cuenta.id },
        orderBy: { createdAt: "asc" },
        select: { id: true, createdAt: true, usuario: true, descripcion: true },
      })
    : [];

  const cancelada = cuenta.estado === "anulada";
  // Una cuenta que se cobró y después se canceló la venta también queda "anulada": el cobro está en la venta (con su propio
  // rastro). Acá "sin cobrar" es la que se cerró antes de llegar a cobrarse.
  const cobroCancelado = cancelada && !!cuenta.ventaPosId;
  const descuento = descuentoDeCuenta(cuenta);
  const productos = itemsAlCancelar(cuenta.items, cuenta.cerradaEn).map((i) => ({
    precioUnitario: Number(i.precioUnitario),
    cantidad: i.cantidad,
  }));
  const valia = totalesDeDelivery(productos, Number(cuenta.costoEnvio), descuento).total;
  const cargado = totalCargado(cuenta.items);
  const coordenadas =
    cuenta.clienteLat != null && cuenta.clienteLng != null ? { lat: cuenta.clienteLat, lng: cuenta.clienteLng } : extraerUbicacion(cuenta.direccion);
  const linkUbicacion = coordenadas ? enlaceDeMapa(coordenadas) : primerEnlace(cuenta.direccion);

  return (
    <div>
      <div className="mb-4">
        <Volver href="/admin/pos/cuentas" texto="Volver al historial de cuentas" />
      </div>

      <Cabecera
        titulo={`Cuenta de delivery ${formatearNumero(cuenta.numero)} · ${cuenta.clienteNombre}`}
        bajada={`Abierta el ${fechaHora(cuenta.abiertaEn)} · ${textoEstadoCuenta(cuenta.estado)}`}
        acciones={
          (cuenta.estado === "pagada" || cobroCancelado) && cuenta.ventaPosId ? (
            <BotonEnlace href={`/admin/pos/venta/${cuenta.ventaPosId}`} tono="navegar" tam="sm">
              Ver la venta
            </BotonEnlace>
          ) : cuenta.estado === "abierta" || cuenta.estado === "por_cobrar" ? (
            <BotonEnlace href="/admin/delivery" tono="navegar" tam="sm">
              Ir a Servicio delivery
            </BotonEnlace>
          ) : undefined
        }
      />

      <div className="flex max-w-3xl flex-col gap-4">
        {cancelada && (
          <Tarjeta className="border-peligro/30 bg-peligro-luz">
            <p className="text-[0.9rem] font-semibold text-peligro">{cobroCancelado ? "Cobro cancelado" : "Cuenta cancelada sin cobrar"}</p>
            <p className="mt-1 text-[0.85rem] text-tinta-media">
              {cobroCancelado ? (
                <>Se había cobrado y después se canceló la venta (el detalle del cobro y de quién la canceló está en la venta). </>
              ) : (
                <>
                  Por <strong className="font-semibold text-tinta">{cuenta.cerradaPor ?? "—"}</strong>
                  {cuenta.cerradaEn && ` el ${fechaHora(cuenta.cerradaEn)}`}
                  {cuenta.motivoCierre && (
                    <>
                      . Motivo: <strong className="font-semibold text-tinta">{cuenta.motivoCierre}</strong>
                    </>
                  )}
                </>
              )}
            </p>
            {!cobroCancelado && (
              <p className="mt-1 text-[0.85rem] text-tinta-media">
                {productos.length > 0 ? (
                  <>
                    Valía <strong className="cifra font-semibold text-tinta">{formatearGuarani(valia)}</strong> (con el envío)
                  </>
                ) : (
                  <>
                    Se habían cargado <strong className="cifra font-semibold text-tinta">{formatearGuarani(cargado)}</strong> en productos y se
                    cancelaron todos de a uno antes de cerrar la cuenta
                  </>
                )}
                {cuenta.impresaEn ? "; la cuenta había llegado a imprimirse para el cliente." : "; la cuenta no se había impreso."}
              </p>
            )}
          </Tarjeta>
        )}

        <Tarjeta>
          <dl className="flex flex-wrap gap-x-8 gap-y-2 text-[0.85rem]">
            <div>
              <dt className="text-tinta-suave">Cliente</dt>
              <dd className="font-semibold text-tinta">
                {cuenta.clienteNombre} <span className="font-normal text-tinta-media">· {cuenta.clienteTelefono}</span>
              </dd>
            </div>
            <div>
              <dt className="text-tinta-suave">Dirección</dt>
              <dd className="font-semibold text-tinta">
                {textoSinEnlaces(cuenta.direccion) || (linkUbicacion ? "Ubicación del mapa" : "—")}
                {linkUbicacion && (
                  <a href={linkUbicacion} target="_blank" rel="noopener noreferrer" className="ml-2 font-normal text-brand-texto hover:underline">
                    ver en el mapa
                  </a>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-tinta-suave">Zona y envío</dt>
              <dd className="font-semibold text-tinta">
                {cuenta.zonaNombre ?? "A coordinar"} · {formatearGuarani(Number(cuenta.costoEnvio))}
              </dd>
            </div>
            <div>
              <dt className="text-tinta-suave">Entrega</dt>
              <dd className="font-semibold text-tinta">
                {textoEntrega(cuenta.entrega)}
                {cuenta.repartidor && <span className="font-normal text-tinta-media"> · {cuenta.repartidor.nombre}</span>}
              </dd>
            </div>
            {cuenta.impresaEn && (
              <div>
                <dt className="text-tinta-suave">Cuenta impresa</dt>
                <dd className="font-semibold text-tinta">
                  {fechaHora(cuenta.impresaEn)}
                  {cuenta.impresaPor && <span className="font-normal text-tinta-media"> · {cuenta.impresaPor}</span>}
                </dd>
              </div>
            )}
            {descuento && (
              <div>
                <dt className="text-tinta-suave">Descuento</dt>
                <dd className="font-semibold text-tinta">
                  {descuento.tipo === "porcentaje" ? `${textoPorcentaje(descuento.valor)} %` : formatearGuarani(descuento.valor)}
                  {cuenta.descuentoMotivo && <span className="font-normal text-tinta-media"> · {cuenta.descuentoMotivo}</span>}
                  {cuenta.descuentoPor && <span className="font-normal text-tinta-media"> · {cuenta.descuentoPor}</span>}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-tinta-suave">Estado</dt>
              <dd>
                <Pastilla color={cancelada ? "peligro" : cuenta.estado === "pagada" ? "exito" : "amarillo"}>
                  {textoEstadoCuenta(cuenta.estado)}
                </Pastilla>
              </dd>
            </div>
          </dl>
          {cuenta.notas && <p className="mt-2 text-[0.82rem] text-tinta-media">Nota: {cuenta.notas}</p>}
        </Tarjeta>

        <section>
          <h2 className="mb-2 text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
            Lo que se pidió, pedido por pedido
          </h2>
          <Tabla>
            <thead>
              <tr>
                <Th>Pedido</Th>
                <Th>Producto</Th>
                <Th className="text-right">Cant.</Th>
                <Th className="text-right">Precio</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {cuenta.items.map((i) => (
                <Tr key={i.id}>
                  <Td>
                    {i.ronda}
                    <span className="mt-0.5 block text-[10px] text-tinta-suave">{fechaHora(i.enviadoEn)}</span>
                  </Td>
                  <Td>
                    <span className={i.estado === "anulado" ? "text-tinta-suave line-through" : "text-tinta"}>{i.nombreProducto}</span>
                    {i.opcionesTexto && <span className="block text-[11px] text-tinta-suave">+ {i.opcionesTexto}</span>}
                    {i.nota && <span className="block text-[11px] text-tinta-media">“{i.nota}”</span>}
                  </Td>
                  <Td className="cifra text-right">{formatearCantidad(i.cantidad)}</Td>
                  <Td className="cifra text-right">{formatearGuarani(Number(i.precioUnitario) * i.cantidad)}</Td>
                  <Td>
                    {i.estado === "anulado" ? (
                      <>
                        <Pastilla color="peligro">Cancelado</Pastilla>
                        <span className="mt-0.5 block text-[11px] text-tinta-media">
                          {i.anuladoPor ?? "—"}
                          {i.anuladoEn && ` · ${fechaHora(i.anuladoEn)}`}
                        </span>
                        {i.motivoAnulacion && <span className="block text-[11px] text-tinta-media">Motivo: {i.motivoAnulacion}</span>}
                      </>
                    ) : (
                      <Pastilla color="exito">Activo</Pastilla>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Tabla>
        </section>

        <section>
          <h2 className="mb-2 text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">Quién hizo qué con esta cuenta</h2>
          {!verBitacora ? (
            <p className="rounded-lg bg-papel-suave px-3 py-2 text-[0.82rem] text-tinta-media">
              El registro completo de movimientos está en la Bitácora, que solo ve quien tiene ese permiso.
            </p>
          ) : movimientos.length === 0 ? (
            <p className="rounded-lg bg-papel-suave px-3 py-2 text-[0.82rem] text-tinta-media">
              No hay movimientos en la Bitácora para esta cuenta.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5 rounded-xl border-2 border-azul/50 bg-superficie p-3">
              {movimientos.map((m) => (
                <li key={m.id} className="text-[0.82rem] text-tinta">
                  <span className="cifra mr-2 text-tinta-suave">{fechaHora(m.createdAt)}</span>
                  <strong className="font-semibold">{m.usuario}</strong> · {m.descripcion}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
