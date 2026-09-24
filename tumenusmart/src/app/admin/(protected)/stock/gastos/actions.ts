"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { normalizarCategoriaGasto, resolverCategoriaNueva } from "@/lib/categoria-gasto";
import { normalizarIva } from "@/lib/iva";

export type ResultadoGasto = { ok: true } | { ok: false; error: string };

/** Un texto opcional del formulario: recortado, o null si quedó vacío. */
function textoOpcional(valor: FormDataEntryValue | null, max: number): string | null {
  const limpio = String(valor ?? "").trim().slice(0, max);
  return limpio || null;
}

/**
 * Crea el gasto. La categoría es una de la lista (las cinco fijas o una propia
 * del local) o, si vino `categoriaNueva`, una que se crea en este mismo paso:
 * así el dueño arma su categoría sin salir del formulario.
 */
export async function crearGasto(formData: FormData): Promise<ResultadoGasto> {
  const sesion = await exigirPermiso("stock.editar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const concepto = String(formData.get("concepto") ?? "").trim();
  if (!concepto) return { ok: false, error: "El concepto es obligatorio" };

  const montoTexto = String(formData.get("monto") ?? "").trim();
  const monto = Number(montoTexto);
  if (!Number.isFinite(monto) || monto <= 0) {
    return { ok: false, error: "El monto tiene que ser mayor a cero" };
  }

  const fechaTexto = String(formData.get("fecha") ?? "").trim();
  const fechaParseada = fechaTexto ? new Date(fechaTexto) : new Date();
  const fecha = Number.isNaN(fechaParseada.getTime()) ? new Date() : fechaParseada;

  const proveedorId = String(formData.get("proveedorId") ?? "").trim() || null;
  const notas = String(formData.get("notas") ?? "").trim() || null;

  // El proveedor viene del navegador: se verifica que sea de ESTE local (al ir
  // por prismaDelLocal, el de otro negocio simplemente no aparece).
  const proveedor = proveedorId
    ? await prisma.proveedor.findUnique({ where: { id: proveedorId }, select: { ruc: true, razonSocial: true } })
    : null;
  if (proveedorId && !proveedor) return { ok: false, error: "Ese proveedor ya no existe." };

  // Datos de la factura del gasto: ninguno es obligatorio — muchos gastos no
  // tienen factura ni RUC de nadie.
  const numeroComprobante = textoOpcional(formData.get("numeroComprobante"), 40);
  const timbradoTexto = String(formData.get("timbrado") ?? "").replace(/\D/g, "");
  if (timbradoTexto.length > 8) return { ok: false, error: "El timbrado tiene como máximo 8 números." };
  const timbrado = timbradoTexto || null;
  // Si se eligió un proveedor cargado y no se escribió otro RUC/razón social,
  // se copian los suyos: el gasto queda con sus datos aunque el proveedor cambie después.
  const proveedorRuc = textoOpcional(formData.get("proveedorRuc"), 40) ?? proveedor?.ruc ?? null;
  const proveedorRazonSocial = textoOpcional(formData.get("proveedorRazonSocial"), 200) ?? proveedor?.razonSocial ?? null;
  const iva = normalizarIva(formData.get("iva"));
  const condicionPago = String(formData.get("condicionPago") ?? "") === "credito" ? "credito" : "contado";
  const vencimientoParseado = new Date(String(formData.get("fechaVencimiento") ?? ""));
  const fechaVencimiento =
    condicionPago === "credito" && !Number.isNaN(vencimientoParseado.getTime()) ? vencimientoParseado : null;

  // Las categorías propias de este local (por el cliente del local, las de otro negocio no aparecen).
  const propias = (await prisma.categoriaGasto.findMany({ select: { nombre: true } })).map((c) => c.nombre);

  let categoria: string;
  const categoriaNueva = String(formData.get("categoriaNueva") ?? "");
  if (categoriaNueva.trim()) {
    const resuelta = resolverCategoriaNueva(categoriaNueva, propias);
    if (!resuelta.ok) return { ok: false, error: resuelta.error };
    categoria = resuelta.valor;
    if (resuelta.esNueva) {
      try {
        await prisma.categoriaGasto.create({ data: { storeId: idLocal, nombre: categoria } });
      } catch {
        // Si dos personas la crean a la vez, la segunda choca con el índice
        // único: no es un error, la categoría ya existe. Si en cambio no está,
        // el problema es otro y se avisa.
        const yaExiste = await prisma.categoriaGasto.findFirst({ where: { nombre: categoria }, select: { id: true } });
        if (!yaExiste) return { ok: false, error: "No se pudo crear la categoría. Probá de nuevo." };
      }
    }
  } else {
    categoria = normalizarCategoriaGasto(formData.get("categoria"), propias);
  }

  await prisma.gasto.create({
    data: {
      storeId: idLocal,
      concepto,
      categoria,
      monto,
      fecha,
      proveedorId,
      notas,
      numeroComprobante,
      timbrado,
      proveedorRuc,
      proveedorRazonSocial,
      iva,
      condicionPago,
      fechaVencimiento,
      registradoPor: sesion.nombre?.trim() || sesion.email,
    },
  });

  revalidatePath("/admin/stock/gastos");
  return { ok: true };
}
