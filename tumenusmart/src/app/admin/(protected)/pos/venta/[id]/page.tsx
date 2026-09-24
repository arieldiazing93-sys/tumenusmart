import { notFound } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera, Pastilla, Tabla, Tarjeta, Td, Th, Tr, clasesBoton } from "@/components/ui";
import { Volver } from "@/components/Volver";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { textoPorcentaje } from "@/lib/descuento-venta";
import { esVentaACredito, etiquetaFormaPagoPos } from "@/lib/turno-pos";
import { detallePagos } from "@/lib/pago-venta";
import { estadoDeCuenta, redondear2, saldoDeCompra } from "@/lib/pagos-compra";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { CancelarVentaBoton } from "./CancelarVentaBoton";
import { RegistrarCobroBoton } from "../../cuentas-por-cobrar/RegistrarCobroBoton";
import { EliminarCobroBoton } from "../../cuentas-por-cobrar/EliminarCobroBoton";

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
    include: {
      items: { orderBy: { id: "asc" } },
      turnoPos: { select: { estado: true } },
      pagos: { orderBy: { orden: "asc" } },
      cobros: { orderBy: [{ fecha: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!venta) notFound();

  const turnoCerrado = venta.turnoPos.estado !== "abierto";

  // Venta a crédito: lo que el cliente todavía debe (total menos lo cobrado).
  const aCredito = esVentaACredito(venta.formaPago);
  const cobrado = redondear2(venta.cobros.reduce((s, c) => s + Number(c.monto), 0));
  const saldo = saldoDeCompra(Number(venta.total), cobrado);
  const estadoCobro = estadoDeCuenta(Number(venta.total), cobrado);

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
              <dd className="font-semibold text-tinta">
                {venta.pagos.length > 1
                  ? detallePagos(venta.pagos.map((p) => ({ forma: p.forma, monto: Number(p.monto) })))
                  : etiquetaFormaPagoPos(venta.formaPago)}
              </dd>
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

        {aCredito && (
          <div id="cobros">
            <Tarjeta className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="rotulo text-[0.8rem] font-bold">Venta a crédito · cobros</p>
                  {!venta.cancelada && (
                    <Pastilla color={estadoCobro === "pagada" ? "exito" : estadoCobro === "parcial" ? "azul" : "aviso"}>
                      {estadoCobro === "pagada" ? "Cobrada" : estadoCobro === "parcial" ? "Cobro parcial" : "Pendiente"}
                    </Pastilla>
                  )}
                </div>
                {!venta.cancelada && saldo > 0 && (
                  <RegistrarCobroBoton
                    ventaId={venta.id}
                    saldo={saldo}
                    descripcion={`Venta ${formatearNumero(venta.numero)} — ${
                      (venta.facturaRazonSocial ?? venta.clienteNombre ?? "").trim() || "cliente"
                    }`}
                    tam="md"
                  />
                )}
              </div>

              <dl className="cifra grid grid-cols-1 gap-2 text-[0.88rem] sm:grid-cols-4">
                <div className="flex justify-between gap-4 sm:block">
                  <dt className="text-tinta-media">Total</dt>
                  <dd className="font-medium">{formatearGuarani(Number(venta.total))}</dd>
                </div>
                <div className="flex justify-between gap-4 sm:block">
                  <dt className="text-tinta-media">Cobrado</dt>
                  <dd className="font-medium">{formatearGuarani(cobrado)}</dd>
                </div>
                <div className="flex justify-between gap-4 sm:block">
                  <dt className="text-tinta-media">Falta cobrar</dt>
                  <dd className="font-semibold text-tinta">{formatearGuarani(saldo)}</dd>
                </div>
                <div className="flex justify-between gap-4 sm:block">
                  <dt className="text-tinta-media">Vence</dt>
                  <dd className="font-medium">
                    {venta.fechaVencimientoCredito
                      ? venta.fechaVencimientoCredito.toLocaleDateString("es-PY", { timeZone: "UTC" })
                      : "—"}
                  </dd>
                </div>
              </dl>

              {venta.cobros.length === 0 ? (
                <p className="rounded-lg border border-dashed border-linea px-3 py-4 text-center text-sm text-tinta-suave">
                  Todavía no se registró ningún cobro de esta venta.
                </p>
              ) : (
                <Tabla>
                  <thead>
                    <tr className="bg-exito-luz">
                      <Th>Fecha</Th>
                      <Th>Monto</Th>
                      <Th>Forma de pago</Th>
                      <Th>Nota</Th>
                      <Th>Registró</Th>
                      <Th>
                        <span className="sr-only">Acciones</span>
                      </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {venta.cobros.map((c) => (
                      <Tr key={c.id}>
                        <Td>{c.fecha.toLocaleDateString("es-PY", { timeZone: "UTC" })}</Td>
                        <Td className="cifra font-medium text-tinta">{formatearGuarani(Number(c.monto))}</Td>
                        <Td>{etiquetaFormaPagoPos(c.formaPago)}</Td>
                        <Td>{c.notas ?? "—"}</Td>
                        <Td>{c.registradoPor}</Td>
                        <Td>
                          <EliminarCobroBoton cobroId={c.id} />
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Tabla>
              )}
            </Tarjeta>
          </div>
        )}

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
