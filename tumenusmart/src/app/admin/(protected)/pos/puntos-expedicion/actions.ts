"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";

export type ResultadoPuntoExpedicion = { ok: true } | { ok: false; error: string };

const TRES_DIGITOS = /^\d{3}$/;

type DatosPuntoExpedicion = {
  nombre: string;
  establecimiento: string;
  puntoExpedicion: string;
  numeroTimbrado: string;
  timbradoDesde: Date;
  timbradoHasta: Date;
  razonSocialEmisor: string;
  rucEmisor: string;
};

function leerDatos(formData: FormData): { datos: DatosPuntoExpedicion } | { error: string } {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const establecimiento = String(formData.get("establecimiento") ?? "").trim();
  const puntoExpedicion = String(formData.get("puntoExpedicion") ?? "").trim();
  const numeroTimbrado = String(formData.get("numeroTimbrado") ?? "").trim();
  const timbradoDesdeTexto = String(formData.get("timbradoDesde") ?? "");
  const timbradoHastaTexto = String(formData.get("timbradoHasta") ?? "");
  const razonSocialEmisor = String(formData.get("razonSocialEmisor") ?? "").trim();
  const rucEmisor = String(formData.get("rucEmisor") ?? "").trim();

  if (!nombre) return { error: "El nombre es obligatorio." };
  if (!TRES_DIGITOS.test(establecimiento)) {
    return { error: "El establecimiento tiene que ser de 3 dígitos, ej: 001." };
  }
  if (!TRES_DIGITOS.test(puntoExpedicion)) {
    return { error: "El punto de expedición tiene que ser de 3 dígitos, ej: 001." };
  }
  if (!numeroTimbrado) return { error: "El número de timbrado es obligatorio." };
  if (!razonSocialEmisor) return { error: "La razón social del emisor es obligatoria." };
  if (!rucEmisor) return { error: "El RUC del emisor es obligatorio." };

  const timbradoDesde = new Date(timbradoDesdeTexto);
  const timbradoHasta = new Date(timbradoHastaTexto);
  if (isNaN(timbradoDesde.getTime()) || isNaN(timbradoHasta.getTime())) {
    return { error: "Las fechas de vigencia del timbrado son obligatorias." };
  }
  if (timbradoHasta <= timbradoDesde) {
    return { error: "El vencimiento tiene que ser posterior al inicio de vigencia." };
  }

  return {
    datos: {
      nombre,
      establecimiento,
      puntoExpedicion,
      numeroTimbrado,
      timbradoDesde,
      timbradoHasta,
      razonSocialEmisor,
      rucEmisor,
    },
  };
}

/**
 * Devuelve un resultado en vez de lanzar los errores de validación: Next.js
 * oculta en producción el mensaje de cualquier `throw` que salga de una
 * Server Action, así que el motivo real solo llega si viaja en el retorno.
 */
export async function crearPuntoExpedicion(formData: FormData): Promise<ResultadoPuntoExpedicion> {
  await exigirPermiso("pos.gestionarEstaciones");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const leido = leerDatos(formData);
  if ("error" in leido) return { ok: false, error: leido.error };

  await prisma.puntoExpedicion.create({ data: { ...leido.datos, storeId: idLocal } });
  revalidatePath("/admin/pos/puntos-expedicion");
  return { ok: true };
}

export async function actualizarPuntoExpedicion(
  id: string,
  formData: FormData
): Promise<ResultadoPuntoExpedicion> {
  await exigirPermiso("pos.gestionarEstaciones");
  const prisma = prismaDelLocal(await idLocalActual());

  const leido = leerDatos(formData);
  if ("error" in leido) return { ok: false, error: leido.error };

  await prisma.puntoExpedicion.update({ where: { id }, data: leido.datos });
  revalidatePath("/admin/pos/puntos-expedicion");
  return { ok: true };
}

/**
 * Sin borrar: una vez que un punto de expedición emitió facturas, borrarlo
 * dejaría esos comprobantes sin de dónde salió su timbrado — mismo criterio
 * que Productos/Estaciones. Se desactiva nomás.
 */
export async function alternarActivoPuntoExpedicion(id: string, activo: boolean) {
  await exigirPermiso("pos.gestionarEstaciones");
  const prisma = prismaDelLocal(await idLocalActual());

  await prisma.puntoExpedicion.update({ where: { id }, data: { activo } });
  revalidatePath("/admin/pos/puntos-expedicion");
}
