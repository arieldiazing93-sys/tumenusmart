"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal, type PrismaLocal } from "@/lib/prisma-local";
import { registrarBitacora } from "@/lib/bitacora";
import { CORRELATIVO_MAXIMO_INTERNO, generarEan13Interno, validarCodigoDeBarras, variantesDeCodigo } from "@/lib/codigo-barras";

/**
 * Los códigos de barras de los productos: asignar el que se escaneó (o se escribió), generar uno propio, generar los que faltan y quitar.
 *
 * Todo es del permiso `productos.editar` (asignar un código cambia qué producto se vende al escanear) y queda en la Bitácora. Un producto lleva
 * UN solo código y un código no se repite dentro del local. Todas las consultas van por el cliente del local, así que un producto de otro
 * negocio no aparece nunca.
 */

export type ResultadoCodigoProducto =
  | { ok: true; codigo: string | null }
  // `conflicto`: el producto que YA tiene ese código (para ofrecer pasárselo a este).
  | { ok: false; error: string; conflicto?: { id: string; nombre: string } };

/** Cuántos productos sin código se completan por vez con «Generar los que faltan». */
const LOTE_DE_GENERACION = 500;

function esCodigoRepetido(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function refrescarPantallas() {
  revalidatePath("/admin/codigos-barras");
  revalidatePath("/admin/productos");
}

/** El producto (de este local) al que se le va a tocar el código. Un servicio no lleva código: no hay nada que escanear. */
async function productoParaCodigo(db: PrismaLocal, productId: string) {
  const producto = await db.product.findFirst({
    where: { id: String(productId ?? "") },
    select: { id: true, nombre: true, esServicio: true, codigoBarras: true },
  });
  if (!producto) return { ok: false, error: "No se encontró ese producto." } as const;
  if (producto.esServicio) return { ok: false, error: "Un servicio no lleva código de barras." } as const;
  return { ok: true, producto } as const;
}

/**
 * El próximo código propio libre del local: toma el siguiente correlativo y lo arma (EAN-13 que empieza con 2). Si justo ese código ya lo tiene
 * un producto (alguien lo escaneó o lo escribió a mano), salta al siguiente.
 */
async function tomarCodigoPropioLibre(idLocal: string, db: PrismaLocal): Promise<string> {
  for (let intento = 0; intento < 25; intento++) {
    // El incremento lo resuelve la base: dos cajas que generen a la vez reciben números distintos.
    const { contadorCodigosInternos } = await prisma.store.update({
      where: { id: idLocal },
      data: { contadorCodigosInternos: { increment: 1 } },
      select: { contadorCodigosInternos: true },
    });
    if (contadorCodigosInternos > CORRELATIVO_MAXIMO_INTERNO) throw new Error("Se acabaron los códigos propios de este local.");
    const codigo = generarEan13Interno(contadorCodigosInternos);
    const ocupado = await db.product.findFirst({ where: { codigoBarras: codigo }, select: { id: true } });
    if (!ocupado) return codigo;
  }
  throw new Error("No se pudo encontrar un código libre. Probá de nuevo.");
}

/**
 * Guarda en un producto el código que se escaneó o se escribió. Si el código ya lo tiene OTRO producto, no lo pisa: avisa cuál es (y con
 * `moverDeOtro` se lo pasa a este, sacándoselo al otro). Si este producto ya tenía un código, lo reemplaza.
 */
export async function asignarCodigoProducto(
  productId: string,
  texto: string,
  moverDeOtro = false
): Promise<ResultadoCodigoProducto> {
  const sesion = await exigirPermiso("productos.editar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const valido = validarCodigoDeBarras(texto);
  if (!valido.ok) return { ok: false, error: valido.error };
  const codigo = valido.codigo;

  const buscado = await productoParaCodigo(db, productId);
  if (!buscado.ok) return { ok: false, error: buscado.error };
  const { producto } = buscado;
  if (producto.codigoBarras === codigo) return { ok: true, codigo };

  // ¿Lo tiene otro producto? (También se mira la otra forma de escribirlo: un UPC-A de 12 dígitos es el EAN-13 con un 0 adelante.)
  const otro = await db.product.findFirst({
    where: { codigoBarras: { in: variantesDeCodigo(codigo) }, NOT: { id: producto.id } },
    select: { id: true, nombre: true, codigoBarras: true },
  });
  if (otro && !moverDeOtro) {
    return { ok: false, error: `Ese código ya lo tiene «${otro.nombre}».`, conflicto: { id: otro.id, nombre: otro.nombre } };
  }

  try {
    if (otro) await db.product.updateMany({ where: { id: otro.id }, data: { codigoBarras: null } });
    await db.product.updateMany({ where: { id: producto.id }, data: { codigoBarras: codigo } });
  } catch (err) {
    if (esCodigoRepetido(err)) return { ok: false, error: "Ese código ya lo tiene otro producto." };
    throw err;
  }

  await registrarBitacora(idLocal, sesion, {
    modulo: "productos",
    accion: otro ? "codigo_barras_movido" : producto.codigoBarras ? "codigo_barras_cambiado" : "codigo_barras_asignado",
    descripcion: otro
      ? `Pasó el código de barras ${codigo} de ${otro.nombre} a ${producto.nombre}.`
      : producto.codigoBarras
        ? `Cambió el código de barras de ${producto.nombre}: de ${producto.codigoBarras} a ${codigo}.`
        : `Asignó el código de barras ${codigo} a ${producto.nombre}.`,
    entidad: "Product",
    entidadId: producto.id,
    detalle: { producto: producto.nombre, codigo, anterior: producto.codigoBarras, deOtroProducto: otro?.nombre ?? null },
  });
  refrescarPantallas();
  return { ok: true, codigo };
}

/** Le genera a un producto sin código uno propio (EAN-13 que empieza con 2), para imprimirle la etiqueta. */
export async function generarCodigoProducto(productId: string): Promise<ResultadoCodigoProducto> {
  const sesion = await exigirPermiso("productos.editar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const buscado = await productoParaCodigo(db, productId);
  if (!buscado.ok) return { ok: false, error: buscado.error };
  const { producto } = buscado;
  if (producto.codigoBarras) return { ok: false, error: "Ese producto ya tiene un código. Quitáselo primero si querés generar otro." };

  let codigo: string;
  try {
    codigo = await tomarCodigoPropioLibre(idLocal, db);
    const r = await db.product.updateMany({ where: { id: producto.id, codigoBarras: null }, data: { codigoBarras: codigo } });
    if (r.count === 0) return { ok: false, error: "El producto cambió mientras se generaba el código. Probá de nuevo." };
  } catch (err) {
    if (esCodigoRepetido(err)) return { ok: false, error: "Se cruzó con otro código. Probá de nuevo." };
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo generar el código." };
  }

  await registrarBitacora(idLocal, sesion, {
    modulo: "productos",
    accion: "codigo_barras_generado",
    descripcion: `Generó el código de barras propio ${codigo} para ${producto.nombre}.`,
    entidad: "Product",
    entidadId: producto.id,
    detalle: { producto: producto.nombre, codigo },
  });
  refrescarPantallas();
  return { ok: true, codigo };
}

export type ResultadoGeneracion =
  | { ok: true; generados: number; pendientes: number }
  | { ok: false; error: string };

/**
 * Completa de una vez los productos sin código con códigos propios (hasta 500 por vez; si quedan, se vuelve a tocar). No toca los que ya
 * tienen uno, ni los servicios.
 */
export async function generarCodigosFaltantes(): Promise<ResultadoGeneracion> {
  const sesion = await exigirPermiso("productos.editar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const sinCodigo = await db.product.findMany({
    where: { codigoBarras: null, esServicio: false },
    orderBy: [{ orden: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    take: LOTE_DE_GENERACION,
    select: { id: true, nombre: true },
  });
  if (sinCodigo.length === 0) return { ok: true, generados: 0, pendientes: 0 };

  let generados = 0;
  try {
    // Se reserva todo el tramo de números de una vez (un solo incremento) y se reparte en orden.
    const { contadorCodigosInternos: fin } = await prisma.store.update({
      where: { id: idLocal },
      data: { contadorCodigosInternos: { increment: sinCodigo.length } },
      select: { contadorCodigosInternos: true },
    });
    const inicio = fin - sinCodigo.length + 1;
    if (fin > CORRELATIVO_MAXIMO_INTERNO) return { ok: false, error: "Se acabaron los códigos propios de este local." };
    const candidatos = sinCodigo.map((_, i) => generarEan13Interno(inicio + i));
    const yaUsados = new Set(
      (await db.product.findMany({ where: { codigoBarras: { in: candidatos } }, select: { codigoBarras: true } })).map((p) => p.codigoBarras)
    );
    for (let i = 0; i < sinCodigo.length; i++) {
      let codigo = candidatos[i];
      // Si ese número justo ya lo usa otro producto (escaneado a mano), se le da el siguiente libre.
      if (yaUsados.has(codigo)) codigo = await tomarCodigoPropioLibre(idLocal, db);
      try {
        const r = await db.product.updateMany({ where: { id: sinCodigo[i].id, codigoBarras: null }, data: { codigoBarras: codigo } });
        generados += r.count;
      } catch (err) {
        if (!esCodigoRepetido(err)) throw err;
      }
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudieron generar los códigos." };
  }

  const pendientes = await db.product.count({ where: { codigoBarras: null, esServicio: false } });
  await registrarBitacora(idLocal, sesion, {
    modulo: "productos",
    accion: "codigos_barras_generados",
    descripcion: `Generó ${generados} códigos de barras propios para productos que no tenían.`,
    detalle: { generados, pendientes },
  });
  refrescarPantallas();
  return { ok: true, generados, pendientes };
}

/** Le saca el código a un producto. */
export async function quitarCodigoProducto(productId: string): Promise<ResultadoCodigoProducto> {
  const sesion = await exigirPermiso("productos.editar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const buscado = await productoParaCodigo(db, productId);
  if (!buscado.ok) return { ok: false, error: buscado.error };
  const { producto } = buscado;
  if (!producto.codigoBarras) return { ok: true, codigo: null };

  await db.product.updateMany({ where: { id: producto.id }, data: { codigoBarras: null } });
  await registrarBitacora(idLocal, sesion, {
    modulo: "productos",
    accion: "codigo_barras_quitado",
    descripcion: `Le quitó el código de barras ${producto.codigoBarras} a ${producto.nombre}.`,
    entidad: "Product",
    entidadId: producto.id,
    detalle: { producto: producto.nombre, codigo: producto.codigoBarras },
  });
  refrescarPantallas();
  return { ok: true, codigo: null };
}
