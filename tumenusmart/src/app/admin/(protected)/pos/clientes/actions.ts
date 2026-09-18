"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { exigirPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";

export type ResultadoActualizarCliente = { ok: true } | { ok: false; error: string };

/**
 * Corrección de nombre/correo/identificación fiscal.
 *
 * No da de alta clientes — eso lo hace solo el flujo de venta. Tipo/número
 * de identificación SÍ se pueden corregir acá (a diferencia de lo que
 * decía este comentario antes): los datos fiscales de una venta ya emitida
 * quedan CONGELADOS en sus propios campos (`VentaPos`/`Order`), el ticket
 * impreso nunca vuelve a leer este `Customer` en vivo — corregir la ficha
 * acá no altera ningún documento ya impreso, solo el perfil a futuro.
 */
export async function actualizarCliente(
  id: string,
  datos: { nombre: string; email: string; tipoIdentificacion: string; numeroIdentificacion: string }
): Promise<ResultadoActualizarCliente> {
  await exigirPermiso("pos.verHistorico");
  const prisma = prismaDelLocal(await idLocalActual());

  const nombre = datos.nombre.trim();
  if (!nombre) return { ok: false, error: "El nombre no puede quedar vacío." };

  const email = datos.email.trim();
  if (email && !email.includes("@")) return { ok: false, error: "El correo electrónico no es válido." };

  const tipoIdentificacion = datos.tipoIdentificacion.trim();
  const numeroIdentificacion = datos.numeroIdentificacion.trim();
  if (!!tipoIdentificacion !== !!numeroIdentificacion) {
    return { ok: false, error: "Completá el tipo y el número de identificación, o dejá los dos vacíos." };
  }

  try {
    await prisma.customer.update({
      where: { id },
      data: {
        nombre,
        email: email || null,
        tipoIdentificacion: tipoIdentificacion || null,
        numeroIdentificacion: numeroIdentificacion || null,
      },
    });
  } catch (err) {
    // Choca contra @@unique([storeId, tipoIdentificacion, numeroIdentificacion])
    // — ya hay otro cliente de este local con ese mismo tipo+número.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "Ya existe otro cliente con ese tipo y número de identificación." };
    }
    throw err;
  }

  revalidatePath("/admin/pos/clientes");
  return { ok: true };
}
