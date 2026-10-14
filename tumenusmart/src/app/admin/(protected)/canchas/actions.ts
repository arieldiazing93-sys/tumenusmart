"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { registrarBitacora } from "@/lib/bitacora";
import { diaDeLaSemana, diaLargo, estadoDeCita, horaDeMinutos, partesLocales } from "@/lib/agenda";
import {
  estadoLiberaHorario,
  sanearReservaPanel,
  tramosDeCancha,
  type DatosReservaPanel,
} from "@/lib/canchas";
import { cargarHorarioCanchas } from "@/lib/canchas-publicas";
import { MINUTOS_BLOQUEO_SIN_CONFIRMAR } from "@/lib/disponibilidad";
import { aMinutos, nombreDeDia } from "@/lib/horario-trabajo";
import { idLocalActual } from "@/lib/local-actual";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal } from "@/lib/prisma-local";
import { instanteAsuncionDesdeTexto } from "@/lib/timezone";

/**
 * `fueraDeHorario`: la hora queda fuera del horario del complejo; la pantalla puede ofrecer "Guardar igual".
 * (Un choque con otra reserva no se puede forzar: una cancha no juega dos partidos a la vez.)
 */
export type ResultadoReservaCancha =
  | { ok: true; id: string }
  | { ok: false; error: string; fueraDeHorario?: boolean };

function refrescar() {
  revalidatePath("/admin/canchas");
}

type Tx = Prisma.TransactionClient;

/**
 * La reserva que pisa ese tramo de esa cancha, o null si está libre. Cuentan las que no están canceladas ni con
 * inasistencia y que ya se ven o se pidieron hace poco (una reserva web sin confirmar reserva el horario un rato).
 */
async function reservaQueSePisa(tx: Tx, storeId: string, canchaId: string, inicio: Date, fin: Date, exceptoId: string | null) {
  const limiteSinConfirmar = new Date(Date.now() - MINUTOS_BLOQUEO_SIN_CONFIRMAR * 60_000);
  return tx.reservaCancha.findFirst({
    where: {
      storeId,
      canchaId,
      ...(exceptoId ? { id: { not: exceptoId } } : {}),
      estado: { notIn: ["cancelada", "no_asistio"] },
      inicio: { lt: fin },
      fin: { gt: inicio },
      OR: [{ visible: true }, { createdAt: { gt: limiteSinConfirmar } }],
    },
    select: { clienteNombre: true, inicio: true, fin: true },
  });
}

function mensajeDeChoque(c: { clienteNombre: string; inicio: Date; fin: Date }): string {
  const i = partesLocales(c.inicio);
  const f = partesLocales(c.fin);
  const hasta = f.dia === i.dia ? f.minutos : 24 * 60;
  return `Esa cancha ya está reservada de ${horaDeMinutos(i.minutos)} a ${horaDeMinutos(hasta)} (${c.clienteNombre}). Elegí otra hora u otra cancha.`;
}

/**
 * Anota una reserva nueva (id null) o guarda los cambios de una que ya existe, desde el panel. Quien atiende el mostrador
 * puede hacerlo (`canchas.ver`), igual que con los turnos.
 *
 * Todo lo que llega se vuelve a verificar: la cancha tiene que ser de este local, la hora tiene que estar libre (con un
 * candado por cancha, para que dos personas no tomen el mismo horario a la vez) y, salvo que se pida guardar igual, dentro
 * del horario del complejo.
 */
