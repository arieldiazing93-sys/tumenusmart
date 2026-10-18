"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { registrarBitacora } from "@/lib/bitacora";
import { diaDeLaSemana, diaLargo, estadoDeCita, horaDeMinutos, partesLocales } from "@/lib/agenda";
import {
  codigoDeReserva,
  estadoLiberaHorario,
  sanearReservaPanel,
  precioDeReserva,
  tramosDeCancha,
  type DatosReservaPanel,
} from "@/lib/canchas";
import { cargarCanchasPublicas, cargarHorarioCanchas } from "@/lib/canchas-publicas";
import { sincronizarProductoDeCancha } from "@/lib/canchas-producto";
import { MINUTOS_BLOQUEO_SIN_CONFIRMAR } from "@/lib/disponibilidad";
import { aMinutos, nombreDeDia } from "@/lib/horario-trabajo";
import type { DatosCobro } from "@/lib/agenda-cita";
import { estacionActual } from "@/lib/estacion-actual";
import { formatearGuarani } from "@/lib/format";
import { exigirAutorizacion } from "@/lib/seguridad-servidor";
import { SIN_REGISTRO_FISCAL } from "@/lib/tipo-cliente";
import { FORMAS_PAGO_POS, etiquetaFormaPagoPos, type FormaPagoPos } from "@/lib/turno-pos";
import { cancelarVenta, registrarVenta } from "../pos/actions";
import { turnoAbierto } from "../pos/turno-actual";
import { idLocalActual } from "@/lib/local-actual";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal } from "@/lib/prisma-local";
import { instanteAsuncionDesdeTexto } from "@/lib/timezone";

/**
 * `fueraDeHorario`: la hora queda fuera del horario del complejo; la pantalla puede ofrecer "Guardar igual".
 * (Un choque con otra reserva no se puede forzar: una cancha no juega dos partidos a la vez.)
 * `requiereClave`: el precio queda por debajo de la tarifa y los descuentos están protegidos (Ajustes → Seguridad): falta la contraseña de
 * un usuario autorizado, o no es correcta.
 */
export type ResultadoReservaCancha =
  | { ok: true; id: string }
  | { ok: false; error: string; fueraDeHorario?: boolean; requiereClave?: true };

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
export async function guardarReservaCancha(
  id: string | null,
  entrada: DatosReservaPanel,
  /** La contraseña de un usuario autorizado, si poner un precio menor que la tarifa está protegido en Ajustes → Seguridad. */
  autorizacion?: string
): Promise<ResultadoReservaCancha> {
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
        select: { id: true, canchaId: true, estado: true, clienteNombre: true, ventaPosId: true, inicio: true, duracionMin: true, precio: true },
      })
    : null;
  if (id && !anterior) return { ok: false, error: "Esa reserva ya no existe." };
  // Una reserva cobrada queda bloqueada (es una venta de la caja): para tocarla hay que anular el cobro primero.
  if (anterior?.ventaPosId) {
    return { ok: false, error: "Esta reserva ya está cobrada. Anulá el cobro para poder cambiarla." };
  }
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

  // Seguridad (Ajustes): el precio de una reserva anotada en el panel se puede escribir a mano, y uno menor que la tarifa es un descuento. Si
  // el local protegió los descuentos, se pide la contraseña antes de guardar nada. Se compara con la tarifa de AHORA (la misma cuenta que
  // la reserva por la web); no se pide si el precio, la cancha, la hora y la duración siguen como estaban (si la tarifa subió después, una
  // reserva vieja no vuelve a pedir clave), pero sí si se cambió la hora o la duración sin tocar el precio (alargar un partido al mismo
  // precio). Va aunque la reserva esté cancelada: reactivarla después no esquiva el control.
  const [tarifaDeLaCancha] = await cargarCanchasPublicas(prisma, storeId, [cancha.id]);
  if (tarifaDeLaCancha) {
    const tarifa = precioDeReserva(tarifaDeLaCancha, aMinutos(r.hora), r.duracion, r.fecha);
    const igualQueAntes =
      !!anterior &&
      anterior.canchaId === cancha.id &&
      anterior.duracionMin === r.duracion &&
      anterior.inicio.getTime() === inicio.getTime() &&
      Math.round(Number(anterior.precio)) === r.precio;
    if (r.precio < tarifa && !igualQueAntes) {
      const clave = await exigirAutorizacion(storeId, sesion, "descuentos", autorizacion);
      if (!clave.ok) return clave;
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
    select: {
      id: true,
      canchaId: true,
      canchaNombre: true,
      clienteNombre: true,
      estado: true,
      inicio: true,
      fin: true,
      ventaPosId: true,
    },
  });
  if (!reserva) return { ok: false, error: "Esa reserva ya no existe." };
  if (reserva.ventaPosId) {
    return { ok: false, error: "Esta reserva ya está cobrada. Anulá el cobro para poder cambiarla." };
  }
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

