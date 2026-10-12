import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { aplicarLocal, type ArgsConsulta } from "./alcance-local";
import { limpiarTelefonoDeCliente } from "./datos-fiscales";

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

/** Igual que las anteriores, para el N° de cada presupuesto/cotización. */
export async function siguienteNumeroCotizacion(storeId: string): Promise<number> {
  const local = await prisma.store.update({
    where: { id: storeId },
    data: { contadorCotizaciones: { increment: 1 } },
    select: { contadorCotizaciones: true },
  });
  return local.contadorCotizaciones;
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
 *
 * El teléfono es opcional (lo deja el cliente en el cuadro «Nuevo cliente»).
 * Es único por local, así que NUNCA hace fallar la venta: si ya es de otra
 * ficha (por ejemplo la del cliente del mostrador o del delivery, que se
 * identifica por teléfono), simplemente no se guarda en esta. A propósito no
 * se fusionan las dos fichas: la del teléfono lleva el nombre de la PERSONA y
 * la fiscal la razón social, y pisar una con la otra perdería datos.
 */
export async function upsertClienteFiscal(
  db: PrismaClient | Prisma.TransactionClient,
  storeId: string,
  datos: {
    tipoIdentificacion: string;
    numeroIdentificacion: string;
    razonSocial: string;
    email: string;
    telefono?: string | null;
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
  const telefono = limpiarTelefonoDeCliente(datos.telefono);
  const existente = await db.customer.findUnique({ where: claveFiscal, select: { id: true } });

  // Quién tiene ya ese teléfono en este local (si alguien lo tiene).
  const duenoDelTelefono = telefono
    ? await db.customer.findUnique({
        where: { storeId_telefono: { storeId, telefono } },
        select: { id: true },
      })
    : null;

  if (existente) {
    const telefonoLibre = !!telefono && (!duenoDelTelefono || duenoDelTelefono.id === existente.id);
    await db.customer.update({
      where: claveFiscal,
      // Solo se toca el email si vino algo: no hay que borrar uno ya
      // cargado porque esta vez no se volvió a tipear. Con el teléfono,
      // igual: solo se guarda si vino y no es de otra ficha.
      data: {
        nombre: datos.razonSocial,
        ...(emailFiscal ? { email: emailFiscal } : {}),
        ...(telefonoLibre ? { telefono } : {}),
      },
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
        // Si el número ya es de otra ficha (con otro documento), esta queda sin teléfono: no se pisa ni se frena el cobro.
        telefono: telefono && !duenoDelTelefono ? telefono : null,
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
