import Link from "next/link";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera, Campo, Entrada, Selector, Tabla, Th, Td, Tr, Vacio, Pastilla, clasesBoton } from "@/components/ui";
import { calcularRangoFecha, type FiltroFecha } from "@/lib/rango-fecha";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { ZONA_NEGOCIO, claveDiaAsuncion, inicioDeMesEnAsuncion } from "@/lib/timezone";
import { SIN_REGISTRO_FISCAL, etiquetaTipoIdentificacion } from "@/lib/tipo-cliente";
import { VerFacturaBoton } from "./VerFacturaBoton";

export const dynamic = "force-dynamic";

const FILTROS_FECHA: { value: FiltroFecha; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "ayer", label: "Ayer" },
  { value: "7dias", label: "Últimos 7 días" },
  { value: "30dias", label: "Últimos 30 días" },
  { value: "mes", label: "Este mes" },
];

type FilaFactura = {
  key: string;
  origen: "pedido" | "venta";
  id: string;
  facturaNumero: string;
  fecha: Date;
  razonSocial: string;
  etiquetaIdentificacion: string;
  identificacion: string;
  total: number;
  // Se cancela la cuenta entera (arrastra la factura de yapa) o se anula
  // SOLO la factura, cuenta viva — dos cosas distintas, ver
  // src/app/admin/(protected)/facturas/actions.ts.
  cuentaAnulada: boolean;
  facturaAnulada: boolean;
  // Solo en filas de FacturaReemplazada: este número YA NO es el vigente de
  // la cuenta (se remitió a uno nuevo) — sin esto, el número viejo
  // desaparecía de la lista por completo apenas se remitía, como si nunca
  // hubiera existido. El documento sigue siendo auditable: motivo, quién y
  // a qué número se reemplazó.
  reemplazadaPor: string | null;
  motivoAnulacion: string | null;
  anuladaPor: string | null;
  origenLabel: string;
  href: string;
};

function nombreCliente(
  tipoIdentificacion: string | null,
  razonSocial: string | null
): string {
  if (tipoIdentificacion === SIN_REGISTRO_FISCAL.tipo) return SIN_REGISTRO_FISCAL.etiquetaDisplay;
  return razonSocial ?? "—";
}

