import { notFound } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera, Tarjeta, Tabla, Th, Td, Tr, Pastilla } from "@/components/ui";
import { Volver } from "@/components/Volver";
import { formatearGuarani } from "@/lib/format";
import { etiquetaIva } from "@/lib/iva";
import { etiquetaUnidadMedida } from "@/lib/unidad-medida";
import { calcularCompra } from "@/lib/compra-calculo";
import { CancelarCompraBoton } from "./CancelarCompraBoton";

export const dynamic = "force-dynamic";

export default async function CompraDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await pantallaConPermiso("stock.ver");
  const { id } = await params;
  const prisma = prismaDelLocal(await idLocalActual());

  const compra = await prisma.compra.findUnique({
    where: { id },
    include: {
      proveedor: { select: { nombre: true, razonSocial: true, ruc: true } },
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
            <CancelarCompraBoton compraId={compra.id} />
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
    </div>
  );
}
