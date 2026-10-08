/**
 * Seguridad: las acciones que piden la CONTRASEÑA DE UN USUARIO AUTORIZADO antes de hacerse (Ajustes → Seguridad).
 *
 * Para qué: que alguien que se sienta en una caja ya abierta (o que sabe la contraseña del cajero) no pueda cancelar un producto, dar un
 * descuento, cancelar una cuenta o reabrirla sin que el dueño lo sepa. El dueño tilda los eventos que quiere proteger; al hacerlos, el
 * cajero ve un cuadro que pide la contraseña de un usuario autorizado y, si no es correcta, la acción NO se hace.
 *
 * Quién autoriza: según el PERFIL DE SEGURIDAD de cada usuario activo del local. "Administrador" (el dueño, siempre) puede dar la
 * autorización de todos los eventos; "Caja" (los empleados, salvo que se les asigne otro) solo la de los eventos que el dueño tilde para
 * ese perfil. La contraseña sola alcanza para saber quién es (no se pide el usuario): se prueba contra cada uno que pueda autorizar ese
 * evento. Se pide siempre, aunque quien está en la caja sea el mismo que puede autorizar: es lo que frena a quien se sienta en una
 * sesión ya abierta (no sabe la contraseña).
 *
 * Esto es puro (sin base de datos ni sesión): lo usan la pantalla de Ajustes y `seguridad-servidor.ts`, que es quien de verdad
 * exige la contraseña en el servidor (el navegador nunca decide si hace falta).
 */

export type EventoSeguridad = "descuentos" | "cancelar_productos" | "cancelaciones" | "reabrir_cuentas";

export type DefinicionDeEvento = {
  id: EventoSeguridad;
  etiqueta: string;
  /** Qué acciones del sistema cubre, dicho tal cual (también lo que NO cubre, para que el dueño no se confíe de más). */
  detalle: string;
};

/** Los eventos que se pueden proteger, en el orden en que se muestran. */
export const EVENTOS_DE_SEGURIDAD: DefinicionDeEvento[] = [
  {
    id: "descuentos",
    etiqueta: "Descuentos",
    detalle:
      "Dar o cambiar un descuento (también una cortesía) en el mostrador, el comedor y el delivery. Quitar un descuento no lo pide. Los cobros de la Agenda todavía no lo piden.",
  },
  {
    id: "cancelar_productos",
    etiqueta: "Cancelar productos",
    detalle: "Cancelar un producto (o algunas unidades) de una cuenta del comedor o del delivery.",
  },
  {
    id: "cancelaciones",
    etiqueta: "Cancelaciones",
    detalle: "Cerrar una cuenta cancelada y anular una venta ya cobrada (desde el Historial de cuentas, desde Facturas o el cobro de una cita).",
  },
  {
    id: "reabrir_cuentas",
    etiqueta: "Reapertura de cuentas",
    detalle: "Reabrir una cuenta que ya se imprimió (quedó por cobrar) en el comedor o el delivery.",
  },
];

const IDS_VALIDOS = new Set<string>(EVENTOS_DE_SEGURIDAD.map((e) => e.id));

export function esEventoDeSeguridad(valor: unknown): valor is EventoSeguridad {
  return typeof valor === "string" && IDS_VALIDOS.has(valor);
}

export function etiquetaDeEvento(id: string): string {
  return EVENTOS_DE_SEGURIDAD.find((e) => e.id === id)?.etiqueta ?? id;
}

export type ResultadoEventos = { ok: true; eventos: EventoSeguridad[] } | { ok: false; error: string };

/** Revisa lo que llega del navegador al guardar: una lista de eventos conocidos, sin repetidos y en el orden de la pantalla. */
export function limpiarEventos(entrada: unknown): ResultadoEventos {
  if (!Array.isArray(entrada)) return { ok: false, error: "La lista de eventos no es válida." };
  const elegidos = new Set<string>();
  for (const e of entrada) {
    if (!esEventoDeSeguridad(e)) return { ok: false, error: "Hay un evento que no existe. Actualizá la pantalla y volvé a intentar." };
    elegidos.add(e);
  }
  return { ok: true, eventos: EVENTOS_DE_SEGURIDAD.map((e) => e.id).filter((id) => elegidos.has(id)) };
}

