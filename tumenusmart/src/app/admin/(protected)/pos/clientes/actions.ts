"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { exigirPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal, siguienteNumeroCliente } from "@/lib/prisma-local";
import { prisma } from "@/lib/prisma";

export type ResultadoActualizarCliente = { ok: true } | { ok: false; error: string };
export type ResultadoCrearCliente = { ok: true } | { ok: false; error: string };

/**
 * Alta manual de un cliente, sin pasar por una venta.
 *
 * El flujo normal es que el Customer se cree solo (registrarVenta en
 * pos/actions.ts, o el checkout público al cargar el teléfono) — esto cubre
 * el caso de cargar los datos de alguien ANTES de su primera compra, por
 * ejemplo un cliente fiscal que ya se sabe que va a facturar seguido.
 *
 * A diferencia de esos flujos (que hacen upsert porque la mayoría de las
 * veces el cliente YA existe), acá es un alta explícita: si el teléfono o la
 * identificación fiscal ya pertenecen a otro cliente, se avisa en vez de
 * pisarle los datos a ese cliente existente.
 */
export async function crearCliente(datos: {
  nombre: string;
  telefono: string;
  email: string;
  tipoIdentificacion: string;
  numeroIdentificacion: string;
}): Promise<ResultadoCrearCliente> {
  await exigirPermiso("pos.verHistorico");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const nombre = datos.nombre.trim();
  if (!nombre) return { ok: false, error: "El nombre no puede quedar vacío." };

  const email = datos.email.trim();
  if (email && !email.includes("@")) return { ok: false, error: "El correo electrónico no es válido." };

  const telefono = datos.telefono.trim();

  const tipoIdentificacion = datos.tipoIdentificacion.trim();
  const numeroIdentificacion = datos.numeroIdentificacion.trim();
  if (!!tipoIdentificacion !== !!numeroIdentificacion) {
    return { ok: false, error: "Completá el tipo y el número de identificación, o dejá los dos vacíos." };
  }

  const numero = await siguienteNumeroCliente(prisma, storeId);
  try {
    await db.customer.create({
      data: {
        nombre,
        telefono: telefono || null,
        email: email || null,
        tipoIdentificacion: tipoIdentificacion || null,
        numeroIdentificacion: numeroIdentificacion || null,
        numero,
      },
    });
  } catch (err) {
    // Choca contra @@unique([storeId, telefono]) o
    // @@unique([storeId, tipoIdentificacion, numeroIdentificacion]) — ya
    // existe otro cliente de este local con ese mismo dato.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "Ya existe un cliente con ese teléfono o esa identificación fiscal." };
    }
    throw err;
  }

  revalidatePath("/admin/pos/clientes");
  return { ok: true };
}

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
