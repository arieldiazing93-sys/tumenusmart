"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { normalizarCategoriaGasto } from "@/lib/categoria-gasto";

export type ResultadoGasto = { ok: true } | { ok: false; error: string };

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
  const categoria = normalizarCategoriaGasto(formData.get("categoria"));

  await prisma.gasto.create({
    data: {
      storeId: idLocal,
      concepto,
      categoria,
      monto,
      fecha,
      proveedorId,
      notas,
      registradoPor: sesion.nombre?.trim() || sesion.email,
    },
  });

  revalidatePath("/admin/stock/gastos");
  return { ok: true };
}
