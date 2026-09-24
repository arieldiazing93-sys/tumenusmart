"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal, siguienteNumeroCotizacion } from "@/lib/prisma-local";
import {
  calcularCotizacion,
  numeroDeCotizacion,
  VALIDEZ_DIAS_POR_DEFECTO,
  type ResultadoCotizacion as CalculoOk,
} from "@/lib/cotizacion";
import { formatearGuarani } from "@/lib/format";
import { registrarBitacora } from "@/lib/bitacora";
import { normalizarIva } from "@/lib/iva";
import type { DescuentoPedido } from "@/lib/descuento-venta";

export type LineaCotizacionInput = {
  nombre: string;
  /** Detalle opcional que sale debajo del nombre. */
  descripcion: string | null;
  cantidad: number;
  /** De UNA unidad, con IVA incluido. */
  precioUnitario: number;
  /** "gravado10" | "gravado5" | "exento" */
  iva: string;
};

export type DatosCotizacion = {
  clienteNombre: string;
  clienteIdentificacion: string | null;
  clienteTelefono: string | null;
  clienteEmail: string | null;
  validezDias: number;
  notas: string | null;
  descuento: DescuentoPedido | null;
  lineas: LineaCotizacionInput[];
};

export type ResultadoGuardarCotizacion = { ok: false; error: string };
export type ResultadoEliminarCotizacion = { ok: true } | { ok: false; error: string };

export type ProductoParaCotizacion = {
  id: string;
  nombre: string;
  categoriaNombre: string;
  /** Con IVA incluido. */
  precio: number;
  iva: string;
};

export type ClienteParaCotizacion = {
  id: string;
  nombre: string;
  telefono: string | null;
  identificacion: string | null;
  email: string | null;
};

const MAX_MONTO = 100_000_000_000; // 100 mil millones: cabe de sobra en Decimal(14,2)

function textoOpcional(valor: string | null | undefined, max: number): string | null {
  const limpio = (valor ?? "").trim().slice(0, max);
  return limpio || null;
}

type CotizacionPreparada = {
  clienteNombre: string;
  clienteIdentificacion: string | null;
  clienteTelefono: string | null;
  clienteEmail: string | null;
  notas: string | null;
  validezDias: number;
  lineas: { nombre: string; descripcion: string | null; cantidad: number; precioUnitario: number; iva: string }[];
  calculo: Extract<CalculoOk, { ok: true }>;
};

/**
 * Valida lo que llegó del navegador y recalcula los totales — es lo que
 * comparten crear y editar. Devuelve el error para mostrar, o todo listo para guardar.
 */
function prepararCotizacion(datos: DatosCotizacion): { error: string } | CotizacionPreparada {
  const clienteNombre = (datos.clienteNombre ?? "").trim().slice(0, 120);
  if (!clienteNombre) return { error: "Escribí el nombre del cliente." };

  if (!Array.isArray(datos.lineas) || datos.lineas.length === 0) {
    return { error: "Agregá al menos un producto o servicio." };
  }

  const lineas: CotizacionPreparada["lineas"] = [];
  for (const l of datos.lineas) {
    const nombre = (l.nombre ?? "").trim().slice(0, 200);
    const cantidad = Number(l.cantidad);
    const precioUnitario = Number(l.precioUnitario);
    if (
      !nombre ||
      !Number.isFinite(cantidad) ||
      cantidad <= 0 ||
      cantidad > 1_000_000 ||
      !Number.isFinite(precioUnitario) ||
      precioUnitario < 0 ||
      precioUnitario > MAX_MONTO
    ) {
      return { error: "Revisá las líneas: cada una necesita nombre, cantidad y precio." };
    }
    lineas.push({
      nombre,
      descripcion: textoOpcional(l.descripcion, 300),
      // Dos decimales como máximo (es lo que guarda la base).
      cantidad: Math.round(cantidad * 100) / 100,
      precioUnitario: Math.round(precioUnitario * 100) / 100,
      iva: normalizarIva(l.iva),
    });
  }

  const calculo = calcularCotizacion(lineas, datos.descuento);
  if (!calculo.ok) return { error: calculo.error };
  if (calculo.total <= 0) return { error: "El total del presupuesto tiene que ser mayor a cero." };

  const dias = Math.round(Number(datos.validezDias));
  const validezDias = Number.isFinite(dias) ? Math.min(Math.max(dias, 1), 365) : VALIDEZ_DIAS_POR_DEFECTO;

  return {
    clienteNombre,
    clienteIdentificacion: textoOpcional(datos.clienteIdentificacion, 40),
    clienteTelefono: textoOpcional(datos.clienteTelefono, 40),
    clienteEmail: textoOpcional(datos.clienteEmail, 120),
    notas: textoOpcional(datos.notas, 2000),
    validezDias,
    lineas,
    calculo,
  };
}

