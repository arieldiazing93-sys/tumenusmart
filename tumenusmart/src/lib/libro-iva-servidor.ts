import { prismaDelLocal } from "./prisma-local";
import { claveDiaAsuncion } from "./timezone";
import {
  filaLibroCompras,
  filaLibroVentas,
  montosDeCompra,
  montosDeGasto,
  type ComprobanteCompraBase,
  type FacturaVentaBase,
  type FilaLibroCompras,
  type FilaLibroVentas,
} from "./libro-iva";

/**
 * La lectura de la base para el Libro IVA Ventas, el Libro IVA Compras y el Resumen del IVA (la cuenta está en libro-iva.ts).
 *
 * `rango` es [gte, lt) en hora de Asunción, como el de todos los reportes (ver rango-fecha.ts).
 */

export type RangoFechas = { gte: Date; lt: Date };

const UN_DIA = 24 * 60 * 60 * 1000;

/**
 * Los días del rango como límites en UTC. La fecha de una compra o de un gasto es el día que se eligió, guardado a medianoche UTC: su
 * período se corta por días del calendario (el mismo corte del archivo RG 90), no por la hora de Asunción.
 */
function limitesEnDiasUtc(rango: RangoFechas): { gte: Date; lt: Date } {
  const primero = claveDiaAsuncion(rango.gte);
  const ultimo = claveDiaAsuncion(new Date(rango.lt.getTime() - UN_DIA));
  return {
    gte: new Date(`${primero}T00:00:00.000Z`),
    lt: new Date(new Date(`${ultimo}T00:00:00.000Z`).getTime() + UN_DIA),
  };
}

/**
 * Las facturas de ventas emitidas en el período, autoimpresor y electrónicas (el libro es del contador: tiene que verlas todas, aunque
 * el archivo RG 90 deje afuera las electrónicas porque la DNIT ya las tiene). Solo las vigentes; las anuladas se cuentan aparte.
 */
export async function cargarVentasDelLibro(
  storeId: string,
  rango: RangoFechas
): Promise<{ facturas: FacturaVentaBase[]; anuladas: number }> {
  const db = prismaDelLocal(storeId);
  const { gte, lt } = rango;

  const campos = {
    facturaNumero: true,
    facturaTimbrado: true,
    facturaTipoIdentificacion: true,
    facturaRuc: true,
    facturaRazonSocial: true,
    facturaGravado10: true,
    facturaGravado5: true,
    facturaExento: true,
  } as const;
  // La modalidad de la factura vigente de la venta (si no tiene comprobante —ventas viejas—, es autoimpresor).
  const modalidad = { comprobantes: { where: { estado: "vigente" }, take: 1, select: { modalidad: true } } } as const;

  const [pedidos, ventas, facturasRapidas, ventasAnuladas, rapidasAnuladas] = await Promise.all([
    db.order.findMany({
      where: {
        comprobanteTipo: "factura",
        facturaNumero: { not: null },
        facturaAnulada: false,
        estado: { not: "cancelado" },
        createdAt: { gte, lt },
      },
      select: { id: true, createdAt: true, ...campos, ...modalidad },
    }),
    db.ventaPos.findMany({
      where: {
        comprobanteTipo: "factura",
        facturaNumero: { not: null },
        facturaAnulada: false,
        cancelada: false,
        creadoEn: { gte, lt },
        // La factura de un delivery emitida con la "factura rápida" va por su comprobante (abajo): que no salga dos veces.
        comprobantes: { none: { cuentaDeliveryId: { not: null } } },
      },
      select: { id: true, creadoEn: true, formaPago: true, ...campos, ...modalidad },
    }),
    db.comprobante.findMany({
      where: { tipo: "factura", estado: "vigente", cuentaDeliveryId: { not: null }, fechaEmision: { gte, lt } },
      select: {
        id: true,
        fechaEmision: true,
        numero: true,
        timbrado: true,
        modalidad: true,
        receptorTipoIdentificacion: true,
        receptorNumeroIdentificacion: true,
        receptorRazonSocial: true,
        gravado10: true,
        gravado5: true,
        exento: true,
      },
    }),
    // Las anuladas del período: solo se cuentan (no tienen importe en el libro).
    db.ventaPos.count({
      where: {
        comprobanteTipo: "factura",
        facturaNumero: { not: null },
        creadoEn: { gte, lt },
        OR: [{ facturaAnulada: true }, { cancelada: true }],
      },
    }),
    db.comprobante.count({
      where: { tipo: "factura", estado: { not: "vigente" }, cuentaDeliveryId: { not: null }, fechaEmision: { gte, lt } },
    }),
  ]);

  const modalidadDe = (c: { modalidad: string }[]): "autoimpresor" | "electronico" =>
    c[0]?.modalidad === "electronico" ? "electronico" : "autoimpresor";

  const facturas: FacturaVentaBase[] = [
    ...facturasRapidas.map((c) => ({
      id: c.id,
      fecha: c.fechaEmision,
      tipoIdentificacion: c.receptorTipoIdentificacion,
      identificacion: c.receptorNumeroIdentificacion,
      razonSocial: c.receptorRazonSocial,
      timbrado: c.timbrado,
      numero: c.numero,
      gravado10: Number(c.gravado10),
      gravado5: Number(c.gravado5),
      exento: Number(c.exento),
      modalidad: (c.modalidad === "electronico" ? "electronico" : "autoimpresor") as "autoimpresor" | "electronico",
      aCredito: false,
    })),
    ...pedidos.map((p) => ({
      id: p.id,
      fecha: p.createdAt,
      tipoIdentificacion: p.facturaTipoIdentificacion,
      identificacion: p.facturaRuc,
      razonSocial: p.facturaRazonSocial,
      timbrado: p.facturaTimbrado,
      numero: p.facturaNumero,
      gravado10: Number(p.facturaGravado10 ?? 0),
      gravado5: Number(p.facturaGravado5 ?? 0),
      exento: Number(p.facturaExento ?? 0),
      modalidad: modalidadDe(p.comprobantes),
      aCredito: false,
    })),
    ...ventas.map((v) => ({
      id: v.id,
      fecha: v.creadoEn,
      tipoIdentificacion: v.facturaTipoIdentificacion,
      identificacion: v.facturaRuc,
      razonSocial: v.facturaRazonSocial,
      timbrado: v.facturaTimbrado,
      numero: v.facturaNumero,
      gravado10: Number(v.facturaGravado10 ?? 0),
      gravado5: Number(v.facturaGravado5 ?? 0),
      exento: Number(v.facturaExento ?? 0),
      modalidad: modalidadDe(v.comprobantes),
      aCredito: v.formaPago === "a_credito",
    })),
  ].sort((a, b) => a.fecha.getTime() - b.fecha.getTime() || (a.numero ?? "").localeCompare(b.numero ?? ""));

  return { facturas, anuladas: ventasAnuladas + rapidasAnuladas };
}

