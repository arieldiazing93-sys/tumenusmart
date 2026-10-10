"use server";

import { descartarImagenes } from "@/lib/imagenes";
import { prisma } from "@/lib/prisma";
import { subirFotoCliente } from "@/lib/supabase-storage";

/**
 * Búsqueda y foto de cliente desde el enlace público del personal
 * (/personal/[id], sin usuario ni contraseña — ver EnlaceTrabajoPersonal.tsx).
 *
 * Como acá no hay sesión, el `personalId` de la URL hace de "llave": cada
 * función vuelve a confirmar que sea de una persona ACTIVA antes de hacer
 * nada, y todo lo que se busca o se sube queda atado al storeId de esa
 * persona — nunca al de otro negocio, aunque alguien arme un id a mano
 * (misma regla de aislamiento por negocio que el resto del sistema).
 */

const TOPE_RESULTADOS = 8;

async function miembroActivo(personalId: string) {
  const miembro = await prisma.miembroPersonal.findUnique({
    where: { id: personalId },
    select: { id: true, activo: true, storeId: true },
  });
  if (!miembro || !miembro.activo) return null;
  return miembro;
}

export type ClienteEncontrado = {
  id: string;
  nombre: string;
  telefono: string | null;
  fotoUrl: string | null;
};

export type ResultadoBusquedaCliente =
  | { ok: true; clientes: ClienteEncontrado[] }
  | { ok: false; error: string };

/**
 * Busca clientes del MISMO local por teléfono (coincidencia parcial, solo
 * dígitos). A propósito no trae correo ni identificación fiscal (RUC/Cédula):
 * este enlace es público, sin usuario ni contraseña, y esos datos no le
 * hacen falta al barbero para encontrar el último peinado de alguien.
 */
export async function buscarClientePorTelefono(
  personalId: string,
  telefono: string
): Promise<ResultadoBusquedaCliente> {
  const miembro = await miembroActivo(personalId);
  if (!miembro) return { ok: false, error: "Este enlace ya no está activo." };

  const busqueda = telefono.replace(/\D/g, "");
  if (busqueda.length < 4) return { ok: false, error: "Escribí al menos 4 números del teléfono." };

  const clientes = await prisma.customer.findMany({
    where: { storeId: miembro.storeId, telefono: { contains: busqueda } },
    orderBy: { createdAt: "desc" },
    take: TOPE_RESULTADOS,
    select: { id: true, nombre: true, telefono: true, fotoUrl: true },
  });

  return { ok: true, clientes };
}

export type ResultadoFotoCliente = { ok: true; url: string } | { ok: false; error: string };

/**
 * Sube el último peinado/corte de un cliente desde el enlace público.
 * `subirFotoCliente` (src/lib/supabase-storage.ts) ya valida extensión + MIME
 * contra una whitelist (jpg/jpeg/png/webp) y un tope de 5MB — acá se suma la
 * otra mitad del filtro: que el enlace siga activo y que el cliente sea de
 * ESE mismo local, nunca de otro.
 */
export async function subirFotoClienteDesdeEnlace(
  personalId: string,
  clienteId: string,
  formData: FormData
): Promise<ResultadoFotoCliente> {
  const miembro = await miembroActivo(personalId);
  if (!miembro) return { ok: false, error: "Este enlace ya no está activo." };

  const cliente = await prisma.customer.findUnique({ where: { id: clienteId }, select: { storeId: true, fotoUrl: true } });
  if (!cliente || cliente.storeId !== miembro.storeId) return { ok: false, error: "Cliente no encontrado." };

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File)) return { ok: false, error: "No se recibió ninguna imagen" };

  try {
    const url = await subirFotoCliente(archivo);
    await prisma.customer.update({ where: { id: clienteId }, data: { fotoUrl: url } });
    // El último corte anterior ya no se usa: se borra del almacenamiento (queda solo la foto más reciente).
    await descartarImagenes([cliente.fotoUrl]);
    return { ok: true, url };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo subir la foto" };
  }
}
