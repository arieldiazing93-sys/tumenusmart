"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { prisma as prismaCliente } from "@/lib/prisma";
import { stockEnAlmacen } from "@/lib/stock-almacen";
import { claveDiaAsuncion, ZONA_NEGOCIO } from "@/lib/timezone";
import { etiquetaUnidadMedida } from "@/lib/unidad-medida";

export type ResultadoAjuste = { ok: true } | { ok: false; error: string };

/**
 * Ajuste manual de inventario: el dueño escribe lo que CONTÓ físicamente en
 * un almacén (no una diferencia — se calcula sola), y queda un
 * MovimientoStock de ese almacén con esa diferencia, para que el historial
 * explique cada cambio de stock. El total del insumo sube o baja lo mismo.
 */
export async function ajustarInventario(
  insumoId: string,
  almacenId: string,
  cantidadContada: number,
  motivo?: string
): Promise<ResultadoAjuste> {
  const sesion = await exigirPermiso("stock.editar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  if (!Number.isFinite(cantidadContada) || cantidadContada < 0) {
    return { ok: false, error: "La cantidad contada tiene que ser un número mayor o igual a cero." };
  }
  if (!almacenId) return { ok: false, error: "Elegí el almacén que contaste." };

  // Insumo y almacén se verifican por el cliente del local: uno de otro
  // negocio simplemente no aparece.
  const [insumo, almacen] = await Promise.all([
    prisma.insumo.findUnique({ where: { id: insumoId }, select: { id: true } }),
    prisma.almacen.findUnique({ where: { id: almacenId }, select: { id: true, activo: true } }),
  ]);
  if (!insumo) return { ok: false, error: "No encontré ese insumo." };
  if (!almacen || !almacen.activo) return { ok: false, error: "Ese almacén ya no existe o está desactivado." };

  const registradoPor = sesion.nombre?.trim() || sesion.email;

  // El cliente crudo, con storeId explícito: el helper del stock por almacén
  // tiene que poder correr adentro de esta transacción.
  await prismaCliente.$transaction(async (tx) => {
    const enElAlmacen = await stockEnAlmacen(tx, idLocal, insumoId, almacenId);
    const diferencia = Math.round((cantidadContada - enElAlmacen) * 1000) / 1000;
    if (diferencia === 0) return;

    await tx.insumo.update({ where: { id: insumoId }, data: { stockActual: { increment: diferencia } } });
    await tx.movimientoStock.create({
      data: {
        storeId: idLocal,
        insumoId,
        almacenId,
        tipo: "ajuste",
        cantidad: diferencia,
        motivo: motivo?.trim() || null,
        registradoPor,
      },
    });
  });

  revalidatePath("/admin/stock/inventario");
  revalidatePath(`/admin/stock/inventario/${insumoId}`);
  revalidatePath("/admin/stock/insumos");
  return { ok: true };
}


/** Una fila de la planilla: `contado` null = ese insumo no se contó. */
export type LineaInventario = { insumoId: string; contado: number | null };
export type ResultadoGuardarInventario =
  | { ok: true; ajustados: number; contados: number; inventarioId: string }
  | { ok: false; error: string };

function redondear3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Guarda una toma de inventario completa: para cada insumo contado en un
 * almacén, deja el stock de ese almacén EXACTAMENTE en lo contado, y deja el
 * registro de toda la planilla (Inventario + InventarioItem) para poder
 * consultarlo después.
 *
 * La diferencia se calcula acá contra lo que hay en el momento de guardar
 * (no contra lo que mostraba la pantalla, que pudo cambiar por una venta
 * mientras se contaba), y cada una queda como un movimiento "ajuste" con el
 * motivo "Inventario físico dd/mm/aaaa". Los que ya coinciden no generan
 * movimiento, y los que no se contaron no se tocan. Los valores, los nombres
 * y los costos del registro también salen de la base, no del navegador. Todo o
 * nada: si algo falla, no se ajusta ni se registra nada.
 */