/**
 * Las compras (facturas de proveedores) y los gastos con factura del período. Una compra o un gasto sin folio ni timbrado no tiene
 * comprobante: no entra al libro y solo se cuenta (`sinComprobante`).
 */
export async function cargarComprasDelLibro(
  storeId: string,
  rango: RangoFechas
): Promise<{ comprobantes: ComprobanteCompraBase[]; sinComprobante: number }> {
  const db = prismaDelLocal(storeId);
  const { gte, lt } = limitesEnDiasUtc(rango);

  const [compras, gastos] = await Promise.all([
    db.compra.findMany({
      where: { cancelada: false, fecha: { gte, lt } },
      orderBy: [{ fecha: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        fecha: true,
        numeroComprobante: true,
        timbrado: true,
        condicionPago: true,
        descuentoGeneralPorcentaje: true,
        proveedor: { select: { ruc: true, razonSocial: true, nombre: true } },
        items: { select: { subtotal: true, iva: true } },
      },
    }),
    db.gasto.findMany({
      where: { fecha: { gte, lt } },
      orderBy: [{ fecha: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        fecha: true,
        monto: true,
        iva: true,
        condicionPago: true,
        numeroComprobante: true,
        timbrado: true,
        proveedorRuc: true,
        proveedorRazonSocial: true,
        proveedor: { select: { ruc: true, razonSocial: true, nombre: true } },
      },
    }),
  ]);

  const comprobantes: ComprobanteCompraBase[] = [];
  let sinComprobante = 0;

  for (const c of compras) {
    const folio = c.numeroComprobante?.trim() ?? "";
    if (!folio && !c.timbrado) {
      sinComprobante++;
      continue;
    }
    comprobantes.push({
      id: c.id,
      origen: "compra",
      fecha: c.fecha,
      folio,
      timbrado: c.timbrado,
      rucProveedor: c.proveedor?.ruc ?? null,
      razonSocial: c.proveedor?.razonSocial ?? c.proveedor?.nombre ?? null,
      aCredito: c.condicionPago === "credito",
      montos: montosDeCompra(
        c.items.map((i) => ({ subtotal: Number(i.subtotal), iva: i.iva })),
        Number(c.descuentoGeneralPorcentaje ?? 0)
      ),
    });
  }

  for (const g of gastos) {
    const folio = g.numeroComprobante?.trim() ?? "";
    if (!folio && !g.timbrado) {
      sinComprobante++;
      continue;
    }
    comprobantes.push({
      id: g.id,
      origen: "gasto",
      fecha: g.fecha,
      folio,
      timbrado: g.timbrado,
      rucProveedor: g.proveedorRuc?.trim() || g.proveedor?.ruc || null,
      razonSocial: g.proveedorRazonSocial?.trim() || g.proveedor?.razonSocial || g.proveedor?.nombre || null,
      aCredito: g.condicionPago === "credito",
      montos: montosDeGasto(Number(g.monto), g.iva),
    });
  }

  comprobantes.sort((a, b) => a.fecha.getTime() - b.fecha.getTime() || (a.folio ?? "").localeCompare(b.folio ?? ""));
  return { comprobantes, sinComprobante };
}

// ---------------------------------------------------------------------------------------------------------------------
//  Los libros ya armados (filas del libro) — lo que usan la pantalla, el Excel y el PDF
// ---------------------------------------------------------------------------------------------------------------------

export async function cargarLibroVentas(
  storeId: string,
  rango: RangoFechas
): Promise<{ filas: FilaLibroVentas[]; anuladas: number }> {
  const { facturas, anuladas } = await cargarVentasDelLibro(storeId, rango);
  return { filas: facturas.map(filaLibroVentas), anuladas };
}

export async function cargarLibroCompras(
  storeId: string,
  rango: RangoFechas
): Promise<{ filas: FilaLibroCompras[]; sinComprobante: number }> {
  const { comprobantes, sinComprobante } = await cargarComprasDelLibro(storeId, rango);
  return { filas: comprobantes.map(filaLibroCompras), sinComprobante };
}
