/**
 * Descarta los pedidos de la carta digital que el cliente armó pero nunca mandó por WhatsApp (ver `pedido-vencimiento.ts`).
 *
 * Un pedido así nunca llegó al local: no tiene factura, ni cobro, ni nadie lo atendió. Por eso se BORRA (igual que las
 * reservas de turnos sin aviso) en vez de dejarlo cancelado: no ensucia la lista de pedidos, las estadísticas ni el kardex.
 * Antes de borrarlo se le devuelve al stock lo que había descontado, y se borran también esos movimientos (el de la venta y el de
 * la devolución): el stock queda igual que si el pedido nunca se hubiera armado.
 *
 * Solo toca pedidos de la carta ("menu"), todavía "pendiente" y sin enviar: uno que una persona del local ya confirmó o
 * atendió no se toca nunca, aunque el cliente no haya apretado el botón. Usa el cliente crudo con `storeId` explícito (igual que
 * el resto de las tareas que corren sin sesión).
 *
 * Se llama desde: crear un pedido, la pantalla del pedido del cliente, la lista de pedidos del panel y una tarea programada
 * (así el stock vuelve aunque nadie entre).
 */

import { prisma } from "./prisma";
import { revertirMovimientosVenta } from "./movimientos-stock";
import { limiteDeEnvio } from "./pedido-vencimiento";

const SIN_ENVIAR = { origen: "menu", enviadoWhatsapp: false, estado: "pendiente" } as const;

/**
 * Descarta UN pedido, solo si sigue sin enviar y ya venció. Devuelve true si lo borró. Todo en una transacción: se toma el pedido
 * con la condición en el WHERE (si el cliente lo envió justo ahora, no se toca nada), se devuelve el stock y se borra.
 */
export async function descartarPedidoSinEnviar(pedido: { id: string; storeId: string }, ahora: Date): Promise<boolean> {
  const limite = limiteDeEnvio(ahora);
  return prisma.$transaction(
    async (tx) => {
      const tomado = await tx.order.updateMany({
        where: { id: pedido.id, storeId: pedido.storeId, ...SIN_ENVIAR, createdAt: { lt: limite } },
        data: { estado: "cancelado" },
      });
      if (tomado.count !== 1) return false;
      await revertirMovimientosVenta(tx, pedido.storeId, { orderId: pedido.id }, "Sistema");
      await tx.movimientoStock.deleteMany({ where: { storeId: pedido.storeId, orderId: pedido.id } });
      await tx.order.delete({ where: { id: pedido.id } });
      return true;
    },
    { timeout: 15_000, maxWait: 10_000 }
  );
}

/** Descarta los pedidos vencidos sin enviar de UN local. Nunca lanza: si algo falla se anota y el resto sigue. */
export async function limpiarPedidosSinEnviarDelLocal(storeId: string, ahora: Date): Promise<number> {
  try {
    const vencidos = await prisma.order.findMany({
      where: { storeId, ...SIN_ENVIAR, createdAt: { lt: limiteDeEnvio(ahora) } },
      select: { id: true, storeId: true },
      take: 50,
    });
    let borrados = 0;
    for (const p of vencidos) {
      try {
        if (await descartarPedidoSinEnviar(p, ahora)) borrados += 1;
      } catch (e) {
        console.error("[pedidos-sin-enviar] no se pudo descartar", p.id, e);
      }
    }
    return borrados;
  } catch (e) {
    console.error("[pedidos-sin-enviar] no se pudo limpiar el local", storeId, e);
    return 0;
  }
}

/**
 * Descarta los vencidos de TODOS los locales (la tarea programada). Se corta antes de `presupuestoMs` para poder responder;
 * lo que falte se hace en la próxima corrida.
 */
export async function limpiarPedidosSinEnviarDeTodos(
  ahora: Date,
  presupuestoMs: number
): Promise<{ borrados: number; quedanPendientes: boolean }> {
  const inicio = Date.now();
  const vencidos = await prisma.order.findMany({
    where: { ...SIN_ENVIAR, createdAt: { lt: limiteDeEnvio(ahora) } },
    select: { id: true, storeId: true },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  let borrados = 0;
  let procesados = 0;
  for (const p of vencidos) {
    if (Date.now() - inicio > presupuestoMs) break;
    procesados += 1;
    try {
      if (await descartarPedidoSinEnviar(p, ahora)) borrados += 1;
    } catch (e) {
      console.error("[pedidos-sin-enviar] no se pudo descartar", p.id, e);
    }
  }
  return { borrados, quedanPendientes: procesados < vencidos.length || vencidos.length === 200 };
}