// ---------------------------------------------------------------------------
//  Cobrar la reserva
// ---------------------------------------------------------------------------

/**
 * El producto del punto de venta con que se cobra el alquiler de esa cancha («Alquiler Cancha 1», por hora, servicio, con el IVA de su
 * ficha). Lo mantiene al día la ficha de la cancha; acá solo se asegura de que exista (las canchas cargadas antes de que tuvieran
 * producto lo reciben en su primer cobro).
 */
async function productoDeAlquiler(
  storeId: string,
  canchaId: string
): Promise<{ ok: true; productId: string } | { ok: false; error: string }> {
  return sincronizarProductoDeCancha(storeId, canchaId);
}

export type ResultadoCobroReservaCancha =
  | { ok: true; ventaId: string; total: number }
  /** `sinTurno`: no hay turno de caja abierto; la pantalla manda directo a abrirlo (ver src/lib/turno-requerido.ts). */
  | { ok: false; error: string; sinTurno?: true };

/**
 * Cobra la reserva: el detalle funciona como punto de venta.
 *
 * Registra la venta en el turno de caja abierto de ESTA computadora con el MISMO motor que el punto de venta (`registrarVenta`): ticket
 * o factura con todas sus validaciones (timbrado vigente, factura obligatoria, RUC verificado en la DNIT, factura electrónica), forma de
 * pago, IVA, cierre de caja y bitácora. La reserva queda enlazada a esa venta en la misma transacción (Finalizada, o Próxima si todavía
 * no se jugó) y la venta aparece en Día a día → Historial de cuentas.
 *
 * El precio sale de la reserva guardada, nunca del navegador; la línea es el alquiler de SU cancha.
 */
