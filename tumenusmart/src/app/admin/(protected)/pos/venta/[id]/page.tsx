import { notFound } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera, Pastilla, Tarjeta, clasesBoton } from "@/components/ui";
import { Volver } from "@/components/Volver";
import { formatearGuarani, formatearNumero } from "@/lib/format";
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
    include: { items: { orderBy: { id: "asc" } } },
  });
  if (!venta) notFound();

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
          <a
            href={`/admin/pos/venta/${venta.id}/ticket`}
            target="_blank"
            rel="noopener noreferrer"
            className={clasesBoton("navegar", "sm")}
          >
            Ver ticket
          </a>
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
              <div key={item.id} className="flex items-center justify-between text-[0.85rem]">
                <span className="text-tinta">
                  {item.cantidad}x {item.nombreProducto}
                </span>
                <span className="cifra text-tinta-media">
                  {formatearGuarani(item.cantidad * Number(item.precioUnitario))}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-linea pt-3">
            <span className="text-[0.9rem] font-semibold text-tinta">Total</span>
            <span className="cifra text-[1.2rem] font-semibold text-tinta">
              {formatearGuarani(Number(venta.total))}
            </span>
          </div>
        </Tarjeta>

        {!venta.cancelada && <CancelarVentaBoton ventaId={venta.id} />}
      </div>
    </div>
  );
}
