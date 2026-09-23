"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { calcularCompra } from "@/lib/compra-calculo";
import { etiquetaUnidadMedida } from "@/lib/unidad-medida";

export type LineaCompraInput = {
  insumoId: string;
  almacenId: string | null;
  cantidad: number;
  /** Costo de una unidad de compra: sin IVA, o con IVA si `costoIncluyeIva` es true. */
  costoUnitario: number;
  /** true si el operador cargó el costo tal cual la factura, con el IVA adentro. */
  costoIncluyeIva?: boolean;
  descuentoPorcentaje: number;
};

export type DatosCompra = {
  proveedorId: string | null;
  fecha: string; // yyyy-mm-dd, del <input type="date">
  /** Folio de la factura del proveedor. */
  folioFactura: string | null;
  condicionPago: "contado" | "credito";
  /** yyyy-mm-dd. Solo se guarda si la compra es a crédito. */
  fechaVencimiento: string | null;
  descuentoGeneralPorcentaje: number;
  notas: string | null;
  lineas: LineaCompraInput[];
};

export type ResultadoCompra = { ok: false; error: string };
export type ResultadoCancelarCompra = { ok: true } | { ok: false; error: string };

export type InsumoParaCompra = {
  id: string;
  nombre: string;
  categoriaNombre: string;
  unidadMedida: string;
  /** "gravado10" | "gravado5" | "exento" */
  iva: string;
  /** Unidades que trae cada unidad de compra (ver Insumo.rendimiento). */
  rendimiento: number;
  /**
   * Lo que costó la última compra de UNA unidad de compra (ej: un pack),
   * para precargar la línea. Null si nunca se compró.
   */
  ultimoCostoPorCompra: number | null;
};

