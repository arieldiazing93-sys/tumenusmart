import { Volver } from "@/components/Volver";
import { notFound } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { DetallePedido } from "../DetallePedido";
import { cargarContextoPedidos } from "../contexto-pedidos";
import { aFilaDePedido } from "../tipos-pedido";

export const dynamic = "force-dynamic";

/**
 * Un pedido suelto (el enlace directo, por ejemplo al terminar de cargarlo): es el mismo detalle que se abre a la derecha de la
 * lista de Pedidos.
 */
export default async function DetallePedidoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Layout y página se renderizan en paralelo: sin este chequeo acá, una
  // sesión vencida podía terminar en el `throw` de idLocalActual() de acá
  // abajo antes de que el layout redirigiera a /admin/login.
  const sesion = await pantallaConPermiso("pedidos.ver");

  // Todas las consultas de acá abajo quedan atadas a este local.
  const storeId = await idLocalActual();
  const prisma = prismaDelLocal(storeId);

  const { id } = await params;

  const [pedido, contexto] = await Promise.all([
    prisma.order.findUnique({
      where: { id },
      include: { items: true, deliveryZone: true, repartidor: true },
    }),
    // Repartidores, impresoras de ESTA computadora, la carta y lo necesario para cobrar (ver cargarContextoPedidos).
    cargarContextoPedidos(prisma, storeId, sesion.rol),
  ]);

  if (!pedido) notFound();

  return (
    <div>
      <div className="mb-3">
        <Volver href="/admin/pedidos" texto="Volver a pedidos" />
      </div>
      <div className="max-w-3xl">
        <DetallePedido pedido={aFilaDePedido(pedido)} contexto={contexto} />
      </div>
    </div>
  );
}
