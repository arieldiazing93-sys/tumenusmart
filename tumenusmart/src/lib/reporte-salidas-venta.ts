import type { Prisma } from "@prisma/client";
import { prismaDelLocal } from "./prisma-local";
import { limitesEnAsuncion, type RangoDias } from "./rango-dias";
import { etiquetaUnidadMedida } from "./unidad-medida";
import { formatearNumero } from "./format";

/**
 * Salidas por venta: qué insumos descontó cada venta y por qué producto — fecha
 * y hora, la venta, lo que se vendió, el insumo y la cantidad que salió del
 * almacén. También muestra las cancelaciones, que son las entradas que devuelven
 * ese stock.
 *
 * Sale del ledger (MovimientoStock): cada movimiento de venta guarda en
 * `motivo` qué se vendió (ver movimientos-stock.ts). Los de antes de que se
 * guardara ese dato se completan con lo que llevaba la venta entera.
 *
 * Lo usan la pantalla, el Excel (salidas-por-venta/exportar) y la versión
 * imprimible/PDF (salidas-por-venta/imprimir), para que digan siempre lo mismo.
 */

export type TipoSalidaVenta = "venta" | "cancelacion";

export type FiltroSalidasVenta = {
  tipo?: TipoSalidaVenta | null;
  almacen?: string | null;
  /** Parte del nombre del insumo. */
  insumo?: string | null;
  /** Parte de lo que se vendió. */
  producto?: string | null;
};

export type FilaSalidaVenta = {
  id: string;
  fecha: Date;
  tipo: TipoSalidaVenta;
  /** "Venta mostrador #0012" o "Pedido #0034". */
  venta: string;
  /** Lo que se vendió: "2 × Pizza Muzzarella (Borde relleno)". */
  producto: string;
  insumo: string;
  unidad: string;
  /** Con signo: negativo = salió por la venta; positivo = volvió por una cancelación. */
  cantidad: number;
  almacen: string;
  /** true en la primera fila de cada producto vendido: las que siguen son de lo mismo. */
  inicioDeGrupo: boolean;
};

export type ReporteSalidasVenta = {
  filas: FilaSalidaVenta[];
  /** Cuántas ventas o pedidos distintos aparecen. */
  ventas: number;
  /** true si se cortó en el tope: hay más movimientos en el período. */
  recortado: boolean;
};

/** Cuántos movimientos se muestran en pantalla, y cuántos entran en un Excel o PDF. */
export const LIMITE_PANTALLA = 300;
export const LIMITE_REPORTE = 5000;

function aNumero(valor: unknown): number {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  const n = parseFloat(String(valor));
  return Number.isFinite(n) ? n : 0;
}

/** "2 × Pizza (Borde relleno)" — el mismo texto que guarda movimientos-stock.ts. */
function textoDeItem(nombre: string, cantidad: number, opciones: string | null): string {
  return `${cantidad} × ${opciones ? `${nombre} (${opciones})` : nombre}`;
}