function aFecha(texto: string | null | undefined): Date | null {
  if (!texto) return null;
  const fecha = new Date(texto);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/** Busca insumos activos por nombre para agregarlos como línea de la compra. */
export async function buscarInsumosParaCompra(query: string): Promise<InsumoParaCompra[]> {
  await exigirPermiso("stock.ver");
  const prisma = prismaDelLocal(await idLocalActual());

  const texto = query.trim();
  if (!texto) return [];

  const insumos = await prisma.insumo.findMany({
    where: { activo: true, nombre: { contains: texto, mode: "insensitive" } },
    orderBy: { nombre: "asc" },
    take: 10,
    select: {
      id: true,
      nombre: true,
      unidadMedida: true,
      iva: true,
      rendimiento: true,
      costoUnitario: true,
      categoria: { select: { nombre: true } },
    },
  });

  return insumos.map((i) => {
    const rendimiento = Number(i.rendimiento);
    return {
      id: i.id,
      nombre: i.nombre,
      categoriaNombre: i.categoria?.nombre ?? "Sin categoría",
      unidadMedida: etiquetaUnidadMedida(i.unidadMedida),
      iva: i.iva,
      rendimiento,
      // Insumo.costoUnitario es por unidad de stock (ya dividido por el
      // rendimiento al comprar) — acá se vuelve a llevar a "por compra".
      ultimoCostoPorCompra: i.costoUnitario != null ? Math.round(Number(i.costoUnitario) * rendimiento) : null,
    };
  });
}

/**
 * Registra una compra: sube el stock de cada insumo, actualiza su costo de
 * reposición, y deja un MovimientoStock ("compra") por cada línea — todo en
 * una sola transacción. Si sale bien, redirige sola a la lista (no hay nada
 * más que devolver).
 *
 * Los totales se recalculan acá con calcularCompra: lo que muestra el
 * formulario es solo una vista previa.
 */
export async function registrarCompra(datos: DatosCompra): Promise<ResultadoCompra | void> {
  const sesion = await exigirPermiso("stock.editar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const lineas = datos.lineas.filter(
    (l) =>
      l.insumoId &&
      Number.isFinite(l.cantidad) &&
      l.cantidad > 0 &&
      Number.isFinite(l.costoUnitario) &&
      l.costoUnitario >= 0
  );
  if (lineas.length === 0) {
    return { ok: false, error: "Agregá al menos un insumo con cantidad y costo unitario válidos." };
  }

  // Todo lo que viene del navegador se verifica contra el local: al ir por
  // prismaDelLocal, un id de otro negocio simplemente no aparece.
  const idsInsumos = [...new Set(lineas.map((l) => l.insumoId))];
  const idsAlmacenes = [...new Set(lineas.map((l) => l.almacenId).filter((a): a is string => !!a))];

  const [insumos, almacenes, proveedor] = await Promise.all([
    prisma.insumo.findMany({ where: { id: { in: idsInsumos } }, select: { id: true, iva: true, rendimiento: true } }),
    idsAlmacenes.length > 0
      ? prisma.almacen.findMany({ where: { id: { in: idsAlmacenes } }, select: { id: true } })
      : Promise.resolve([]),
    datos.proveedorId
      ? prisma.proveedor.findUnique({ where: { id: datos.proveedorId }, select: { id: true } })
      : Promise.resolve(null),
  ]);

  if (insumos.length !== idsInsumos.length) {
    return { ok: false, error: "Alguno de los insumos ya no existe. Recargá la pantalla e intentá de nuevo." };
  }
  if (almacenes.length !== idsAlmacenes.length) {
    return { ok: false, error: "Alguno de los almacenes elegidos ya no existe." };
  }
  if (datos.proveedorId && !proveedor) {
    return { ok: false, error: "Ese proveedor ya no existe." };
  }

  const ivaPorInsumo = new Map(insumos.map((i) => [i.id, i.iva]));
  // El rendimiento sale de la base, nunca del navegador: define cuántas
  // unidades entran al stock por cada unidad de compra (ver Insumo.rendimiento).
  const rendimientoPorInsumo = new Map(insumos.map((i) => [i.id, Number(i.rendimiento)]));
  const rendimientoDe = (insumoId: string) => rendimientoPorInsumo.get(insumoId) ?? 1;
  const calculo = calcularCompra(
    lineas.map((l) => ({
      cantidad: l.cantidad,
      costoUnitario: l.costoUnitario,
      // El IVA que se le saca sale de la base (el del insumo), no del navegador.
      costoIncluyeIva: l.costoIncluyeIva === true,
      descuentoPorcentaje: l.descuentoPorcentaje,
      iva: ivaPorInsumo.get(l.insumoId) ?? "gravado10",
    })),
    datos.descuentoGeneralPorcentaje
  );

  const condicionPago = datos.condicionPago === "credito" ? "credito" : "contado";
  const descuentoGeneral =
    Number.isFinite(datos.descuentoGeneralPorcentaje) && datos.descuentoGeneralPorcentaje > 0
      ? Math.min(datos.descuentoGeneralPorcentaje, 100)
      : null;

  const registradoPor = sesion.nombre?.trim() || sesion.email;

  await prisma.$transaction(async (tx) => {
    const nuevaCompra = await tx.compra.create({
      data: {
        storeId: idLocal,
        proveedorId: datos.proveedorId || null,
        numeroComprobante: datos.folioFactura?.trim() || null,
        fecha: aFecha(datos.fecha) ?? new Date(),
        condicionPago,
        fechaVencimiento: condicionPago === "credito" ? aFecha(datos.fechaVencimiento) : null,
        descuentoGeneralPorcentaje: descuentoGeneral,
        total: calculo.total,
        notas: datos.notas?.trim() || null,
        registradoPor,
        items: {
          create: lineas.map((l, i) => ({
            storeId: idLocal,
            insumoId: l.insumoId,
            almacenId: l.almacenId || null,
            cantidad: l.cantidad,
            rendimiento: rendimientoDe(l.insumoId),
            // Siempre neto: si se cargó con IVA, ya viene sin el impuesto.
            costoUnitario: calculo.lineas[i].costoUnitarioNeto,
            descuentoPorcentaje: l.descuentoPorcentaje > 0 ? Math.min(l.descuentoPorcentaje, 100) : null,
            subtotal: calculo.lineas[i].subtotal,
            // Snapshot del IVA del insumo al comprar (ver CompraItem.iva).
            iva: ivaPorInsumo.get(l.insumoId) ?? "gravado10",
          })),
        },
      },
    });

    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i];
      const rendimiento = rendimientoDe(linea.insumoId);
      // Lo que entra al stock son UNIDADES: 10 packs de 12 → 120.
      const unidades = Math.round(linea.cantidad * rendimiento * 1000) / 1000;
      await tx.insumo.update({
        where: { id: linea.insumoId },
        data: {
          stockActual: { increment: unidades },
          // Costo de reposición POR UNIDAD de stock: lo que costó cada pack,
          // neto y con los descuentos aplicados, repartido entre las
          // unidades que trae.
          costoUnitario: Math.round((calculo.lineas[i].costoUnitarioEfectivo / rendimiento) * 100) / 100,
        },
      });
      await tx.movimientoStock.create({
        data: {
          storeId: idLocal,
          insumoId: linea.insumoId,
          tipo: "compra",
          cantidad: unidades,
          compraId: nuevaCompra.id,
          registradoPor,
        },
      });
    }
  });

  revalidatePath("/admin/stock/compras");
  revalidatePath("/admin/stock/insumos");
  redirect("/admin/stock/compras");
}

