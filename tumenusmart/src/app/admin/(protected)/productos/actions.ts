"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal, type PrismaLocal } from "@/lib/prisma-local";
import { moverEnLista, cambiosDeOrden, type Direccion } from "@/lib/ordenar";
import { subirImagenProducto } from "@/lib/supabase-storage";
import { normalizarIva } from "@/lib/iva";
import { normalizarUnidadMedida, etiquetaUnidadMedida } from "@/lib/unidad-medida";

export type ResultadoFoto = { ok: true; url: string } | { ok: false; error: string };

/**
 * Devuelve un resultado en vez de lanzar el error de "sin imagen": Next.js
 * oculta en producción el mensaje de cualquier `throw` que salga de una
 * Server Action, así que el motivo real solo llega si viaja en el retorno.
 */
export async function subirFotoProducto(formData: FormData): Promise<ResultadoFoto> {
  await exigirPermiso("productos.editar");
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File)) {
    return { ok: false, error: "No se recibió ninguna imagen" };
  }
  const url = await subirImagenProducto(archivo);
  return { ok: true, url };
}

function parsearIngredientes(formData: FormData): string[] {
  const crudo = String(formData.get("ingredientes") ?? "[]");
  try {
    const lista = JSON.parse(crudo);
    if (!Array.isArray(lista)) return [];
    return lista
      .map((x) => String(x).trim())
      .filter((x) => x.length > 0);
  } catch {
    return [];
  }
}


/**
 * El almacén del que descuenta la receta del producto. Tiene que ser de este
 * local (al ir por el cliente del local, uno de otro negocio no aparece); si
 * viene vacío o ya no existe, queda sin almacén elegido, que en la venta
 * significa "el almacén principal".
 */
async function leerAlmacen(prisma: PrismaLocal, formData: FormData): Promise<string | null> {
  const id = String(formData.get("almacenId") ?? "").trim();
  if (!id) return null;
  const almacen = await prisma.almacen.findUnique({ where: { id }, select: { id: true } });
  return almacen?.id ?? null;
}

export type ResultadoProducto = { ok: true } | { ok: false; error: string };

/**
 * Devuelve un resultado en vez de lanzar el error de "faltan datos": Next.js
 * oculta en producción el mensaje de cualquier `throw` que salga de una
 * Server Action. Este formulario todavía se envía directo (sin un
 * componente cliente intermedio), así que hoy nadie lee este valor de
 * retorno — pero evita que una validación fallida rompa la pantalla entera,
 * que es el riesgo más grave de los dos.
 */
export async function crearProducto(formData: FormData): Promise<ResultadoProducto | void> {
  await exigirPermiso("productos.editar");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const nombre = String(formData.get("nombre") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "");
  const areaImpresionId = String(formData.get("areaImpresionId") ?? "").trim() || null;
  const precio = parseFloat(String(formData.get("precio") ?? "0"));

  if (!nombre || !categoryId || isNaN(precio)) {
    return { ok: false, error: "Faltan datos obligatorios" };
  }

  const almacenId = await leerAlmacen(prisma, formData);

  const producto = await prisma.product.create({
    data: {
      nombre,
      categoryId,
      areaImpresionId,
      almacenId,
      precio,
      descripcion: String(formData.get("descripcion") ?? "") || null,
      imagenUrl: String(formData.get("imagenUrl") ?? "") || null,
      disponible: formData.get("disponible") === "on",
      destacado: formData.get("destacado") === "on",
      ingredientes: parsearIngredientes(formData),
      storeId: idLocal,
    },
  });

  revalidatePath("/admin/productos");
  revalidatePath("/[slug]", "layout");
  // Vuelve a la lista de la misma categoría (no al detalle del producto)
  // para poder seguir cargando productos sin ir y venir entre pantallas.
  redirect(`/admin/productos?categoria=${producto.categoryId}&guardado=1`);
}

