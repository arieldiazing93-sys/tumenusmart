"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { calcularCompra, costoDeReposicionDeLinea, type ResultadoCalculoCompra } from "@/lib/compra-calculo";
import { etiquetaUnidadMedida } from "@/lib/unidad-medida";
import { formatearGuarani } from "@/lib/format";
import { registrarBitacora } from "@/lib/bitacora";

export type LineaCompraInput = {
  insumoId: string;
  /** Obligatorio: todo lo que se compra entra a un almacén. */
  almacenId: string;
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
  /** Timbrado de esa factura (hasta 8 números). Lo pide el registro de compras de la DNIT (RG 90). */
  timbrado?: string | null;
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

/**
 * Busca insumos activos por nombre para agregarlos como línea de la compra (o de
 * un movimiento de almacén). Las preparaciones (salsa, masa…) quedan afuera:
 * no se compran ni llevan stock propio.
 */
export async function buscarInsumosParaCompra(query: string): Promise<InsumoParaCompra[]> {
  await exigirPermiso("stock.ver");
  const prisma = prismaDelLocal(await idLocalActual());

  const texto = query.trim();
  if (!texto) return [];

  const insumos = await prisma.insumo.findMany({
    where: { activo: true, esElaborado: false, nombre: { contains: texto, mode: "insensitive" } },
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
      // Con centavos, sin redondear a entero: el formulario le suma el IVA y
      // recién ahí redondea. Si se redondeara antes, el error se arrastraba:
      // 50.000 con IVA volvía como 50.001.
      ultimoCostoPorCompra:
        i.costoUnitario != null ? Math.round(Number(i.costoUnitario) * rendimiento * 100) / 100 : null,
    };
  });
}

function redondear3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Lo que entra al stock son UNIDADES: 10 packs de 12 → 120. */
function unidadesQueEntran(cantidad: number, rendimiento: number): number {
  return redondear3(cantidad * rendimiento);
}

/** Costo de reposición POR UNIDAD de stock: lo que costó cada pack (neto y con los descuentos), repartido entre las unidades que trae. */
function costoDeReposicion(costoEfectivoPorCompra: number, rendimiento: number): number {
  return Math.round((costoEfectivoPorCompra / rendimiento) * 100) / 100;
}

/**
 * Cuando una compra deja de aportar el costo de un insumo (se canceló, se le sacó el insumo, o su costo quedó en 0), el insumo vuelve al
 * costo de la compra ANTERIOR que sí lo traía — pero solo si esa compra era la más reciente con costo: si hay una más nueva, el costo
 * del insumo ya es el de esa y no se toca. Si no queda ninguna compra anterior con costo, se deja como estaba (no hay de dónde sacar otro).
 *
 * Va después de la transacción de la compra (con el cliente del local, que es lo que se le puede pasar a una función con seguridad):
 * el costo es un dato que se deriva de las compras, y si este paso fallara solo queda el costo de antes, como pasaba hasta ahora.
 */
async function volverAlCostoDeLaCompraAnterior(
  prisma: ReturnType<typeof prismaDelLocal>,
  insumoId: string,
  compraId: string,
  compraCreadaEn: Date
): Promise<void> {
  const masNueva = await prisma.compraItem.count({
    where: {
      insumoId,
      compraId: { not: compraId },
      costoUnitario: { gt: 0 },
      compra: { cancelada: false, createdAt: { gt: compraCreadaEn } },
    },
  });
  if (masNueva > 0) return;

  const anterior = await prisma.compraItem.findFirst({
    where: { insumoId, compraId: { not: compraId }, costoUnitario: { gt: 0 }, compra: { cancelada: false } },
    orderBy: { compra: { createdAt: "desc" } },
    select: {
      costoUnitario: true,
      descuentoPorcentaje: true,
      rendimiento: true,
      iva: true,
      compra: { select: { descuentoGeneralPorcentaje: true } },
    },
  });
  if (!anterior) return;

  const costo = costoDeReposicionDeLinea(
    {
      costoUnitario: Number(anterior.costoUnitario),
      descuentoPorcentaje: anterior.descuentoPorcentaje != null ? Number(anterior.descuentoPorcentaje) : null,
      rendimiento: Number(anterior.rendimiento),
      iva: anterior.iva,
    },
    anterior.compra.descuentoGeneralPorcentaje != null ? Number(anterior.compra.descuentoGeneralPorcentaje) : null
  );
  if (costo > 0) await prisma.insumo.update({ where: { id: insumoId }, data: { costoUnitario: costo } });
}

