"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal, siguienteNumeroReserva } from "@/lib/prisma-local";
import { fechaAsuncionDesdeTexto } from "@/lib/timezone";
import { TURNOS, MOTIVOS_RESERVA, ESTADOS_RESERVA } from "@/lib/reservas";

/** "" o un número inválido => sin límite (null). */
function parsearCapacidad(valor: FormDataEntryValue | null): number | null {
  const texto = String(valor ?? "").trim();
  if (!texto) return null;
  const numero = parseInt(texto, 10);
  if (isNaN(numero) || numero <= 0) return null;
  return numero;
}

export type ResultadoAccion = { ok: true } | { ok: false; error: string };

/**
 * Devuelve {ok,error} en vez de lanzar: un `throw` que escapa de una Server
 * Action queda con el mensaje real escondido en producción (Next.js lo
 * cambia por un genérico "Application error"), así que quien carga el
 * horario nunca se enteraría de si el problema fue el turno o la hora.
 */
export async function crearHorario(formData: FormData): Promise<ResultadoAccion> {
  await exigirPermiso("reservas.gestionar");
  // La clave compuesta necesita el local escrito, así que acá se pide aparte.
  const storeId = await idLocalActual();
  const prisma = prismaDelLocal(storeId);

  const turno = String(formData.get("turno") ?? "");
  const hora = String(formData.get("hora") ?? "").trim();
  const capacidadPersonas = parsearCapacidad(formData.get("capacidadPersonas"));

  if (!TURNOS.some((t) => t.value === turno)) return { ok: false, error: "Turno inválido" };
  if (!hora) return { ok: false, error: "Falta el horario" };

  await prisma.horarioReserva.upsert({
    // La clave ahora incluye el local: dos negocios pueden tener el mismo
    // horario de las 20:00 sin pisarse entre sí.
    where: { storeId_turno_hora: { storeId, turno, hora } },
    update: { activo: true, capacidadPersonas },
    create: { storeId, turno, hora, capacidadPersonas },
  });

  revalidatePath("/admin/reservas/horarios");
  return { ok: true };
}

export async function actualizarCapacidadHorario(
  id: string,
  capacidad: number | null
): Promise<void> {
  await exigirPermiso("reservas.gestionar");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  await prisma.horarioReserva.update({
    where: { id },
    data: { capacidadPersonas: capacidad && capacidad > 0 ? capacidad : null },
  });

  revalidatePath("/admin/reservas/horarios");
  revalidatePath("/admin/reservas");
}

export async function eliminarHorario(id: string) {
  await exigirPermiso("reservas.gestionar");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  await prisma.horarioReserva.delete({ where: { id } });
  revalidatePath("/admin/reservas/horarios");
}

export async function actualizarEstadoReserva(
  id: string,
  estado: string
): Promise<ResultadoAccion> {
  await exigirPermiso("reservas.gestionar");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  if (!ESTADOS_RESERVA.some((e) => e.value === estado)) {
    return { ok: false, error: "Estado inválido" };
  }
  await prisma.reservation.update({ where: { id }, data: { estado } });
  revalidatePath("/admin/reservas");
  return { ok: true };
}

export type ResultadoReservaManual = { ok: true } | { ok: false; error: string };

/**
 * Alta manual de una reserva por el encargado: cliente que llama por
 * teléfono, que reserva en el mostrador, o cualquier otro motivo por el que
 * no pasó por el formulario público de WhatsApp. Se guarda directamente
 * como confirmada y visible en el calendario — a diferencia del flujo
 * público, acá no hay un "enviar por WhatsApp" pendiente: el encargado ya
 * habló con el cliente antes de cargarla.
 */
export async function crearReservaManual(formData: FormData): Promise<ResultadoReservaManual> {
  await exigirPermiso("reservas.gestionar");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const storeId = await idLocalActual();
  const prisma = prismaDelLocal(storeId);

  const fechaTexto = String(formData.get("fecha") ?? "").trim();
  const turno = String(formData.get("turno") ?? "");
  const horario = String(formData.get("horario") ?? "").trim();
  const personas = parseInt(String(formData.get("personas") ?? ""), 10);
  const motivo = String(formData.get("motivo") ?? "");
  const clienteNombre = String(formData.get("clienteNombre") ?? "").trim();
  const clienteTelefono = String(formData.get("clienteTelefono") ?? "").trim();
  const clienteEmail = String(formData.get("clienteEmail") ?? "").trim();
  const nota = String(formData.get("nota") ?? "").trim();

  if (!fechaTexto) return { ok: false, error: "Falta la fecha" };
  if (!TURNOS.some((t) => t.value === turno)) return { ok: false, error: "Elegí un turno" };
  if (!horario) return { ok: false, error: "Falta el horario" };
  if (!personas || personas < 1) return { ok: false, error: "Cantidad de personas inválida" };
  if (!MOTIVOS_RESERVA.some((m) => m.value === motivo)) return { ok: false, error: "Motivo inválido" };
  if (!clienteNombre || !clienteTelefono) return { ok: false, error: "Faltan los datos del cliente" };

  const fecha = fechaAsuncionDesdeTexto(fechaTexto);
  if (!fecha) return { ok: false, error: "Fecha inválida" };

  const numero = await siguienteNumeroReserva(storeId);

  await prisma.reservation.create({
    data: {
      storeId,
      numero,
      fecha,
      turno,
      horario,
      personas,
      motivo,
      clienteNombre,
      clienteTelefono,
      clienteEmail: clienteEmail || null,
      estado: "confirmada",
      enviadoWhatsapp: true,
      nota: nota || null,
    },
  });

  revalidatePath("/admin/reservas");
  return { ok: true };
}

export async function actualizarNotaReserva(id: string, nota: string) {
  await exigirPermiso("reservas.gestionar");
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  await prisma.reservation.update({ where: { id }, data: { nota: nota.trim() || null } });
  revalidatePath("/admin/reservas");
}
