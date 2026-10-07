import { pantallaConPermiso } from "@/lib/auth";
import { Cabecera, Cifra, Tabla, Td, Th, Tr, Vacio } from "@/components/ui";
import { idLocalActual } from "@/lib/local-actual";
import { formatearCantidad, formatearGuarani } from "@/lib/format";
import { calcularRangoFecha, type FiltroFecha } from "@/lib/rango-fecha";
import { calcularReportePromociones } from "@/lib/reporte-promociones-servidor";
import { FiltroFechaReporte } from "@/components/FiltroFechaReporte";

export const dynamic = "force-dynamic";

const FILTROS_FECHA: { value: FiltroFecha; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "ayer", label: "Ayer" },
  { value: "7dias", label: "Últimos 7 días" },
  { value: "mes", label: "Este mes" },
  { value: "mesAnterior", label: "Mes anterior" },
];

const MAXIMO_PRODUCTOS_EN_PANTALLA = 50;

const ETIQUETA_DE_ESTADO = { activa: "Activa", inactiva: "Inactiva", eliminada: "Eliminada" } as const;

/**
 * Reporte de Promociones: cuánto se descontó y cuánto se regaló con cada promoción, en el mostrador, el comedor y el delivery. Las
 * cuentas están en src/lib/reporte-promociones.ts.
 */