export async function guardarReservaCancha(id: string | null, entrada: DatosReservaPanel): Promise<ResultadoReservaCancha> {
  const sesion = await exigirPermiso("canchas.ver");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const saneada = sanearReservaPanel(entrada);
  if (!saneada.ok) return saneada;
  const r = saneada.reserva;

  const cancha = await db.cancha.findFirst({ where: { id: r.canchaId }, select: { id: true, nombre: true, activa: true } });
  if (!cancha) return { ok: false, error: "Esa cancha ya no existe. Elegí otra." };

  const anterior = id
    ? await db.reservaCancha.findFirst({
        where: { id },
        select: { id: true, canchaId: true, estado: true, clienteNombre: true },
      })
    : null;
  if (id && !anterior) return { ok: false, error: "Esa reserva ya no existe." };
  // Una cancha desactivada no recibe reservas nuevas (una reserva vieja suya sí se puede seguir editando).
  if (!cancha.activa && (!anterior || anterior.canchaId !== cancha.id)) {
    return { ok: false, error: "Esa cancha está desactivada. Elegí otra." };
  }

  const inicio = instanteAsuncionDesdeTexto(`${r.fecha}T${r.hora}`);
  if (!inicio) return { ok: false, error: "El día o la hora no son válidos" };
  const fin = new Date(inicio.getTime() + r.duracion * 60_000);
  const ocupa = !estadoLiberaHorario(r.estado);

  // Fuera del horario del complejo: se avisa, y con "guardar igual" se anota de todos modos.
  if (ocupa && !r.forzar) {
    const horarios = await cargarHorarioCanchas(prisma, storeId);
    const diaSemana = diaDeLaSemana(r.fecha);
    const horario = horarios.find((h) => h.diaSemana === diaSemana);
    const inicioMin = aMinutos(r.hora);
    const cabe = tramosDeCancha(horario).some((t) => t.desde <= inicioMin && inicioMin + r.duracion <= t.hasta);
    if (!cabe) {
      const dia = nombreDeDia(diaSemana).toLowerCase();
      return {
        ok: false,
        fueraDeHorario: true,
        error: horario?.trabaja
          ? `Ese horario queda fuera de lo que abre el complejo los ${dia} (de ${horario.inicio} a ${horario.fin}).`
          : `El complejo no abre los ${dia}.`,
      };
    }
  }

  const resultado = await prisma.$transaction(
    async (tx) => {
      // Un candado por cancha: dos personas que piden la misma hora a la vez se ordenan, y la segunda ve el horario ocupado.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${cancha.id}))`;

      if (ocupa) {
        const choque = await reservaQueSePisa(tx, storeId, cancha.id, inicio, fin, anterior?.id ?? null);
        if (choque) return { id: null, texto: mensajeDeChoque(choque) };
      }

      const datos = {
        canchaId: cancha.id,
        canchaNombre: cancha.nombre,
        clienteNombre: r.clienteNombre,
        clienteTelefono: r.clienteTelefono,
        nota: r.nota,
        inicio,
        fin,
        duracionMin: r.duracion,
        estado: r.estado,
        precio: r.precio,
      };

      if (anterior) {
        await tx.reservaCancha.updateMany({ where: { id: anterior.id, storeId }, data: datos });
        return { id: anterior.id, texto: null };
      }
      const creada = await tx.reservaCancha.create({
        data: { storeId, ...datos, origen: "panel", visible: true },
        select: { id: true },
      });
      return { id: creada.id, texto: null };
    },
    { timeout: 15_000 }
  );

  // Sin id es que la hora se ocupó (el texto dice con quién se pisa).
  const reservaId = resultado.id;
  if (reservaId === null) return { ok: false, error: resultado.texto ?? "Esa hora ya está ocupada." };

  const cuando = `${diaLargo(r.fecha)} a las ${r.hora}`;
  const cambioEstado = anterior && anterior.estado !== r.estado;
  await registrarBitacora(storeId, sesion, {
    modulo: "canchas",
    accion: !anterior ? "reserva_creada" : cambioEstado ? "reserva_estado_cambiado" : "reserva_modificada",
    descripcion: !anterior
      ? `Anotó una reserva de ${r.clienteNombre} en ${cancha.nombre} (${cuando}).`
      : cambioEstado
        ? `Pasó la reserva de ${r.clienteNombre} en ${cancha.nombre} de ${estadoDeCita(anterior.estado).etiqueta} a ${estadoDeCita(r.estado).etiqueta}.`
        : `Modificó la reserva de ${r.clienteNombre} en ${cancha.nombre} (${cuando}).`,
    entidad: "ReservaCancha",
    entidadId: reservaId,
    detalle: { duracionMin: r.duracion, precio: r.precio, estado: r.estado },
  });

  refrescar();
  return { ok: true, id: reservaId };
}

/**
 * Cambia solo el estado de una reserva (un toque desde el panel: Confirmada, Jugó, No vino, Cancelar). Si la reserva
 * vuelve a ocupar la cancha (estaba cancelada y se reactiva), se revisa de nuevo que el horario siga libre.
 */
export async function cambiarEstadoReservaCancha(id: string, estado: string): Promise<ResultadoReservaCancha> {
  const sesion = await exigirPermiso("canchas.ver");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  if (typeof estado !== "string" || !["pendiente", "proxima", "finalizada", "cancelada", "no_asistio"].includes(estado)) {
    return { ok: false, error: "El estado no es válido" };
  }
  const reserva = await db.reservaCancha.findFirst({
    where: { id },
    select: { id: true, canchaId: true, canchaNombre: true, clienteNombre: true, estado: true, inicio: true, fin: true },
  });
  if (!reserva) return { ok: false, error: "Esa reserva ya no existe." };
  if (reserva.estado === estado) return { ok: true, id };

  const textoDelChoque = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${reserva.canchaId}))`;
      if (!estadoLiberaHorario(estado)) {
        const otra = await reservaQueSePisa(tx, storeId, reserva.canchaId, reserva.inicio, reserva.fin, reserva.id);
        if (otra) return mensajeDeChoque(otra);
      }
      await tx.reservaCancha.updateMany({ where: { id: reserva.id, storeId }, data: { estado } });
      return null;
    },
    { timeout: 15_000 }
  );
  if (textoDelChoque) return { ok: false, error: textoDelChoque };

  await registrarBitacora(storeId, sesion, {
    modulo: "canchas",
    accion: "reserva_estado_cambiado",
    descripcion: `Pasó la reserva de ${reserva.clienteNombre} en ${reserva.canchaNombre} de ${estadoDeCita(reserva.estado).etiqueta} a ${estadoDeCita(estado).etiqueta}.`,
    entidad: "ReservaCancha",
    entidadId: reserva.id,
    detalle: { antes: reserva.estado, despues: estado },
  });

  refrescar();
  return { ok: true, id: reserva.id };
}
