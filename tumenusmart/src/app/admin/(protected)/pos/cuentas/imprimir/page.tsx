import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { calcularRangoFecha } from "@/lib/rango-fecha";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { etiquetaFormaPagoPos, FORMA_PAGO_MIXTO } from "@/lib/turno-pos";
import { detallePagos, filtroPorFormaPago, montoCobradoConForma } from "@/lib/pago-venta";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { ImprimirBoton } from "../../../estadisticas/imprimir/ImprimirBoton";
import { nombreCompleto } from "@/lib/agenda-personal";
import { cargarCuentasCanceladas, type CuentaCancelada } from "@/lib/cuentas-canceladas";

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
  const [local, canceladasMesa, ventas] = await Promise.all([
    localActual(),
    // Las cuentas (de mesa y de delivery) cerradas sin cobrar también van en el reporte (con una forma de pago filtrada no entran:
    // una cuenta sin cobrar no tiene forma de pago). Es la misma función que usan la pantalla y el Excel.
    formaPago ? Promise.resolve<CuentaCancelada[]>([]) : cargarCuentasCanceladas(db, rango),
    db.ventaPos.findMany({
      where: { creadoEn: { gte: rango.gte, lt: rango.lt }, ...filtroPorFormaPago(formaPago) },
      orderBy: { creadoEn: "asc" },
      select: {
        id: true,
        numero: true,
        total: true,
        formaPago: true,
        pagos: { orderBy: { orden: "asc" }, select: { forma: true, monto: true } },
        registradoPor: true,
        creadoEn: true,
        cancelada: true,
        personal: { select: { nombre: true, apellido: true } },
      },
    }),
  ]);

  const opcionesFecha: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ZONA_NEGOCIO,
  };
  // Mismo criterio que el export a Excel: un rango manual con hora muestra
  // los dos instantes exactos en vez de fingir que son días enteros.
  const esRangoConHora =
    fechaActiva === "rango" && ((desde?.includes("T") ?? false) || (hasta?.includes("T") ?? false));
  const periodoTexto = esRangoConHora
    ? `${rango.gte.toLocaleString("es-PY", { ...opcionesFecha, hour: "2-digit", minute: "2-digit", hour12: false })} – ${rango.lt.toLocaleString("es-PY", { ...opcionesFecha, hour: "2-digit", minute: "2-digit", hour12: false })}`
    : `${rango.gte.toLocaleDateString("es-PY", opcionesFecha)} – ${new Date(rango.lt.getTime() - 24 * 60 * 60 * 1000).toLocaleDateString("es-PY", opcionesFecha)}`;
  // Filtrando por una forma concreta se suma solo lo cobrado CON esa forma (de
  // una venta dividida, la parte y no la cuenta entera).
  const filtraPorUnaForma = !!formaPago && formaPago !== FORMA_PAGO_MIXTO;
  const total = ventas
    .filter((v) => !v.cancelada)
    .reduce(
      (s, v) => s + (filtraPorUnaForma ? montoCobradoConForma(v.pagos, formaPago ?? "") : Number(v.total)),
      0
    );
  const totalCanceladasMesa = canceladasMesa.reduce((s, c) => s + c.total, 0);

  // Ventas y cuentas canceladas sin cobrar, juntas y en orden de fecha (de la más vieja a la más nueva).
  const filas = [
    ...ventas.map((v) => ({ clave: v.id, fecha: v.creadoEn, venta: v, cuenta: null as CuentaCancelada | null })),
    ...canceladasMesa.map((c) => ({
      clave: `${c.canal}-${c.id}`,
      fecha: c.cerradaEn ?? new Date(0),
      venta: null,
      cuenta: c as CuentaCancelada | null,
    })),
  ].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="mb-6 flex justify-end print:hidden">
        <ImprimirBoton />
      </div>

      <div className="mb-8 border-b border-linea pb-6">
        <h1 className="text-2xl font-bold text-tinta">Historial de cuentas — {local.nombre}</h1>
        <p className="mt-1 text-sm text-tinta-media">Período: {periodoTexto}</p>
      </div>

      {filas.length === 0 ? (
        <p className="text-sm text-tinta-suave">No se registraron cuentas en este período.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
              <th className="py-1.5">Cuenta</th>
              <th className="py-1.5">Fecha</th>
              <th className="py-1.5">Forma de pago</th>
              <th className="py-1.5">Cajero</th>
              <th className="py-1.5">Personal</th>
              <th className="py-1.5">Estado</th>
              <th className="py-1.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => {
              const v = fila.venta;
              if (!v) {
                // Una cuenta (de mesa o de delivery) cerrada SIN cobrar: no suma al total (no entró plata) pero queda a la vista,
                // con quién la canceló, cuándo y por qué.
                const c = fila.cuenta;
                if (!c) return null;
                return (
                  <tr key={fila.clave} className="border-b border-linea-fina">
                    <td className="py-1.5">
                      {c.titulo}
                      <span className="block text-[10px] uppercase text-tinta-suave">{c.etiqueta}</span>
                    </td>
                    <td className="py-1.5 text-tinta-media">
                      {c.cerradaEn
                        ? c.cerradaEn.toLocaleString("es-PY", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                            timeZone: ZONA_NEGOCIO,
                          })
                        : "—"}
                    </td>
                    <td className="py-1.5 text-tinta-media">Sin cobrar</td>
                    <td className="py-1.5 text-tinta-media">
                      {c.cerradaPor ?? "—"}
                      <span className="block text-[10px] text-tinta-suave">la canceló</span>
                    </td>
                    <td className="py-1.5 text-tinta-media">
                      {c.responsable}
                      <span className="block text-[10px] text-tinta-suave">{c.rolResponsable}</span>
                    </td>
                    <td className="py-1.5 text-tinta-media">
                      Cancelada sin cobrar
                      {c.motivoCierre && <span className="block text-[10px] text-tinta-suave">Motivo: {c.motivoCierre}</span>}
                      {c.unoPorUno && (
                        <span className="block text-[10px] text-tinta-suave">Productos cancelados de a uno</span>
                      )}
                    </td>
                    <td className="cifra py-1.5 text-right text-tinta-suave line-through">{formatearGuarani(c.total)}</td>
                  </tr>
                );
              }
              return (
              <tr key={v.id} className="border-b border-linea-fina">
                <td className="py-1.5">{formatearNumero(v.numero)}</td>
                <td className="py-1.5 text-tinta-media">
                  {v.creadoEn.toLocaleString("es-PY", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                    timeZone: ZONA_NEGOCIO,
                  })}
                </td>
                <td className="py-1.5 text-tinta-media">
                  {v.pagos.length > 1
                    ? detallePagos(v.pagos.map((p) => ({ forma: p.forma, monto: Number(p.monto) })))
                    : etiquetaFormaPagoPos(v.formaPago)}
                </td>
                <td className="py-1.5 text-tinta-media">{v.registradoPor}</td>
                <td className="py-1.5 text-tinta-media">{v.personal ? nombreCompleto(v.personal) : "—"}</td>
                <td className="py-1.5 text-tinta-media">{v.cancelada ? "Cancelada" : "Activa"}</td>
                <td
                  className={`cifra py-1.5 text-right ${v.cancelada ? "text-tinta-suave line-through" : ""}`}
                >
                  {formatearGuarani(Number(v.total))}
                </td>
              </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-linea font-semibold text-tinta">
              <td className="py-2" colSpan={6}>
                {filtraPorUnaForma
                  ? `Cobrado en ${etiquetaFormaPagoPos(formaPago ?? "").toLowerCase()} (sin canceladas)`
                  : "Total recaudado (sin canceladas)"}
              </td>
              <td className="cifra py-2 text-right">{formatearGuarani(total)}</td>
            </tr>
            {canceladasMesa.length > 0 && (
              <tr className="font-medium text-tinta-media">
                <td className="py-1.5" colSpan={6}>
                  Cuentas canceladas sin cobrar: {canceladasMesa.length} (no suman al total)
                </td>
                <td className="cifra py-1.5 text-right">{formatearGuarani(totalCanceladasMesa)}</td>
              </tr>
            )}
          </tfoot>
        </table>
      )}
    </div>
  );
}