export async function actualizarProducto(
  productId: string,
  formData: FormData
): Promise<ResultadoProducto | void> {
  await exigirPermiso("productos.editar");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  const nombre = String(formData.get("nombre") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "");
  const areaImpresionId = String(formData.get("areaImpresionId") ?? "").trim() || null;
  const precio = parseFloat(String(formData.get("precio") ?? "0"));

  if (!nombre || !categoryId || isNaN(precio)) {
    return { ok: false, error: "Faltan datos obligatorios" };
  }

  const mitadYMitadGrupo = String(formData.get("mitadYMitadGrupo") ?? "").trim() || null;
  const mitadYMitadModo =
    String(formData.get("mitadYMitadModo") ?? "mayor") === "proporcional"
      ? "proporcional"
      : "mayor";
  const iva = normalizarIva(formData.get("iva"));
  const unidadMedida = normalizarUnidadMedida(formData.get("unidadMedida"));
  const almacenId = await leerAlmacen(prisma, formData);

  // El costo ya no se carga acá: sale de la receta (ver costo-receta.ts). Por
  // eso el `update` no lo toca — un costo cargado a mano antes se conserva.
  await prisma.product.update({
    where: { id: productId },
    data: {
      nombre,
      categoryId,
      areaImpresionId,
      almacenId,
      precio,
      descripcion: String(formData.get("descripcion") ?? "") || null,
      imagenUrl: String(formData.get("imagenUrl") ?? "") || null,
      disponible: formData.get("disponible") === "on",
      destacado: formData.get("destacado") === "on",
      ingredientes: parsearIngredientes(formData),
      mitadYMitadGrupo,
      mitadYMitadModo,
      iva,
      unidadMedida,
    },
  });

  revalidatePath("/admin/productos");
  revalidatePath(`/admin/productos/${productId}`);
  revalidatePath("/[slug]", "layout");
  redirect(`/admin/productos/${productId}?guardado=1`);
}

/**
 * Mismo criterio que `eliminarZona` para las zonas de envío: si el producto
 * ya aparece en algún pedido (aunque esté cancelado), no se borra. Borrarlo
 * dejaría el `OrderItem` de ese pedido viejo sin producto (`productId` en
 * null) y el reporte de Rentabilidad lo empezaría a tratar como un combo sin
 * costo — el margen de esa venta pasada se vuelve "desconocido" de la nada.
 * En vez de eso, se le pide al dueño que lo marque "No disponible": deja de
 * venderse en la carta pública sin tocar ni un dato de lo ya vendido.
 */
export async function eliminarProducto(productId: string): Promise<ResultadoProducto> {
  await exigirPermiso("productos.editar");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  const pedidosConEsteProducto = await prisma.orderItem.count({ where: { productId } });
  if (pedidosConEsteProducto > 0) {
    return {
      ok: false,
      error: `No se puede borrar: hay ${pedidosConEsteProducto} pedido(s) que incluyen este producto en su historial. Si ya no lo querés vender, marcalo como "No disponible" en el formulario de arriba — así dejás de venderlo sin perder ese historial en los reportes.`,
    };
  }

  await prisma.product.delete({ where: { id: productId } });
  revalidatePath("/admin/productos");
  redirect("/admin/productos");
}

/**
 * Solo queda para poder LIMPIAR agregados propios cargados antes de que
 * existieran los Grupos de agregados (ver GruposAgregadosProducto.tsx) —
 * ya no hay forma de crear ni editar uno nuevo así, solo de sacarlo.
 */
export async function eliminarOpcion(productId: string, optionId: string) {
  await exigirPermiso("productos.editar");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  await prisma.productOption.delete({ where: { id: optionId } });
  revalidatePath(`/admin/productos/${productId}`);
}

/**
 * Adjunta o desadjunta un grupo de agregados reutilizable (ver
 * src/app/admin/(protected)/grupos-agregados/) a este producto. Mismo
 * patrón upsert/deleteMany que `asignarImpresoraDeArea`
 * (pos/estaciones/actions.ts) para el join Estacion↔AreaImpresion.
 */
export async function asignarGrupoAProducto(
  productId: string,
  groupId: string,
  adjunto: boolean
): Promise<ResultadoProducto> {
  await exigirPermiso("productos.editar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  if (!adjunto) {
    await prisma.productOptionGroup.deleteMany({ where: { productId, groupId } });
  } else {
    await prisma.productOptionGroup.upsert({
      where: { productId_groupId: { productId, groupId } },
      update: {},
      create: { productId, groupId, storeId: idLocal },
    });
  }

  revalidatePath(`/admin/productos/${productId}`);
  revalidatePath("/[slug]", "layout");
  return { ok: true };
}

export type ResultadoAplicarGrupos =
  | { ok: true; productosActualizados: number; adjuntosCreados: number; productosSinCambios: number }
  | { ok: false; error: string };