type CompraPreparada = {
  lineas: LineaCompraInput[];
  calculo: ResultadoCalculoCompra;
  ivaDe: (insumoId: string) => string;
  rendimientoDe: (insumoId: string) => number;
  condicionPago: "contado" | "credito";
  descuentoGeneral: number | null;
  /** Solo dígitos, o null si no se cargó. */
  timbrado: string | null;
};

/**
 * Lo que comparten registrar y editar una compra: valida lo que llegó del
 * navegador contra el local y recalcula los totales. Devuelve el error para
 * mostrar, o todo lo necesario para guardar.
 */
async function prepararCompra(
  prisma: ReturnType<typeof prismaDelLocal>,
  datos: DatosCompra,
  /** Al corregir una compra: el rendimiento con que se compró cada insumo (el guardado en la línea), no el de hoy. */
  rendimientosDeLaCompra?: Map<string, number>
): Promise<{ error: string } | CompraPreparada> {
  const lineas = datos.lineas.filter(
    (l) =>
      l.insumoId &&
      Number.isFinite(l.cantidad) &&
      l.cantidad > 0 &&
      Number.isFinite(l.costoUnitario) &&
      l.costoUnitario >= 0
  );
  if (lineas.length === 0) {
    return { error: "Agregá al menos un insumo con cantidad y costo unitario válidos." };
  }

  // El timbrado son hasta 8 números; se guarda sin espacios ni guiones.
  const timbrado = (datos.timbrado ?? "").replace(/\D/g, "");
  if (timbrado && timbrado.length > 8) {
    return { error: "El timbrado tiene como máximo 8 números." };
  }

  // Todo lo que se compra entra a un almacén: sin almacén no hay dónde
  // guardar el stock.
  if (lineas.some((l) => !l.almacenId)) {
    return { error: "Elegí el almacén de cada insumo." };
  }

  // Todo lo que viene del navegador se verifica contra el local: al ir por
  // prismaDelLocal, un id de otro negocio simplemente no aparece.
  const idsInsumos = [...new Set(lineas.map((l) => l.insumoId))];
  const idsAlmacenes = [...new Set(lineas.map((l) => l.almacenId))];

  const [insumos, almacenes, proveedor] = await Promise.all([
    prisma.insumo.findMany({ where: { id: { in: idsInsumos } }, select: { id: true, iva: true, rendimiento: true } }),
    prisma.almacen.findMany({ where: { id: { in: idsAlmacenes }, activo: true }, select: { id: true } }),
    datos.proveedorId
      ? prisma.proveedor.findUnique({ where: { id: datos.proveedorId }, select: { id: true } })
      : Promise.resolve(null),
  ]);

  if (insumos.length !== idsInsumos.length) {
    return { error: "Alguno de los insumos ya no existe. Recargá la pantalla e intentá de nuevo." };
  }
  if (almacenes.length !== idsAlmacenes.length) {
    return { error: "Alguno de los almacenes elegidos ya no existe o está desactivado." };
  }
  if (datos.proveedorId && !proveedor) {
    return { error: "Ese proveedor ya no existe." };
  }

  const ivaPorInsumo = new Map(insumos.map((i) => [i.id, i.iva]));
  const ivaDe = (insumoId: string) => ivaPorInsumo.get(insumoId) ?? "gravado10";
  // El rendimiento sale de la base, nunca del navegador: define cuántas
  // unidades entran al stock por cada unidad de compra (ver Insumo.rendimiento).
  const rendimientoPorInsumo = new Map(insumos.map((i) => [i.id, Number(i.rendimiento)]));
  // Un insumo que YA estaba en la compra conserva el rendimiento con el que se compró: si después se cambió el rendimiento del insumo,
  // corregir una compra vieja con el de hoy desajustaba el stock (calculaba otras unidades que las que habían entrado).
  const rendimientoDe = (insumoId: string) => rendimientosDeLaCompra?.get(insumoId) ?? rendimientoPorInsumo.get(insumoId) ?? 1;

  const calculo = calcularCompra(
    lineas.map((l) => ({
      cantidad: l.cantidad,
      costoUnitario: l.costoUnitario,
      // El IVA que se le saca sale de la base (el del insumo), no del navegador.
      costoIncluyeIva: l.costoIncluyeIva === true,
      descuentoPorcentaje: l.descuentoPorcentaje,
      iva: ivaDe(l.insumoId),
    })),
    datos.descuentoGeneralPorcentaje
  );

  const condicionPago = datos.condicionPago === "credito" ? "credito" : "contado";
  const descuentoGeneral =
    Number.isFinite(datos.descuentoGeneralPorcentaje) && datos.descuentoGeneralPorcentaje > 0
      ? Math.min(datos.descuentoGeneralPorcentaje, 100)
      : null;

  return { lineas, calculo, ivaDe, rendimientoDe, condicionPago, descuentoGeneral, timbrado: timbrado || null };
}

