import Link from "next/link";
import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera, clasesBoton, Tabla, Th, Td, Tr, Vacio } from "@/components/ui";
import { calcularRangoFecha, type FiltroFecha } from "@/lib/rango-fecha";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { COLUMNAS_FORMA_PAGO, calcularReporteGeneralPos } from "@/lib/reporte-general-pos";
import { ZONA_NEGOCIO } from "@/lib/timezone";

export const dynamic = "force-dynamic";

const FILTROS_FECHA: { value: FiltroFecha; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "ayer", label: "Ayer" },
  { value: "7dias", label: "Últimos 7 días" },
  { value: "30dias", label: "Últimos 30 días" },
  { value: "mes", label: "Este mes" },
];

/**
 * Reporte general de cuentas: pedidos de mostrador + ventas del Punto de
 * Venta + delivery ya entregado, en una sola lista, con el importe de cada
 * una repartido en su columna de forma de pago y una fila de totales al
 * pie — mismo criterio que un libro de caja. Ver
 * src/lib/reporte-general-pos.ts para el detalle de cómo se arma.
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
    timeZone: ZONA_NEGOCIO,
  };

  return (
    <div>
      <Cabecera
        titulo="Reporte general de cuentas"
        bajada="Todo lo que se cobró — mostrador, retiro/mesa y delivery ya entregado — detallado por forma de pago."
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

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {FILTROS_FECHA.map((f) => (
          <Link
            key={f.value}
            href={hrefFecha(f.value)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
              fechaActiva === f.value && fechaActiva !== "rango"
                ? "border-brand bg-brand text-white"
                : "border-linea text-tinta-media hover:border-brand hover:text-brand"
            }`}
          >
            {f.label}
          </Link>
        ))}

        <form
          method="get"
          action="/admin/pos/reporte-general"
          className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-sm ${
            fechaActiva === "rango" ? "border-brand bg-brand-light" : "border-linea"
          }`}
        >
          <input type="hidden" name="fecha" value="rango" />
          <input
            type="date"
            name="desde"
            defaultValue={fechaActiva === "rango" ? desde : ""}
            required
            className="rounded-md border border-linea px-1.5 py-1 text-xs"
          />
          <span className="text-tinta-suave">–</span>
          <input
            type="date"
            name="hasta"
            defaultValue={fechaActiva === "rango" ? hasta : ""}
            required
            className="rounded-md border border-linea px-1.5 py-1 text-xs"
          />
          <button
            type="submit"
            className="rounded-full bg-noche-panel px-3 py-1 text-xs font-medium text-white hover:bg-noche-panel"
          >
            Filtrar
          </button>
        </form>
      </div>

      {reporte.filas.length === 0 ? (
        <Vacio
          titulo="No hay cuentas en este período"
          detalle="Los pedidos de mostrador, las ventas del Punto de Venta y el delivery entregado van a aparecer acá."
        />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>N°</Th>
              <Th>ID Pedido</Th>
              <Th>ID Venta POS</Th>
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
              <Tr key={`${f.n}-${f.idPedido ?? ""}-${f.idVenta ?? ""}`}>
                <Td>{f.n}</Td>
                <Td>
                  {f.idPedido != null && f.idPedidoDb ? (
                    <Link
                      href={`/admin/pedidos/${f.idPedidoDb}`}
                      className="font-medium text-azul-oscuro hover:underline"
                    >
                      {formatearNumero(f.idPedido)}
                    </Link>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td>
                  {f.idVenta != null && f.idVentaDb ? (
                    <Link
                      href={`/admin/pos/venta/${f.idVentaDb}`}
                      className="font-medium text-azul-oscuro hover:underline"
                    >
                      {formatearNumero(f.idVenta)}
                    </Link>
                  ) : (
                    "—"
                  )}
                </Td>
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
              <Td colSpan={4} className="text-right font-semibold">
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

      <p className="mt-3 text-[0.76rem] text-tinta-suave">
        La forma de pago del delivery es la que declaró el repartidor al entregar. Esto es
        independiente de si ya rindió esa plata: para controlar eso, entrá a "Rendiciones".
      </p>
    </div>
  );
}