export default async function ReportePromocionesPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; desde?: string; hasta?: string }>;
}) {
  await pantallaConPermiso("estadisticas.ver");

  const { fecha, desde, hasta } = await searchParams;
  const fechaActiva: FiltroFecha = (fecha as FiltroFecha) ?? "mes";
  const rango = calcularRangoFecha(fechaActiva, desde, hasta) ?? calcularRangoFecha("mes", undefined, undefined)!;

  const reporte = await calcularReportePromociones(await idLocalActual(), rango);
  const t = reporte.totales;
  const productos = reporte.productos.slice(0, MAXIMO_PRODUCTOS_EN_PANTALLA);

  return (
    <div className="flex flex-col gap-4">
      <Cabecera
        titulo="Reporte de promociones"
        bajada="Cuánto se descontó y cuánto se regaló con cada promoción, en el mostrador, el comedor y el delivery."
      />

      {/* El filtro de fechas: se adapta al celular (atajos que se deslizan, rango en dos campos lado a lado). */}
      <FiltroFechaReporte accion="/admin/reporte-promociones" opciones={FILTROS_FECHA} activa={fechaActiva} desde={desde} hasta={hasta} />

      {reporte.filas.length === 0 ? (
        <Vacio
          titulo="Todavía no hay ventas con promoción en este período"
          detalle="Cuando se cobre algo con una promoción activa, acá se ve cuánto se descontó o se regaló. Cuenta desde que se instaló este reporte."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Cifra
              valor={formatearGuarani(t.ahorro)}
              rotulo="Dado a los clientes"
              detalle={`${formatearGuarani(t.descontado)} en descuentos · ${formatearGuarani(t.regalado)} en regalos`}
            />
            <Cifra valor={formatearCantidad(t.regaladas)} rotulo="Unidades regaladas" detalle="a precio de lista" />
            <Cifra
              valor={formatearGuarani(t.costoRegalado)}
              rotulo="Costo de lo regalado"
              detalle={t.costoIncompleto ? "parcial: a algún producto le falta el costo" : "lo que costó producirlo"}
            />
            <Cifra
              valor={formatearGuarani(t.cobrado)}
              rotulo="Vendido con promoción"
              detalle={`${t.ventas} ${t.ventas === 1 ? "venta" : "ventas"}`}
            />
          </div>

          <Tabla className="min-w-0">
            <thead>
              <tr>
                <Th>Promoción</Th>
                <Th>Estado</Th>
                <Th className="text-right">Ventas</Th>
                <Th className="text-right">Unidades</Th>
                <Th className="text-right">Regaladas</Th>
                <Th className="text-right">Vendido</Th>
                <Th className="text-right">Descontado</Th>
                <Th className="text-right">Regalado</Th>
                <Th className="text-right">Costo regalado</Th>
              </tr>
            </thead>
            <tbody>
              {reporte.filas.map((f) => (
                <Tr key={f.promocionId}>
                  <Td className="font-medium text-tinta">
                    {f.nombre}
                    {f.etiqueta && <span className="ml-1.5 text-[0.72rem] font-normal text-tinta-suave">{f.etiqueta}</span>}
                  </Td>
                  <Td>{ETIQUETA_DE_ESTADO[f.estado]}</Td>
                  <Td className="cifra text-right">{f.ventas}</Td>
                  <Td className="cifra text-right">{formatearCantidad(f.unidades)}</Td>
                  <Td className="cifra text-right">{f.regaladas > 0 ? formatearCantidad(f.regaladas) : "—"}</Td>
                  <Td className="cifra text-right font-semibold text-tinta">{formatearGuarani(f.cobrado)}</Td>
                  <Td className="cifra text-right">{f.descontado > 0 ? formatearGuarani(f.descontado) : "—"}</Td>
                  <Td className="cifra text-right">{f.regalado > 0 ? formatearGuarani(f.regalado) : "—"}</Td>
                  <Td className="cifra text-right">
                    {f.regaladas > 0 ? `${formatearGuarani(f.costoRegalado)}${f.costoIncompleto ? " *" : ""}` : "—"}
                  </Td>
                </Tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-papel-suave">
                <Td className="font-semibold text-tinta">Total</Td>
                <Td />
                <Td className="cifra text-right font-semibold text-tinta">{t.ventas}</Td>
                <Td className="cifra text-right font-semibold text-tinta">{formatearCantidad(t.unidades)}</Td>
                <Td className="cifra text-right font-semibold text-tinta">{formatearCantidad(t.regaladas)}</Td>
                <Td className="cifra text-right font-semibold text-tinta">{formatearGuarani(t.cobrado)}</Td>
                <Td className="cifra text-right font-semibold text-tinta">{formatearGuarani(t.descontado)}</Td>
                <Td className="cifra text-right font-semibold text-tinta">{formatearGuarani(t.regalado)}</Td>
                <Td className="cifra text-right font-semibold text-tinta">
                  {formatearGuarani(t.costoRegalado)}
                  {t.costoIncompleto ? " *" : ""}
                </Td>
              </tr>
            </tfoot>
          </Tabla>

          <h2 className="text-[0.95rem] font-semibold text-tinta">Por canal de venta</h2>
          <Tabla className="min-w-0">
            <thead>
              <tr>
                <Th>Canal</Th>
                <Th className="text-right">Ventas</Th>
                <Th className="text-right">Unidades</Th>
                <Th className="text-right">Regaladas</Th>
                <Th className="text-right">Vendido</Th>
                <Th className="text-right">Dado a los clientes</Th>
              </tr>
            </thead>
            <tbody>
              {reporte.canales.map((c) => (
                <Tr key={c.canal}>
                  <Td className="font-medium text-tinta">{c.nombre}</Td>
                  <Td className="cifra text-right">{c.ventas}</Td>
                  <Td className="cifra text-right">{formatearCantidad(c.unidades)}</Td>
                  <Td className="cifra text-right">{c.regaladas > 0 ? formatearCantidad(c.regaladas) : "—"}</Td>
                  <Td className="cifra text-right">{formatearGuarani(c.cobrado)}</Td>
                  <Td className="cifra text-right font-semibold text-tinta">{c.ahorro > 0 ? formatearGuarani(c.ahorro) : "—"}</Td>
                </Tr>
              ))}
            </tbody>
          </Tabla>

          <h2 className="text-[0.95rem] font-semibold text-tinta">Por producto</h2>
          <Tabla className="min-w-0">
            <thead>
              <tr>
                <Th>Producto</Th>
                <Th>Promoción</Th>
                <Th className="text-right">Unidades</Th>
                <Th className="text-right">Regaladas</Th>
                <Th className="text-right">Vendido</Th>
                <Th className="text-right">Dado a los clientes</Th>
              </tr>
            </thead>
            <tbody>
              {productos.map((p) => (
                <Tr key={`${p.promocionId}-${p.productId ?? p.producto}`}>
                  <Td className="font-medium text-tinta">{p.producto}</Td>
                  <Td>{p.promocion}</Td>
                  <Td className="cifra text-right">{formatearCantidad(p.unidades)}</Td>
                  <Td className="cifra text-right">{p.regaladas > 0 ? formatearCantidad(p.regaladas) : "—"}</Td>
                  <Td className="cifra text-right">{formatearGuarani(p.cobrado)}</Td>
                  <Td className="cifra text-right font-semibold text-tinta">{p.ahorro > 0 ? formatearGuarani(p.ahorro) : "—"}</Td>
                </Tr>
              ))}
            </tbody>
          </Tabla>
          {reporte.productos.length > MAXIMO_PRODUCTOS_EN_PANTALLA && (
            <p className="text-[0.78rem] text-tinta-suave">
              Se muestran los {MAXIMO_PRODUCTOS_EN_PANTALLA} productos que más se dieron a los clientes, de {reporte.productos.length}.
            </p>
          )}

          <p className="text-[0.78rem] leading-snug text-tinta-suave">
            Cuenta las ventas cobradas del período (las anuladas no) por el día en que se cobraron. “Vendido” es lo cobrado de las líneas con
            promoción, antes del descuento general de la cuenta. “Descontado” es lo que se rebajó con las promociones por descuento y
            “Regalado”, lo que valían a precio de lista las unidades de cortesía. * El costo es parcial: a algún producto regalado le falta
            el costo en su receta.
            {reporte.lineasSinPrecioAnterior > 0 &&
              ` Hay ${reporte.lineasSinPrecioAnterior} ${reporte.lineasSinPrecioAnterior === 1 ? "línea" : "líneas"} sin el precio de antes (cargadas antes de este reporte): su ahorro no se cuenta.`}
          </p>
        </>
      )}
    </div>
  );
}
