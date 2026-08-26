/**
 * Lógica del filtro por local, separada de Prisma a propósito.
 *
 * Esta es la pieza que evita que un negocio vea los datos de otro, así que
 * está escrita como funciones puras: reciben los argumentos de una consulta
 * y devuelven los argumentos ya filtrados. Al no depender de Prisma ni de
 * la base, se puede probar de verdad — ver alcance-local.test.
 */

/** Tablas que pertenecen a un local. Store queda afuera: es el local mismo. */
export const MODELOS_POR_LOCAL = new Set([
  "Category",
  "Product",
  "ProductOption",
  "DeliveryZone",
  "Customer",
  "Repartidor",
  "Order",
  "OrderItem",
  "Reservation",
  "HorarioReserva",
  "HorarioAtencion",
  "IdeaSemanal",
]);

/** Operaciones que leen o modifican filas existentes: se filtran por `where`. */
const OPERACIONES_CON_WHERE = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
]);

/** Operaciones que insertan filas: se les completa el local en `data`. */
const OPERACIONES_CON_DATA = new Set(["create", "createMany"]);

export type ArgsConsulta = Record<string, unknown>;

/**
 * Devuelve los argumentos de la consulta con el local ya aplicado.
 *
 * - Al leer, borrar o actualizar, agrega `storeId` al `where`.
 * - Al crear, completa `storeId` en los datos.
 * - En `upsert`, hace las tres cosas.
 *
 * Si el modelo no pertenece a un local (Store), devuelve los argumentos
 * intactos.
 */
export function aplicarLocal(
  modelo: string | undefined,
  operacion: string,
  args: ArgsConsulta | undefined,
  storeId: string
): ArgsConsulta {
  const entrada: ArgsConsulta = args ? { ...args } : {};

  if (!modelo || !MODELOS_POR_LOCAL.has(modelo)) return entrada;
  if (!storeId) {
    // Nunca dejar pasar una consulta sin local: sería justamente la fuga
    // que todo este archivo existe para impedir.
    throw new Error("Consulta sin local asignado");
  }

  if (operacion === "upsert") {
    return {
      ...entrada,
      where: conStoreId(entrada.where, storeId),
      create: conStoreId(entrada.create, storeId),
      update: entrada.update ?? {},
    };
  }

  if (OPERACIONES_CON_DATA.has(operacion)) {
    const datos = entrada.data;
    return {
      ...entrada,
      data: Array.isArray(datos)
        ? datos.map((fila) => conStoreId(fila as ArgsConsulta, storeId))
        : conStoreId(datos, storeId),
    };
  }

  if (OPERACIONES_CON_WHERE.has(operacion)) {
    return { ...entrada, where: conStoreId(entrada.where, storeId) };
  }

  // Operación desconocida (por ejemplo una nueva de Prisma): se filtra
  // igual si acepta `where`, que es la opción prudente.
  return { ...entrada, where: conStoreId(entrada.where, storeId) };
}

/** Agrega storeId a un objeto, sin pisar el resto de sus claves. */
function conStoreId(objeto: unknown, storeId: string): ArgsConsulta {
  const base = objeto && typeof objeto === "object" ? { ...(objeto as ArgsConsulta) } : {};
  return { ...base, storeId };
}

/**
 * Nombre de local válido para usar en la URL: minúsculas, sin acentos ni
 * espacios. "La Fogata Ñemby" -> "la-fogata-nemby".
 */
export function normalizarSlug(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * Nombres que no se pueden usar como local porque chocan con rutas de la
 * aplicación. Si un local se llamara "admin", su menú taparía el panel.
 */
export const SLUGS_RESERVADOS = new Set([
  "admin",
  "super",
  "api",
  "checkout",
  "carrito",
  "pedido",
  "pedidos",
  "reserva",
  "reservas",
  "repartidor",
  "_next",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
]);

export function slugDisponible(slug: string): boolean {
  return slug.length >= 2 && !SLUGS_RESERVADOS.has(slug);
}
