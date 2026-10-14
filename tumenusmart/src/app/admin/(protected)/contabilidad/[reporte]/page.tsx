import { notFound } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { Cabecera, Campo, Cifra, Entrada, Selector, Tabla, Td, Th, Tr, Vacio, clasesBoton } from "@/components/ui";
import { FiltroFechaReporte } from "@/components/FiltroFechaReporte";
import { idLocalActual } from "@/lib/local-actual";
import { formatearGuarani } from "@/lib/format";
import { calcularRangoFecha, type FiltroFecha } from "@/lib/rango-fecha";
import { claveDiaAsuncion, inicioDeMesEnAsuncion, ZONA_NEGOCIO } from "@/lib/timezone";
import {
  REPORTES_CONTABLES,
  fechaDelLibro,
  leerReporteContable,
  resumirIva,
  totalizar,
  type FilaLibroCompras,
  type FilaLibroVentas,
} from "@/lib/libro-iva";
import { cargarLibroCompras, cargarLibroVentas } from "@/lib/libro-iva-servidor";

export const dynamic = "force-dynamic";

// Para la contabilidad el período natural es el mes: el que se presenta es el anterior. Atajos: hoy, este mes y el mes anterior (más el
// rango, que trae el propio filtro).
const FILTROS_FECHA: { value: FiltroFecha; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "mes", label: "Este mes" },
  { value: "mesAnterior", label: "Mes anterior" },
];

const MAXIMO_FILAS_EN_PANTALLA = 500;

/**
 * Contabilidad: el Libro IVA ventas, el Libro IVA compras, el Resumen del IVA del mes y el archivo RG 90 para Marangatú. Las cuentas
 * están en src/lib/libro-iva.ts (pura, probada) y la lectura de la base en libro-iva-servidor.ts. El libro es un reporte para el
 * contador y para conciliar con Marangatú: la presentación oficial es el registro RG 90.
 */