function itemsParaGuardar(idLocal: string, p: CotizacionPreparada) {
  return p.lineas.map((l, i) => ({
    storeId: idLocal,
    orden: i,
    nombre: l.nombre,
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    precioUnitario: l.precioUnitario,
    iva: l.iva,
  }));
}

/** Busca productos o servicios del catálogo por nombre, para armar las líneas del presupuesto. */
export async function buscarProductosParaCotizacion(query: string): Promise<ProductoParaCotizacion[]> {
  await exigirPermiso("cotizaciones.gestionar");
  const prisma = prismaDelLocal(await idLocalActual());

  const texto = query.trim();
  if (!texto) return [];

  const productos = await prisma.product.findMany({
    where: { nombre: { contains: texto, mode: "insensitive" } },
    orderBy: { nombre: "asc" },
    take: 10,
    select: { id: true, nombre: true, precio: true, iva: true, category: { select: { nombre: true } } },
  });

  return productos.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    categoriaNombre: p.category?.nombre ?? "Sin categoría",
    precio: Number(p.precio),
    iva: p.iva,
  }));
}

/** Busca clientes ya cargados (por nombre, teléfono o RUC/cédula) para completar los datos del presupuesto. */
export async function buscarClientesParaCotizacion(query: string): Promise<ClienteParaCotizacion[]> {
  await exigirPermiso("cotizaciones.gestionar");
  const prisma = prismaDelLocal(await idLocalActual());

  const texto = query.trim();
  if (!texto) return [];

  const clientes = await prisma.customer.findMany({
    where: {
      OR: [
        { nombre: { contains: texto, mode: "insensitive" } },
        { telefono: { contains: texto } },
        { numeroIdentificacion: { contains: texto, mode: "insensitive" } },
      ],
    },
    orderBy: { nombre: "asc" },
    take: 8,
    select: { id: true, nombre: true, telefono: true, numeroIdentificacion: true, email: true },
  });

  return clientes.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    telefono: c.telefono,
    identificacion: c.numeroIdentificacion,
    email: c.email,
  }));
}

/**
 * Guarda un presupuesto nuevo. Los totales se recalculan acá con la misma
 * función que usa el formulario: lo que se ve mientras se arma es solo una
 * vista previa. Si sale bien, redirige sola al presupuesto guardado.
 */
