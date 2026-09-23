"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { normalizarUnidadMedida } from "@/lib/unidad-medida";
import { normalizarIva } from "@/lib/iva";

export type ResultadoInsumo = { ok: true } | { ok: false; error: string };
export type ResultadoCrearInsumo =
  | { ok: true; insumoId: string }
  | { ok: false; error: string };

function aDecimalOpcional(valor: FormDataEntryValue | null): number | null {
  const texto = String(valor ?? "").trim();
  if (!texto) return null;
  const n = Number(texto);
  return Number.isFinite(n) ? n : null;
}

/** Vacío cuenta como 1 (se compra y se cuenta en la misma unidad); 0 o negativo es un error. */
function leerRendimiento(valor: FormDataEntryValue | null): number | "invalido" {
  const n = aDecimalOpcional(valor);
  if (n === null) return valor && String(valor).trim() ? "invalido" : 1;
  return n > 0 ? n : "invalido";
}

/**
 * Crea el insumo. Si `categoriaId` viene vacío pero `categoriaNueva` trae un
 * nombre, la categoría se crea y se adjunta en la misma transacción — así el
 * dueño arma su primera categoría sin salir de esta pantalla.
 */
export async function crearInsumo(formData: FormData): Promise<ResultadoCrearInsumo> {
  const sesion = await exigirPermiso("stock.editar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { ok: false, error: "El nombre es obligatorio" };

  const categoriaId = String(formData.get("categoriaId") ?? "").trim();
  const categoriaNueva = String(formData.get("categoriaNueva") ?? "").trim();
  const unidadMedida = normalizarUnidadMedida(formData.get("unidadMedida"));
  const iva = normalizarIva(formData.get("iva"));
  const rendimiento = leerRendimiento(formData.get("rendimiento"));
  if (rendimiento === "invalido") return { ok: false, error: "El rendimiento tiene que ser un número mayor a cero" };
  const stockInicial = aDecimalOpcional(formData.get("stockInicial")) ?? 0;
  const stockMinimo = aDecimalOpcional(formData.get("stockMinimo"));
  const costoUnitario = aDecimalOpcional(formData.get("costoUnitario"));
  const registradoPor = sesion.nombre?.trim() || sesion.email;

  const insumo = await prisma.$transaction(async (tx) => {
    let categoriaFinalId = categoriaId || null;
    if (!categoriaFinalId && categoriaNueva) {
      const nuevaCategoria = await tx.categoriaInsumo.create({
        data: { nombre: categoriaNueva, storeId: idLocal },
      });
      categoriaFinalId = nuevaCategoria.id;
    }
    const nuevo = await tx.insumo.create({
      data: {
        storeId: idLocal,
        nombre,
        categoriaId: categoriaFinalId,
        unidadMedida,
        iva,
        rendimiento,
        stockActual: stockInicial,
        stockMinimo,
        costoUnitario,
      },
    });
    // El stock inicial también queda como movimiento — así el historial
    // arranca completo, sin un número que "aparece de la nada".
    if (stockInicial !== 0) {
      await tx.movimientoStock.create({
        data: {
          storeId: idLocal,
          insumoId: nuevo.id,
          tipo: "ajuste",
          cantidad: stockInicial,
          motivo: "Carga inicial",
          registradoPor,
        },
      });
    }
    return nuevo;
  });

  revalidatePath("/admin/stock/insumos");
  return { ok: true, insumoId: insumo.id };
}

export async function actualizarInsumo(
  id: string,
  formData: FormData
): Promise<ResultadoInsumo> {
  await exigirPermiso("stock.editar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { ok: false, error: "El nombre es obligatorio" };

  const categoriaId = String(formData.get("categoriaId") ?? "").trim();
  const categoriaNueva = String(formData.get("categoriaNueva") ?? "").trim();
  const unidadMedida = normalizarUnidadMedida(formData.get("unidadMedida"));
  const iva = normalizarIva(formData.get("iva"));
  const rendimiento = leerRendimiento(formData.get("rendimiento"));
  if (rendimiento === "invalido") return { ok: false, error: "El rendimiento tiene que ser un número mayor a cero" };
  const stockMinimo = aDecimalOpcional(formData.get("stockMinimo"));
  const costoUnitario = aDecimalOpcional(formData.get("costoUnitario"));
  const activo = formData.get("activo") === "on";

  await prisma.$transaction(async (tx) => {
    let categoriaFinalId = categoriaId || null;
    if (!categoriaFinalId && categoriaNueva) {
      const nuevaCategoria = await tx.categoriaInsumo.create({
        data: { nombre: categoriaNueva, storeId: idLocal },
      });
      categoriaFinalId = nuevaCategoria.id;
    }
    await tx.insumo.update({
      where: { id },
      data: {
        nombre,
        categoriaId: categoriaFinalId,
        unidadMedida,
        iva,
        rendimiento,
        stockMinimo,
        costoUnitario,
        activo,
      },
    });
  });

  // No redirige: el panel de datos vive en la misma pantalla que la lista y
  // sigue abierto después de guardar.
  revalidatePath("/admin/stock/insumos");
  return { ok: true };
}