/**
 * Todas las facturas emitidas (pedidos + mostrador) en un rango de fecha,
 * en un solo lugar — hoy una factura solo se ve como un dato suelto dentro
 * de un pedido o de una cuenta del POS, sin forma de repasar el período
 * completo de un vistazo.
 *
 * Solo entran acá las que de verdad tienen número (facturaNumero no nulo):
 * un pedido que pidió factura pero se imprimió informal porque la estación
 * no tenía punto de expedición no es una factura real, y no corresponde
 * mezclarla en este listado.
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
  const rango =
    calcularRangoFecha(fechaActiva, desde, hasta) ?? calcularRangoFecha("30dias", undefined, undefined)!;

  function hrefFecha(nuevaFecha: FiltroFecha) {
    return `/admin/facturas?fecha=${nuevaFecha}`;
  }

  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const [pedidos, ventas, reemplazadas] = await Promise.all([
    db.order.findMany({
      where: { facturaNumero: { not: null }, createdAt: rango },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        numero: true,
        createdAt: true,
        total: true,
        estado: true,
        facturaAnulada: true,
        facturaNumero: true,
        facturaRazonSocial: true,
        facturaRuc: true,
        facturaTipoIdentificacion: true,
      },
    }),
    db.ventaPos.findMany({
      where: { facturaNumero: { not: null }, creadoEn: rango },
      orderBy: { creadoEn: "desc" },
      select: {
        id: true,
        numero: true,
        creadoEn: true,
        total: true,
        cancelada: true,
        facturaAnulada: true,
        facturaNumero: true,
        facturaRazonSocial: true,
        facturaRuc: true,
        facturaTipoIdentificacion: true,
      },
    }),
    // Números viejos que se anularon y después se remitieron a uno nuevo —
    // ver Fase 11 (remisión). Sin esto, un número que ya no es el vigente de
    // su cuenta no aparecía en ningún lado de esta pantalla.
    db.facturaReemplazada.findMany({
      where: { anuladaEn: rango },
      orderBy: { anuladaEn: "desc" },
      select: {
        id: true,
        origen: true,
        facturaNumero: true,
        anuladaEn: true,
        anuladaPor: true,
        motivoAnulacion: true,
        facturaNuevaNumero: true,
        facturaRazonSocial: true,
        facturaRuc: true,
        facturaTipoIdentificacion: true,
        order: { select: { id: true, numero: true, total: true } },
        venta: { select: { id: true, numero: true, total: true } },
      },
    }),
  ]);

  const filas: FilaFactura[] = [
    ...pedidos.map((p) => ({
      key: `pedido-${p.id}`,
      origen: "pedido" as const,
      id: p.id,
      facturaNumero: p.facturaNumero!,
      fecha: p.createdAt,
      razonSocial: nombreCliente(p.facturaTipoIdentificacion, p.facturaRazonSocial),
      etiquetaIdentificacion: etiquetaTipoIdentificacion(p.facturaTipoIdentificacion ?? "ruc"),
      identificacion: p.facturaRuc ?? "—",
      total: Number(p.total),
      cuentaAnulada: p.estado === "cancelado",
      facturaAnulada: p.facturaAnulada,
      reemplazadaPor: null,
      motivoAnulacion: null,
      anuladaPor: null,
      origenLabel: `Pedido ${formatearNumero(p.numero)}`,
      href: `/admin/pedidos/${p.id}`,
    })),
    ...ventas.map((v) => ({
      key: `venta-${v.id}`,
      origen: "venta" as const,
      id: v.id,
      facturaNumero: v.facturaNumero!,
      fecha: v.creadoEn,
      razonSocial: nombreCliente(v.facturaTipoIdentificacion, v.facturaRazonSocial),
      etiquetaIdentificacion: etiquetaTipoIdentificacion(v.facturaTipoIdentificacion ?? "ruc"),
      identificacion: v.facturaRuc ?? "—",
      total: Number(v.total),
      cuentaAnulada: v.cancelada,
      facturaAnulada: v.facturaAnulada,
      reemplazadaPor: null,
      motivoAnulacion: null,
      anuladaPor: null,
      origenLabel: `Venta ${formatearNumero(v.numero)}`,
      href: `/admin/pos/venta/${v.id}`,
    })),
    ...reemplazadas.map((r) => {
      const cuenta = r.origen === "venta" ? r.venta : r.order;
      const origen = r.origen === "venta" ? ("venta" as const) : ("pedido" as const);
      return {
        key: `reemplazada-${r.id}`,
        origen,
        id: cuenta?.id ?? "",
        facturaNumero: r.facturaNumero,
        fecha: r.anuladaEn,
        razonSocial: nombreCliente(r.facturaTipoIdentificacion, r.facturaRazonSocial),
        etiquetaIdentificacion: etiquetaTipoIdentificacion(r.facturaTipoIdentificacion ?? "ruc"),
        identificacion: r.facturaRuc ?? "—",
        total: cuenta ? Number(cuenta.total) : 0,
        cuentaAnulada: false,
        facturaAnulada: true,
        reemplazadaPor: r.facturaNuevaNumero,
        motivoAnulacion: r.motivoAnulacion,
        anuladaPor: r.anuladaPor,
        origenLabel: cuenta
          ? `${origen === "pedido" ? "Pedido" : "Venta"} ${formatearNumero(cuenta.numero)}`
          : "—",
        href: cuenta ? (origen === "pedido" ? `/admin/pedidos/${cuenta.id}` : `/admin/pos/venta/${cuenta.id}`) : "#",
      };
    }),
  ].sort((a, b) => b.fecha.getTime() - a.fecha.getTime());

  // "Vigente" = ni la cuenta ni la factura están anuladas. Solo esas suman
  // al total facturado del período.
  const vigentes = filas.filter((f) => !f.cuentaAnulada && !f.facturaAnulada);
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
          <Link href="/admin/facturas/nueva" className={clasesBoton("principal", "sm")}>
            + Nueva factura
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {FILTROS_FECHA.map((f) => (
          <Link
            key={f.value}
            href={hrefFecha(f.value)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
              fechaActiva === f.value
                ? "border-brand bg-brand text-white"
                : "border-linea text-tinta-media hover:border-brand hover:text-brand"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {avisoRg90 && (
        <p className="mb-4 rounded-lg bg-aviso-luz px-4 py-3 text-[0.85rem] font-medium text-aviso">{avisoRg90}</p>
      )}

      {/* Registro de comprobantes de ventas en el formato de importación de la
          DNIT (RG 90/2021, Marangatú). El formulario baja un .zip listo para subir. */}
      <details open={!!rg90} className="group mb-6 rounded-xl border border-linea bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-[0.9rem] font-semibold text-tinta">
          <span>Exportar para Marangatú (RG 90)</span>
          <span aria-hidden="true" className="text-xs text-tinta-suave transition-transform group-open:rotate-180">
            ▼
          </span>
        </summary>
        <form
          method="get"
          action="/admin/facturas/rg90"
          className="grid grid-cols-1 gap-3 border-t border-linea p-4 sm:grid-cols-2 lg:grid-cols-3"
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
