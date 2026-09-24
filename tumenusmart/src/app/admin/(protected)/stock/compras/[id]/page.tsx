import { notFound } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera, Tarjeta, Tabla, Th, Td, Tr, Pastilla, BotonEnlace, type ColorEstado } from "@/components/ui";
import { Volver } from "@/components/Volver";
import { formatearGuarani } from "@/lib/format";
import { etiquetaIva } from "@/lib/iva";
import { etiquetaUnidadMedida } from "@/lib/unidad-medida";
import { calcularCompra } from "@/lib/compra-calculo";
import {
  ETIQUETA_ESTADO_CUENTA,
  estadoDeCuenta,
  etiquetaFormaPago,
  redondear2,
  saldoDeCompra,
  type EstadoCuenta,
} from "@/lib/pagos-compra";
import { RegistrarPagoBoton } from "../../cuentas-por-pagar/RegistrarPagoBoton";
import { EliminarPagoBoton } from "../../cuentas-por-pagar/EliminarPagoBoton";
import { CancelarCompraBoton } from "./CancelarCompraBoton";

export const dynamic = "force-dynamic";

const COLOR_ESTADO_CUENTA: Record<EstadoCuenta, ColorEstado> = {
  pendiente: "aviso",
  parcial: "azul",
  pagada: "exito",
};