/** Las líneas de la compra tal cual se guardan en CompraItem. */
function itemsParaGuardar(idLocal: string, p: CompraPreparada) {
  return p.lineas.map((l, i) => ({
    storeId: idLocal,
    insumoId: l.insumoId,
    almacenId: l.almacenId,
    cantidad: l.cantidad,
    rendimiento: p.rendimientoDe(l.insumoId),
    // Siempre neto: si se cargó con IVA, ya viene sin el impuesto.
    costoUnitario: p.calculo.lineas[i].costoUnitarioNeto,
    descuentoPorcentaje: l.descuentoPorcentaje > 0 ? Math.min(l.descuentoPorcentaje, 100) : null,
    subtotal: p.calculo.lineas[i].subtotal,
    // Snapshot del IVA del insumo al comprar (ver CompraItem.iva).
    iva: p.ivaDe(l.insumoId),
  }));
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

  const preparada = await prepararCompra(prisma, datos);
  if ("error" in preparada) return { ok: false, error: preparada.error };
  const { lineas, calculo, rendimientoDe, condicionPago, descuentoGeneral, timbrado } = preparada;

  const registradoPor = sesion.nombre?.trim() || sesion.email;

  const compraCreadaId = await prisma.$transaction(async (tx) => {
    const nuevaCompra = await tx.compra.create({
      data: {
        storeId: idLocal,
        proveedorId: datos.proveedorId || null,
        numeroComprobante: datos.folioFactura?.trim() || null,
        timbrado,
        fecha: aFecha(datos.fecha) ?? new Date(),
        condicionPago,
        fechaVencimiento: condicionPago === "credito" ? aFecha(datos.fechaVencimiento) : null,
        descuentoGeneralPorcentaje: descuentoGeneral,
        total: calculo.total,
        notas: datos.notas?.trim() || null,
        registradoPor,
        items: { create: itemsParaGuardar(idLocal, preparada) },
      },
    });

    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i];
      const rendimiento = rendimientoDe(linea.insumoId);
      const unidades = unidadesQueEntran(linea.cantidad, rendimiento);
      const costoNuevo = costoDeReposicion(calculo.lineas[i].costoUnitarioEfectivo, rendimiento);
      await tx.insumo.update({
        where: { id: linea.insumoId },
        data: {
          stockActual: { increment: unidades },
          // Una línea de costo 0 (un regalo, una muestra, o un 0 por error) suma al stock pero NO pisa el costo del insumo con 0:
          // eso hacía parecer gratis todo lo que lo lleva y inflaba la ganancia en los reportes.
          ...(costoNuevo > 0 ? { costoUnitario: costoNuevo } : {}),
        },
      });
      await tx.movimientoStock.create({
        data: {
          storeId: idLocal,
          insumoId: linea.insumoId,
          almacenId: linea.almacenId,
          tipo: "compra",
          cantidad: unidades,
          compraId: nuevaCompra.id,
          registradoPor,
        },
      });
    }
    return nuevaCompra.id;
  });

  await registrarBitacora(idLocal, sesion, {
    modulo: "compras",
    accion: "compra_registrada",
    descripcion: `Registró una compra${datos.folioFactura?.trim() ? ` (folio ${datos.folioFactura.trim()})` : ""} de ${
      lineas.length
    } ${lineas.length === 1 ? "insumo" : "insumos"} por ${formatearGuarani(calculo.total)}, ${
      condicionPago === "credito" ? "a crédito" : "al contado"
    }.`,
    entidad: "Compra",
    entidadId: compraCreadaId,
    detalle: {
      folio: datos.folioFactura?.trim() || null,
      total: calculo.total,
      insumos: lineas.length,
      condicion: condicionPago,
    },
  });

  revalidatePath("/admin/stock/compras");
  revalidatePath("/admin/stock/insumos");
  redirect("/admin/stock/compras");
}