export default async function ContabilidadPage({
  params,
  searchParams,
}: {
  params: Promise<{ reporte: string }>;
  searchParams: Promise<{ fecha?: string; desde?: string; hasta?: string; rg90?: string; mes?: string; detalle?: string }>;
}) {
  const { reporte: reporteCrudo } = await params;
  const reporte = leerReporteContable(reporteCrudo);
  if (!reporte) notFound();

  // Las ventas y las facturas son del histórico del dueño; las compras son de Control de stock.
  await pantallaConPermiso("pos.verHistorico");
  if (reporte !== "libro-ventas") await pantallaConPermiso("stock.ver");

  const info = REPORTES_CONTABLES.find((r) => r.valor === reporte)!;
  const { fecha, desde, hasta, rg90, mes: mesAviso, detalle } = await searchParams;

  if (reporte === "rg90") {
    return <RegistroRg90 titulo={info.titulo} bajada={info.bajada} aviso={rg90} mesAviso={mesAviso} detalle={detalle} />;
  }

  const fechaActiva: FiltroFecha = (fecha as FiltroFecha) ?? "mesAnterior";
  const rango = calcularRangoFecha(fechaActiva, desde, hasta) ?? calcularRangoFecha("mesAnterior", undefined, undefined)!;
  const storeId = await idLocalActual();

  const consulta = new URLSearchParams({ fecha: fechaActiva });
  if (fechaActiva === "rango" && desde) consulta.set("desde", desde);
  if (fechaActiva === "rango" && hasta) consulta.set("hasta", hasta);
  const finRangoInclusive = new Date(rango.lt.getTime() - 24 * 60 * 60 * 1000);
  const periodo = `${fechaDelLibro(rango.gte, ZONA_NEGOCIO)} – ${fechaDelLibro(finRangoInclusive, ZONA_NEGOCIO)}`;

  const necesitaVentas = reporte === "libro-ventas" || reporte === "resumen-iva";
  const necesitaCompras = reporte === "libro-compras" || reporte === "resumen-iva";
  const [ventas, compras] = await Promise.all([
    necesitaVentas ? cargarLibroVentas(storeId, rango) : Promise.resolve({ filas: [] as FilaLibroVentas[], anuladas: 0 }),
    necesitaCompras ? cargarLibroCompras(storeId, rango) : Promise.resolve({ filas: [] as FilaLibroCompras[], sinComprobante: 0 }),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <Cabecera
        titulo={info.titulo}
        bajada={info.bajada}
        acciones={
          <>
            <a href={`/admin/contabilidad/${reporte}/exportar?${consulta}`} className={clasesBoton("navegar", "sm")}>
              Descargar Excel
            </a>
            <a
              href={`/admin/contabilidad/${reporte}/imprimir?${consulta}`}
              target="_blank"
              rel="noopener noreferrer"
              className={clasesBoton("navegar", "sm")}
            >
              Ver reporte / PDF
            </a>
          </>
        }
      />

      <FiltroFechaReporte
        accion={`/admin/contabilidad/${reporte}`}
        opciones={FILTROS_FECHA}
        activa={fechaActiva}
        desde={desde}
        hasta={hasta}
      />
      <p className="-mt-2 text-[0.8rem] text-tinta-suave">Período: {periodo}</p>

      {reporte === "libro-ventas" && <LibroVentas filas={ventas.filas} anuladas={ventas.anuladas} />}
      {reporte === "libro-compras" && <LibroCompras filas={compras.filas} sinComprobante={compras.sinComprobante} />}
      {reporte === "resumen-iva" && (
        <ResumenDelIva ventas={ventas.filas} compras={compras.filas} anuladas={ventas.anuladas} sinComprobante={compras.sinComprobante} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------

function Fecha({ fecha, zona }: { fecha: Date; zona: string }) {
  return <>{fechaDelLibro(fecha, zona)}</>;
}

function LibroVentas({ filas, anuladas }: { filas: FilaLibroVentas[]; anuladas: number }) {
  if (filas.length === 0) {
    return (
      <Vacio
        titulo="No hay facturas emitidas en este período"
        detalle={anuladas > 0 ? `Hubo ${anuladas} facturas anuladas, que no suman al libro.` : "Cambiá el período y volvé a mirar."}
      />
    );
  }
  const t = totalizar(filas);
  const visibles = filas.slice(0, MAXIMO_FILAS_EN_PANTALLA);
  const electronicas = filas.filter((f) => f.modalidad === "electronico").length;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cifra valor={t.comprobantes} rotulo="Facturas" detalle={anuladas > 0 ? `${anuladas} anuladas (no suman)` : undefined} />
        <Cifra valor={formatearGuarani(t.total)} rotulo="Total facturado" />
        <Cifra valor={formatearGuarani(t.iva10)} rotulo="IVA 10 %" detalle={`sobre ${formatearGuarani(t.gravado10)}`} />
        <Cifra valor={formatearGuarani(t.iva5)} rotulo="IVA 5 %" detalle={`sobre ${formatearGuarani(t.gravado5)}`} />
      </div>

      <Tabla className="min-w-0">
        <thead>
          <tr>
            <Th>Fecha</Th>
            <Th>Comprador</Th>
            <Th>Timbrado</Th>
            <Th>N° de comprobante</Th>
            <Th className="text-right">Total</Th>
            <Th className="text-right">Exenta</Th>
            <Th className="text-right">Gravadas 5 %</Th>
            <Th className="text-right">IVA 5 %</Th>
            <Th className="text-right">Gravadas 10 %</Th>
            <Th className="text-right">IVA 10 %</Th>
          </tr>
        </thead>
        <tbody>
          {visibles.map((f) => (
            <Tr key={f.id}>
              <Td className="whitespace-nowrap text-tinta-media">
                <Fecha fecha={f.fecha} zona={ZONA_NEGOCIO} />
              </Td>
              <Td>
                <span className="font-medium text-tinta">{f.razonSocial || "—"}</span>
                <span className="block text-[0.76rem] text-tinta-suave">
                  {f.tipoIdentificacion}: {f.identificacion || "—"}
                </span>
              </Td>
              <Td className="whitespace-nowrap">{f.timbrado || "—"}</Td>
              <Td className="whitespace-nowrap">
                {f.numero || "—"}
                {f.modalidad === "electronico" && <span className="ml-1.5 rounded bg-azul-luz px-1 text-[0.68rem] font-semibold text-azul-oscuro">electrónica</span>}
                {f.condicion === "credito" && <span className="ml-1.5 rounded bg-aviso-luz px-1 text-[0.68rem] font-semibold text-aviso">crédito</span>}
              </Td>
              <Td className="cifra text-right font-semibold text-tinta">{formatearGuarani(f.total)}</Td>
              <Td className="cifra text-right">{formatearGuarani(f.exento)}</Td>
              <Td className="cifra text-right">{formatearGuarani(f.gravado5)}</Td>
              <Td className="cifra text-right">{formatearGuarani(f.iva5)}</Td>
              <Td className="cifra text-right">{formatearGuarani(f.gravado10)}</Td>
              <Td className="cifra text-right">{formatearGuarani(f.iva10)}</Td>
            </Tr>
          ))}
          <Tr>
            <Td className="font-semibold text-tinta" colSpan={4}>
              TOTAL ({t.comprobantes} facturas)
            </Td>
            <Td className="cifra text-right font-bold text-tinta">{formatearGuarani(t.total)}</Td>
            <Td className="cifra text-right font-bold text-tinta">{formatearGuarani(t.exento)}</Td>
            <Td className="cifra text-right font-bold text-tinta">{formatearGuarani(t.gravado5)}</Td>
            <Td className="cifra text-right font-bold text-tinta">{formatearGuarani(t.iva5)}</Td>
            <Td className="cifra text-right font-bold text-tinta">{formatearGuarani(t.gravado10)}</Td>
            <Td className="cifra text-right font-bold text-tinta">{formatearGuarani(t.iva10)}</Td>
          </Tr>
        </tbody>
      </Tabla>
      {filas.length > MAXIMO_FILAS_EN_PANTALLA && (
        <p className="text-[0.78rem] text-tinta-suave">
          Se muestran las primeras {MAXIMO_FILAS_EN_PANTALLA} de {filas.length}. El total de arriba y el Excel traen todas.
        </p>
      )}
      <p className="text-[0.78rem] leading-snug text-tinta-suave">
        Entran las facturas vigentes emitidas en el período, de mostrador, comedor y delivery
        {electronicas > 0 ? ` (${electronicas} electrónicas, que el archivo RG 90 no incluye porque la DNIT ya las tiene)` : ""}. «Gravadas» son
        los importes con el IVA incluido; el IVA es gravadas ÷ 11 (10 %) y ÷ 21 (5 %), en guaraníes enteros. Las facturas anuladas no suman. La
        fecha es la de emisión.
      </p>
    </>
  );
}

function LibroCompras({ filas, sinComprobante }: { filas: FilaLibroCompras[]; sinComprobante: number }) {
  if (filas.length === 0) {
    return (
      <Vacio
        titulo="No hay compras con factura en este período"
        detalle={
          sinComprobante > 0
            ? `Hay ${sinComprobante} compras o gastos sin factura del proveedor (sin folio ni timbrado): no entran al libro.`
            : "Las compras se cargan en Control de stock → Compras; los gastos con factura, en Gastos."
        }
      />
    );
  }
  const completas = filas.filter((f) => f.faltan.length === 0);
  const incompletas = filas.filter((f) => f.faltan.length > 0);
  const t = totalizar(completas);
  const visibles = filas.slice(0, MAXIMO_FILAS_EN_PANTALLA);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cifra valor={t.comprobantes} rotulo="Facturas completas" detalle={incompletas.length > 0 ? `${incompletas.length} incompletas (sin crédito fiscal)` : undefined} />
        <Cifra valor={formatearGuarani(t.total)} rotulo="Total comprado" />
        <Cifra valor={formatearGuarani(t.iva10)} rotulo="IVA 10 % (crédito)" detalle={`sobre ${formatearGuarani(t.gravado10)}`} />
        <Cifra valor={formatearGuarani(t.iva5)} rotulo="IVA 5 % (crédito)" detalle={`sobre ${formatearGuarani(t.gravado5)}`} />
      </div>

      {incompletas.length > 0 && (
        <p className="rounded-lg bg-aviso-luz px-4 py-3 text-[0.85rem] font-medium text-aviso">
          {incompletas.length} {incompletas.length === 1 ? "comprobante tiene" : "comprobantes tienen"} la factura incompleta (marcados abajo): su IVA no
          suma como crédito fiscal hasta completar el folio, el timbrado y el RUC del proveedor.
        </p>
      )}

      <Tabla className="min-w-0">
        <thead>
          <tr>
            <Th>Fecha</Th>
            <Th>Proveedor</Th>
            <Th>Timbrado</Th>
            <Th>N° de comprobante</Th>
            <Th className="text-right">Total</Th>
            <Th className="text-right">Exenta</Th>
            <Th className="text-right">Gravadas 5 %</Th>
            <Th className="text-right">IVA 5 %</Th>
            <Th className="text-right">Gravadas 10 %</Th>
            <Th className="text-right">IVA 10 %</Th>
          </tr>
        </thead>
        <tbody>
          {visibles.map((f) => (
            <Tr key={`${f.origen}-${f.id}`} className={f.faltan.length > 0 ? "bg-aviso-luz/40" : undefined}>
              <Td className="whitespace-nowrap text-tinta-media">
                <Fecha fecha={f.fecha} zona="UTC" />
              </Td>
              <Td>
                <span className="font-medium text-tinta">{f.razonSocial || "—"}</span>
                <span className="block text-[0.76rem] text-tinta-suave">
                  RUC: {f.identificacion || "—"} · {f.origen === "gasto" ? "Gasto" : "Compra"}
                </span>
                {f.faltan.length > 0 && <span className="block text-[0.76rem] font-medium text-aviso">Falta: {f.faltan.join(", ")}</span>}
              </Td>
              <Td className="whitespace-nowrap">{f.timbrado || "—"}</Td>
              <Td className="whitespace-nowrap">
                {f.numero || "—"}
                {f.condicion === "credito" && <span className="ml-1.5 rounded bg-aviso-luz px-1 text-[0.68rem] font-semibold text-aviso">crédito</span>}
              </Td>
              <Td className="cifra text-right font-semibold text-tinta">{formatearGuarani(f.total)}</Td>
              <Td className="cifra text-right">{formatearGuarani(f.exento)}</Td>
              <Td className="cifra text-right">{formatearGuarani(f.gravado5)}</Td>
              <Td className="cifra text-right">{formatearGuarani(f.iva5)}</Td>
              <Td className="cifra text-right">{formatearGuarani(f.gravado10)}</Td>
              <Td className="cifra text-right">{formatearGuarani(f.iva10)}</Td>
            </Tr>
          ))}
          <Tr>
            <Td className="font-semibold text-tinta" colSpan={4}>
              TOTAL con factura completa ({t.comprobantes})
            </Td>
            <Td className="cifra text-right font-bold text-tinta">{formatearGuarani(t.total)}</Td>
            <Td className="cifra text-right font-bold text-tinta">{formatearGuarani(t.exento)}</Td>
            <Td className="cifra text-right font-bold text-tinta">{formatearGuarani(t.gravado5)}</Td>
            <Td className="cifra text-right font-bold text-tinta">{formatearGuarani(t.iva5)}</Td>
            <Td className="cifra text-right font-bold text-tinta">{formatearGuarani(t.gravado10)}</Td>
            <Td className="cifra text-right font-bold text-tinta">{formatearGuarani(t.iva10)}</Td>
          </Tr>
        </tbody>
      </Tabla>
      {filas.length > MAXIMO_FILAS_EN_PANTALLA && (
        <p className="text-[0.78rem] text-tinta-suave">
          Se muestran las primeras {MAXIMO_FILAS_EN_PANTALLA} de {filas.length}. El total y el Excel traen todas.
        </p>
      )}
      <p className="text-[0.78rem] leading-snug text-tinta-suave">
        Entran las compras de Control de stock y los gastos que tienen factura del proveedor (folio y/o timbrado).
        {sinComprobante > 0 ? ` Hay ${sinComprobante} compras o gastos sin factura que no entran.` : ""} Cada compra se lleva a lo que dice la factura
        (con IVA incluido, separado por tasa). El archivo RG 90 hoy trae las compras de stock; los gastos con factura se cargan en Marangatú a mano.
      </p>
    </>
  );
}

function ResumenDelIva({
  ventas,
  compras,
  anuladas,
  sinComprobante,
}: {
  ventas: FilaLibroVentas[];
  compras: FilaLibroCompras[];
  anuladas: number;
  sinComprobante: number;
}) {
  const r = resumirIva(ventas, compras, anuladas, sinComprobante);
  const aPagar = r.saldo > 0;
  const fila = (rotulo: string, base: number, iva: number | null) => (
    <Tr key={rotulo}>
      <Td className="text-tinta-media">{rotulo}</Td>
      <Td className="cifra text-right">{formatearGuarani(base)}</Td>
      <Td className="cifra text-right font-semibold text-tinta">{iva === null ? "—" : formatearGuarani(iva)}</Td>
    </Tr>
  );
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Cifra valor={formatearGuarani(r.debitoFiscal)} rotulo="IVA de las ventas (débito)" detalle={`${r.ventas.comprobantes} facturas`} />
        <Cifra valor={formatearGuarani(r.creditoFiscal)} rotulo="IVA de las compras (crédito)" detalle={`${r.compras.comprobantes} comprobantes completos`} />
        <Cifra
          valor={formatearGuarani(Math.abs(r.saldo))}
          rotulo={aPagar ? "IVA a pagar (referencia)" : r.saldo < 0 ? "Saldo a favor (referencia)" : "Sin saldo"}
          detalle="débito − crédito"
        />
      </div>

      <h2 className="text-[0.95rem] font-semibold text-tinta">Ventas (débito fiscal)</h2>
      <Tabla className="min-w-0">
        <thead>
          <tr>
            <Th>Concepto</Th>
            <Th className="text-right">Importe (IVA incluido)</Th>
            <Th className="text-right">IVA</Th>
          </tr>
        </thead>
        <tbody>
          {fila("Gravadas al 10 %", r.ventas.gravado10, r.ventas.iva10)}
          {fila("Gravadas al 5 %", r.ventas.gravado5, r.ventas.iva5)}
          {fila("Exentas", r.ventas.exento, null)}
          <Tr>
            <Td className="font-semibold text-tinta">Total de ventas</Td>
            <Td className="cifra text-right font-bold text-tinta">{formatearGuarani(r.ventas.total)}</Td>
            <Td className="cifra text-right font-bold text-tinta">{formatearGuarani(r.debitoFiscal)}</Td>
          </Tr>
        </tbody>
      </Tabla>

      <h2 className="text-[0.95rem] font-semibold text-tinta">Compras (crédito fiscal)</h2>
      <Tabla className="min-w-0">
        <thead>
          <tr>
            <Th>Concepto</Th>
            <Th className="text-right">Importe (IVA incluido)</Th>
            <Th className="text-right">IVA</Th>
          </tr>
        </thead>
        <tbody>
          {fila("Gravadas al 10 %", r.compras.gravado10, r.compras.iva10)}
          {fila("Gravadas al 5 %", r.compras.gravado5, r.compras.iva5)}
          {fila("Exentas", r.compras.exento, null)}
          <Tr>
            <Td className="font-semibold text-tinta">Total de compras</Td>
            <Td className="cifra text-right font-bold text-tinta">{formatearGuarani(r.compras.total)}</Td>
            <Td className="cifra text-right font-bold text-tinta">{formatearGuarani(r.creditoFiscal)}</Td>
          </Tr>
        </tbody>
      </Tabla>

      {(r.comprasIncompletas.comprobantes > 0 || r.comprasSinComprobante > 0 || r.facturasAnuladas > 0) && (
        <div className="rounded-lg bg-aviso-luz px-4 py-3 text-[0.85rem] text-aviso">
          <p className="font-semibold">Para tener en cuenta</p>
          <ul className="mt-1 list-disc pl-5">
            {r.comprasIncompletas.comprobantes > 0 && (
              <li>
                {r.comprasIncompletas.comprobantes} compras o gastos con la factura incompleta ({formatearGuarani(r.comprasIncompletas.iva10 + r.comprasIncompletas.iva5)} de IVA
                que no se toma como crédito): completá el folio, el timbrado y el RUC del proveedor.
              </li>
            )}
            {r.comprasSinComprobante > 0 && <li>{r.comprasSinComprobante} compras o gastos sin factura del proveedor: no dan crédito fiscal.</li>}
            {r.facturasAnuladas > 0 && <li>{r.facturasAnuladas} facturas anuladas en el período: no suman a las ventas.</li>}
          </ul>
        </div>
      )}

      <p className="text-[0.78rem] leading-snug text-tinta-suave">
        Es una referencia calculada con lo que está cargado en el sistema: la declaración oficial del IVA (Formulario 120) la liquida Marangatú con
        el registro RG 90 que confirmes. El IVA de cada comprobante es su importe con IVA ÷ 11 (10 %) o ÷ 21 (5 %), en guaraníes enteros. Las
        compras se toman por la fecha de la factura y las ventas por la de emisión.
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------------

/** El formulario para bajar el archivo de importación de la DNIT (el mismo que está en Facturas), dentro de Contabilidad. */
function RegistroRg90({
  titulo,
  bajada,
  aviso,
  mesAviso,
  detalle,
}: {
  titulo: string;
  bajada: string;
  aviso: string | undefined;
  mesAviso: string | undefined;
  detalle: string | undefined;
}) {
  // El mes que se propone es el anterior (el que se presenta en Marangatú), salvo que se vuelva de un aviso sobre otro mes.
  const ultimoDiaMesAnterior = new Date(inicioDeMesEnAsuncion(new Date()).getTime() - 24 * 60 * 60 * 1000);
  const mesPorDefecto = /^\d{4}-\d{2}$/.test(mesAviso ?? "") ? (mesAviso as string) : claveDiaAsuncion(ultimoDiaMesAnterior).slice(0, 7);
  const textoAviso: string | null =
    aviso === "sin_facturas"
      ? `No hay facturas vigentes ni compras con factura de proveedor en ${mesAviso ?? "ese mes"} para exportar.`
      : aviso === "incompletas"
        ? `No se generó el archivo: estos comprobantes tienen datos incompletos y no se pueden informar: ${detalle ?? ""}. Corregilos (las compras se editan desde su detalle en Compras) y volvé a exportar.`
        : aviso === "sin_ruc"
          ? "No se pudo saber el RUC del contribuyente para el nombre del archivo. Cargalo en Puntos de expedición y volvé a exportar."
          : aviso === "sin_imputacion"
            ? "Elegí al menos una obligación a la que imputar las facturas (IVA, IRE o IRP-RSP)."
            : aviso === "mes_invalido"
              ? "Elegí un mes válido para exportar."
              : null;

  return (
    <div className="flex flex-col gap-4">
      <Cabecera titulo={titulo} bajada={bajada} />

      {textoAviso && <p className="rounded-lg bg-aviso-luz px-4 py-3 text-[0.85rem] font-medium text-aviso">{textoAviso}</p>}

      <form
        method="get"
        action="/admin/facturas/rg90"
        className="grid grid-cols-1 gap-3 rounded-xl border border-linea bg-superficie p-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {/* Vuelve acá (y no a Facturas) si no se puede armar el archivo. */}
        <input type="hidden" name="volver" value="contabilidad" />
        <Campo etiqueta="Mes" ayuda="El mes fiscal del registro. Entran las facturas y compras con fecha de ese mes.">
          <Entrada type="month" name="mes" defaultValue={mesPorDefecto} required />
        </Campo>
        <Campo etiqueta="Formato del archivo" ayuda="Los dos los acepta Marangatú.">
          <Selector name="formato" defaultValue="csv">
            <option value="csv">CSV (delimitado por comas)</option>
            <option value="txt">TXT (delimitado por tabulaciones)</option>
          </Selector>
        </Campo>
        <Campo etiqueta="Número de archivo" ayuda="V0001 (ventas), C0001 (compras)… Cada archivo que subas al mismo mes lleva uno distinto.">
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
          <label className="flex items-start gap-2 text-[0.86rem] text-tinta">
            <input type="checkbox" name="compras" value="1" defaultChecked className="mt-1" />
            <span>
              Incluir también las <strong>compras</strong> del mes (facturas de tus proveedores).
              <span className="block text-xs text-tinta-suave">
                Salen en su propio archivo (C0001). Entran las compras que tienen folio y/o timbrado de la factura del proveedor, y el proveedor
                con su RUC; las compras sin factura no se informan.
              </span>
            </span>
          </label>
          <div>
            <button type="submit" className={clasesBoton("navegar", "md")}>
              Descargar archivo RG 90 (.zip)
            </button>
          </div>
          <p className="text-xs leading-snug text-tinta-suave">
            Es el registro de comprobantes de la Resolución General N° 90/2021. De las ventas entran las facturas vigentes de talonario
            (autoimpresor): las anuladas no se informan (el formato no tiene dónde marcarlas) y las facturas electrónicas tampoco, porque la
            DNIT ya las tiene por e-Kuatia y las trae sola a Marangatú. El archivo sale comprimido y con el nombre que pide la DNIT (RUC sin
            dígito verificador, mes y número de archivo): subilo tal cual en Marangatú → Declaraciones informativas → Gestión de comprobantes
            informativos → Importar. A qué obligaciones se imputan las facturas depende del contribuyente: si tenés dudas, confirmalo con tu
            contador (por defecto, solo IVA). Con más de 5.000 facturas en el mes se arman varios archivos dentro del mismo .zip.
          </p>
        </div>
      </form>
    </div>
  );
}
