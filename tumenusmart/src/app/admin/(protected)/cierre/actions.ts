"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { exigirPermiso } from "@/lib/auth";
import { resumirCierre } from "@/lib/rendicion";
import { instanteAsuncionDesdeTexto } from "@/lib/timezone";
import { estacionActual } from "@/lib/estacion-actual";
import { turnoAbierto } from "../pos/turno-actual";

/**
 * Recibir la plata de un repartidor y cerrar su vuelta.
 *
 * Cierra EXACTAMENTE el turno que se está mirando en pantalla. Si el dueño
 * filtró la jornada de anoche, no se le pueden colar entregas de hace tres
 * días que quedaron sin rendir: firmaría un número y estaría dando por
 * recibido otro.
 *
 * Por eso llegan `cantidadVista` y `efectivoVisto`: el servidor recalcula y,
 * si no coinciden con lo que el navegador mostraba, no cierra nada y pide
 * refrescar. Pasa cuando el repartidor marcó una entrega justo mientras el
 * dueño miraba la pantalla — raro, pero es plata.
 *
 * Los totales se copian a la rendición en vez de calcularse después: si
 * mañana alguien corrige el precio de un pedido de anoche, lo que ya se
 * recibió no puede moverse solo.
 */
export async function cerrarRendicion(
  repartidorId: string,
  notas: string,
  rango: { desde: string; hasta: string } | null,
  cantidadVista: number,
  efectivoVisto: number
): Promise<{ ok: boolean; error?: string; efectivo?: number; rendicionId?: string }> {
  const sesion = await exigirPermiso("rendiciones.gestionar");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const repartidor = await db.repartidor.findUnique({
    where: { id: repartidorId },
    select: { id: true, storeId: true },
  });
  // El filtro por local ya lo aplica prismaDelLocal, pero se comprueba igual:
  // esta acción mueve plata y no es lugar para confiar en una sola defensa.
  if (!repartidor || repartidor.storeId !== storeId) {
    return { ok: false, error: "Ese repartidor no es de este local" };
  }

  // El rango llega como texto en hora de Paraguay y se traduce acá, del mismo
  // modo que lo hizo la pantalla al mostrarlo. Si viniera ya convertido desde
  // el navegador, dependería del reloj del aparato del dueño.
  let entregadoEn: { gte: Date; lt: Date } | undefined;
  if (rango) {
    const desde = instanteAsuncionDesdeTexto(rango.desde);
    const hasta = instanteAsuncionDesdeTexto(rango.hasta);
    if (!desde || !hasta) return { ok: false, error: "El rango de fechas no es válido" };
    entregadoEn = { gte: desde, lt: hasta };
  }

  const pedidos = await db.order.findMany({
    where: { repartidorId, estado: "entregado", rendicionId: null, entregadoEn },
    select: { id: true, numero: true, total: true, cobroMetodo: true },
  });

  if (pedidos.length === 0) {
    return { ok: false, error: "Este repartidor no tiene nada pendiente de rendir en ese turno" };
  }

  const resumen = resumirCierre(pedidos);

  // Lo que se firma tiene que ser lo que se vio. Se comparan las dos cosas
  // —cantidad y monto— porque cualquiera de las dos sola se puede mantener
  // igual por casualidad mientras la otra cambió.
  if (resumen.cantidad !== cantidadVista || Math.round(resumen.efectivo) !== Math.round(efectivoVisto)) {
    return {
      ok: false,
      error:
        "Los números cambiaron mientras mirabas la pantalla (entró otra entrega). " +
        "Refrescá y fijate el total nuevo antes de recibir.",
    };
  }

  // Si esta computadora tiene una estación vinculada con un turno de caja
  // abierto, esta rendición queda atada a ese turno — así el cierre general
  // del turno la puede sumar aparte (ver cerrarTurno en pos/actions.ts). Sin
  // estación/turno (un local que no usa Punto de Venta), queda suelta como
  // siempre.
  const estacion = await estacionActual(db);
  const turno = estacion ? await turnoAbierto(db, estacion.id) : null;

  // Se devuelve el id para poder abrir el comprobante recién cerrado sin
  // tener que buscarlo en la lista.
  const rendicionId = await prisma.$transaction(async (tx) => {
    // Desglosado de "otros" para que el cierre general del turno pueda sumar
    // cada forma a su columna correspondiente de mostrador (ver
    // pos/turnos/[id]/page.tsx) — resumen.porMetodo ya lo trae calculado,
    // acá solo se extrae cada uno.
    const montoDe = (metodo: string) => resumen.porMetodo.find((m) => m.metodo === metodo)?.monto ?? 0;

    const rendicion = await tx.rendicion.create({
      data: {
        storeId,
        repartidorId,
        cantidadPedidos: resumen.cantidad,
        totalEfectivo: resumen.efectivo,
        totalOtros: resumen.otros,
        totalTransferencia: montoDe("transferencia"),
        totalTarjetaDebito: montoDe("tarjeta_debito"),
        totalTarjetaCredito: montoDe("tarjeta_credito"),
        recibidoPor: sesion.nombre?.trim() || sesion.email,
        notas: notas.trim() || null,
        turnoPosId: turno?.id,
      },
    });

    // Se marcan por id y no repitiendo el filtro: si mientras se cerraba
    // entró otra entrega, esa NO debe colarse en una rendición cuyos totales
    // ya se calcularon sin ella. Queda pendiente para la próxima vuelta.
    await tx.order.updateMany({
      where: { id: { in: pedidos.map((p) => p.id) } },
      data: { rendicionId: rendicion.id },
    });

    return rendicion.id;
  });

  revalidatePath("/admin/cierre");
  revalidatePath("/admin/pedidos");
  if (turno) {
    revalidatePath("/admin/pos");
    revalidatePath("/admin/pos/turnos");
    revalidatePath(`/admin/pos/turnos/${turno.id}`);
  }
  return { ok: true, efectivo: resumen.efectivo, rendicionId };
}