export async function calcularSalidasPorVenta(
  storeId: string,
  rango: RangoDias,
  filtro: FiltroSalidasVenta,
  tope: number
): Promise<ReporteSalidasVenta> {
  const db = prismaDelLocal(storeId);
  const insumoTexto = filtro.insumo?.trim() ?? "";
  const productoTexto = filtro.producto?.trim() ?? "";

  const where: Prisma.MovimientoStockWhereInput = {
    tipo: { in: filtro.tipo ? [filtro.tipo] : ["venta", "cancelacion"] },
    createdAt: limitesEnAsuncion(rango),
  };
  if (filtro.almacen) where.almacenId = filtro.almacen;
  if (insumoTexto) where.insumo = { nombre: { contains: insumoTexto, mode: "insensitive" } };
  if (productoTexto) where.motivo = { contains: productoTexto, mode: "insensitive" };

  // Uno de más, para saber si quedó algo afuera.
  const encontrados = await db.movimientoStock.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: tope + 1,
    select: {
      id: true,
      tipo: true,
      cantidad: true,
      motivo: true,
      createdAt: true,
      ventaPosId: true,
      orderId: true,
      almacen: { select: { nombre: true } },
      insumo: { select: { nombre: true, unidadMedida: true } },
      ventaPos: { select: { numero: true } },
      order: { select: { numero: true } },
    },
  });
  const recortado = encontrados.length > tope;
  const movimientos = recortado ? encontrados.slice(0, tope) : encontrados;

  // Los movimientos de antes de que se guardara qué se vendió no lo dicen: se
  // completan con lo que llevaba la venta entera (no se sabe cuál de los
  // productos descontó cada insumo).
  const ventaIds = [...new Set(movimientos.filter((m) => !m.motivo && m.ventaPosId).map((m) => m.ventaPosId as string))];
  const pedidoIds = [...new Set(movimientos.filter((m) => !m.motivo && m.orderId).map((m) => m.orderId as string))];
  const itemsDeVentas = ventaIds.length
    ? await db.ventaPosItem.findMany({
        where: { ventaPosId: { in: ventaIds } },
        select: { ventaPosId: true, nombreProducto: true, cantidad: true, opcionesTexto: true },
      })
    : [];
  const itemsDePedidos = pedidoIds.length
    ? await db.orderItem.findMany({
        where: { orderId: { in: pedidoIds } },
        select: { orderId: true, nombreProducto: true, cantidad: true, opcionesTexto: true },
      })
    : [];
  const textoDeLaVenta = new Map<string, string[]>();
  for (const i of itemsDeVentas) {
    const lista = textoDeLaVenta.get(i.ventaPosId) ?? [];
    lista.push(textoDeItem(i.nombreProducto, i.cantidad, i.opcionesTexto));
    textoDeLaVenta.set(i.ventaPosId, lista);
  }
  for (const i of itemsDePedidos) {
    const lista = textoDeLaVenta.get(i.orderId) ?? [];
    lista.push(textoDeItem(i.nombreProducto, i.cantidad, i.opcionesTexto));
    textoDeLaVenta.set(i.orderId, lista);
  }

  type Fila = Omit<FilaSalidaVenta, "inicioDeGrupo">;
  const porVenta = new Map<string, { momento: number; filas: Fila[] }>();
  const ventasDistintas = new Set<string>();
  for (const m of movimientos) {
    const refId = m.ventaPosId ?? m.orderId ?? m.id;
    ventasDistintas.add(refId);
    const tipo: TipoSalidaVenta = m.tipo === "cancelacion" ? "cancelacion" : "venta";
    const fila: Fila = {
      id: m.id,
      fecha: m.createdAt,
      tipo,
      venta: m.order
        ? `Pedido ${formatearNumero(m.order.numero)}`
        : m.ventaPos
          ? `Venta mostrador ${formatearNumero(m.ventaPos.numero)}`
          : "—",
      producto: m.motivo ?? `Toda la venta: ${(textoDeLaVenta.get(refId) ?? ["—"]).join("; ")}`,
      insumo: m.insumo.nombre,
      unidad: etiquetaUnidadMedida(m.insumo.unidadMedida),
      cantidad: aNumero(m.cantidad),
      almacen: m.almacen?.nombre ?? "—",
    };
    const clave = `${tipo}|${refId}`;
    const grupo = porVenta.get(clave);
    if (grupo) {
      grupo.filas.push(fila);
      grupo.momento = Math.min(grupo.momento, m.createdAt.getTime());
    } else {
      porVenta.set(clave, { momento: m.createdAt.getTime(), filas: [fila] });
    }
  }

  // Las ventas más nuevas primero; adentro de cada una, los insumos en el orden en que se descontaron.
  const filas: FilaSalidaVenta[] = [];
  const ventasOrdenadas = [...porVenta.values()].sort((a, b) => b.momento - a.momento);
  for (const venta of ventasOrdenadas) {
    venta.filas.sort((a, b) => a.fecha.getTime() - b.fecha.getTime() || a.id.localeCompare(b.id));
    let anterior: string | null = null;
    for (const f of venta.filas) {
      filas.push({ ...f, inicioDeGrupo: f.producto !== anterior });
      anterior = f.producto;
    }
  }

  return { filas, ventas: ventasDistintas.size, recortado };
}
