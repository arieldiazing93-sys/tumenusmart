import { Prisma, type PrismaClient } from "@prisma/client";
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

/** Igual que el anterior, para ventas del Punto de Venta. */
export async function siguienteNumeroVentaPos(storeId: string): Promise<number> {
  const local = await prisma.store.update({
    where: { id: storeId },
    data: { contadorVentasPos: { increment: 1 } },
    select: { contadorVentasPos: true },
  });
  return local.contadorVentasPos;
}

/**
 * Igual que las anteriores, para la Clave del cliente — con una diferencia:
 * tiene que poder recibir el `tx` de una transacción en curso, no solo el
 * `prisma` de módulo. Un pedido/reserva/venta se crea SIEMPRE que se pide
 * su número; un Customer se da de alta con upsert, y la mayoría de las
 * veces ya existe. Pedirle la Clave antes de saber si hace falta un CREATE
 * gastaría un número cada vez que un cliente recurrente vuelve a facturar
 * — por eso quien llama a esto lo hace solo en la rama que de verdad va a
 * crear la fila, con el mismo `tx` de esa transacción.
 */
export async function siguienteNumeroCliente(
  db: PrismaClient | Prisma.TransactionClient,
  storeId: string
): Promise<number> {
  const local = await db.store.update({
    where: { id: storeId },
    data: { contadorClientes: { increment: 1 } },
    select: { contadorClientes: true },
  });
  return local.contadorClientes;
}

/**
 * Alta o corrección de un cliente fiscal (RUC/Cédula/etc.), compartida entre
 * todo lo que factura: el cobro del POS (registrarVenta) y la remisión de
 * facturas (remitirFactura). La mayoría de las veces el cliente YA existe
 * (se busca por tipo+número), así que la Clave nueva (siguienteNumeroCliente)
 * se pide únicamente en la rama que de verdad crea la fila — nunca en un
 * update, para no gastar números en clientes recurrentes.
 *
 * Necesita el `tx` de la transacción en curso: la carrera de dos cajas
 * facturando el mismo RUC nuevo al mismo tiempo se resuelve con un `catch`
 * de P2002 que cae a `update` en vez de fallar en medio del cobro.
 */
export async function upsertClienteFiscal(
  db: PrismaClient | Prisma.TransactionClient,
  storeId: string,
  datos: {
    tipoIdentificacion: string;
    numeroIdentificacion: string;
    razonSocial: string;
    email: string;
  }
): Promise<void> {
  const claveFiscal = {
    storeId_tipoIdentificacion_numeroIdentificacion: {
      storeId,
      tipoIdentificacion: datos.tipoIdentificacion,
      numeroIdentificacion: datos.numeroIdentificacion,
    },
  };
  const emailFiscal = datos.email.trim();
  const existente = await db.customer.findUnique({ where: claveFiscal, select: { id: true } });

  if (existente) {
    await db.customer.update({
      where: claveFiscal,
      // Solo se toca el email si vino algo: no hay que borrar uno ya
      // cargado porque esta vez no se volvió a tipear.
      data: { nombre: datos.razonSocial, ...(emailFiscal ? { email: emailFiscal } : {}) },
    });
    return;
  }

  const numeroCliente = await siguienteNumeroCliente(db, storeId);
  try {
    await db.customer.create({
      data: {
        storeId,
        nombre: datos.razonSocial,
        tipoIdentificacion: datos.tipoIdentificacion,
        numeroIdentificacion: datos.numeroIdentificacion,
        email: emailFiscal || null,
        numero: numeroCliente,
      },
    });
  } catch (err) {
    // Otra venta/remisión con el mismo RUC lo creó justo entre el
    // findUnique y este create (dos cajas, mismo instante).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      await db.customer.update({
        where: claveFiscal,
        data: { nombre: datos.razonSocial, ...(emailFiscal ? { email: emailFiscal } : {}) },
      });
    } else {
      throw err;
    }
  }
}
