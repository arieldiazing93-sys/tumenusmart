"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { normalizarUnidadMedida } from "@/lib/unidad-medida";
import { normalizarIva } from "@/lib/iva";
import { registrarBitacora } from "@/lib/bitacora";

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

  // El stock siempre está en un almacén: si se carga stock inicial, hay que
  // decir en cuál (y tiene que ser uno de este local, y estar activo).
  const almacenId = String(formData.get("almacenId") ?? "").trim();
  if (stockInicial !== 0) {
    if (!almacenId) {
      return { ok: false, error: "Elegí en qué almacén queda el stock inicial. Si todavía no creaste ninguno, hacelo en Almacenes." };
    }
    const almacen = await prisma.almacen.findFirst({ where: { id: almacenId, activo: true }, select: { id: true } });
    if (!almacen) return { ok: false, error: "Ese almacén ya no existe o está desactivado." };
  }

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
          almacenId,
          tipo: "ajuste",
          cantidad: stockInicial,
          motivo: "Carga inicial",
          registradoPor,
        },
      });
    }
    return nuevo;
  });

  await registrarBitacora(idLocal, sesion, {
    modulo: "stock",
    accion: "insumo_creado",
    descripcion: `Creó el insumo ${nombre}${stockInicial !== 0 ? ` con un stock inicial de ${stockInicial}` : ""}.`,
    entidad: "Insumo",
    entidadId: insumo.id,
    detalle: { insumo: nombre, stock_inicial: stockInicial, costo: costoUnitario },
  });

  revalidatePath("/admin/stock/insumos");
  return { ok: true, insumoId: insumo.id };
}

export async function actualizarInsumo(
  id: string,
  formData: FormData
): Promise<ResultadoInsumo> {
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
  const stockMinimo = aDecimalOpcional(formData.get("stockMinimo"));
  const costoEscrito = aDecimalOpcional(formData.get("costoUnitario"));
  const activo = formData.get("activo") === "on";

  // El campo muestra el costo redondeado a guaraníes enteros. Si quedó tal como
  // se mostró (no lo tocaron), se conserva el exacto de la última compra en vez
  // de pisarlo con el redondeado, que cambiaría en silencio el costo de las recetas.
  const actual = await prisma.insumo.findUnique({
    where: { id },
    select: { nombre: true, costoUnitario: true, activo: true },
  });
  const costoActual = actual?.costoUnitario != null ? Number(actual.costoUnitario) : null;
  const costoUnitario =
    costoEscrito !== null && costoActual !== null && Math.round(costoActual) === costoEscrito
      ? costoActual
      : costoEscrito;

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

  // Se anota lo que cambió (sobre todo el costo, que mueve el costo de las recetas).
  if (actual) {
    const cambios: string[] = [];
    if (actual.nombre !== nombre) cambios.push(`nombre "${actual.nombre}" → "${nombre}"`);
    const costoAntes = costoActual != null ? Math.round(costoActual * 100) / 100 : null;
    const costoAhora = costoUnitario != null ? Math.round(costoUnitario * 100) / 100 : null;
    if (costoAntes !== costoAhora) {
      cambios.push(`costo ${costoAntes ?? "sin costo"} → ${costoAhora ?? "sin costo"}`);
    }
    if (actual.activo !== activo) cambios.push(activo ? "lo activó" : "lo desactivó");
    if (cambios.length > 0) {
      await registrarBitacora(idLocal, sesion, {
        modulo: "stock",
        accion: "insumo_editado",
        descripcion: `Editó el insumo ${nombre}: ${cambios.join("; ")}.`,
        entidad: "Insumo",
        entidadId: id,
        detalle: { insumo: nombre, cambios },
      });
    }
  }

  // No redirige: el panel de datos vive en la misma pantalla que la lista y
  // sigue abierto después de guardar.
  revalidatePath("/admin/stock/insumos");
  return { ok: true };
}