export async function cobrarReservaCancha(reservaId: string, cobro: DatosCobro): Promise<ResultadoCobroReservaCancha> {
  const sesion = await exigirPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const reserva = await db.reservaCancha.findFirst({
    where: { id: reservaId },
    select: {
      id: true,
      canchaId: true,
      canchaNombre: true,
      clienteNombre: true,
      clienteTelefono: true,
      estado: true,
      ventaPosId: true,
      precio: true,
    },
  });
  if (!reserva) return { ok: false, error: "Esa reserva ya no existe." };
  if (reserva.ventaPosId) return { ok: false, error: "Esta reserva ya está cobrada." };
  if (reserva.estado === "cancelada" || reserva.estado === "no_asistio") {
    return { ok: false, error: "Esta reserva está cancelada o sin asistencia. Reactivala para poder cobrarla." };
  }

  const forma: FormaPagoPos | null = FORMAS_PAGO_POS.find((f) => f.valor === cobro?.forma)?.valor ?? null;
  if (!forma) return { ok: false, error: "Elegí cómo paga el cliente." };

  const precio = Math.round(Number(reserva.precio));
  if (!Number.isFinite(precio) || precio <= 0) {
    return { ok: false, error: "El precio de la reserva tiene que ser mayor a cero para cobrar." };
  }

  // La caja: esta computadora tiene que estar vinculada a una estación con el turno abierto.
  const estacion = await estacionActual(db);
  if (!estacion) {
    return {
      ok: false,
      error: "Esta computadora no está vinculada a una caja. Vinculala en Estaciones (punto de venta) para poder cobrar.",
    };
  }
  const turno = await turnoAbierto(db, estacion.id);
  if (!turno) {
    return { ok: false, error: "No hay un turno de caja abierto en esta computadora. Abrilo y volvé a cobrar.", sinTurno: true };
  }

  const producto = await productoDeAlquiler(storeId, reserva.canchaId);
  if (!producto.ok) return producto;

  const esFactura = cobro.comprobanteTipo === "factura";
  const sinRegistro = esFactura && cobro.registroFiscal === "sin";
  const conRegistro = esFactura && !sinRegistro;

  const venta = await registrarVenta(turno.id, {
    pagos: [{ forma, monto: precio }],
    tipoEntrega: "local",
    clienteNombre: reserva.clienteNombre,
    clienteTelefono: reserva.clienteTelefono ?? "",
    nota: `Reserva ${codigoDeReserva(reserva.id)} · ${reserva.canchaNombre}`,
    comprobanteTipo: esFactura ? "factura" : "ticket",
    facturaTipoIdentificacion: esFactura
      ? sinRegistro
        ? SIN_REGISTRO_FISCAL.tipo
        : String(cobro.tipoIdentificacion ?? "")
      : undefined,
    facturaNumeroIdentificacion: conRegistro ? String(cobro.numeroIdentificacion ?? "").trim() : undefined,
    facturaRazonSocial: conRegistro ? String(cobro.razonSocial ?? "").trim() : undefined,
    facturaEmail: conRegistro ? String(cobro.email ?? "").trim() || undefined : undefined,
    facturaTelefono: conRegistro ? String(cobro.telefono ?? "").trim() || undefined : undefined,
    items: [{ productId: producto.productId, cantidad: 1 }],
    reservaCanchaId: reserva.id,
  });
  if (!venta.ok) return venta;

  await registrarBitacora(storeId, sesion, {
    modulo: "canchas",
    accion: "reserva_cobrada",
    descripcion: `Cobró la reserva de ${reserva.clienteNombre} en ${reserva.canchaNombre} (${formatearGuarani(venta.total)}, ${etiquetaFormaPagoPos(forma)}).`,
    entidad: "ReservaCancha",
    entidadId: reserva.id,
    detalle: { venta: venta.ventaId, total: venta.total, forma, comprobante: esFactura ? "factura" : "ticket" },
  });

  refrescar();
  return { ok: true, ventaId: venta.ventaId, total: venta.total };
}

/**
 * Anula el cobro de una reserva (se cargó mal, el cliente se arrepintió): cancela la venta del punto de venta —con sus reglas: solo
 * mientras el turno de caja sigue abierto, con motivo y, si el local lo protegió en Seguridad, con la contraseña de un usuario
 * autorizado— y la reserva vuelve a quedar sin cobrar.
 */
export async function anularCobroReservaCancha(
  reservaId: string,
  motivo: string,
  autorizacion?: string
): Promise<{ ok: true } | { ok: false; error: string; requiereClave?: true }> {
  const sesion = await exigirPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const reserva = await db.reservaCancha.findFirst({
    where: { id: reservaId },
    select: { id: true, ventaPosId: true, clienteNombre: true, canchaNombre: true },
  });
  if (!reserva?.ventaPosId) return { ok: false, error: "Esta reserva no tiene un cobro para anular." };

  const limpio = String(motivo ?? "").trim();
  if (limpio.length < 3) return { ok: false, error: "Escribí por qué se anula el cobro." };

  // cancelarVenta suelta la reserva (vuelve a "sin cobrar") en la misma transacción.
  const anulada = await cancelarVenta(reserva.ventaPosId, limpio, autorizacion);
  if (!anulada.ok) return anulada;

  await registrarBitacora(storeId, sesion, {
    modulo: "canchas",
    accion: "reserva_cobro_anulado",
    descripcion: `Anuló el cobro de la reserva de ${reserva.clienteNombre} en ${reserva.canchaNombre}. Motivo: ${limpio}.`,
    entidad: "ReservaCancha",
    entidadId: reserva.id,
    detalle: { venta: reserva.ventaPosId, motivo: limpio },
  });

  refrescar();
  return { ok: true };
}
