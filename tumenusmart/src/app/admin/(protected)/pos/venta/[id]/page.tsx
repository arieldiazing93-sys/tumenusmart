import { notFound } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera, Pastilla, Tarjeta, clasesBoton } from "@/components/ui";
import { Volver } from "@/components/Volver";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { textoPorcentaje } from "@/lib/descuento-venta";
import { etiquetaFormaPagoPos } from "@/lib/turno-pos";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { CancelarVentaBoton } from "./CancelarVentaBoton";

export const dynamic = "force-dynamic";

/**
 * El detalle de una cuenta cobrada por Punto de Venta.
 *
 * A diferencia del ticket (que es para imprimir), esta es la pantalla donde
 * el cajero revisa qué se cargó y, si hizo falta, la cancela — con el ticket
 * a un clic de distancia por si necesita reimprimirlo.
 */
export default async function DetalleVentaPosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await pantallaConPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);
  const { id } = await params;

  const venta = await db.ventaPos.findUnique({
    where: { id },
    include: { items: { orderBy: { id: "asc" } }, turnoPos: { select: { estado: true } } },
  });
  if (!venta) notFound();

  const turnoCerrado = venta.turnoPos.estado !== "abierto";

  const fecha = venta.creadoEn.toLocaleString("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ZONA_NEGOCIO,
  });

  return (
    <div>
      <div className="mb-4">
        <Volver href="/admin/pos/cuentas" texto="Volver a cuentas del mostrador" />
      </div>

      <Cabecera
        titulo={`Cuenta ${formatearNumero(venta.numero)}`}
        bajada={fecha}
        acciones={
          <>
            <a
              href={`/admin/pos/venta/${venta.id}/comanda`}
              target="_blank"
              rel="noopener noreferrer"
              className={clasesBoton("suave", "sm")}
            >
              Ver comanda
            </a>
            <a
              href={`/admin/pos/venta/${venta.id}/ticket`}
              target="_blank"
              rel="noopener noreferrer"
              className={clasesBoton("navegar", "sm")}
            >
              Ver ticket
            </a>
          </>
        }
      />

      <div className="flex max-w-lg flex-col gap-4">
        {venta.cancelada && (
          <Tarjeta className="border-peligro/30 bg-peligro-luz">
            <p className="text-[0.9rem] font-semibold text-peligro">Cuenta cancelada</p>
            <p className="mt-1 text-[0.85rem] text-tinta-media">
              Por {venta.canceladaPor}
              {venta.canceladaEn &&
                ` el ${venta.canceladaEn.toLocaleString("es-PY", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: ZONA_NEGOCIO,
                })}`}
              {venta.motivoCancelacion && <>. Motivo: {venta.motivoCancelacion}</>}
            </p>
          </Tarjeta>
        )}

        <Tarjeta>
          <dl className="mb-3 flex flex-wrap gap-x-8 gap-y-2 text-[0.85rem]">
            {venta.clienteNombre && (
              <div>
                <dt className="text-tinta-suave">Cliente</dt>
                <dd className="font-semibold text-tinta">{venta.clienteNombre}</dd>
              </div>
            )}
            {venta.clienteTelefono && (
              <div>
                <dt className="text-tinta-suave">Teléfono</dt>
                <dd className="font-semibold text-tinta">{venta.clienteTelefono}</dd>
              </div>
            )}
            <div>
              <dt className="text-tinta-suave">Entrega</dt>
              <dd className="font-semibold text-tinta">
                {venta.tipoEntrega === "llevar" ? "Para llevar" : "En el local"}
              </dd>
            </div>
            <div>
              <dt className="text-tinta-suave">Cajero</dt>
              <dd className="font-semibold text-tinta">{venta.registradoPor}</dd>
            </div>
            <div>
              <dt className="text-tinta-suave">Forma de pago</dt>
              <dd className="font-semibold text-tinta">{etiquetaFormaPagoPos(venta.formaPago)}</dd>
            </div>
            {venta.comprobanteTipo === "factura" && (
              <div>
                <dt className="text-tinta-suave">Factura</dt>
                <dd className="font-semibold text-tinta">
                  {venta.facturaNumero}
                  <span className="ml-1 font-normal text-tinta-media">
                    ({venta.facturaRazonSocial} — RUC {venta.facturaRuc})
                  </span>
                  {venta.facturaAnulada && (
                    <span className="ml-1.5 text-peligro">(ANULADA)</span>
                  )}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-tinta-suave">Estado</dt>
              <dd>
                <Pastilla color={venta.cancelada ? "peligro" : "exito"}>
                  {venta.cancelada ? "Cancelada" : "Activa"}
                </Pastilla>
              </dd>
            </div>
          </dl>

          {venta.nota && (
            <p className="mb-3 rounded-lg border border-linea bg-papel-suave px-3 py-2 text-[0.82rem] text-tinta-media">
              Nota: {venta.nota}
            </p>
          )}

          <div className="flex flex-col gap-2 border-t border-linea pt-3">
            {venta.items.map((item) => (
              <div key={item.id} className="text-[0.85rem]">
                <div className="flex items-center justify-between">
                  <span className="text-tinta">
                    {item.cantidad}x {item.nombreProducto}
                  </span>
                  <span className="cifra text-tinta-media">
                    {formatearGuarani(item.cantidad * Number(item.precioUnitario))}
                  </span>
                </div>
                {item.opcionesTexto && (
                  <p className="pl-3 text-[0.78rem] text-tinta-suave">+ {item.opcionesTexto}</p>
                )}
              </div>
            ))}
          </div>

          {Number(venta.descuento) > 0 && (
            <div className="mt-3 flex flex-col gap-1 border-t border-linea pt-3 text-[0.85rem]">
              <div className="flex items-center justify-between text-tinta-media">
                <span>Subtotal</span>
                <span className="cifra">{formatearGuarani(Number(venta.total) + Number(venta.descuento))}</span>
              </div>
              <div className="flex items-center justify-between text-exito">
                <span>
                  Descuento
                  {venta.descuentoPorcentaje != null && ` (${textoPorcentaje(Number(venta.descuentoPorcentaje))} %)`}
                </span>
                <span className="cifra">-{formatearGuarani(Number(venta.descuento))}</span>
              </div>
            </div>
          )}

          <div
            className={`flex items-center justify-between pt-3 ${
              Number(venta.descuento) > 0 ? "mt-2" : "mt-3 border-t border-linea"
            }`}
          >
            <span className="text-[0.9rem] font-semibold text-tinta">Total</span>
            <span className="cifra text-[1.2rem] font-semibold text-tinta">
              {formatearGuarani(Number(venta.total))}
            </span>
          </div>
        </Tarjeta>

        {!venta.cancelada &&
          (turnoCerrado ? (
            <p className="rounded-lg border border-linea bg-papel-suave px-3 py-2 text-[0.82rem] text-tinta-media">
              El turno de esta cuenta ya está cerrado — no se puede cancelar.
            </p>
          ) : (
            <CancelarVentaBoton
              ventaId={venta.id}
              comprobanteTipo={venta.comprobanteTipo}
              facturaNumero={venta.facturaNumero}
              facturaAnulada={venta.facturaAnulada}
            />
          ))}
      </div>
    </div>
  );
}