/**
 * Adjunta a los demás productos de la MISMA categoría todos los grupos que
 * ya tiene este producto — para armar una vez la configuración de una
 * pasta (ej: grupo "Salsas") y replicarla al resto de las pastas sin
 * repetir el tildado producto por producto. Mismo espíritu que
 * `aplicarAgregadosACategoria` (la versión vieja, para agregados propios):
 * no duplica — si un producto destino ya tiene alguno de estos grupos
 * adjuntado, ese no se vuelve a crear, así se puede apretar de nuevo
 * después de sumar un grupo más sin pisar nada.
 */
export async function aplicarGruposACategoria(
  productId: string
): Promise<ResultadoAplicarGrupos> {
  await exigirPermiso("productos.editar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const producto = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      categoryId: true,
      gruposAgregados: { select: { groupId: true } },
    },
  });
  if (!producto) return { ok: false, error: "No encontré el producto" };
  if (producto.gruposAgregados.length === 0) {
    return { ok: false, error: "Este producto todavía no tiene grupos de agregados para aplicar" };
  }

  const productosDestino = await prisma.product.findMany({
    where: { categoryId: producto.categoryId, id: { not: productId } },
    select: { id: true, gruposAgregados: { select: { groupId: true } } },
  });
  if (productosDestino.length === 0) {
    return { ok: false, error: "No hay otros productos en esta categoría" };
  }

  const gruposOrigen = producto.gruposAgregados.map((g) => g.groupId);

  let adjuntosCreados = 0;
  let productosActualizados = 0;
  const escrituras: ReturnType<typeof prisma.productOptionGroup.createMany>[] = [];

  for (const destino of productosDestino) {
    const yaTiene = new Set(destino.gruposAgregados.map((g) => g.groupId));
    const faltantes = gruposOrigen.filter((id) => !yaTiene.has(id));
    if (faltantes.length === 0) continue;

    escrituras.push(
      prisma.productOptionGroup.createMany({
        data: faltantes.map((groupId) => ({ productId: destino.id, groupId, storeId: idLocal })),
      })
    );
    adjuntosCreados += faltantes.length;
    productosActualizados++;
  }

  if (escrituras.length > 0) {
    await prisma.$transaction(escrituras);
  }

  revalidatePath("/admin/productos");
  revalidatePath("/[slug]", "layout");

  return {
    ok: true,
    productosActualizados,
    adjuntosCreados,
    productosSinCambios: productosDestino.length - productosActualizados,
  };
}

export type ResultadoCrearGrupo = { ok: true; groupId: string } | { ok: false; error: string };

/**
 * Crea un grupo de agregados nuevo y lo adjunta a este producto en el
 * mismo paso — para no tener que ir primero a /admin/grupos-agregados a
 * crearlo antes de poder buscarle modificadores. Después de esto, la
 * pantalla de producto ya puede buscar y agregarle productos (ver
 * BuscarProductoParaGrupo) sin salir de acá.
 */