/**
 * Corrige una compra ya registrada (cantidad, precio, insumos, proveedor,
 * fecha…). Reemplaza sus líneas por las nuevas y ajusta el stock por la
 * DIFERENCIA, no lo rehace: el historial de movimientos no se reescribe, queda
 * la compra original y, aparte, un movimiento "correccion" por cada insumo y
 * almacén cuyo stock cambió. Si sale bien, redirige sola al detalle.
 *
 * El costo de reposición de un insumo se actualiza solo si esta compra es la
 * última que lo trajo: corregir una compra vieja no pisa el precio de una más
 * nueva. Un insumo que se quita de la compra, o que queda en costo 0, deja de
 * aportar su costo: vuelve al de la compra anterior (si esta era la última).
 */
export async function actualizarCompra(
  compraId: string,
  datos: DatosCompra
): Promise<ResultadoCompra | void> {
  const sesion = await exigirPermiso("stock.editar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const compra = await prisma.compra.findUnique({
    where: { id: compraId },
    select: { id: true, cancelada: true, createdAt: true, pagos: { select: { monto: true } } },
  });
  if (!compra) return { ok: false, error: "Esa compra no existe." };
  if (compra.cancelada) return { ok: false, error: "Una compra cancelada no se puede editar." };

  // Lo que traía la compra ANTES de corregirla: qué insumos (para devolverle el costo a los que se quiten) y con qué rendimiento se
  // compró cada uno (para que corregirla no use el rendimiento de hoy si el del insumo cambió después).
  const itemsAntes = await prisma.compraItem.findMany({ where: { compraId }, select: { insumoId: true, rendimiento: true } });
  const insumosQueTraia = itemsAntes.map((i) => i.insumoId);
  const rendimientosDeLaCompra = new Map(itemsAntes.map((i) => [i.insumoId, Number(i.rendimiento)]));

  const preparada = await prepararCompra(prisma, datos, rendimientosDeLaCompra);
  if ("error" in preparada) return { ok: false, error: preparada.error };
  const { lineas, calculo, rendimientoDe, condicionPago, descuentoGeneral, timbrado } = preparada;

  // Una compra con pagos registrados tiene que seguir siendo a crédito y no
  // puede quedar debiendo menos de lo que ya se pagó.
  const pagado = compra.pagos.reduce((s, p) => s + Number(p.monto), 0);
  if (pagado > 0) {
    if (condicionPago !== "credito") {
      return {
        ok: false,
        error: "Esta compra ya tiene pagos registrados, así que tiene que seguir a crédito. Eliminá sus pagos si querés pasarla a contado.",
      };
    }
    if (calculo.total + 0.004 < pagado) {
      return {
        ok: false,
        error: `Ya se pagaron ${formatearGuarani(pagado)} de esta compra: el total no puede quedar por debajo de eso. Corregí primero los pagos.`,
      };
    }
  }

  const registradoPor = sesion.nombre?.trim() || sesion.email;

  // Cuáles insumos hay que revisar al final para devolverles el costo de la compra anterior.
  const insumosParaRevisarElCosto = new Set<string>();

  await prisma.$transaction(async (tx) => {
    // Lo que esta compra tiene hoy en el stock, por insumo y almacén: la suma
    // de TODOS sus movimientos (la compra original y las correcciones previas).
    const previos = await tx.movimientoStock.groupBy({
      by: ["insumoId", "almacenId"],
      where: { compraId },
      _sum: { cantidad: true },
    });
    type Stock = { insumoId: string; almacenId: string | null; cantidad: number };
    const clave = (insumoId: string, almacenId: string | null) => `${insumoId}|${almacenId ?? ""}`;

    const antes = new Map<string, Stock>();
    for (const f of previos) {
      antes.set(clave(f.insumoId, f.almacenId), {
        insumoId: f.insumoId,
        almacenId: f.almacenId,
        cantidad: Number(f._sum.cantidad ?? 0),
      });
    }

    // Lo que tendría con las líneas nuevas.
    const despues = new Map<string, Stock>();
    for (const l of lineas) {
      const k = clave(l.insumoId, l.almacenId);
      const unidades = unidadesQueEntran(l.cantidad, rendimientoDe(l.insumoId));
      const actual = despues.get(k);
      if (actual) actual.cantidad = redondear3(actual.cantidad + unidades);
      else despues.set(k, { insumoId: l.insumoId, almacenId: l.almacenId, cantidad: unidades });
    }

    for (const k of new Set([...antes.keys(), ...despues.keys()])) {
      const base = despues.get(k) ?? antes.get(k)!;
      const diferencia = redondear3((despues.get(k)?.cantidad ?? 0) - (antes.get(k)?.cantidad ?? 0));
      if (diferencia === 0) continue;
      await tx.insumo.update({
        where: { id: base.insumoId },
        data: { stockActual: { increment: diferencia } },
      });
      await tx.movimientoStock.create({
        data: {
          storeId: idLocal,
          insumoId: base.insumoId,
          almacenId: base.almacenId,
          tipo: "correccion",
          cantidad: diferencia,
          compraId,
          motivo: "Compra corregida",
          registradoPor,
        },
      });
    }

    await tx.compra.update({
      where: { id: compraId },
      data: {
        proveedorId: datos.proveedorId || null,
        numeroComprobante: datos.folioFactura?.trim() || null,
        timbrado,
        fecha: aFecha(datos.fecha) ?? new Date(),
        condicionPago,
        fechaVencimiento: condicionPago === "credito" ? aFecha(datos.fechaVencimiento) : null,
        descuentoGeneralPorcentaje: descuentoGeneral,
        total: calculo.total,
        notas: datos.notas?.trim() || null,
        items: { deleteMany: {}, create: itemsParaGuardar(idLocal, preparada) },
      },
    });

    // El costo de reposición sigue a la compra más reciente de cada insumo (con costo: una compra de costo 0 no cuenta ni pisa nada).
    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i];
      const costoNuevo = costoDeReposicion(calculo.lineas[i].costoUnitarioEfectivo, rendimientoDe(linea.insumoId));
      if (costoNuevo <= 0) {
        // La línea quedó en costo 0: ya no aporta el costo del insumo (se revisa después de la transacción).
        insumosParaRevisarElCosto.add(linea.insumoId);
        continue;
      }
      const conCompraMasNueva = await tx.compraItem.count({
        where: {
          insumoId: linea.insumoId,
          compraId: { not: compraId },
          costoUnitario: { gt: 0 },
          compra: { cancelada: false, createdAt: { gt: compra.createdAt } },
        },
      });
      if (conCompraMasNueva > 0) continue;
      await tx.insumo.update({
        where: { id: linea.insumoId },
        data: { costoUnitario: costoNuevo },
      });
    }
  });

  // Los insumos que esta compra ya no trae (se los quitó de la lista) o que quedaron en costo 0 dejan de aportar su costo: si esta era
  // la compra más reciente de cada uno, vuelven al costo de la compra anterior.
  const siguenEnLaCompra = new Set(lineas.map((l) => l.insumoId));
  for (const id of insumosQueTraia) if (!siguenEnLaCompra.has(id)) insumosParaRevisarElCosto.add(id);
  for (const id of insumosParaRevisarElCosto) {
    try {
      await volverAlCostoDeLaCompraAnterior(prisma, id, compraId, compra.createdAt);
    } catch {
      // Es un dato derivado: si este paso falla, el costo queda como estaba y la corrección de la compra ya se guardó.
    }
  }

  await registrarBitacora(idLocal, sesion, {
    modulo: "compras",
    accion: "compra_editada",
    descripcion: `Editó una compra${datos.folioFactura?.trim() ? ` (folio ${datos.folioFactura.trim()})` : ""}: ahora tiene ${
      lineas.length
    } ${lineas.length === 1 ? "insumo" : "insumos"} y un total de ${formatearGuarani(calculo.total)}.`,
    entidad: "Compra",
    entidadId: compraId,
    detalle: {
      folio: datos.folioFactura?.trim() || null,
      total_nuevo: calculo.total,
      insumos: lineas.length,
      condicion: condicionPago,
    },
  });

  revalidatePath("/admin/stock/compras");
  revalidatePath(`/admin/stock/compras/${compraId}`);
  revalidatePath("/admin/stock/insumos");
  revalidatePath("/admin/stock/inventario");
  redirect(`/admin/stock/compras/${compraId}`);
}

