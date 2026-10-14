import Link from "next/link";
import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera, Campo, Entrada, Tabla, Th, Td, Tr, Vacio, Pastilla, clasesBoton } from "@/components/ui";
import { calcularRangoFecha, claveDia, type FiltroFecha } from "@/lib/rango-fecha";
import { formatearGuarani } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { esVigente, listarFacturas } from "@/lib/reporte-facturas";
import { VerFacturaBoton } from "./VerFacturaBoton";

export const dynamic = "force-dynamic";

/**
 * Todas las facturas emitidas (pedidos + mostrador) en un rango de fechas, en un
 * solo lugar — ver src/lib/reporte-facturas.ts. El rango se elige con un
 * calendario Desde / Hasta; los reportes de Excel y PDF salen con el mismo.
 */
export default async function FacturasPage({
  searchParams,
}: {
  searchParams: Promise<{
    fecha?: string;
    desde?: string;
    hasta?: string;
  }>;
}) {
  await pantallaConPermiso("pos.verHistorico");

  const { fecha, desde, hasta } = await searchParams;
  const fechaActiva: FiltroFecha = (fecha as FiltroFecha) ?? "30dias";
  let rango =
    calcularRangoFecha(fechaActiva, desde, hasta) ?? calcularRangoFecha("30dias", undefined, undefined)!;

  // El filtro es un calendario Desde / Hasta. Sin fechas en la dirección arranca
  // en los últimos 30 días, y el calendario muestra siempre el rango que se está
  // viendo, venga como venga en la dirección.
  let diaDesde = claveDia(rango.gte);
  let diaHasta = claveDia(new Date(rango.lt.getTime() - 24 * 60 * 60 * 1000));
  if (diaDesde > diaHasta) {
    // Las escribieron al revés: se dan vuelta en vez de mostrar una lista vacía.
    [diaDesde, diaHasta] = [diaHasta, diaDesde];
    rango = calcularRangoFecha("rango", diaDesde, diaHasta)!;
  }
  // Los reportes de Excel y PDF reciben el mismo rango, así salen con lo que se ve.
  const consultaReporte = new URLSearchParams({ fecha: "rango", desde: diaDesde, hasta: diaHasta }).toString();

  const storeId = await idLocalActual();
  const filas = await listarFacturas(storeId, rango);

  // Solo las vigentes suman al total facturado del período.
  const vigentes = filas.filter(esVigente);
  const totalFacturado = vigentes.reduce((s, f) => s + f.total, 0);

  return (
    <div>
      <Cabecera
        titulo="Facturas"
        bajada="Todas las facturas emitidas, de pedidos y de mostrador, juntas en un solo lugar."
        acciones={
          <>
            <a href={`/admin/facturas/exportar?${consultaReporte}`} className={clasesBoton("suave", "sm")}>
              Descargar Excel
            </a>
            <a
              href={`/admin/facturas/imprimir?${consultaReporte}`}
              target="_blank"
              rel="noopener noreferrer"
              className={clasesBoton("navegar", "sm")}
            >
              Ver reporte / PDF
            </a>
            {/* Acceso directo a los datos del emisor para factura electrónica (viven en Puntos de expedición). */}
            <Link href="/admin/pos/puntos-expedicion" className={clasesBoton("navegar", "sm")}>
              Datos del emisor
            </Link>
            <Link href="/admin/facturas/nueva" className={clasesBoton("nuevo", "sm")}>
              + Nueva factura
            </Link>
          </>
        }
      />

      {/* Solo calendario: el rango de fechas que se ve en la lista y sale en los reportes. */}
      <form
        key={`${diaDesde}_${diaHasta}`}
        method="get"
        action="/admin/facturas"
        className="mb-6 flex flex-wrap items-end gap-3"
      >
        <input type="hidden" name="fecha" value="rango" />
        <Campo etiqueta="Desde" className="w-44">
          <Entrada type="date" name="desde" defaultValue={diaDesde} required />
        </Campo>
        <Campo etiqueta="Hasta" className="w-44">
          <Entrada type="date" name="hasta" defaultValue={diaHasta} required />
        </Campo>
        <button type="submit" className={clasesBoton("principal", "md")}>
          Filtrar
        </button>
      </form>

      {filas.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-6 rounded-xl border border-linea bg-white px-4 py-3 text-[0.85rem]">
          <div>
            <span className="text-tinta-media">Facturas vigentes: </span>
            <span className="cifra font-semibold text-tinta">{vigentes.length}</span>
          </div>
          <div>
            <span className="text-tinta-media">Total facturado: </span>
            <span className="cifra font-semibold text-tinta">{formatearGuarani(totalFacturado)}</span>
          </div>
        </div>
      )}

      {filas.length === 0 ? (
        <Vacio
          titulo="No hay facturas en este período"
          detalle="Las facturas emitidas desde Pedidos o el Punto de Venta van a aparecer acá."
        />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>N° Factura</Th>
              <Th>Fecha</Th>
              <Th>Cliente</Th>
              <Th>Origen</Th>
              <Th className="text-right">Monto</Th>
              <Th className="text-right">Estado</Th>
              <Th className="text-right">
                <span className="sr-only">Acción</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const anulada = f.cuentaAnulada || f.facturaAnulada;
              return (
                <Tr key={f.key}>
                  <Td>
                    <span className="cifra font-medium text-tinta">{f.facturaNumero}</span>
                  </Td>
                  <Td>
                    {f.fecha.toLocaleString("es-PY", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                      timeZone: ZONA_NEGOCIO,
                    })}
                  </Td>
                  <Td>
                    <p className="text-tinta">{f.razonSocial}</p>
                    <p className="text-[0.78rem] text-tinta-suave">
                      {f.etiquetaIdentificacion}: {f.identificacion}
                    </p>
                  </Td>
                  <Td>
                    <Link href={f.href} className={clasesBoton("navegar", "sm")}>
                      {f.origenLabel}
                    </Link>
                  </Td>
                  <Td className={`text-right ${anulada ? "text-tinta-suave line-through" : "text-tinta"}`}>
                    <span className="cifra font-medium">{formatearGuarani(f.total)}</span>
                  </Td>
                  <Td className="text-right">
                    {f.cuentaAnulada ? (
                      <Pastilla color="peligro">Cuenta anulada</Pastilla>
                    ) : f.facturaAnulada ? (
                      <Pastilla color="aviso">Factura anulada</Pastilla>
                    ) : (
                      <Pastilla color="exito">Vigente</Pastilla>
                    )}
                  </Td>
                  <Td className="text-right">
                    <VerFacturaBoton
                      origen={f.origen}
                      id={f.id}
                      facturaNumero={f.facturaNumero}
                      fecha={f.fecha}
                      razonSocial={f.razonSocial}
                      etiquetaIdentificacion={f.etiquetaIdentificacion}
                      identificacion={f.identificacion}
                      total={f.total}
                      origenLabel={f.origenLabel}
                      href={f.href}
                      cuentaAnulada={f.cuentaAnulada}
                      facturaAnulada={f.facturaAnulada}
                      reemplazadaPor={f.reemplazadaPor}
                      motivoAnulacion={f.motivoAnulacion}
                      anuladaPor={f.anuladaPor}
                    />
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Tabla>
      )}
    </div>
  );
}