/**
 * Anula una compra ya registrada: le resta a cada insumo lo que esa compra
 * había sumado (queda un movimiento "cancelacion" por cada uno) y la marca
 * cancelada con quién y por qué — la fila nunca se borra, igual que una
 * venta cancelada.
 *
 * Ojo: el costo de reposición del insumo NO se revierte — no hay forma de
 * saber cuál era antes. Se corrige solo con la próxima compra.
 */
export async function cancelarCompra(
  compraId: string,
  motivo: string
): Promise<ResultadoCancelarCompra> {
  const sesion = await exigirPermiso("stock.editar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  if (!motivo.trim()) {
    return { ok: false, error: "Decí por qué se cancela — queda en el historial." };
  }

  const compra = await prisma.compra.findUnique({
    where: { id: compraId },
    select: { id: true, cancelada: true },
  });
  if (!compra) return { ok: false, error: "Esa compra no existe." };
  if (compra.cancelada) return { ok: false, error: "Esa compra ya estaba cancelada." };

  const identidad = sesion.nombre?.trim() || sesion.email;

  await prisma.$transaction(async (tx) => {
    await tx.compra.update({
      where: { id: compraId },
      data: {
        cancelada: true,
        canceladaPor: identidad,
        canceladaEn: new Date(),
        motivoCancelacion: motivo.trim(),
      },
    });

    // El ledger es la fuente de verdad: se invierte cada movimiento "compra"
    // de esta compra, sin re-derivar nada desde las líneas.
    const movimientos = await tx.movimientoStock.findMany({
      where: { compraId, tipo: "compra" },
      select: { insumoId: true, cantidad: true },
    });
    for (const m of movimientos) {
      const cantidad = Number(m.cantidad);
      if (cantidad === 0) continue;
      await tx.insumo.update({
        where: { id: m.insumoId },
        data: { stockActual: { decrement: cantidad } },
      });
      await tx.movimientoStock.create({
        data: {
          storeId: idLocal,
          insumoId: m.insumoId,
          tipo: "cancelacion",
          cantidad: -cantidad,
          compraId,
          motivo: motivo.trim(),
          registradoPor: identidad,
        },
      });
    }
  });

  revalidatePath("/admin/stock/compras");
  revalidatePath(`/admin/stock/compras/${compraId}`);
  revalidatePath("/admin/stock/insumos");
  return { ok: true };
}
