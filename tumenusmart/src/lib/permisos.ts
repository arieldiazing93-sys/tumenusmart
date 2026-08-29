/**
 * Quién puede hacer qué.
 *
 * Está todo acá, en un solo archivo y sin base de datos, por dos motivos.
 *
 * El primero es que se puede probar de verdad: los permisos son la clase de
 * regla donde un error no se ve —la pantalla anda igual— hasta que alguien
 * hace algo que no debía.
 *
 * El segundo es que esconder un botón NO es un permiso. Cualquiera puede
 * llamar a una acción del servidor desde afuera del panel. Por eso cada acción
 * pregunta acá antes de tocar la base, y el menú usa lo mismo solo para no
 * mostrar cosas que igual no van a funcionar.
 */

export type Rol = "superadmin" | "local" | "empleado";

/**
 * Cada cosa que se puede hacer en el panel.
 *
 * Son verbos concretos y no secciones: "ver pedidos" y "cambiar el estado de
 * un pedido" son permisos distintos aunque vivan en la misma pantalla.
 */
export type Permiso =
  // --- día a día ---
  | "pedidos.ver"
  | "pedidos.cambiarEstado"
  | "pedidos.asignarRepartidor"
  | "reservas.ver"
  | "reservas.gestionar"
  | "repartidores.ver"
  | "repartidores.gestionar"
  // El cierre de caja del repartidor: ver cuánto debe y darlo por recibido.
  | "rendiciones.gestionar"
  // --- la carta ---
  | "productos.ver"
  | "productos.disponibilidad"
  | "productos.editar"
  | "categorias.ver"
  | "categorias.editar"
  // --- el negocio ---
  | "estadisticas.ver"
  | "ideas.ver"
  | "configuracion.editar"
  | "empleados.gestionar"
  // --- administración de la cartera ---
  | "cartera.gestionar"
  | "usuarios.gestionar";

/**
 * El empleado: cajero, mozo o encargado de turno.
 *
 * La línea que separa lo que puede de lo que no es si la acción es
 * REVERSIBLE y si toca plata.
 *
 * Puede marcar un producto agotado, porque "se acabó la muzzarella" pasa todos
 * los días en el medio del servicio y se deshace en un toque. Si no pudiera,
 * habría que llamar al dueño a su casa o dejar entrar pedidos de algo que no
 * existe — y un pedido cancelado por falta de stock es un cliente que no vuelve.
 *
 * No puede tocar precios, borrar nada, ver la facturación ni la configuración.
 * Nada de eso se arregla con un toque.
 */
const PERMISOS_EMPLEADO: Permiso[] = [
  "pedidos.ver",
  "pedidos.cambiarEstado",
  "pedidos.asignarRepartidor",
  "reservas.ver",
  "reservas.gestionar",
  "repartidores.ver",
  "productos.ver",
  "productos.disponibilidad",
  "categorias.ver",
];

/**
 * El dueño del local: todo lo de su negocio.
 *
 * No entra en la cartera ni administra usuarios de otros locales — eso es del
 * superadmin. Pero sí da de alta y de baja a sus propios empleados, porque el
 * personal de un restaurante rota, y si cada cambio de mozo tuviera que pasar
 * por el proveedor, el proveedor se vuelve el cuello de botella un sábado a la
 * noche.
 */
const PERMISOS_LOCAL: Permiso[] = [
  ...PERMISOS_EMPLEADO,
  "repartidores.gestionar",
  // Queda fuera del empleado a propósito: acá se decide que la plata que
  // trajo el repartidor está bien. Es del dueño hasta que él diga otra cosa.
  "rendiciones.gestionar",
  "productos.editar",
  "categorias.editar",
  "estadisticas.ver",
  "ideas.ver",
  "configuracion.editar",
  "empleados.gestionar",
];

const POR_ROL: Record<Rol, Permiso[]> = {
  empleado: PERMISOS_EMPLEADO,
  local: PERMISOS_LOCAL,
  // El superadmin tiene todo lo del dueño más la cartera y los usuarios.
  superadmin: [...PERMISOS_LOCAL, "cartera.gestionar", "usuarios.gestionar"],
};

/**
 * Convierte lo que hay guardado en la base a un rol conocido.
 *
 * La columna es texto libre, así que puede llegar cualquier cosa: un rol viejo,
 * un typo, un valor de una versión futura. Ante la duda cae en "empleado", que
 * es el que MENOS puede hacer. Si algún día se rompe, que se rompa hacia el
 * lado seguro.
 */
export function normalizarRol(valor: string | null | undefined): Rol {
  if (valor === "superadmin" || valor === "local" || valor === "empleado") return valor;
  return "empleado";
}

/** Si ese rol puede hacer eso. */
export function puede(rol: string | null | undefined, permiso: Permiso): boolean {
  return POR_ROL[normalizarRol(rol)].includes(permiso);
}

/** Todos los permisos de un rol, para armar el menú de una sola pasada. */
export function permisosDe(rol: string | null | undefined): Permiso[] {
  return [...POR_ROL[normalizarRol(rol)]];
}

/** Cómo se llama el rol en pantalla. */
export function etiquetaRol(rol: string | null | undefined): string {
  const nombres: Record<Rol, string> = {
    superadmin: "Administrador del sistema",
    local: "Dueño del local",
    empleado: "Empleado",
  };
  return nombres[normalizarRol(rol)];
}
