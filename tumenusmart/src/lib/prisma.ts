import { PrismaClient } from "@prisma/client";

/**
 * Aviso de configuración de la conexión.
 *
 * Vercel levanta una copia del programa por cada tanda de visitas simultáneas,
 * y cada copia abre sus propias conexiones. Eso obliga a dos cosas:
 *
 *   pgbouncer=true       El repartidor de conexiones de Supabase (puerto 6543)
 *                        no soporta las "sentencias preparadas" que Prisma usa
 *                        por defecto. Sin esta bandera todo anda bien con poco
 *                        tráfico y empieza a fallar justo cuando hay varios
 *                        pedidos a la vez.
 *
 *   connection_limit     Cuántas conexiones abre CADA copia. Sin límite, Prisma
 *                        abre varias por copia y entre todas agotan el cupo.
 *
 * Este chequeo no corta nada: solo deja un aviso claro en los registros de
 * Vercel si la configuración se pierde en el camino. Nunca escribe la dirección
 * de la base, que lleva la contraseña adentro.
 */
function revisarConexion(): void {
  if (process.env.NODE_ENV !== "production") return;

  const direccion = process.env.DATABASE_URL;
  if (!direccion) return;

  try {
    const url = new URL(direccion);

    if (url.port === "6543" && url.searchParams.get("pgbouncer") !== "true") {
      console.warn(
        "[TuMenuSmart] DATABASE_URL apunta al repartidor de conexiones (puerto 6543) " +
          "pero le falta ?pgbouncer=true. Con varios pedidos simultáneos van a aparecer " +
          'errores de "prepared statement already exists".'
      );
    }

    if (!url.searchParams.get("connection_limit")) {
      console.warn(
        "[TuMenuSmart] DATABASE_URL no define connection_limit. En Vercel conviene " +
          "connection_limit=1 para que cada copia del programa no acapare conexiones."
      );
    }
  } catch {
    // Si la dirección no se puede interpretar, no vale la pena molestar: el
    // propio Prisma va a fallar con un mensaje mucho más claro.
  }
}

revisarConexion();

// Evita crear una nueva conexión en cada hot-reload durante desarrollo.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