export async function guardarInventario(
  almacenId: string,
  lineas: LineaInventario[],
  detalle?: string
): Promise<ResultadoGuardarInventario> {
  const sesion = await exigirPermiso("stock.editar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  if (!almacenId) return { ok: false, error: "Elegí el almacén que contaste." };
  if (!Array.isArray(lineas) || lineas.length === 0) {
    return { ok: false, error: "No hay ninguna fila para guardar." };
  }

  // Un insumo repetido cuenta una sola vez (gana el último); se conserva el orden de la planilla.
  const contadoPorInsumo = new Map<string, number | null>();
  for (const l of lineas) {
    if (!l?.insumoId) return { ok: false, error: "Hay una fila sin insumo. Recargá la pantalla e intentá de nuevo." };
    if (l.contado != null && (!Number.isFinite(l.contado) || l.contado < 0)) {
      return { ok: false, error: "Hay una cantidad contada que no es válida: tiene que ser un número mayor o igual a cero." };
    }
    contadoPorInsumo.set(l.insumoId, l.contado != null ? redondear3(l.contado) : null);
  }
  const idsInsumos = [...contadoPorInsumo.keys()];
  if (![...contadoPorInsumo.values()].some((c) => c != null)) {
    return { ok: false, error: "Escribí al menos una cantidad contada." };
  }

  // Insumos y almacén se verifican por el cliente del local: uno de otro
  // negocio simplemente no aparece.
  const [insumos, almacen] = await Promise.all([
    prisma.insumo.findMany({
      where: { id: { in: idsInsumos } },
      select: {
        id: true,
        nombre: true,
        unidadMedida: true,
        costoUnitario: true,
        categoria: { select: { nombre: true } },
      },
    }),
    prisma.almacen.findUnique({ where: { id: almacenId }, select: { id: true, nombre: true, activo: true } }),
  ]);
  if (insumos.length !== idsInsumos.length) {
    return { ok: false, error: "Alguno de los insumos ya no existe. Recargá la pantalla e intentá de nuevo." };
  }
  if (!almacen || !almacen.activo) return { ok: false, error: "Ese almacén ya no existe o está desactivado." };
  const datosDeInsumo = new Map(insumos.map((i) => [i.id, i]));

  const registradoPor = sesion.nombre?.trim() || sesion.email;
  const fecha = claveDiaAsuncion(new Date()).split("-").reverse().join("/");
  const categorias = detalle?.trim().slice(0, 150) ?? "";
  const motivo = `Inventario físico ${fecha}${categorias ? ` — ${categorias}` : ""}`;

  const resultado = await prismaCliente.$transaction(
    async (tx) => {
      // Lo que hay ahora en ese almacén, de todos los insumos de la planilla, en una sola consulta.
      const actuales = await tx.movimientoStock.groupBy({
        by: ["insumoId"],
        where: { storeId: idLocal, almacenId, insumoId: { in: idsInsumos } },
        _sum: { cantidad: true },
      });
      const enElAlmacen = new Map(actuales.map((a) => [a.insumoId, redondear3(Number(a._sum.cantidad ?? 0))]));

      const movimientos: {
        storeId: string;
        insumoId: string;
        almacenId: string;
        tipo: string;
        cantidad: number;
        motivo: string;
        registradoPor: string;
      }[] = [];
      const filas: {
        storeId: string;
        insumoId: string;
        insumoNombre: string;
        categoriaNombre: string | null;
        unidad: string;
        stockSistema: number;
        contado: number | null;
        diferencia: number | null;
        costoUnitario: number | null;
        orden: number;
      }[] = [];

      let valorSistema = 0;
      let valorContado = 0;
      let contados = 0;
      let conDiferencia = 0;
      let orden = 0;

      for (const [insumoId, contado] of contadoPorInsumo) {
        const insumo = datosDeInsumo.get(insumoId);
        if (!insumo) continue; // no pasa: ya se verificó arriba
        const sistema = enElAlmacen.get(insumoId) ?? 0;
        const costo = insumo.costoUnitario != null ? Number(insumo.costoUnitario) : null;
        const diferencia = contado != null ? redondear3(contado - sistema) : null;

        valorSistema += sistema * (costo ?? 0);
        valorContado += (contado ?? sistema) * (costo ?? 0);
        if (contado != null) contados += 1;

        if (diferencia != null && diferencia !== 0) {
          conDiferencia += 1;
          await tx.insumo.update({ where: { id: insumoId }, data: { stockActual: { increment: diferencia } } });
          movimientos.push({
            storeId: idLocal,
            insumoId,
            almacenId,
            tipo: "ajuste",
            cantidad: diferencia,
            motivo,
            registradoPor,
          });
        }

        filas.push({
          storeId: idLocal,
          insumoId,
          insumoNombre: insumo.nombre,
          categoriaNombre: insumo.categoria?.nombre ?? null,
          unidad: etiquetaUnidadMedida(insumo.unidadMedida),
          stockSistema: sistema,
          contado,
          diferencia,
          costoUnitario: costo,
          orden: orden++,
        });
      }

      if (movimientos.length > 0) await tx.movimientoStock.createMany({ data: movimientos });

      const inventario = await tx.inventario.create({
        data: {
          storeId: idLocal,
          almacenId,
          almacenNombre: almacen.nombre,
          categorias,
          contados,
          conDiferencia,
          valorSistema: Math.round(valorSistema * 100) / 100,
          valorContado: Math.round(valorContado * 100) / 100,
          registradoPor,
        },
        select: { id: true },
      });
      await tx.inventarioItem.createMany({ data: filas.map((f) => ({ ...f, inventarioId: inventario.id })) });

      return { inventarioId: inventario.id, ajustados: movimientos.length, contados };
    },
    // Un inventario grande son cientos de actualizaciones: el tiempo por
    // defecto (5 segundos) no alcanza siempre.
    { timeout: 30000 }
  );

  revalidatePath("/admin/stock/inventario");
  revalidatePath("/admin/stock/insumos");
  return { ok: true, ...resultado };
}

/** Lo que se ve al abrir un inventario ya guardado. Todo ya formateado: el navegador no calcula nada. */
export type DetalleInventario = {
  id: string;
  /** "23/09/2026 14:32", en hora de Asunción. */
  fecha: string;
  almacen: string;
  categorias: string;
  registradoPor: string | null;
  contados: number;
  conDiferencia: number;
  valorSistema: number;
  valorContado: number;
  items: {
    insumo: string;
    categoria: string | null;
    unidad: string;
    sistema: number;
    contado: number | null;
    diferencia: number | null;
  }[];
};
export type ResultadoDetalleInventario =
  | { ok: true; inventario: DetalleInventario }
  | { ok: false; error: string };

/** Trae un inventario guardado con todas las filas de su planilla. */
export async function obtenerInventario(id: string): Promise<ResultadoDetalleInventario> {
  await exigirPermiso("stock.ver");
  const prisma = prismaDelLocal(await idLocalActual());

  const inventario = await prisma.inventario.findUnique({
    where: { id },
    include: { items: { orderBy: { orden: "asc" } } },
  });
  if (!inventario) return { ok: false, error: "No encontré ese inventario." };

  return {
    ok: true,
    inventario: {
      id: inventario.id,
      fecha: inventario.createdAt.toLocaleString("es-PY", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: ZONA_NEGOCIO,
      }),
      almacen: inventario.almacenNombre,
      categorias: inventario.categorias,
      registradoPor: inventario.registradoPor,
      contados: inventario.contados,
      conDiferencia: inventario.conDiferencia,
      valorSistema: Number(inventario.valorSistema),
      valorContado: Number(inventario.valorContado),
      items: inventario.items.map((i) => ({
        insumo: i.insumoNombre,
        categoria: i.categoriaNombre,
        unidad: i.unidad,
        sistema: Number(i.stockSistema),
        contado: i.contado != null ? Number(i.contado) : null,
        diferencia: i.diferencia != null ? Number(i.diferencia) : null,
      })),
    },
  };
}
