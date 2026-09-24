"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { etiquetaUnidadMedida, normalizarUnidadMedida } from "@/lib/unidad-medida";
import { normalizarIva } from "@/lib/iva";
import { registrarBitacora } from "@/lib/bitacora";
import { formaCirculo } from "@/lib/insumo-elaborado";
import { cargarElaborados } from "@/lib/cargar-elaborados";

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

  // Una preparación (salsa, masa…) no se compra ni lleva stock propio: se arma
  // con otros insumos y solo hace falta saber cuánto rinde una tanda. Nada de
  // rendimiento de compra, stock, mínimo ni costo — el costo sale de sus ingredientes.
  const esElaborado = formData.get("esElaborado") === "on";
  const rindeTanda = esElaborado ? aDecimalOpcional(formData.get("rindeTanda")) : null;
  if (esElaborado && (rindeTanda === null || rindeTanda <= 0)) {
    return { ok: false, error: "Decí cuánto rinde una tanda de la preparación (un número mayor a cero)" };
  }

  const rendimiento = esElaborado ? 1 : leerRendimiento(formData.get("rendimiento"));
  if (rendimiento === "invalido") return { ok: false, error: "El rendimiento tiene que ser un número mayor a cero" };
  const stockInicial = esElaborado ? 0 : (aDecimalOpcional(formData.get("stockInicial")) ?? 0);
  const stockMinimo = esElaborado ? null : aDecimalOpcional(formData.get("stockMinimo"));
  const costoUnitario = esElaborado ? null : aDecimalOpcional(formData.get("costoUnitario"));
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
        esElaborado,
        rindeTanda,
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
    descripcion: esElaborado
      ? `Creó la preparación ${nombre} (una tanda rinde ${rindeTanda}).`
      : `Creó el insumo ${nombre}${stockInicial !== 0 ? ` con un stock inicial de ${stockInicial}` : ""}.`,
    entidad: "Insumo",
    entidadId: insumo.id,
    detalle: esElaborado
      ? { insumo: nombre, preparacion: true, rinde_tanda: rindeTanda }
      : { insumo: nombre, stock_inicial: stockInicial, costo: costoUnitario },
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
    select: { nombre: true, costoUnitario: true, activo: true, esElaborado: true, rindeTanda: true },
  });
  if (!actual) return { ok: false, error: "Ese insumo ya no existe." };

  // Una preparación solo cambia lo suyo: cuánto rinde una tanda. No tiene
  // rendimiento de compra, stock mínimo ni costo (sale de sus ingredientes).
  const rindeTanda = actual.esElaborado ? aDecimalOpcional(formData.get("rindeTanda")) : null;
  if (actual.esElaborado && (rindeTanda === null || rindeTanda <= 0)) {
    return { ok: false, error: "Decí cuánto rinde una tanda de la preparación (un número mayor a cero)" };
  }

  const costoActual = actual.costoUnitario != null ? Number(actual.costoUnitario) : null;
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
    if (actual.esElaborado) {
      await tx.insumo.update({
        where: { id },
        data: { nombre, categoriaId: categoriaFinalId, unidadMedida, rindeTanda, activo },
      });
    } else {
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
    }
  });

  // Se anota lo que cambió (sobre todo el costo, que mueve el costo de las recetas).
  const cambios: string[] = [];
  if (actual.nombre !== nombre) cambios.push(`nombre "${actual.nombre}" → "${nombre}"`);
  const costoAntes = costoActual != null ? Math.round(costoActual * 100) / 100 : null;
  const costoAhora = costoUnitario != null ? Math.round(costoUnitario * 100) / 100 : null;
  if (!actual.esElaborado && costoAntes !== costoAhora) {
    cambios.push(`costo ${costoAntes ?? "sin costo"} → ${costoAhora ?? "sin costo"}`);
  }
  const rindeAntes = actual.rindeTanda != null ? Number(actual.rindeTanda) : null;
  if (actual.esElaborado && rindeAntes !== rindeTanda) {
    cambios.push(`rinde por tanda ${rindeAntes ?? "sin dato"} → ${rindeTanda}`);
  }
  if (actual.activo !== activo) cambios.push(activo ? "lo activó" : "lo desactivó");
  if (cambios.length > 0) {
    await registrarBitacora(idLocal, sesion, {
      modulo: "stock",
      accion: "insumo_editado",
      descripcion: `Editó ${actual.esElaborado ? "la preparación" : "el insumo"} ${nombre}: ${cambios.join("; ")}.`,
      entidad: "Insumo",
      entidadId: id,
      detalle: { insumo: nombre, cambios },
    });
  }

  // No redirige: el panel de datos vive en la misma pantalla que la lista y
  // sigue abierto después de guardar.
  revalidatePath("/admin/stock/insumos");
  return { ok: true };
}

// ===========================================================================
//  Ingredientes de una preparación (insumo elaborado) — con qué se hace, y
//  cuánto lleva UNA tanda de cada uno. Todo el flujo vive en el panel del
//  propio insumo, igual que la receta en la ficha de un producto.
// ===========================================================================