export async function crearGrupoYAdjuntar(
  productId: string,
  nombreGrupo: string
): Promise<ResultadoCrearGrupo> {
  await exigirPermiso("productos.editar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const nombre = nombreGrupo.trim();
  if (!nombre) return { ok: false, error: "El nombre del grupo es obligatorio" };

  const grupo = await prisma.$transaction(async (tx) => {
    const nuevoGrupo = await tx.optionGroup.create({ data: { nombre, storeId: idLocal } });
    await tx.productOptionGroup.create({
      data: { productId, groupId: nuevoGrupo.id, storeId: idLocal },
    });
    return nuevoGrupo;
  });

  revalidatePath(`/admin/productos/${productId}`);
  revalidatePath("/admin/grupos-agregados");
  return { ok: true, groupId: grupo.id };
}

// ===========================================================================
//  Receta (Control de stock) — qué insumos descuenta este producto al
//  venderse, y cuánto de cada uno. Mismo espíritu que Grupos de agregados:
//  todo el flujo (buscar, agregar, cambiar cantidad, quitar) vive en esta
//  misma pantalla, sin pasar por /admin/stock/insumos.
// ===========================================================================

export type InsumoParaReceta = {
  id: string;
  nombre: string;
  categoriaNombre: string;
  unidadMedida: string;
};

/** Busca insumos del local para agregar a la receta — excluye los que ya están en ella. */
export async function buscarInsumosParaReceta(
  productId: string,
  query: string
): Promise<InsumoParaReceta[]> {
  await exigirPermiso("stock.ver");
  const prisma = prismaDelLocal(await idLocalActual());

  const texto = query.trim();
  if (!texto) return [];

  const yaEnReceta = await prisma.recetaItem.findMany({
    where: { productId },
    select: { insumoId: true },
  });

  const insumos = await prisma.insumo.findMany({
    where: {
      activo: true,
      nombre: { contains: texto, mode: "insensitive" },
      id: { notIn: yaEnReceta.map((r) => r.insumoId) },
    },
    orderBy: { nombre: "asc" },
    take: 10,
    select: { id: true, nombre: true, unidadMedida: true, categoria: { select: { nombre: true } } },
  });

  return insumos.map((i) => ({
    id: i.id,
    nombre: i.nombre,
    categoriaNombre: i.categoria?.nombre ?? "Sin categoría",
    unidadMedida: etiquetaUnidadMedida(i.unidadMedida),
  }));
}

/** Agrega (o, si ya estaba, corrige la cantidad de) un insumo en la receta de este producto. */
export async function asignarInsumoAProducto(
  productId: string,
  insumoId: string,
  cantidad: number
): Promise<ResultadoProducto> {
  await exigirPermiso("stock.editar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    return { ok: false, error: "La cantidad tiene que ser mayor a cero" };
  }

  await prisma.recetaItem.upsert({
    where: { productId_insumoId: { productId, insumoId } },
    update: { cantidad },
    create: { productId, insumoId, cantidad, storeId: idLocal },
  });

  revalidatePath(`/admin/productos/${productId}`);
  return { ok: true };
}

export async function quitarInsumoDeProducto(productId: string, insumoId: string) {
  await exigirPermiso("stock.editar");
  const prisma = prismaDelLocal(await idLocalActual());

  await prisma.recetaItem.deleteMany({ where: { productId, insumoId } });
  revalidatePath(`/admin/productos/${productId}`);
}

/**
 * Sube o baja un producto DENTRO de su categoría.
 *
 * Se reordena solo entre hermanos: mover una milanesa no puede alterar el
 * orden de las bebidas. Misma renumeración completa y misma transacción que
 * en categorías, y por los mismos motivos.
 */
export async function moverProducto(id: string, direccion: Direccion) {
  await exigirPermiso("productos.editar");
  const prisma = prismaDelLocal(await idLocalActual());

  const producto = await prisma.product.findUnique({
    where: { id },
    select: { categoryId: true },
  });
  if (!producto) return;

  const productos = await prisma.product.findMany({
    where: { categoryId: producto.categoryId },
    orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
    select: { id: true, orden: true },
  });

  const indice = productos.findIndex((p) => p.id === id);
  if (indice === -1) return;

  const nuevoOrden = moverEnLista(
    productos.map((p) => p.id),
    indice,
    direccion
  );
  const cambios = cambiosDeOrden(
    nuevoOrden,
    new Map(productos.map((p) => [p.id, p.orden]))
  );
  if (cambios.length === 0) return;

  await prisma.$transaction(
    cambios.map((c) =>
      prisma.product.update({ where: { id: c.id }, data: { orden: c.orden } })
    )
  );

  revalidatePath("/admin/productos");
  revalidatePath("/[slug]", "layout");
}

/**
 * Marcar un producto agotado o disponible, sin abrir el formulario.
 *
 * Es la única cosa de la carta que puede tocar un empleado, y existe por lo
 * que pasa todos los días en el medio del servicio: se acaba la muzzarella.
 * Si hubiera que entrar a editar el producto, el empleado necesitaría permiso
 * para cambiar precios — y ahí ya no hay nivel intermedio posible.
 *
 * Solo toca esa columna. No puede cambiar precio, nombre ni nada más, aunque
 * alguien llame a esta acción desde afuera del panel.
 */
export async function alternarDisponibleProducto(id: string, disponible: boolean) {
  await exigirPermiso("productos.disponibilidad");
  const prisma = prismaDelLocal(await idLocalActual());

  await prisma.product.update({ where: { id }, data: { disponible } });

  revalidatePath("/admin/productos");
  revalidatePath("/[slug]", "layout");
}
