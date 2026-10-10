"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { exigirPermiso } from "@/lib/auth";
import { descartarImagenes } from "@/lib/imagenes";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal, siguienteNumeroCliente } from "@/lib/prisma-local";
import { prisma } from "@/lib/prisma";
import { subirFotoCliente } from "@/lib/supabase-storage";
import { registrarBitacora } from "@/lib/bitacora";
import { formatearNumero } from "@/lib/format";

export type ResultadoActualizarCliente = { ok: true } | { ok: false; error: string };
export type ResultadoCrearCliente = { ok: true } | { ok: false; error: string };
export type ResultadoFotoCliente = { ok: true; url: string } | { ok: false; error: string };

/** Sube el último peinado/corte del cliente (Reserva de turnos). Se llama antes de guardar: acá solo se sube la imagen, `actualizarCliente` guarda su dirección. */
export async function subirFotoDelCliente(formData: FormData): Promise<ResultadoFotoCliente> {
  await exigirPermiso("pos.verHistorico");
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File)) return { ok: false, error: "No se recibió ninguna imagen" };
  try {
    return { ok: true, url: await subirFotoCliente(archivo) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo subir la foto" };
  }
}

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
        storeId,
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

/** Lo más largo que puede ser un teléfono escrito a mano (con prefijo, espacios y guiones). */
const LARGO_TELEFONO_CLIENTE = 30;

/**
 * Corrección de todos los datos del cliente: nombre o razón social, teléfono, correo, tipo y número de identificación fiscal (RUC,
 * cédula…) y la foto. Lo único que NO se toca es la clave (el correlativo interno).
 *
 * No da de alta clientes — eso lo hace solo el flujo de venta (o `crearCliente`). Tipo/número de identificación SÍ se pueden
 * corregir acá: los datos fiscales de una venta ya emitida quedan CONGELADOS en sus propios campos (`VentaPos`), el ticket impreso
 * nunca vuelve a leer este `Customer` en vivo — corregir la ficha acá no altera ningún documento ya impreso, solo el perfil a futuro.
 * Lo mismo vale para las cuentas de delivery ya abiertas: guardan el teléfono y el nombre con que se abrieron.
 *
 * El teléfono y la identificación son únicos dentro del local: si el nuevo ya es de otro cliente, se avisa cuál dato choca en vez
 * de pisarle los datos a ese otro cliente. Cada cambio queda en la Bitácora, con lo que decía antes.
 */
export async function actualizarCliente(
  id: string,
  datos: {
    nombre: string;
    telefono: string;
    email: string;
    tipoIdentificacion: string;
    numeroIdentificacion: string;
    fotoUrl: string;
  }
): Promise<ResultadoActualizarCliente> {
  const sesion = await exigirPermiso("pos.verHistorico");
  const storeId = await idLocalActual();
  const prisma = prismaDelLocal(storeId);

  const nombre = datos.nombre.trim();
  if (!nombre) return { ok: false, error: "El nombre no puede quedar vacío." };

  const telefono = datos.telefono.trim();
  if (telefono.length > LARGO_TELEFONO_CLIENTE) {
    return { ok: false, error: `El teléfono no puede tener más de ${LARGO_TELEFONO_CLIENTE} caracteres.` };
  }
  if (telefono && !/\d/.test(telefono)) return { ok: false, error: "El teléfono no es válido: tiene que llevar números." };

  const email = datos.email.trim();
  if (email && !email.includes("@")) return { ok: false, error: "El correo electrónico no es válido." };

  const tipoIdentificacion = datos.tipoIdentificacion.trim();
  const numeroIdentificacion = datos.numeroIdentificacion.trim();
  if (!!tipoIdentificacion !== !!numeroIdentificacion) {
    return { ok: false, error: "Completá el tipo y el número de identificación, o dejá los dos vacíos." };
  }

  // La foto ya se subió aparte (subirFotoDelCliente); acá solo llega su dirección.
  const fotoUrl = datos.fotoUrl.trim();
  if (fotoUrl && !/^https:\/\//i.test(fotoUrl)) return { ok: false, error: "La foto no es válida. Subila de nuevo." };

  // El cliente se busca dentro de ESTE local: el id de otro negocio no aparece. Sirve además para dejar en la Bitácora lo que había.
  const antes = await prisma.customer.findFirst({
    where: { id: String(id) },
    select: { id: true, numero: true, nombre: true, telefono: true, email: true, tipoIdentificacion: true, numeroIdentificacion: true, fotoUrl: true },
  });
  if (!antes) return { ok: false, error: "No encontré a ese cliente. Actualizá la pantalla." };

  try {
    await prisma.customer.update({
      where: { id: antes.id },
      data: {
        nombre,
        telefono: telefono || null,
        email: email || null,
        tipoIdentificacion: tipoIdentificacion || null,
        numeroIdentificacion: numeroIdentificacion || null,
        fotoUrl: fotoUrl || null,
      },
    });
  } catch (err) {
    // Choca contra @@unique([storeId, telefono]) o @@unique([storeId, tipoIdentificacion, numeroIdentificacion]):
    // ya hay otro cliente de este local con ese mismo dato.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const campo = String(err.meta?.target ?? "");
      return {
        ok: false,
        error: campo.includes("telefono")
          ? "Ya existe otro cliente con ese teléfono."
          : "Ya existe otro cliente con ese tipo y número de identificación.",
      };
    }
    throw err;
  }

  // Si se cambió o se quitó la foto, la anterior se borra del almacenamiento (si ninguna otra fila la usa).
  if (antes.fotoUrl && antes.fotoUrl !== (fotoUrl || null)) await descartarImagenes([antes.fotoUrl]);

  // Solo se anota lo que cambió de verdad (la foto no: no es un dato del cliente que importe en el rastro).
  const cambios: Record<string, { antes: string | null; despues: string | null }> = {};
  const comparar = (campo: string, anterior: string | null, nuevo: string | null) => {
    if ((anterior ?? null) !== (nuevo ?? null)) cambios[campo] = { antes: anterior ?? null, despues: nuevo ?? null };
  };
  comparar("nombre", antes.nombre, nombre);
  comparar("telefono", antes.telefono, telefono || null);
  comparar("email", antes.email, email || null);
  comparar("tipoIdentificacion", antes.tipoIdentificacion, tipoIdentificacion || null);
  comparar("numeroIdentificacion", antes.numeroIdentificacion, numeroIdentificacion || null);
  if (Object.keys(cambios).length > 0) {
    await registrarBitacora(storeId, sesion, {
      modulo: "clientes",
      accion: "cliente_editado",
      descripcion: `Corrigió los datos del cliente ${antes.nombre}${antes.numero != null ? ` (clave ${formatearNumero(antes.numero)})` : ""}: ${Object.keys(cambios).join(", ")}.`,
      entidad: "Customer",
      entidadId: antes.id,
      detalle: { cambios },
    });
  }

  revalidatePath("/admin/pos/clientes");
  return { ok: true };
}
