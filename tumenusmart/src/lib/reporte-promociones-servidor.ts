import { prismaDelLocal } from "./prisma-local";
import type { RangoFecha } from "./estadisticas";
import { cargarPromociones } from "./promociones-servidor";
import { resumirPromociones, type Canal, type LineaVendida, type ReportePromociones } from "./reporte-promociones";

/**
 * Lee de la base las líneas de las ventas COBRADAS del período que llevaron una promoción y arma el reporte (ver reporte-promociones.ts).
 *
 *  - El período es el día de la venta (`creadoEn`, calendario de Asunción: el que arma el rango).
 *  - Una venta anulada después de cobrarse no cuenta: lo que se descontó o se regaló en ella se devolvió.
 *  - El canal sale de la venta: delivery si es de una cuenta de delivery; comedor si cobró una cuenta de mesa; el resto, mostrador.
 *  - Las promociones se leen TODAS (también las apagadas y no solo las activas) para ponerles nombre; las que ya se borraron figuran
 *    como "Promoción eliminada".
 *
 * Todo va por el cliente del local, así nunca se mezcla con las ventas de otro negocio.
 */
export async function calcularReportePromociones(storeId: string, rango: RangoFecha): Promise<ReportePromociones> {
  const db = prismaDelLocal(storeId);

  const [items, promos] = await Promise.all([
    db.ventaPosItem.findMany({
      where: {
        promocionId: { not: null },
        ventaPos: { creadoEn: { gte: rango.gte, lt: rango.lt }, cancelada: false },
      },
      select: {
        ventaPosId: true,
        promocionId: true,
        productId: true,
        nombreProducto: true,
        cantidad: true,
        precioUnitario: true,
        precioAntesPromo: true,
        cortesia: true,
        costoProducto: true,
        costoAgregados: true,
        ventaPos: { select: { tipoEntrega: true } },
      },
    }),
    cargarPromociones(db, false),
  ]);

  // De esas ventas, las que cobraron una cuenta de mesa son del comedor.
  const idsDeVentas = [...new Set(items.map((i) => i.ventaPosId))];
  const cuentasDeMesa = idsDeVentas.length
    ? await db.cuentaMesa.findMany({ where: { ventaPosId: { in: idsDeVentas } }, select: { ventaPosId: true } })
    : [];
  const ventasDeComedor = new Set(cuentasDeMesa.map((c) => c.ventaPosId));

  const lineas: LineaVendida[] = items.flatMap((i) => {
    // `promocionId` no es null por el filtro de arriba; se comprueba igual para que el tipo lo sepa.
    if (!i.promocionId) return [];
    const canal: Canal = i.ventaPos.tipoEntrega === "delivery" ? "delivery" : ventasDeComedor.has(i.ventaPosId) ? "comedor" : "mostrador";
    return [
      {
        ventaId: i.ventaPosId,
        promocionId: i.promocionId,
        productId: i.productId,
        nombreProducto: i.nombreProducto,
        cantidad: i.cantidad,
        precioUnitario: Number(i.precioUnitario),
        precioAntesPromo: i.precioAntesPromo === null ? null : Number(i.precioAntesPromo),
        cortesia: i.cortesia,
        costoProducto: i.costoProducto === null ? null : Number(i.costoProducto),
        costoAgregados: i.costoAgregados === null ? null : Number(i.costoAgregados),
        canal,
      },
    ];
  });

  return resumirPromociones(lineas, promos);
}
