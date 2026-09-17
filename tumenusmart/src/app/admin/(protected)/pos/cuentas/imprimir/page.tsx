import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { calcularRangoFecha } from "@/lib/rango-fecha";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { etiquetaFormaPagoPos } from "@/lib/turno-pos";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { ImprimirBoton } from "../../../estadisticas/imprimir/ImprimirBoton";

export const dynamic = "force-dynamic";

export default async function ImprimirCuentasPosPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; desde?: string; hasta?: string; formaPago?: string }>;
}) {
  await pantallaConPermiso("pos.vender");

  const { fecha, desde, hasta, formaPago } = await searchParams;
  const fechaActiva = fecha ?? "hoy";
  const rango =
    calcularRangoFecha(fechaActiva, desde, hasta) ?? calcularRangoFecha("hoy", undefined, undefined)!;

  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);
  const [local, ventas] = await Promise.all([
    localActual(),
    db.ventaPos.findMany({
      where: { creadoEn: { gte: rango.gte, lt: rango.lt }, formaPago: formaPago || undefined },
      orderBy: { creadoEn: "asc" },
      select: {
        id: true,
        numero: true,
        total: true,
        formaPago: true,
        registradoPor: true,
        creadoEn: true,
        cancelada: true,
      },
    }),
  ]);

  const finRangoInclusive = new Date(rango.lt.getTime() - 24 * 60 * 60 * 1000);
  const opcionesFecha: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ZONA_NEGOCIO,
  };
  const total = ventas.filter((v) => !v.cancelada).reduce((s, v) => s + Number(v.total), 0);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="mb-6 flex justify-end print:hidden">
        <ImprimirBoton />
      </div>

      <div className="mb-8 border-b border-linea pb-6">
        <h1 className="text-2xl font-bold text-tinta">Cuentas del mostrador — {local.nombre}</h1>
        <p className="mt-1 text-sm text-tinta-media">
          Período: {rango.gte.toLocaleDateString("es-PY", opcionesFecha)} –{" "}
          {finRangoInclusive.toLocaleDateString("es-PY", opcionesFecha)}
        </p>
      </div>

      {ventas.length === 0 ? (
        <p className="text-sm text-tinta-suave">No se registraron cuentas en este período.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
              <th className="py-1.5">Cuenta</th>
              <th className="py-1.5">Fecha</th>
              <th className="py-1.5">Forma de pago</th>
              <th className="py-1.5">Cajero</th>
              <th className="py-1.5">Estado</th>
              <th className="py-1.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {ventas.map((v) => (
              <tr key={v.id} className="border-b border-linea-fina">
                <td className="py-1.5">{formatearNumero(v.numero)}</td>
                <td className="py-1.5 text-tinta-media">
                  {v.creadoEn.toLocaleString("es-PY", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: ZONA_NEGOCIO,
                  })}
                </td>
                <td className="py-1.5 text-tinta-media">{etiquetaFormaPagoPos(v.formaPago)}</td>
                <td className="py-1.5 text-tinta-media">{v.registradoPor}</td>
                <td className="py-1.5 text-tinta-media">{v.cancelada ? "Cancelada" : "Activa"}</td>
                <td
                  className={`cifra py-1.5 text-right ${v.cancelada ? "text-tinta-suave line-through" : ""}`}
                >
                  {formatearGuarani(Number(v.total))}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-linea font-semibold text-tinta">
              <td className="py-2" colSpan={5}>
                Total recaudado (sin canceladas)
              </td>
              <td className="cifra py-2 text-right">{formatearGuarani(total)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
