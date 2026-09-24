import { prisma } from "./prisma";

/**
 * La bitácora del sistema: quién hizo qué y cuándo.
 *
 * Cada acción importante (cancelar una venta, anular una factura, cargar una
 * compra, cambiar un precio…) deja una fila en la tabla Bitacora, con el
 * usuario, lo que hizo en una frase y los datos de apoyo. Solo se agrega:
 * nunca se edita ni se borra.
 *
 * Es un rastro, no parte de la operación: si por algún motivo no se puede
 * escribir, se avisa en el registro del servidor y la acción del usuario sigue
 * adelante — que falle la bitácora nunca tiene que impedir una venta o una
 * compra. Por eso se llama DESPUÉS de que la acción ya salió bien.
 */

/** Las áreas del sistema, para agrupar y filtrar la bitácora. */
export const MODULOS_BITACORA = [
  { valor: "ventas", etiqueta: "Ventas" },
  { valor: "caja", etiqueta: "Caja y turnos" },
  { valor: "facturas", etiqueta: "Facturas" },
  { valor: "pedidos", etiqueta: "Pedidos" },
  { valor: "compras", etiqueta: "Compras y pagos" },
  { valor: "stock", etiqueta: "Stock" },
  { valor: "gastos", etiqueta: "Gastos" },
  { valor: "productos", etiqueta: "Productos y precios" },
  { valor: "cotizaciones", etiqueta: "Cotizaciones" },
  { valor: "clientes", etiqueta: "Clientes" },
  { valor: "empleados", etiqueta: "Empleados" },
  { valor: "agenda", etiqueta: "Agenda y turnos" },
  { valor: "configuracion", etiqueta: "Configuración" },
] as const;

export type ModuloBitacora = (typeof MODULOS_BITACORA)[number]["valor"];

export function etiquetaModulo(valor: string): string {
  return MODULOS_BITACORA.find((m) => m.valor === valor)?.etiqueta ?? valor;
}

/** Lo que hace falta saber de quien hizo la acción (la sesión que devuelve exigirPermiso). */
export type QuienHizo = { nombre?: string | null; email: string; rol?: string | null };

export type DatosBitacora = {
  modulo: ModuloBitacora;
  /** Código corto de lo que pasó: "venta_cancelada", "factura_anulada"… */
  accion: string;
  /** La frase que se lee en pantalla: "Canceló la venta #0007 (Gs. 45.000). Motivo: se cargó mal." */
  descripcion: string;
  /** Sobre qué registro fue ("VentaPos") y su id, si aplica. */
  entidad?: string;
  entidadId?: string;
  /** Datos de apoyo (montos, antes y después). Se guardan como JSON en texto. */
  detalle?: Record<string, unknown>;
};

/**
 * Anota una acción en la bitácora del local. Nunca lanza: si falla, lo deja en
 * el registro del servidor y sigue.
 *
 * Usa el cliente sin filtro con el `storeId` explícito (igual que los
 * contadores de numeración): la fila siempre queda en el local de quien actuó.
 */
export async function registrarBitacora(storeId: string, quien: QuienHizo, datos: DatosBitacora): Promise<void> {
  try {
    await prisma.bitacora.create({
      data: {
        storeId,
        usuario: quien.nombre?.trim() || quien.email,
        usuarioEmail: quien.email,
        usuarioRol: quien.rol ?? null,
        modulo: datos.modulo,
        accion: datos.accion,
        descripcion: datos.descripcion.slice(0, 500),
        entidad: datos.entidad ?? null,
        entidadId: datos.entidadId ?? null,
        detalle: datos.detalle ? JSON.stringify(datos.detalle).slice(0, 4000) : null,
      },
    });
  } catch (err) {
    console.error("[bitacora] no se pudo registrar", datos.accion, err);
  }
}
