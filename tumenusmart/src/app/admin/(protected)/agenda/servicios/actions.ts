"use server";

import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { registrarBitacora } from "@/lib/bitacora";
import { formatearGuarani } from "@/lib/format";
import { normalizarIva } from "@/lib/iva";
import { idLocalActual } from "@/lib/local-actual";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal, type PrismaLocal } from "@/lib/prisma-local";
import {
  DURACION_MAXIMA_MIN,
  MINUTOS_BUFER,
  normalizarColor,
  normalizarTipoPrecio,
  type TipoPrecio,
} from "@/lib/servicios-agenda";

export type ResultadoServicio = { ok: true } | { ok: false; error: string };
export type ResultadoCategoriaServicio = { ok: true; id: string } | { ok: false; error: string };

const LARGO_MAXIMO_NOMBRE = 80;
/** El precio se guarda con Decimal(10,2): hasta 99.999.999 de guaraníes. */
const PRECIO_MAXIMO = 99_999_999;

function texto(valor: FormDataEntryValue | null): string {
  return String(valor ?? "").trim();
}

function refrescarPantallas() {
  revalidatePath("/admin/agenda/servicios");
  revalidatePath("/admin/agenda/personal");
  // Un servicio es un producto: aparece también en el punto de venta y en Productos.
  revalidatePath("/admin/productos");
  revalidatePath("/admin/pos");
}

// ---------------------------------------------------------------------------
//  Categorías de servicios
// ---------------------------------------------------------------------------

