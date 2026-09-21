"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { moverEnLista, cambiosDeOrden, type Direccion } from "@/lib/ordenar";
import { subirImagenProducto } from "@/lib/supabase-storage";
import { normalizarIva } from "@/lib/iva";
import { normalizarUnidadMedida } from "@/lib/unidad-medida";

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
 * Lee el costo del formulario.
 *
 * Vacío significa "no lo sé todavía", que no es lo mismo que cero: por eso
 * devuelve null y no 0. Un cero haría creer al analista que el producto no
 * cuesta nada y que todo lo que factura es ganancia.
 */
function leerCosto(formData: FormData): number | null {
  const crudo = String(formData.get("costo") ?? "").trim();
  if (!crudo) return null;
  const valor = parseFloat(crudo);
  if (isNaN(valor) || valor < 0) return null;
  return valor;
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

  const producto = await prisma.product.create({
    data: {
      nombre,
      categoryId,
      areaImpresionId,
      precio,
      descripcion: String(formData.get("descripcion") ?? "") || null,
      imagenUrl: String(formData.get("imagenUrl") ?? "") || null,
      disponible: formData.get("disponible") === "on",
      destacado: formData.get("destacado") === "on",
      ingredientes: parsearIngredientes(formData),
      costo: leerCosto(formData),
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

  await prisma.product.update({
    where: { id: productId },
    data: {
      nombre,
      categoryId,
      areaImpresionId,
      precio,
      descripcion: String(formData.get("descripcion") ?? "") || null,
      imagenUrl: String(formData.get("imagenUrl") ?? "") || null,
      disponible: formData.get("disponible") === "on",
      destacado: formData.get("destacado") === "on",
      ingredientes: parsearIngredientes(formData),
      costo: leerCosto(formData),
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
