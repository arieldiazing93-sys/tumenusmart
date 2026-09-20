import Link from "next/link";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera, Tabla, Th, Td, Tr, Vacio, Pastilla, clasesBoton } from "@/components/ui";
import { calcularRangoFecha, type FiltroFecha } from "@/lib/rango-fecha";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";
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
  searchParams: Promise<{ fecha?: string; desde?: string; hasta?: string }>;
}) {
  await pantallaConPermiso("pos.verHistorico");

  const { fecha, desde, hasta } = await searchParams;
  const fechaActiva: FiltroFecha = (fecha as FiltroFecha) ?? "30dias";
  const rango =
    calcularRangoFecha(fechaActiva, desde, hasta) ?? calcularRangoFecha("30dias", undefined, undefined)!;

  function hrefFecha(nuevaFecha: FiltroFecha) {
    return `/admin/facturas?fecha=${nuevaFecha}`;
  }

  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const [pedidos, ventas] = await Promise.all([
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
      origenLabel: `Venta ${formatearNumero(v.numero)}`,
      href: `/admin/pos/venta/${v.id}`,
    })),
  ].sort((a, b) => b.fecha.getTime() - a.fecha.getTime());

  // "Vigente" = ni la cuenta ni la factura están anuladas. Solo esas suman
  // al total facturado del período.
  const vigentes = filas.filter((f) => !f.cuentaAnulada && !f.facturaAnulada);
  const totalFacturado = vigentes.reduce((s, f) => s + f.total, 0);

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
                    <Link href={f.href} className="text-azul-oscuro hover:underline">
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
