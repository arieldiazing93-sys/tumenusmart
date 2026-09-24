import Link from "next/link";
import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera, Campo, Entrada, Selector, Tabla, Th, Td, Tr, Vacio, Pastilla, clasesBoton } from "@/components/ui";
import { calcularRangoFecha, claveDia, type FiltroFecha } from "@/lib/rango-fecha";
import { formatearGuarani } from "@/lib/format";
import { ZONA_NEGOCIO, claveDiaAsuncion, inicioDeMesEnAsuncion } from "@/lib/timezone";
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
    /** Resultado de la exportación RG 90 cuando no se pudo bajar el archivo (ver rg90/route.ts). */
    rg90?: string;
    mes?: string;
    detalle?: string;
  }>;
}) {
  await pantallaConPermiso("pos.verHistorico");

  const { fecha, desde, hasta, rg90, mes: mesAviso, detalle } = await searchParams;
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

  // Exportación RG 90: el mes que se propone es el anterior (el que se presenta
  // en Marangatú), salvo que se esté volviendo de un aviso sobre otro mes.
  const ultimoDiaMesAnterior = new Date(inicioDeMesEnAsuncion(new Date()).getTime() - 24 * 60 * 60 * 1000);
  const mesPorDefecto = /^\d{4}-\d{2}$/.test(mesAviso ?? "")
    ? (mesAviso as string)
    : claveDiaAsuncion(ultimoDiaMesAnterior).slice(0, 7);
  const avisoRg90: string | null =
    rg90 === "sin_facturas"
      ? `No hay facturas vigentes en ${mesAviso ?? "ese mes"} para exportar.`
      : rg90 === "incompletas"
        ? `No se generó el archivo: estas facturas tienen datos incompletos (timbrado, número o datos del cliente) y no se pueden informar: ${detalle ?? ""}. Corregilas y volvé a exportar.`
        : rg90 === "sin_ruc"
          ? "No se pudo saber el RUC del contribuyente para el nombre del archivo. Cargalo en Puntos de expedición y volvé a exportar."
          : rg90 === "sin_imputacion"
            ? "Elegí al menos una obligación a la que imputar las facturas (IVA, IRE o IRP-RSP)."
            : rg90 === "mes_invalido"
              ? "Elegí un mes válido para exportar."
              : null;

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
            <Link href="/admin/facturas/nueva" className={clasesBoton("principal", "sm")}>
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

      {avisoRg90 && (
        <p className="mb-4 rounded-lg bg-aviso-luz px-4 py-3 text-[0.85rem] font-medium text-aviso">{avisoRg90}</p>
      )}

      {/* Registro de comprobantes de ventas en el formato de importación de la
          DNIT (RG 90/2021, Marangatú). El formulario baja un .zip listo para subir.
          La cabecera va con fondo naranja claro para distinguirla del resto. */}
      <details open={!!rg90} className="group mb-6 overflow-hidden rounded-xl border border-brand/30 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 bg-brand-light px-4 py-3 text-[0.9rem] font-semibold text-brand-texto">
          <span>Exportar para Marangatú (RG 90)</span>
          <span aria-hidden="true" className="text-xs transition-transform group-open:rotate-180">
            ▼
          </span>
        </summary>
        <form
          method="get"
          action="/admin/facturas/rg90"
          className="grid grid-cols-1 gap-3 border-t border-brand/30 p-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <Campo etiqueta="Mes" ayuda="El mes fiscal del registro. Entran las facturas emitidas en ese mes.">
            <Entrada type="month" name="mes" defaultValue={mesPorDefecto} required />
          </Campo>
          <Campo etiqueta="Formato del archivo" ayuda="Los dos los acepta Marangatú.">
            <Selector name="formato" defaultValue="csv">
              <option value="csv">CSV (delimitado por comas)</option>
              <option value="txt">TXT (delimitado por tabulaciones)</option>
            </Selector>
          </Campo>
          <Campo etiqueta="Número de archivo" ayuda="V0001, V0002… Cada archivo que subas al mismo mes lleva uno distinto.">
            {/* De texto con teclado numérico, no type="number": ese agrega un manejador
                de la rueda del mouse que no puede ir en una pantalla de servidor. */}
            <Entrada type="text" inputMode="numeric" pattern="[0-9]{1,4}" name="archivo" defaultValue="1" required />
          </Campo>
          <Campo etiqueta="Imputa al IVA">
            <Selector name="iva" defaultValue="S">
              <option value="S">Sí</option>
              <option value="N">No</option>
            </Selector>
          </Campo>
          <Campo etiqueta="Imputa al IRE">
            <Selector name="ire" defaultValue="N">
              <option value="S">Sí</option>
              <option value="N">No</option>
            </Selector>
          </Campo>
          <Campo etiqueta="Imputa al IRP-RSP">
            <Selector name="irp" defaultValue="N">
              <option value="S">Sí</option>
              <option value="N">No</option>
            </Selector>
          </Campo>
          <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
            <div>
              <button type="submit" className={clasesBoton("principal", "sm")}>
                Descargar archivo RG 90 (.zip)
              </button>
            </div>
            <p className="text-xs text-tinta-suave">
              Solo entran las facturas vigentes: el formato pide un total mayor a cero y no tiene dónde marcar una factura
              anulada, así que las anuladas no se informan. El archivo sale comprimido y con el nombre que pide la DNIT
              (RUC sin dígito verificador, mes y número de archivo): subilo tal cual en Marangatú → Declaraciones
              informativas → Gestión de comprobantes informativos → Importar. A qué obligaciones se imputan las
              facturas depende del contribuyente: si tenés dudas, confirmalo con tu contador (por defecto, solo IVA).
              Con más de 5.000 facturas en el mes se arman varios archivos dentro del mismo .zip.
            </p>
          </div>
        </form>
      </details>

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
                    {f.reemplazadaPor ? (
                      <Pastilla color="neutro">Reemplazada</Pastilla>
                    ) : f.cuentaAnulada ? (
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