export async function crearCotizacion(datos: DatosCotizacion): Promise<ResultadoGuardarCotizacion | void> {
  const sesion = await exigirPermiso("cotizaciones.gestionar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const p = prepararCotizacion(datos);
  if ("error" in p) return { ok: false, error: p.error };

  const numero = await siguienteNumeroCotizacion(idLocal);
  const creada = await prisma.cotizacion.create({
    data: {
      storeId: idLocal,
      numero,
      validezDias: p.validezDias,
      clienteNombre: p.clienteNombre,
      clienteIdentificacion: p.clienteIdentificacion,
      clienteTelefono: p.clienteTelefono,
      clienteEmail: p.clienteEmail,
      notas: p.notas,
      descuento: p.calculo.descuento,
      descuentoPorcentaje: p.calculo.descuentoPorcentaje,
      total: p.calculo.total,
      creadaPor: sesion.nombre?.trim() || sesion.email,
      items: { create: itemsParaGuardar(idLocal, p) },
    },
    select: { id: true },
  });

  await registrarBitacora(idLocal, sesion, {
    modulo: "cotizaciones",
    accion: "cotizacion_creada",
    descripcion: `Creó la cotización N° ${numeroDeCotizacion(numero)} para ${p.clienteNombre} por ${formatearGuarani(p.calculo.total)}.`,
    entidad: "Cotizacion",
    entidadId: creada.id,
    detalle: { numero, cliente: p.clienteNombre, total: p.calculo.total, lineas: p.lineas.length },
  });

  revalidatePath("/admin/cotizaciones");
  redirect(`/admin/cotizaciones/${creada.id}`);
}

/**
 * Corrige un presupuesto ya guardado: reemplaza sus líneas por las nuevas.
 * Conserva su número y su fecha de emisión.
 */
export async function actualizarCotizacion(
  cotizacionId: string,
  datos: DatosCotizacion
): Promise<ResultadoGuardarCotizacion | void> {
  const sesion = await exigirPermiso("cotizaciones.gestionar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const existente = await prisma.cotizacion.findUnique({
    where: { id: cotizacionId },
    select: { id: true, numero: true, total: true },
  });
  if (!existente) return { ok: false, error: "Ese presupuesto ya no existe." };

  const p = prepararCotizacion(datos);
  if ("error" in p) return { ok: false, error: p.error };

  await prisma.cotizacion.update({
    where: { id: cotizacionId },
    data: {
      validezDias: p.validezDias,
      clienteNombre: p.clienteNombre,
      clienteIdentificacion: p.clienteIdentificacion,
      clienteTelefono: p.clienteTelefono,
      clienteEmail: p.clienteEmail,
      notas: p.notas,
      descuento: p.calculo.descuento,
      descuentoPorcentaje: p.calculo.descuentoPorcentaje,
      total: p.calculo.total,
      items: { deleteMany: {}, create: itemsParaGuardar(idLocal, p) },
    },
  });

  await registrarBitacora(idLocal, sesion, {
    modulo: "cotizaciones",
    accion: "cotizacion_editada",
    descripcion: `Editó la cotización N° ${numeroDeCotizacion(existente.numero)} para ${p.clienteNombre}: el total pasó de ${formatearGuarani(
      Number(existente.total)
    )} a ${formatearGuarani(p.calculo.total)}.`,
    entidad: "Cotizacion",
    entidadId: cotizacionId,
    detalle: { numero: existente.numero, total_anterior: Number(existente.total), total_nuevo: p.calculo.total },
  });

  revalidatePath("/admin/cotizaciones");
  revalidatePath(`/admin/cotizaciones/${cotizacionId}`);
  redirect(`/admin/cotizaciones/${cotizacionId}`);
}

/** Borra un presupuesto. No afecta nada más: no mueve stock, caja ni facturas. */
export async function eliminarCotizacion(cotizacionId: string): Promise<ResultadoEliminarCotizacion> {
  const sesion = await exigirPermiso("cotizaciones.gestionar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const existente = await prisma.cotizacion.findUnique({
    where: { id: cotizacionId },
    select: { id: true, numero: true, clienteNombre: true, total: true },
  });
  if (!existente) return { ok: false, error: "Ese presupuesto ya no existe." };

  await prisma.cotizacion.delete({ where: { id: cotizacionId } });

  await registrarBitacora(idLocal, sesion, {
    modulo: "cotizaciones",
    accion: "cotizacion_eliminada",
    descripcion: `Eliminó la cotización N° ${numeroDeCotizacion(existente.numero)} de ${existente.clienteNombre} (${formatearGuarani(
      Number(existente.total)
    )}).`,
    entidad: "Cotizacion",
    entidadId: cotizacionId,
    detalle: { numero: existente.numero, cliente: existente.clienteNombre, total: Number(existente.total) },
  });

  revalidatePath("/admin/cotizaciones");
  return { ok: true };
}
