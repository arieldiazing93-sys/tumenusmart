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

/**
 * Vacío o inválido = costo desconocido (null), no cero — un agregado
 * gratis de verdad es un caso raro y se puede escribir "0" a mano; lo
 * común es no saberlo todavía, y ahí el reporte de Rentabilidad tiene que
 * poder distinguir "no cuesta nada" de "no lo cargaron".
 */
function parsearCosto(formData: FormData): number | null {
  const crudo = String(formData.get("costo") ?? "").trim();
  return crudo && !isNaN(parseFloat(crudo)) ? parseFloat(crudo) : null;
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

export async function agregarOpcion(
  productId: string,
  formData: FormData
): Promise<ResultadoProducto> {
  await exigirPermiso("productos.editar");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const nombre = String(formData.get("nombre") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "agregado");
  const precioExtra = parseFloat(String(formData.get("precioExtra") ?? "0")) || 0;
  const costo = parsearCosto(formData);

  if (!nombre) return { ok: false, error: "El nombre de la opción es obligatorio" };

  await prisma.productOption.create({
    data: { productId, nombre, tipo, precioExtra, costo, storeId: idLocal },
  });
  revalidatePath(`/admin/productos/${productId}`);
  return { ok: true };
}

/**
 * Cambia el costo de un agregado/variante que ya existe.
 *
 * Separado de `agregarOpcion` a propósito: cuando este campo se agregó, los
 * agregados creados antes se quedaron sin costo cargado y no había forma de
 * completarlo salvo borrar y crear de nuevo (perdiendo también el precio
 * extra ya configurado). Esto deja corregir solo el costo, sin tocar lo
 * demás.
 */
export async function actualizarCostoOpcion(
  productId: string,
  optionId: string,
  formData: FormData
): Promise<ResultadoProducto> {
  await exigirPermiso("productos.editar");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  const costo = parsearCosto(formData);

  // El `where` con productId de más, aparte de optionId, es defensa en
  // profundidad: sin él, alguien podría mandar el id de una opción de OTRO
  // producto (de este mismo local) y pisarle el costo desde este formulario.
  const resultado = await prisma.productOption.updateMany({
    where: { id: optionId, productId },
    data: { costo },
  });
  if (resultado.count === 0) {
    return { ok: false, error: "Esa opción no existe o no es de este producto" };
  }

  revalidatePath(`/admin/productos/${productId}`);
  return { ok: true };
}

/**
 * Corrige el nombre de un agregado/variante ya creado — para el típico "lo
 * escribí mal", sin tener que borrarlo y perder el precio/costo ya cargados.
 */
export async function actualizarNombreOpcion(
  productId: string,
  optionId: string,
  formData: FormData
): Promise<ResultadoProducto> {
  await exigirPermiso("productos.editar");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { ok: false, error: "El nombre no puede quedar vacío" };

  // El `where` con productId de más, aparte de optionId, es defensa en
  // profundidad: ver el mismo comentario en `actualizarCostoOpcion`.
  const resultado = await prisma.productOption.updateMany({
    where: { id: optionId, productId },
    data: { nombre },
  });
  if (resultado.count === 0) {
    return { ok: false, error: "Esa opción no existe o no es de este producto" };
  }

  revalidatePath(`/admin/productos/${productId}`);
  return { ok: true };
}

/**
 * Cambia el precio extra (lo que le cobra al cliente) de un agregado/variante
 * que ya existe — mismo criterio que `actualizarCostoOpcion`, separado para
 * no tener que borrar y crear de nuevo un agregado por corregir el precio.
 * A diferencia del costo, acá vacío/inválido cae en 0 y no en null: el
 * precio de venta lo pone el propio dueño, nunca es "un dato que falta".
 */
export async function actualizarPrecioExtraOpcion(
  productId: string,
  optionId: string,
  formData: FormData
): Promise<ResultadoProducto> {
  await exigirPermiso("productos.editar");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  const precioExtra = parseFloat(String(formData.get("precioExtra") ?? "0")) || 0;

  // El `where` con productId de más, aparte de optionId, es defensa en
  // profundidad: ver el mismo comentario en `actualizarCostoOpcion`.
  const resultado = await prisma.productOption.updateMany({
    where: { id: optionId, productId },
    data: { precioExtra },
  });
  if (resultado.count === 0) {
    return { ok: false, error: "Esa opción no existe o no es de este producto" };
  }

  revalidatePath(`/admin/productos/${productId}`);
  return { ok: true };
}

/**
 * Cambia el IVA de un agregado/variante que ya existe — mismo criterio que
 * `actualizarCostoOpcion`. Ver el comentario de ProductOption.iva en el
 * schema: hoy el ticket sigue facturando toda la línea a la tasa del
 * producto principal, esto solo deja cargar el dato para cuando la futura
 * API de factura electrónica lo necesite por agregado.
 */
export async function actualizarIvaOpcion(
  productId: string,
  optionId: string,
  formData: FormData
): Promise<ResultadoProducto> {
  await exigirPermiso("productos.editar");
  const prisma = prismaDelLocal(await idLocalActual());

  const iva = normalizarIva(formData.get("iva"));

  const resultado = await prisma.productOption.updateMany({
    where: { id: optionId, productId },
    data: { iva },
  });
  if (resultado.count === 0) {
    return { ok: false, error: "Esa opción no existe o no es de este producto" };
  }

  revalidatePath(`/admin/productos/${productId}`);
  return { ok: true };
}

/**
 * Cambia la unidad de medida de un agregado/variante que ya existe — mismo
 * criterio que `actualizarIvaOpcion`.
 */
export async function actualizarUnidadMedidaOpcion(
  productId: string,
  optionId: string,
  formData: FormData
): Promise<ResultadoProducto> {
  await exigirPermiso("productos.editar");
  const prisma = prismaDelLocal(await idLocalActual());

  const unidadMedida = normalizarUnidadMedida(formData.get("unidadMedida"));

  const resultado = await prisma.productOption.updateMany({
    where: { id: optionId, productId },
    data: { unidadMedida },
  });
  if (resultado.count === 0) {
    return { ok: false, error: "Esa opción no existe o no es de este producto" };
  }

  revalidatePath(`/admin/productos/${productId}`);
  return { ok: true };
}

export async function eliminarOpcion(productId: string, optionId: string) {
  await exigirPermiso("productos.editar");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  await prisma.productOption.delete({ where: { id: optionId } });
  revalidatePath(`/admin/productos/${productId}`);
}

export type ResultadoAplicarAgregados =
  | { ok: true; productosActualizados: number; agregadosCreados: number; productosSinCambios: number }
  | { ok: false; error: string };

/**
 * Copia TODOS los agregados de este producto a los demás productos de la
 * MISMA categoría — para no cargar a mano los mismos 6-7 agregados en cada
 * uno de los 15-20 productos de una categoría como "Hamburguesas".
 *
 * No duplica: si un producto destino ya tiene un agregado con ese nombre
 * (comparado sin mayúsculas ni espacios de más), ese no se vuelve a crear —
 * así se puede apretar el botón de nuevo después de sumar un agregado más
 * sin pisar precios ya corregidos a mano en los demás productos.
 */
export async function aplicarAgregadosACategoria(
  productId: string
): Promise<ResultadoAplicarAgregados> {
  await exigirPermiso("productos.editar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const producto = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      categoryId: true,
      opciones: {
        select: {
          nombre: true,
          tipo: true,
          precioExtra: true,
          costo: true,
          iva: true,
          unidadMedida: true,
        },
      },
    },
  });
  if (!producto) return { ok: false, error: "No encontré el producto" };
  if (producto.opciones.length === 0) {
    return { ok: false, error: "Este producto todavía no tiene agregados para copiar" };
  }

  const productosDestino = await prisma.product.findMany({
    where: { categoryId: producto.categoryId, id: { not: productId } },
    select: { id: true, opciones: { select: { nombre: true } } },
  });
  if (productosDestino.length === 0) {
    return { ok: false, error: "No hay otros productos en esta categoría" };
  }

  let agregadosCreados = 0;
  let productosActualizados = 0;
  const escrituras: ReturnType<typeof prisma.productOption.createMany>[] = [];

  for (const destino of productosDestino) {
    const yaTiene = new Set(destino.opciones.map((o) => o.nombre.trim().toLowerCase()));
    const faltantes = producto.opciones.filter(
      (o) => !yaTiene.has(o.nombre.trim().toLowerCase())
    );
    if (faltantes.length === 0) continue;

    escrituras.push(
      prisma.productOption.createMany({
        data: faltantes.map((o) => ({
          productId: destino.id,
          storeId: idLocal,
          nombre: o.nombre,
          tipo: o.tipo,
          precioExtra: o.precioExtra,
          costo: o.costo,
          iva: o.iva,
          unidadMedida: o.unidadMedida,
        })),
      })
    );
    agregadosCreados += faltantes.length;
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
    agregadosCreados,
    productosSinCambios: productosDestino.length - productosActualizados,
  };
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