export async function crearCategoriaServicio(nombre: string): Promise<ResultadoCategoriaServicio> {
  const sesion = await exigirPermiso("agenda.configurar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const limpio = nombre.trim();
  if (!limpio) return { ok: false, error: "El nombre es obligatorio" };
  if (limpio.length > 60) return { ok: false, error: "El nombre puede tener hasta 60 letras" };

  const repetida = await db.category.findFirst({
    where: { paraServicios: true, nombre: { equals: limpio, mode: "insensitive" } },
    select: { id: true },
  });
  if (repetida) return { ok: false, error: "Ya hay una categoría de servicios con ese nombre" };

  const ultima = await db.category.findFirst({ orderBy: { orden: "desc" }, select: { orden: true } });
  const creada = await db.category.create({
    data: { storeId: idLocal, nombre: limpio, orden: (ultima?.orden ?? 0) + 1, paraServicios: true },
    select: { id: true },
  });

  await registrarBitacora(idLocal, sesion, {
    modulo: "agenda",
    accion: "categoria_servicio_creada",
    descripcion: `Creó la categoría de servicios ${limpio}.`,
    entidad: "Category",
    entidadId: creada.id,
  });

  refrescarPantallas();
  return { ok: true, id: creada.id };
}

export async function renombrarCategoriaServicio(id: string, nombre: string): Promise<ResultadoServicio> {
  await exigirPermiso("agenda.configurar");
  const db = prismaDelLocal(await idLocalActual());

  const limpio = nombre.trim();
  if (!limpio) return { ok: false, error: "El nombre es obligatorio" };
  if (limpio.length > 60) return { ok: false, error: "El nombre puede tener hasta 60 letras" };

  const repetida = await db.category.findFirst({
    where: { paraServicios: true, id: { not: id }, nombre: { equals: limpio, mode: "insensitive" } },
    select: { id: true },
  });
  if (repetida) return { ok: false, error: "Ya hay una categoría de servicios con ese nombre" };

  const cambiadas = await db.category.updateMany({ where: { id, paraServicios: true }, data: { nombre: limpio } });
  if (cambiadas.count === 0) return { ok: false, error: "Esa categoría ya no existe" };

  refrescarPantallas();
  return { ok: true };
}

export async function eliminarCategoriaServicio(id: string): Promise<ResultadoServicio> {
  const sesion = await exigirPermiso("agenda.configurar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const categoria = await db.category.findFirst({ where: { id, paraServicios: true }, select: { nombre: true } });
  if (!categoria) return { ok: false, error: "Esa categoría ya no existe" };

  const conServicios = await db.product.count({ where: { categoryId: id } });
  if (conServicios > 0) {
    return { ok: false, error: "No se puede borrar: todavía tiene servicios. Eliminalos o pasalos a otra categoría primero." };
  }

  await db.category.deleteMany({ where: { id, paraServicios: true } });
  await registrarBitacora(idLocal, sesion, {
    modulo: "agenda",
    accion: "categoria_servicio_eliminada",
    descripcion: `Eliminó la categoría de servicios ${categoria.nombre}.`,
    entidad: "Category",
    entidadId: id,
  });

  refrescarPantallas();
  return { ok: true };
}

// ---------------------------------------------------------------------------
//  Servicios
// ---------------------------------------------------------------------------

type DatosServicio = {
  nombre: string;
  categoryId: string;
  personalIds: string[];
  duracionMin: number;
  bufferMin: number;
  tipoPrecio: TipoPrecio;
  precio: number;
  iva: string;
  color: string;
};

/**
 * Lee y valida lo que mandó el formulario. Nada se guarda tal cual: la
 * categoría y el personal que vienen del navegador se verifican por el cliente
 * del local (los de otro negocio simplemente no aparecen).
 */
async function leerDatosServicio(
  db: PrismaLocal,
  formData: FormData
): Promise<{ ok: true; datos: DatosServicio } | { ok: false; error: string }> {
  const nombre = texto(formData.get("nombre"));
  if (!nombre) return { ok: false, error: "El nombre del servicio es obligatorio" };
  if (nombre.length > LARGO_MAXIMO_NOMBRE) {
    return { ok: false, error: `El nombre puede tener hasta ${LARGO_MAXIMO_NOMBRE} letras` };
  }

  const categoryId = texto(formData.get("categoryId"));
  const categoria = categoryId
    ? await db.category.findFirst({ where: { id: categoryId, paraServicios: true }, select: { id: true } })
    : null;
  if (!categoria) return { ok: false, error: "Elegí una categoría para el servicio" };

  const personalIds = [...new Set(formData.getAll("personalId").map((v) => String(v)))].filter(Boolean);
  if (personalIds.length === 0) return { ok: false, error: "Elegí quién realiza el servicio" };
  const existentes = await db.miembroPersonal.count({ where: { id: { in: personalIds } } });
  if (existentes !== personalIds.length) {
    return { ok: false, error: "Alguien del personal elegido ya no existe. Recargá la página." };
  }

  const horas = Number(texto(formData.get("horas")));
  const minutos = Number(texto(formData.get("minutos")));
  if (!Number.isInteger(horas) || !Number.isInteger(minutos) || horas < 0 || minutos < 0 || minutos > 59) {
    return { ok: false, error: "La duración no es válida" };
  }
  const duracionMin = horas * 60 + minutos;
  if (duracionMin < 5) return { ok: false, error: "La duración tiene que ser de al menos 5 minutos" };
  if (duracionMin > DURACION_MAXIMA_MIN) return { ok: false, error: "La duración no puede pasar de 12 horas" };

  let bufferMin = 0;
  if (formData.get("usaBufer") === "on") {
    bufferMin = Number(texto(formData.get("bufferMin")));
    if (!(MINUTOS_BUFER as readonly number[]).includes(bufferMin)) {
      return { ok: false, error: "El tiempo de búfer no es válido" };
    }
  }

  const precioEscrito = texto(formData.get("precio")).replace(/\D/g, "");
  if (!precioEscrito) return { ok: false, error: "Ingresá el monto del servicio" };
  const precio = Number(precioEscrito);
  if (!Number.isFinite(precio) || precio > PRECIO_MAXIMO) return { ok: false, error: "El monto no es válido" };

  return {
    ok: true,
    datos: {
      nombre,
      categoryId: categoria.id,
      personalIds,
      duracionMin,
      bufferMin,
      tipoPrecio: normalizarTipoPrecio(formData.get("tipoPrecio")),
      precio,
      iva: normalizarIva(formData.get("iva")),
      color: normalizarColor(formData.get("color")),
    },
  };
}

export async function crearServicio(formData: FormData): Promise<ResultadoServicio> {
  const sesion = await exigirPermiso("agenda.configurar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const leido = await leerDatosServicio(db, formData);
  if (!leido.ok) return leido;
  const d = leido.datos;

  // El servicio es un producto marcado como servicio: así se vende en el punto
  // de venta y se factura (con su IVA, y como "prestación de servicios" en la
  // factura electrónica) sin duplicar nada.
  const producto = await db.product.create({
    data: {
      storeId: idLocal,
      categoryId: d.categoryId,
      nombre: d.nombre,
      precio: d.precio,
      iva: d.iva,
      unidadMedida: "unidad",
      esServicio: true,
      disponible: true,
      servicioAgenda: {
        create: {
          storeId: idLocal,
          duracionMin: d.duracionMin,
          bufferMin: d.bufferMin,
          tipoPrecio: d.tipoPrecio,
          color: d.color,
          personal: { create: d.personalIds.map((personalId) => ({ storeId: idLocal, personalId })) },
        },
      },
    },
    select: { id: true },
  });

  await registrarBitacora(idLocal, sesion, {
    modulo: "agenda",
    accion: "servicio_creado",
    descripcion: `Creó el servicio ${d.nombre} a ${formatearGuarani(d.precio)}.`,
    entidad: "Product",
    entidadId: producto.id,
    detalle: { servicio: d.nombre, precio: d.precio, duracionMin: d.duracionMin },
  });

  refrescarPantallas();
  return { ok: true };
}

export async function actualizarServicio(servicioId: string, formData: FormData): Promise<ResultadoServicio> {
  const sesion = await exigirPermiso("agenda.configurar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const anterior = await db.servicioAgenda.findFirst({
    where: { id: servicioId },
    select: { id: true, productId: true, product: { select: { nombre: true, precio: true, disponible: true } } },
  });
  if (!anterior) return { ok: false, error: "Ese servicio ya no existe." };

  const leido = await leerDatosServicio(db, formData);
  if (!leido.ok) return leido;
  const d = leido.datos;
  const activo = formData.get("activo") === "on";

  // Cliente sin filtro con el local explícito: la transacción en arreglo lo pide
  // así. La pertenencia al local ya quedó verificada arriba (anterior.productId
  // salió de una lectura por el cliente del local).
  await prisma.$transaction([
    prisma.product.update({
      where: { id: anterior.productId },
      data: { nombre: d.nombre, categoryId: d.categoryId, precio: d.precio, iva: d.iva, disponible: activo },
    }),
    prisma.servicioAgenda.update({
      where: { id: anterior.id },
      data: { duracionMin: d.duracionMin, bufferMin: d.bufferMin, tipoPrecio: d.tipoPrecio, color: d.color },
    }),
    prisma.servicioPersonal.deleteMany({ where: { servicioId: anterior.id } }),
    prisma.servicioPersonal.createMany({
      data: d.personalIds.map((personalId) => ({ storeId: idLocal, servicioId: anterior.id, personalId })),
    }),
  ]);

  const cambios: string[] = [];
  const precioAnterior = Number(anterior.product.precio);
  if (Math.round(precioAnterior) !== d.precio) {
    cambios.push(`precio ${formatearGuarani(precioAnterior)} → ${formatearGuarani(d.precio)}`);
  }
  if (anterior.product.nombre !== d.nombre) cambios.push(`nombre "${anterior.product.nombre}" → "${d.nombre}"`);
  if (anterior.product.disponible !== activo) cambios.push(activo ? "lo volvió a activar" : "lo desactivó");
  await registrarBitacora(idLocal, sesion, {
    modulo: "agenda",
    accion: "servicio_editado",
    descripcion:
      cambios.length > 0
        ? `Editó el servicio ${d.nombre}: ${cambios.join(", ")}.`
        : `Editó el servicio ${d.nombre}.`,
    entidad: "Product",
    entidadId: anterior.productId,
  });

  refrescarPantallas();
  return { ok: true };
}

export async function eliminarServicio(servicioId: string): Promise<ResultadoServicio> {
  const sesion = await exigirPermiso("agenda.configurar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const servicio = await db.servicioAgenda.findFirst({
    where: { id: servicioId },
    select: { productId: true, product: { select: { nombre: true, precio: true } } },
  });
  if (!servicio) return { ok: false, error: "Ese servicio ya no existe." };

  // Un servicio que ya se vendió tiene historial (ventas, facturas): borrarlo
  // lo dejaría sin producto. Se desactiva en vez de borrarse.
  const [enPedidos, enVentas] = await Promise.all([
    db.orderItem.count({ where: { productId: servicio.productId } }),
    db.ventaPosItem.count({ where: { productId: servicio.productId } }),
  ]);
  if (enPedidos + enVentas > 0) {
    return {
      ok: false,
      error:
        "Este servicio ya se vendió y no se puede borrar (se perdería el historial). Entrá a Editar y desmarcá “Activo”: deja de ofrecerse pero se conserva.",
    };
  }

  // Borra el producto; la ficha de la agenda y el personal asignado se van con él.
  await db.product.delete({ where: { id: servicio.productId } });

  await registrarBitacora(idLocal, sesion, {
    modulo: "agenda",
    accion: "servicio_eliminado",
    descripcion: `Eliminó el servicio ${servicio.product.nombre} (${formatearGuarani(Number(servicio.product.precio))}).`,
    entidad: "Product",
    entidadId: servicio.productId,
  });

  refrescarPantallas();
  return { ok: true };
}
