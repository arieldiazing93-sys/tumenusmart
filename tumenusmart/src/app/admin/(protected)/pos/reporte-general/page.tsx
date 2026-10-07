import Link from "next/link";
import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera, clasesBoton, Tabla, Th, Td, Tr, Vacio } from "@/components/ui";
import { calcularRangoFecha, type FiltroFecha } from "@/lib/rango-fecha";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { COLUMNAS_CANAL, COLUMNAS_FORMA_PAGO, calcularReporteGeneralPos } from "@/lib/reporte-general-pos";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { FiltroFechaReporte } from "@/components/FiltroFechaReporte";

export const dynamic = "force-dynamic";

const FILTROS_FECHA: { value: FiltroFecha; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "ayer", label: "Ayer" },
  { value: "7dias", label: "Últimos 7 días" },
  { value: "30dias", label: "Últimos 30 días" },
  { value: "mes", label: "Este mes" },
];

/**
 * Reporte general de cuentas: todo lo que se cobró —mostrador, comedor,
 * delivery y reservas de turnos— en una sola lista, con el número de la venta
 * en la columna de su forma de vender, el importe repartido en su columna de
 * forma de pago y una fila de totales al pie — mismo criterio que un libro de
 * caja. Ver src/lib/reporte-general-pos.ts para el detalle de cómo se arma.
 */
export default async function ReporteGeneralPosPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; desde?: string; hasta?: string }>;
}) {
  await pantallaConPermiso("pos.verHistorico");

  const { fecha, desde, hasta } = await searchParams;
  const fechaActiva: FiltroFecha = (fecha as FiltroFecha) ?? "hoy";
  const rango =
    calcularRangoFecha(fechaActiva, desde, hasta) ?? calcularRangoFecha("hoy", undefined, undefined)!;

  function hrefFecha(nuevaFecha: FiltroFecha) {
    return `/admin/pos/reporte-general?fecha=${nuevaFecha}`;
  }
  function querystringActual() {
    const params = new URLSearchParams();
    params.set("fecha", fechaActiva);
    if (fechaActiva === "rango" && desde) params.set("desde", desde);
    if (fechaActiva === "rango" && hasta) params.set("hasta", hasta);
    return params.toString();
  }

  const storeId = await idLocalActual();
  const reporte = await calcularReporteGeneralPos(storeId, rango);

  const opcionesFechaHora: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ZONA_NEGOCIO,
  };

  return (
    <div>
      <Cabecera
        titulo="Reporte general de cuentas"
        bajada="Todo lo que se cobró — mostrador, comedor, delivery y reservas de turnos — detallado por forma de pago."
        acciones={
          <>
            <a
              href={`/admin/pos/reporte-general/exportar?${querystringActual()}`}
              className={clasesBoton("principal", "sm")}
            >
              Descargar Excel
            </a>
            <a
              href={`/admin/pos/reporte-general/imprimir?${querystringActual()}`}
              target="_blank"
              rel="noopener noreferrer"
              className={clasesBoton("navegar", "sm")}
            >
              Ver reporte / PDF
            </a>
          </>
        }
      />

      {/* El filtro de fechas: se adapta al celular (atajos que se deslizan, rango en dos campos lado a lado). */}
      <FiltroFechaReporte accion="/admin/pos/reporte-general" opciones={FILTROS_FECHA} activa={fechaActiva} desde={desde} hasta={hasta} />

      {reporte.filas.length === 0 ? (
        <Vacio
          titulo="No hay cuentas en este período"
          detalle="Las ventas del mostrador, del comedor, del delivery y de las reservas de turnos van a aparecer acá apenas se cobren."
        />
      ) : (
        <Tabla className="!border-2 !border-azul/50">
          <thead>
            <tr>
              <Th>N°</Th>
              {/* Una columna por cada forma de vender: el número de la venta va en la de su canal. */}
              {COLUMNAS_CANAL.map((c) => (
                <Th key={c.valor}>{c.etiqueta}</Th>
              ))}
              <Th>Fecha</Th>
              <Th className="text-right">Importe</Th>
              {COLUMNAS_FORMA_PAGO.map((f) => (
                <Th key={f.valor} className="text-right">
                  {f.etiqueta}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {reporte.filas.map((f) => (
              <Tr key={`${f.n}-${f.idVentaDb}`}>
                <Td>{f.n}</Td>
                {COLUMNAS_CANAL.map((c) => (
                  <Td key={c.valor}>
                    {f.canal === c.valor ? (
                      <Link href={`/admin/pos/venta/${f.idVentaDb}`} className="font-medium text-azul-oscuro hover:underline">
                        {formatearNumero(f.idVenta)}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </Td>
                ))}
                <Td>{f.fecha.toLocaleString("es-PY", opcionesFechaHora)}</Td>
                <Td className="cifra text-right font-medium text-tinta">{formatearGuarani(f.importe)}</Td>
                {COLUMNAS_FORMA_PAGO.map((fp) => (
                  <Td key={fp.valor} className="cifra text-right">
                    {f.formaPago === fp.valor ? formatearGuarani(f.importe) : "—"}
                  </Td>
                ))}
              </Tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <Td colSpan={2 + COLUMNAS_CANAL.length} className="text-right font-semibold">
                CUENTAS ({reporte.filas.length})
              </Td>
              <Td className="cifra text-right font-bold text-tinta">
                {formatearGuarani(reporte.totalImporte)}
              </Td>
              {COLUMNAS_FORMA_PAGO.map((fp) => (
                <Td key={fp.valor} className="cifra text-right font-semibold text-tinta">
                  {formatearGuarani(reporte.totalPorForma[fp.valor])}
                </Td>
              ))}
            </tr>
          </tfoot>
        </Tabla>
      )}

      {/* Cuánto entró por cada forma de vender, para cuadrarlo de un vistazo con el cierre y con Estadísticas. */}
      {reporte.filas.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[0.8rem] text-tinta-media">
          {COLUMNAS_CANAL.map((c) => (
            <span key={c.valor}>
              {c.etiqueta}: <span className="cifra font-semibold text-tinta">{formatearGuarani(reporte.totalPorCanal[c.valor])}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