/**
 * Sube o baja un agregado DENTRO de su producto.
 *
 * Mismo criterio que `moverProducto`: se reordena solo entre hermanos (los
 * agregados del MISMO producto) y se renumera toda la lista, no solo los dos
 * que se tocaron — los agregados cargados hasta ahora tienen todos
 * `orden = 0`, así que intercambiar dos valores iguales no movería nada.
 */
export async function moverOpcion(id: string, direccion: Direccion) {
  await exigirPermiso("productos.editar");
  const prisma = prismaDelLocal(await idLocalActual());

  const opcion = await prisma.productOption.findUnique({
    where: { id },
    select: { productId: true },
  });
  if (!opcion) return;

  const opciones = await prisma.productOption.findMany({
    where: { productId: opcion.productId },
    orderBy: [{ orden: "asc" }, { id: "asc" }],
    select: { id: true, orden: true },
  });

  const indice = opciones.findIndex((o) => o.id === id);
  if (indice === -1) return;

  const nuevoOrden = moverEnLista(
    opciones.map((o) => o.id),
    indice,
    direccion
  );
  const cambios = cambiosDeOrden(
    nuevoOrden,
    new Map(opciones.map((o) => [o.id, o.orden]))
  );
  if (cambios.length === 0) return;

  await prisma.$transaction(
    cambios.map((c) =>
      prisma.productOption.update({ where: { id: c.id }, data: { orden: c.orden } })
    )
  );

  revalidatePath(`/admin/productos/${opcion.productId}`);
  revalidatePath("/[slug]", "layout");
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
