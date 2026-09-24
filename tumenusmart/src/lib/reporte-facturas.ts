import { prismaDelLocal } from "./prisma-local";
import { formatearNumero } from "./format";
import { SIN_REGISTRO_FISCAL, etiquetaTipoIdentificacion } from "./tipo-cliente";

/**
 * Todas las facturas emitidas (pedidos + mostrador) en un rango de fecha, en un
 * solo lugar — una factura solo se ve como un dato suelto dentro de un pedido o
 * de una cuenta del POS, sin forma de repasar el período completo.
 *
 * Solo entran las que de verdad tienen número (facturaNumero no nulo): un
 * pedido que pidió factura pero se imprimió informal porque la estación no
 * tenía punto de expedición no es una factura real.
 *
 * Lo usan la pantalla de Facturas, el Excel (facturas/exportar) y la versión
 * imprimible/PDF (facturas/imprimir), para que los tres digan siempre lo mismo.
 */

export type FilaFactura = {
  key: string;
  origen: "pedido" | "venta";
  id: string;
  facturaNumero: string;
  fecha: Date;
  razonSocial: string;
  /** "RUC", "Cédula de identidad"... */
  etiquetaIdentificacion: string;
  identificacion: string;
  total: number;
  /** El desglose fiscal de la factura (con IVA incluido). Null en las reemplazadas: no se guardó. */
  gravado10: number | null;
  gravado5: number | null;
  exento: number | null;
  iva10: number | null;
  iva5: number | null;
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

/** "Vigente" = ni la cuenta ni la factura están anuladas. Solo esas suman al total facturado. */
export function esVigente(f: Pick<FilaFactura, "cuentaAnulada" | "facturaAnulada">): boolean {
  return !f.cuentaAnulada && !f.facturaAnulada;
}

/** El estado de una factura, como se muestra en la lista. */
export function etiquetaEstadoFactura(
  f: Pick<FilaFactura, "cuentaAnulada" | "facturaAnulada" | "reemplazadaPor">
): string {
  if (f.reemplazadaPor) return "Reemplazada";
  if (f.cuentaAnulada) return "Cuenta anulada";
  if (f.facturaAnulada) return "Factura anulada";
  return "Vigente";
}

function nombreCliente(tipoIdentificacion: string | null, razonSocial: string | null): string {
  if (tipoIdentificacion === SIN_REGISTRO_FISCAL.tipo) return SIN_REGISTRO_FISCAL.etiquetaDisplay;
  return razonSocial ?? "—";
}

const aNumero = (valor: unknown): number | null => (valor == null ? null : Number(valor));

export async function listarFacturas(
  storeId: string,
  rango: { gte: Date; lt: Date }
): Promise<FilaFactura[]> {
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
        facturaGravado10: true,
        facturaGravado5: true,
        facturaExento: true,
        facturaIva10: true,
        facturaIva5: true,
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
        facturaGravado10: true,
        facturaGravado5: true,
        facturaExento: true,
        facturaIva10: true,
        facturaIva5: true,
      },
    }),
    // Números viejos que se anularon y después se remitieron a uno nuevo —
    // ver Fase 11 (remisión). Sin esto, un número que ya no es el vigente de
    // su cuenta no aparecía en ningún lado.
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
      gravado10: aNumero(p.facturaGravado10),
      gravado5: aNumero(p.facturaGravado5),
      exento: aNumero(p.facturaExento),
      iva10: aNumero(p.facturaIva10),
      iva5: aNumero(p.facturaIva5),
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
      gravado10: aNumero(v.facturaGravado10),
      gravado5: aNumero(v.facturaGravado5),
      exento: aNumero(v.facturaExento),
      iva10: aNumero(v.facturaIva10),
      iva5: aNumero(v.facturaIva5),
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
        gravado10: null,
        gravado5: null,
        exento: null,
        iva10: null,
        iva5: null,
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
  ];

  return filas.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
}