export default async function CompraDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await pantallaConPermiso("stock.ver");
  const { id } = await params;
  const prisma = prismaDelLocal(await idLocalActual());

  const compra = await prisma.compra.findUnique({
    where: { id },
    include: {
      proveedor: { select: { nombre: true, razonSocial: true, ruc: true } },
      pagos: { orderBy: [{ fecha: "asc" }, { createdAt: "asc" }] },
      items: {
        orderBy: { id: "asc" },
        include: {
          insumo: { select: { nombre: true, unidadMedida: true } },
          almacen: { select: { nombre: true } },
        },
      },
    },
  });
  if (!compra) notFound();

  // Se parte del importe ya guardado de cada línea (con su descuento), no de
  // cantidad × costo unitario: el costo unitario está redondeado a centavos y
  // en una compra grande el resultado podía desviarse un guaraní del total.
  const calculo = calcularCompra(
    compra.items.map((i) => ({
      cantidad: 1,
      costoUnitario: Number(i.subtotal),
      descuentoPorcentaje: 0,
      iva: i.iva,
    })),
    compra.descuentoGeneralPorcentaje != null ? Number(compra.descuentoGeneralPorcentaje) : 0
  );

  // Lo que se le debe al proveedor: el total menos lo pagado (solo si es a crédito).
  const esCredito = compra.condicionPago === "credito";
  const totalCompra = Number(compra.total);
  const pagado = redondear2(compra.pagos.reduce((s, p) => s + Number(p.monto), 0));
  const saldo = saldoDeCompra(totalCompra, pagado);
  const estadoCuenta = estadoDeCuenta(totalCompra, pagado);
  const puedeEditar = puede(sesion.rol, "stock.editar");

  return (
    <div className="flex flex-col gap-4">
      <Volver href="/admin/stock/compras" texto="Volver a Compras" className="self-start" />
      <Cabecera
        titulo={`Compra ${compra.numeroComprobante ? `— folio ${compra.numeroComprobante}` : "sin folio"}`}
        bajada={`Registrada por ${compra.registradoPor ?? "—"} el ${compra.createdAt.toLocaleString("es-PY")}.`}
        acciones={
          compra.cancelada ? (
            <Pastilla color="peligro">Cancelada</Pastilla>
          ) : puede(sesion.rol, "stock.editar") ? (
            <>
              <BotonEnlace href={`/admin/stock/compras/${compra.id}/editar`}>Editar</BotonEnlace>
              <CancelarCompraBoton compraId={compra.id} />
            </>
          ) : undefined
        }
      />

      {compra.cancelada && (
        <div className="rounded-xl border border-peligro/25 bg-peligro-luz p-4 text-[0.86rem] text-tinta-media">
          <p className="font-semibold text-peligro">Compra cancelada</p>
          <p>
            Por {compra.canceladaPor ?? "—"} el {compra.canceladaEn?.toLocaleString("es-PY") ?? "—"}.
            Motivo: {compra.motivoCancelacion ?? "—"}
          </p>
        </div>
      )}

      <Tarjeta className="grid grid-cols-1 gap-3 text-[0.88rem] sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <p className="rotulo">Proveedor</p>
          <p className="font-medium">{compra.proveedor?.nombre ?? "—"}</p>
          {compra.proveedor?.razonSocial && (
            <p className="text-xs text-tinta-suave">{compra.proveedor.razonSocial}</p>
          )}
          {compra.proveedor?.ruc && <p className="text-xs text-tinta-suave">RUC {compra.proveedor.ruc}</p>}
        </div>
        <div>
          <p className="rotulo">Fecha de la factura</p>
          <p className="font-medium">{compra.fecha.toLocaleDateString("es-PY")}</p>
        </div>
        <div>
          <p className="rotulo">Condición de pago</p>
          <p className="font-medium">
            {compra.condicionPago === "credito" ? "A crédito" : "Al contado"}
            {compra.condicionPago === "credito" && compra.fechaVencimiento
              ? ` — vence ${compra.fechaVencimiento.toLocaleDateString("es-PY")}`
              : ""}
          </p>
        </div>
        {compra.notas && (
          <div className="sm:col-span-2 lg:col-span-3">
            <p className="rotulo">Notas</p>
            <p>{compra.notas}</p>
          </div>
        )}
      </Tarjeta>

      <Tabla>
        <thead>
          <tr>
            <Th>Insumo</Th>
            <Th>Almacén</Th>
            <Th>Cantidad</Th>
            <Th>Costo unit.</Th>
            <Th>Desc. %</Th>
            <Th>IVA</Th>
            <Th>Importe s/ imp.</Th>
          </tr>
        </thead>
        <tbody>
          {compra.items.map((i) => (
            <Tr key={i.id}>
              <Td className="font-medium text-tinta">{i.insumo.nombre}</Td>
              <Td>{i.almacen?.nombre ?? "—"}</Td>
              <Td>
                {Number(i.rendimiento) === 1 ? (
                  <>
                    {Number(i.cantidad)} {etiquetaUnidadMedida(i.insumo.unidadMedida)}
                  </>
                ) : (
                  <>
                    {Number(i.cantidad)} × {Number(i.rendimiento)} ={" "}
                    {Math.round(Number(i.cantidad) * Number(i.rendimiento) * 1000) / 1000}{" "}
                    {etiquetaUnidadMedida(i.insumo.unidadMedida)}
                  </>
                )}
              </Td>
              <Td>{formatearGuarani(Number(i.costoUnitario))}</Td>
              <Td>{i.descuentoPorcentaje != null ? `${Number(i.descuentoPorcentaje)}%` : "—"}</Td>
              <Td>{etiquetaIva(i.iva)}</Td>
              <Td>{formatearGuarani(Number(i.subtotal))}</Td>
            </Tr>
          ))}
        </tbody>
      </Tabla>

      <Tarjeta className="self-end sm:w-80">
        <dl className="cifra flex flex-col gap-1.5 text-[0.88rem]">
          <div className="flex justify-between gap-4">
            <dt className="text-tinta-media">Subtotal</dt>
            <dd>{formatearGuarani(calculo.subtotal)}</dd>
          </div>
          {compra.descuentoGeneralPorcentaje != null && (
            <div className="flex justify-between gap-4">
              <dt className="text-tinta-media">Descuento general ({Number(compra.descuentoGeneralPorcentaje)}%)</dt>
              <dd>− {formatearGuarani(calculo.descuentoGeneral)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-tinta-media">IVA</dt>
            <dd>{formatearGuarani(calculo.iva)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-linea pt-1.5 text-[1.05rem] font-semibold">
            <dt>Total</dt>
            <dd>{formatearGuarani(Number(compra.total))}</dd>
          </div>
        </dl>
      </Tarjeta>

      {esCredito && (
        <Tarjeta className="flex flex-col gap-3">
          <div id="pagos" className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="rotulo text-[0.8rem] font-bold">Pagos al proveedor</p>
              {!compra.cancelada && (
                <Pastilla color={COLOR_ESTADO_CUENTA[estadoCuenta]}>{ETIQUETA_ESTADO_CUENTA[estadoCuenta]}</Pastilla>
              )}
            </div>
            {!compra.cancelada && saldo > 0 && puedeEditar && (
              <RegistrarPagoBoton
                compraId={compra.id}
                saldo={saldo}
                descripcion={`${compra.proveedor?.nombre ?? "Sin proveedor"}${
                  compra.numeroComprobante ? ` — folio ${compra.numeroComprobante}` : ""
                }`}
                tam="md"
              />
            )}
          </div>

          <dl className="cifra grid grid-cols-1 gap-2 text-[0.88rem] sm:grid-cols-3">
            <div className="flex justify-between gap-4 sm:block">
              <dt className="text-tinta-media">Total de la compra</dt>
              <dd className="font-medium">{formatearGuarani(totalCompra)}</dd>
            </div>
            <div className="flex justify-between gap-4 sm:block">
              <dt className="text-tinta-media">Pagado</dt>
              <dd className="font-medium">{formatearGuarani(pagado)}</dd>
            </div>
            <div className="flex justify-between gap-4 sm:block">
              <dt className="text-tinta-media">Falta pagar</dt>
              <dd className={`font-semibold ${saldo > 0 && !compra.cancelada ? "text-tinta" : ""}`}>
                {formatearGuarani(saldo)}
              </dd>
            </div>
          </dl>

          {compra.pagos.length === 0 ? (
            <p className="rounded-lg border border-dashed border-linea px-3 py-4 text-center text-sm text-tinta-suave">
              Todavía no se registró ningún pago de esta compra.
            </p>
          ) : (
            <Tabla>
              <thead>
                <tr className="bg-exito-luz">
                  <Th>Fecha</Th>
                  <Th>Monto</Th>
                  <Th>Forma de pago</Th>
                  <Th>Nota</Th>
                  <Th>Registrado por</Th>
                  <Th>
                    <span className="sr-only">Acciones</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {compra.pagos.map((p) => (
                  <Tr key={p.id}>
                    <Td>{p.fecha.toLocaleDateString("es-PY")}</Td>
                    <Td className="cifra font-medium text-tinta">{formatearGuarani(Number(p.monto))}</Td>
                    <Td>{etiquetaFormaPago(p.formaPago)}</Td>
                    <Td>{p.notas ?? "—"}</Td>
                    <Td>{p.registradoPor ?? "—"}</Td>
                    <Td>{puedeEditar && <EliminarPagoBoton pagoId={p.id} />}</Td>
                  </Tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Tarjeta>
      )}
    </div>
  );
}
