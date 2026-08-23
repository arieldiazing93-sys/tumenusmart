import { prisma } from "./prisma";
import { aplicarLocal, type ArgsConsulta } from "./alcance-local";

/**
 * Acceso a la base ya atado a un local.
 *
 * En vez de escribir `where: { storeId }` en cada consulta y confiar en no
 * olvidarlo nunca, se usa este cliente: toda consulta que pase por acá sale
 * filtrada aunque el código no lo pida. Olvidarse deja de ser posible, que
 * es distinto de "acordarse siempre".
 *
 *     const db = prismaDelLocal(storeId);
 *     const pedidos = await db.order.findMany();   // ya viene filtrado
 *
 * Para lo que NO pertenece a un local (buscar un local por su nombre en la
 * URL, listar todos los locales en el superadmin) se sigue usando `prisma`
 * directamente.
 */
export function prismaDelLocal(storeId: string) {
  if (!storeId) throw new Error("prismaDelLocal necesita un local");

  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const argsFiltrados = aplicarLocal(
            model,
            operation,
            args as ArgsConsulta | undefined,
            storeId
          );
          return query(argsFiltrados as typeof args);
        },
      },
    },
  });
}

export type PrismaLocal = ReturnType<typeof prismaDelLocal>;

/**
 * Toma el siguiente número de pedido del local, de a uno y sin repetir.
 *
 * El incremento lo resuelve la base, así que dos pedidos que entren en el
 * mismo instante reciben números distintos — que es exactamente el caso que
 * se da un sábado a la noche.
 */
export async function siguienteNumeroPedido(storeId: string): Promise<number> {
  const local = await prisma.store.update({
    where: { id: storeId },
    data: { contadorPedidos: { increment: 1 } },
    select: { contadorPedidos: true },
  });
  return local.contadorPedidos;
}

/** Igual que el anterior, para reservas. */
export async function siguienteNumeroReserva(storeId: string): Promise<number> {
  const local = await prisma.store.update({
    where: { id: storeId },
    data: { contadorReservas: { increment: 1 } },
    select: { contadorReservas: true },
  });
  return local.contadorReservas;
}