/**
 * Anula una compra ya registrada: le resta a cada insumo lo que esa compra
 * había sumado (queda un movimiento "cancelacion" por cada uno) y la marca
 * cancelada con quién y por qué — la fila nunca se borra, igual que una
 * venta cancelada.
 *
 * El costo de reposición de cada insumo vuelve al de la compra anterior que lo
 * traía (si esta era la más reciente): cancelar una compra cargada con un
 * precio equivocado no deja ese precio en el insumo. Si no hay una compra
 * anterior con costo, el insumo queda con el que tenía.
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
    select: {
      id: true,
      cancelada: true,
      total: true,
      numeroComprobante: true,
      createdAt: true,
      items: { select: { insumoId: true } },
      _count: { select: { pagos: true } },
    },
  });
  if (!compra) return { ok: false, error: "Esa compra no existe." };
  if (compra.cancelada) return { ok: false, error: "Esa compra ya estaba cancelada." };
  if (compra._count.pagos > 0) {
    return {
      ok: false,
      error: "Esta compra ya tiene pagos registrados. Eliminá primero sus pagos (en el detalle de la compra) y después cancelala.",
    };
  }

  const identidad = sesion.nombre?.trim() || sesion.email;

  let yaCancelada = false;
  await prisma.$transaction(async (tx) => {
    // Se "reclama" la cancelación con la condición adentro de la transacción: si otra persona (u otra pestaña) la canceló un instante
    // antes, esta no encuentra nada que cancelar y NO devuelve el stock una segunda vez. La revisión de arriba sola no alcanza: las
    // dos podían pasarla antes de que cualquiera de las dos escribiera.
    const reclamada = await tx.compra.updateMany({
      where: { id: compraId, cancelada: false },
      data: {
        cancelada: true,
        canceladaPor: identidad,
        canceladaEn: new Date(),
        motivoCancelacion: motivo.trim(),
      },
    });
    if (reclamada.count !== 1) {
      yaCancelada = true;
      return;
    }

    // El ledger es la fuente de verdad: se devuelve lo que esta compra tiene
    // hoy en el stock de cada insumo y almacén, sin re-derivar nada desde las
    // líneas. Es la suma de TODOS sus movimientos, no solo el de la compra
    // original: si se corrigió antes, las correcciones también cuentan.
    const movimientos = (
      await tx.movimientoStock.groupBy({
        by: ["insumoId", "almacenId"],
        where: { compraId },
        _sum: { cantidad: true },
      })
    ).map((f) => ({ insumoId: f.insumoId, almacenId: f.almacenId, cantidad: f._sum.cantidad }));
    for (const m of movimientos) {
      const cantidad = Number(m.cantidad ?? 0);
      if (cantidad === 0) continue;
      await tx.insumo.update({
        where: { id: m.insumoId },
        data: { stockActual: { decrement: cantidad } },
      });
      await tx.movimientoStock.create({
        data: {
          storeId: idLocal,
          insumoId: m.insumoId,
          // Sale del mismo almacén al que había entrado.
          almacenId: m.almacenId,
          tipo: "cancelacion",
          cantidad: -cantidad,
          compraId,
          motivo: motivo.trim(),
          registradoPor: identidad,
        },
      });
    }
  });
  if (yaCancelada) return { ok: false, error: "Esa compra ya estaba cancelada." };

  // La compra cancelada deja de aportar el costo de sus insumos: cada uno vuelve al costo de su compra anterior (si esta era la última).
  for (const insumoId of new Set(compra.items.map((i) => i.insumoId))) {
    try {
      await volverAlCostoDeLaCompraAnterior(prisma, insumoId, compraId, compra.createdAt);
    } catch {
      // Es un dato derivado: si este paso falla, el costo queda como estaba y la cancelación ya se guardó.
    }
  }

  await registrarBitacora(idLocal, sesion, {
    modulo: "compras",
    accion: "compra_cancelada",
    descripcion: `Canceló una compra${compra.numeroComprobante ? ` (folio ${compra.numeroComprobante})` : ""} de ${formatearGuarani(
      Number(compra.total)
    )}. Motivo: ${motivo.trim()}.`,
    entidad: "Compra",
    entidadId: compraId,
    detalle: { folio: compra.numeroComprobante, total: Number(compra.total), motivo: motivo.trim() },
  });

  revalidatePath("/admin/stock/compras");
  revalidatePath(`/admin/stock/compras/${compraId}`);
  revalidatePath("/admin/stock/insumos");
  return { ok: true };
}
