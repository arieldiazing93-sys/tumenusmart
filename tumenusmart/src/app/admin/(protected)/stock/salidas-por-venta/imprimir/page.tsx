import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { rangoDeDias, diaEnTexto } from "@/lib/rango-dias";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { LIMITE_REPORTE, calcularSalidasPorVenta, unidadCorta, ventaCorta } from "@/lib/reporte-salidas-venta";
import { ImprimirBoton } from "../../../estadisticas/imprimir/ImprimirBoton";

export const dynamic = "force-dynamic";

/** "29/09/26 20:14": corto, para que la fecha ocupe poco lugar. */
function fechaCorta(fecha: Date): string {
  const dia = fecha.toLocaleDateString("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: ZONA_NEGOCIO,
  });
  const hora = fecha.toLocaleTimeString("es-PY", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ZONA_NEGOCIO,
  });
  return `${dia} ${hora}`;
}

/**
 * Versión imprimible del reporte de salidas por venta — "Imprimir / Guardar como
 * PDF" desde el navegador. Muy compacta a propósito: letra chica y filas casi
 * sin relleno, para que entren muchas por hoja.
 */
export default async function ImprimirSalidasPorVentaPage({
  searchParams,
}: {
  searchParams: Promise<{
    desde?: string;
    hasta?: string;
    tipo?: string;
    almacen?: string;
    insumo?: string;
    producto?: string;
  }>;
}) {
  await pantallaConPermiso("stock.ver");

  const { desde, hasta, tipo, almacen, insumo, producto } = await searchParams;
  const rango = rangoDeDias(desde, hasta);
  const tipoFiltro = tipo === "venta" || tipo === "cancelacion" ? tipo : null;

  const storeId = await idLocalActual();
  const [local, reporte, almacenElegido] = await Promise.all([
    localActual(),
    calcularSalidasPorVenta(
      storeId,
      rango,
      { tipo: tipoFiltro, almacen: almacen || null, insumo: insumo?.trim() || null, producto: producto?.trim() || null },
      LIMITE_REPORTE
    ),
    almacen
      ? prismaDelLocal(storeId).almacen.findUnique({ where: { id: almacen }, select: { nombre: true } })
      : Promise.resolve(null),
  ]);

  // Con un solo almacén la columna no dice nada nuevo: va en el encabezado.
  const almacenesUsados = new Set(reporte.filas.map((f) => f.almacen));
  const mostrarAlmacen = almacenesUsados.size > 1;

  const filtros = [
    almacenElegido?.nombre ?? (!mostrarAlmacen && almacenesUsados.size === 1 ? [...almacenesUsados][0] : "Todos los almacenes"),
    tipoFiltro === "venta"
      ? "Solo salidas por venta"
      : tipoFiltro === "cancelacion"
        ? "Solo cancelaciones"
        : "Salidas por venta y cancelaciones",
    producto?.trim() ? `Producto: ${producto.trim()}` : null,
    insumo?.trim() ? `Insumo: ${insumo.trim()}` : null,
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 print:max-w-none print:px-0 print:py-0">
      <div className="mb-4 flex justify-end print:hidden">
        <ImprimirBoton />
      </div>

      <div className="mb-4 flex items-center gap-3 border-b border-linea pb-3">
        {local.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={local.logoUrl} alt={local.nombre} className="h-10 w-10 flex-none rounded-full object-cover" />
        )}
        <div>
          <h1 className="text-lg font-bold text-tinta">{local.nombre} — Salidas por venta</h1>
          <p className="text-xs text-tinta-media">
            Período: {diaEnTexto(rango.desde)} – {diaEnTexto(rango.hasta)} · {filtros.join(" · ")}
            {reporte.filas.length > 0 && (
              <>
                {" "}
                · {reporte.filas.length} {reporte.filas.length === 1 ? "movimiento" : "movimientos"} de {reporte.ventas}{" "}
                {reporte.ventas === 1 ? "venta" : "ventas"}
              </>
            )}
          </p>
        </div>
      </div>

      {reporte.filas.length === 0 ? (
        <p className="text-sm text-tinta-suave">No hay salidas por venta en este período.</p>
      ) : (
        <table className="w-full border-collapse text-left text-[0.7rem] leading-[1.2]">
          <thead>
            <tr className="border-b border-linea text-[0.62rem] uppercase tracking-wide text-tinta-media">
              <th className="py-0.5 pr-2">Fecha y hora</th>
              <th className="py-0.5 pr-2">Venta</th>
              <th className="py-0.5 pr-2">Qué se vendió</th>
              <th className="py-0.5 pr-2">Insumo</th>
              <th className="py-0.5 text-right">Cantidad</th>
              {mostrarAlmacen && <th className="py-0.5 pl-2">Almacén</th>}
            </tr>
          </thead>
          <tbody>
            {reporte.filas.map((f) => (
              <tr key={f.id} className={`break-inside-avoid ${f.inicioDeGrupo ? "border-t border-linea" : ""}`}>
                <td className="whitespace-nowrap py-[1px] pr-2 align-top text-tinta-media">
                  {f.inicioDeGrupo ? fechaCorta(f.fecha) : ""}
                </td>
                <td className="whitespace-nowrap py-[1px] pr-2 align-top text-tinta-media">
                  {f.inicioDeGrupo ? `${ventaCorta(f.venta)}${f.tipo === "cancelacion" ? " (cancelada)" : ""}` : ""}
                </td>
                <td className="py-[1px] pr-2 align-top font-medium text-tinta">{f.inicioDeGrupo ? f.producto : ""}</td>
                <td className="py-[1px] pr-2 text-tinta">{f.insumo}</td>
                <td
                  className={`whitespace-nowrap py-[1px] text-right font-semibold ${
                    f.cantidad < 0 ? "text-peligro" : "text-exito"
                  }`}
                >
                  {f.cantidad > 0 ? "+" : ""}
                  {f.cantidad} {unidadCorta(f.unidad)}
                </td>
                {mostrarAlmacen && <td className="py-[1px] pl-2 text-tinta-media">{f.almacen}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {reporte.recortado && (
        <p className="mt-3 text-[0.68rem] text-tinta-suave">
          Se incluyen los {LIMITE_REPORTE} movimientos más recientes de este filtro. Acotá las fechas para ver los
          anteriores.
        </p>
      )}
      <p className="mt-4 text-[0.68rem] text-tinta-suave">
        Cada fila es lo que un producto vendido le sacó a un insumo (negativo: salió por la venta; positivo: volvió por
        una cancelación). Las ventas de antes de que existiera este reporte figuran como “Toda la venta”: no se guardó
        qué producto descontó cada insumo. Generado desde TuMenuSmart.
      </p>
    </div>
  );
}