export type IngredienteParaElaborado = {
  id: string;
  nombre: string;
  categoriaNombre: string;
  unidadMedida: string;
  esElaborado: boolean;
};

/**
 * Busca insumos para agregar como ingrediente de una preparación. Deja afuera
 * los que ya están, la propia preparación, y las preparaciones que la llevan a
 * ella adentro (la salsa no puede llevar un pesto que a su vez lleva la salsa).
 */
export async function buscarIngredientesParaElaborado(
  elaboradoId: string,
  query: string
): Promise<IngredienteParaElaborado[]> {
  await exigirPermiso("stock.ver");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const texto = query.trim();
  if (!texto) return [];

  const yaEstan = await prisma.ingredienteElaborado.findMany({
    where: { elaboradoId },
    select: { ingredienteId: true },
  });

  const insumos = await prisma.insumo.findMany({
    where: {
      activo: true,
      nombre: { contains: texto, mode: "insensitive" },
      id: { notIn: [elaboradoId, ...yaEstan.map((r) => r.ingredienteId)] },
    },
    orderBy: { nombre: "asc" },
    take: 10,
    select: {
      id: true,
      nombre: true,
      unidadMedida: true,
      esElaborado: true,
      categoria: { select: { nombre: true } },
    },
  });

  const elaborados = await cargarElaborados(idLocal);
  return insumos
    .filter((i) => !i.esElaborado || !formaCirculo(elaboradoId, i.id, elaborados))
    .map((i) => ({
      id: i.id,
      nombre: i.nombre,
      categoriaNombre: i.esElaborado ? "Preparación" : (i.categoria?.nombre ?? "Sin categoría"),
      unidadMedida: etiquetaUnidadMedida(i.unidadMedida),
      esElaborado: i.esElaborado,
    }));
}

/** Agrega (o, si ya estaba, corrige la cantidad de) un ingrediente de la preparación — por tanda. */
export async function asignarIngredienteAElaborado(
  elaboradoId: string,
  ingredienteId: string,
  cantidad: number
): Promise<ResultadoInsumo> {
  const sesion = await exigirPermiso("stock.editar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    return { ok: false, error: "La cantidad tiene que ser mayor a cero" };
  }
  if (elaboradoId === ingredienteId) {
    return { ok: false, error: "Una preparación no puede llevarse a sí misma como ingrediente." };
  }

  // Los dos ids vienen del navegador: se vuelven a leer atados a este local.
  const [elaborado, ingrediente] = await Promise.all([
    prisma.insumo.findUnique({ where: { id: elaboradoId }, select: { nombre: true, esElaborado: true } }),
    prisma.insumo.findUnique({ where: { id: ingredienteId }, select: { nombre: true } }),
  ]);
  if (!elaborado || !ingrediente) return { ok: false, error: "Ese insumo ya no existe." };
  if (!elaborado.esElaborado) {
    return { ok: false, error: "Solo una preparación lleva ingredientes." };
  }

  const elaborados = await cargarElaborados(idLocal);
  if (formaCirculo(elaboradoId, ingredienteId, elaborados)) {
    return {
      ok: false,
      error: `${ingrediente.nombre} ya lleva ${elaborado.nombre} adentro: no pueden llevarse uno al otro.`,
    };
  }

  await prisma.ingredienteElaborado.upsert({
    where: { elaboradoId_ingredienteId: { elaboradoId, ingredienteId } },
    update: { cantidad },
    create: { elaboradoId, ingredienteId, cantidad, storeId: idLocal },
  });

  await registrarBitacora(idLocal, sesion, {
    modulo: "stock",
    accion: "preparacion_ingrediente",
    descripcion: `En la preparación ${elaborado.nombre}, ${ingrediente.nombre} ahora lleva ${cantidad} por tanda.`,
    entidad: "Insumo",
    entidadId: elaboradoId,
    detalle: { preparacion: elaborado.nombre, ingrediente: ingrediente.nombre, cantidad },
  });

  revalidatePath("/admin/stock/insumos");
  return { ok: true };
}

export async function quitarIngredienteDeElaborado(
  elaboradoId: string,
  ingredienteId: string
): Promise<ResultadoInsumo> {
  const sesion = await exigirPermiso("stock.editar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const [elaborado, ingrediente] = await Promise.all([
    prisma.insumo.findUnique({ where: { id: elaboradoId }, select: { nombre: true } }),
    prisma.insumo.findUnique({ where: { id: ingredienteId }, select: { nombre: true } }),
  ]);
  if (!elaborado || !ingrediente) return { ok: false, error: "Ese insumo ya no existe." };

  await prisma.ingredienteElaborado.deleteMany({ where: { elaboradoId, ingredienteId } });

  await registrarBitacora(idLocal, sesion, {
    modulo: "stock",
    accion: "preparacion_ingrediente",
    descripcion: `Sacó ${ingrediente.nombre} de la preparación ${elaborado.nombre}.`,
    entidad: "Insumo",
    entidadId: elaboradoId,
    detalle: { preparacion: elaborado.nombre, ingrediente: ingrediente.nombre, quitado: true },
  });

  revalidatePath("/admin/stock/insumos");
  return { ok: true };
}
