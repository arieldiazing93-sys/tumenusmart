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
 * Son verbos concretos y no secciones: "ver las reservas" y "gestionarlas"
 * son permisos distintos aunque vivan en la misma pantalla.
 */
export type Permiso =
  // --- día a día ---
  | "reservas.ver"
  | "reservas.gestionar"
  | "repartidores.ver"
  | "repartidores.gestionar"
  // El cierre de caja del repartidor: ver cuánto debe y darlo por recibido.
  | "rendiciones.gestionar"
  // Punto de venta: abrir/cerrar SU turno y vender por mostrador.
  | "pos.vender"
  // Presupuestos / cotizaciones para clientes: armarlos, editarlos, borrarlos y sacarles el PDF.
  | "cotizaciones.gestionar"
  // Ver el histórico completo de cuentas y cierres de TODOS los cajeros.
  | "pos.verHistorico"
  // Dar de alta estaciones (notebooks/cajas) y vincular una computadora a
  // una de ellas — configuración de infraestructura, no algo del día a día.
  | "pos.gestionarEstaciones"
  // --- la carta ---
  | "productos.ver"
  | "productos.disponibilidad"
  | "productos.editar"
  | "categorias.ver"
  | "categorias.editar"
  // --- control de stock: insumos, recetas, proveedores, compras, gastos ---
  | "stock.ver"
  | "stock.editar"
  // --- reserva de turnos: la agenda de los negocios que atienden con cita
  // (peluquería, barbería, salón de belleza) ---
  | "agenda.ver"
  // Armar la agenda: cargar y editar el personal (y más adelante horarios,
  // servicios y la página de reservas). Del dueño, como el resto de la configuración.
  | "agenda.configurar"
  // --- registro de asistencia: quién entró y salió, con foto. Del dueño: son datos del personal. ---
  | "asistencia.gestionar"
  // --- servicio comedor: el mozo carga las mesas desde su celular y la caja las opera ---
  // Ver las cuentas abiertas de las mesas.
  | "comedor.ver"
  // Lo de la caja: la pantalla que imprime las comandas y, más adelante, anular productos (con motivo), dar
  // descuentos, cambiar de mozo y cobrar la cuenta.
  | "comedor.gestionar"
  // Dar de alta a los mozos (con su PIN) y sacar el enlace público del Servicio comedor. Del dueño.
  | "comedor.configurar"
  // --- servicio delivery: la caja abre las cuentas de los pedidos a domicilio, las arma, las manda con un repartidor y las cobra ---
  // Ver las cuentas de delivery abiertas.
  | "delivery.ver"
  // Abrir cuentas, cargarles productos, cancelar, dar descuentos, imprimirlas, asignar repartidor y cobrarlas (el cobro pide además
  // `pos.vender`, igual que el comedor).
  | "delivery.gestionar"
  // --- el negocio ---
  | "estadisticas.ver"
  | "ideas.ver"
  | "analytics.ver"
  | "configuracion.editar"
  // Facturación electrónica: subir el certificado digital del contribuyente (con el que se firman las facturas), cargar el
  // código de seguridad (CSC) y elegir el ambiente. Quien tiene la clave del certificado emite facturas a nombre del negocio: solo el dueño.
  | "facturacion.configurar"
  // La bitácora del sistema: quién hizo qué. Solo el dueño la ve.
  | "bitacora.ver"
  | "empleados.gestionar"
  | "fidelizacion.gestionar"
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
  "reservas.ver",
  "reservas.gestionar",
  // Quien atiende el mostrador es quien anota y mueve los turnos, igual que
  // con las reservas de mesa.
  "agenda.ver",
  "repartidores.ver",
  "pos.vender",
  // El cajero ve las mesas y opera la cuenta: es quien habla con el mozo. Lo que cargó el mozo y lo que hace la caja
  // queda en la bitácora.
  "comedor.ver",
  "comedor.gestionar",
  // Quien atiende el teléfono abre y opera las cuentas de delivery: lo que hace queda en la bitácora.
  "delivery.ver",
  "delivery.gestionar",
  // Un presupuesto no mueve plata ni stock ni es un comprobante: quien atiende
  // al cliente puede armarlo (los precios se editan solo en ESE presupuesto,
  // nunca en el catálogo).
  "cotizaciones.gestionar",
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
  // El dueño ve el histórico de TODOS los cajeros, no solo el suyo.
  "pos.verHistorico",
  "pos.gestionarEstaciones",
  "productos.editar",
  "categorias.editar",
  // Toca costos, proveedores y stock del negocio — nivel dueño, no
  // empleado, mismo criterio que "pos.gestionarEstaciones".
  "stock.ver",
  "stock.editar",
  "agenda.configurar",
  "asistencia.gestionar",
  // Quién puede ser mozo y la llave de su enlace: del dueño, como el resto de la configuración del personal.
  "comedor.configurar",
  "estadisticas.ver",
  "ideas.ver",
  "analytics.ver",
  "configuracion.editar",
  "facturacion.configurar",
  "bitacora.ver",
  "empleados.gestionar",
  "fidelizacion.gestionar",
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