/** ¿Este evento está protegido en este local? `activos` es lo que hay guardado (texto libre: puede traer algo viejo, que no cuenta). */
export function pideClave(activos: readonly string[] | null | undefined, evento: EventoSeguridad): boolean {
  return Array.isArray(activos) && activos.includes(evento);
}

// ---------------------------------------------------------------------------------------------------------------------
//  Perfiles de seguridad: quién puede dar la autorización
// ---------------------------------------------------------------------------------------------------------------------

export type PerfilDeSeguridad = "administrador" | "caja";

export const PERFILES_DE_SEGURIDAD: { id: PerfilDeSeguridad; etiqueta: string; detalle: string }[] = [
  { id: "administrador", etiqueta: "Administrador", detalle: "Puede dar la autorización de todos los eventos. Siempre tiene todos los permisos." },
  { id: "caja", etiqueta: "Caja", detalle: "Puede dar la autorización solo de los eventos que se tilden para este perfil." },
];

export function esPerfilDeSeguridad(valor: unknown): valor is PerfilDeSeguridad {
  return valor === "administrador" || valor === "caja";
}

export function etiquetaDePerfil(perfil: PerfilDeSeguridad): string {
  return PERFILES_DE_SEGURIDAD.find((p) => p.id === perfil)?.etiqueta ?? perfil;
}

/**
 * El perfil que tiene un usuario: el dueño (rol "local") es SIEMPRE administrador, sin importar lo que haya guardado (no se puede dejar al
 * local sin nadie que autorice); un empleado tiene el que se le asignó, y si no tiene ninguno guardado (o trae algo viejo), "caja".
 */
export function perfilDeUsuario(rol: string | null | undefined, guardado: string | null | undefined): PerfilDeSeguridad {
  if (rol === "local") return "administrador";
  return esPerfilDeSeguridad(guardado) ? guardado : "caja";
}

/** Los eventos que un perfil puede autorizar: el administrador todos; caja, los tildados (`permisosCaja` es lo guardado en el local). */
export function eventosDelPerfil(perfil: PerfilDeSeguridad, permisosCaja: readonly string[] | null | undefined): EventoSeguridad[] {
  const todos = EVENTOS_DE_SEGURIDAD.map((e) => e.id);
  if (perfil === "administrador") return todos;
  const tildados = Array.isArray(permisosCaja) ? permisosCaja : [];
  return todos.filter((id) => tildados.includes(id));
}

export function puedeAutorizar(perfil: PerfilDeSeguridad, permisosCaja: readonly string[] | null | undefined, evento: EventoSeguridad): boolean {
  return eventosDelPerfil(perfil, permisosCaja).includes(evento);
}

/** Un usuario que puede autorizar, con lo que hace falta para comprobar su contraseña. */
export type Autorizante = { id: string; nombre: string; passwordHash: string };

/**
 * Busca de quién es la contraseña escrita: prueba con cada usuario autorizado y devuelve el primero que coincide (o null).
 * `coincide` es la comparación de contraseñas (scrypt en el servidor); acá se recibe de afuera para poder probarla sin criptografía.
 * Una contraseña vacía nunca coincide con nadie.
 */
export async function buscarAutorizante(
  clave: unknown,
  autorizantes: Autorizante[],
  coincide: (claveEscrita: string, guardado: string) => Promise<boolean>
): Promise<Autorizante | null> {
  if (typeof clave !== "string" || clave.length === 0) return null;
  for (const a of autorizantes) {
    if (await coincide(clave, a.passwordHash)) return a;
  }
  return null;
}

/** Los textos que ve quien pide la autorización, para que sean los mismos en el servidor y en las pruebas. */
export const TEXTOS_AUTORIZACION = {
  faltaClave: "Esta acción pide la contraseña de un usuario autorizado.",
  incorrecta: (quedan: number) => `Contraseña incorrecta. Te ${quedan === 1 ? "queda 1 intento" : `quedan ${quedan} intentos`}.`,
  bloqueado: (minutos: number) =>
    `Demasiados intentos con una contraseña incorrecta. Probá de nuevo en ${minutos} ${minutos === 1 ? "minuto" : "minutos"}.`,
  sinAutorizantes:
    "No hay ningún usuario activo que pueda autorizar esto en este local. Pedile al dueño que revise Ajustes → Seguridad.",
} as const;
