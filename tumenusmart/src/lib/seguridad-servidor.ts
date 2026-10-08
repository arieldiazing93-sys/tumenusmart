import { prisma } from "./prisma";
import { passwordCoincide } from "./auth";
import { registrarBitacora } from "./bitacora";
import { pedirIntentoDePin, resolverIntentoDePin } from "./limite-pin";
import { TEXTOS_AUTORIZACION, buscarAutorizante, etiquetaDeEvento, pideClave, type EventoSeguridad } from "./seguridad";

/**
 * La parte de Seguridad que corre en el servidor (ver seguridad.ts): comprueba si el evento está protegido en el local y, si lo está,
 * exige la contraseña de un usuario autorizado ANTES de que la acción toque nada.
 *
 * Cada acción protegida la llama al principio, después de revisar el permiso y lo que llegó, y antes de escribir en la base:
 *
 *     const clave = await exigirAutorizacion(storeId, sesion, "cancelar_productos", autorizacion);
 *     if (!clave.ok) return clave;
 *
 * Devuelve `requiereClave: true` cuando falta o no es correcta: la pantalla muestra el cuadro de la contraseña (ver
 * src/components/Autorizacion.tsx) y vuelve a llamar a la misma acción con la contraseña escrita. Sin esa marca, el error es otro.
 *
 * Quién autoriza: los usuarios activos del local con rol de dueño. Se prueba la contraseña escrita contra cada uno. El freno contra
 * la adivinanza es el mismo de los PIN (limite-pin.ts): se cuenta el intento ANTES de mirar la contraseña, 5 errores bloquean 3 minutos
 * a todo el local y un acierto no borra los errores de los demás. Todo queda en la Bitácora (módulo Seguridad): quién pidió qué y
 * quién lo autorizó, los intentos fallidos y los bloqueos.
 */

export type ResultadoAutorizacion = { ok: true; autorizo: string | null } | { ok: false; error: string; requiereClave: true };

type QuienPide = { nombre?: string | null; email: string; rol?: string | null };

/** Más largo que esto no es una contraseña: ni se prueba (cada prueba es una cuenta pesada). */
const LARGO_MAXIMO_CLAVE = 200;

export async function exigirAutorizacion(
  storeId: string,
  quien: QuienPide,
  evento: EventoSeguridad,
  clave: unknown
): Promise<ResultadoAutorizacion> {
  const local = await prisma.store.findUnique({ where: { id: storeId }, select: { seguridadEventos: true } });
  // El evento no está protegido (o el local no existe: lo demás de la acción ya lo dirá): nada que pedir.
  if (!local || !pideClave(local.seguridadEventos, evento)) return { ok: true, autorizo: null };

  if (typeof clave !== "string" || clave.length === 0) {
    return { ok: false, error: TEXTOS_AUTORIZACION.faltaClave, requiereClave: true };
  }

  const nombreDeQuienPide = quien.nombre?.trim() || quien.email;
  const etiqueta = etiquetaDeEvento(evento);

  // El intento se cuenta ANTES de mirar la contraseña (atómico): una ráfaga de pedidos no puede probar más de 5.
  const intento = await pedirIntentoDePin("autorizacion", storeId);
  if (!intento.ok) return { ok: false, error: TEXTOS_AUTORIZACION.bloqueado(intento.minutos), requiereClave: true };

  const usuarios = await prisma.usuario.findMany({
    where: { storeId, activo: true, rol: "local" },
    select: { id: true, nombre: true, email: true, passwordHash: true },
  });
  const autorizantes = usuarios.map((u) => ({ id: u.id, nombre: u.nombre?.trim() || u.email, passwordHash: u.passwordHash }));

  const encontrado = clave.length > LARGO_MAXIMO_CLAVE ? null : await buscarAutorizante(clave, autorizantes, passwordCoincide);
  const resultado = await resolverIntentoDePin("autorizacion", storeId, encontrado !== null, intento.n);

  if (!encontrado) {
    await registrarBitacora(storeId, quien, {
      modulo: "seguridad",
      accion: resultado.bloqueado ? "autorizacion_bloqueada" : "autorizacion_fallida",
      descripcion: resultado.bloqueado
        ? `${nombreDeQuienPide} escribió una contraseña de autorización incorrecta para “${etiqueta}”: el cuadro se bloqueó ${resultado.minutos} minutos.`
        : `${nombreDeQuienPide} escribió una contraseña de autorización incorrecta para “${etiqueta}”.`,
      detalle: { evento },
    });
    if (autorizantes.length === 0) return { ok: false, error: TEXTOS_AUTORIZACION.sinAutorizantes, requiereClave: true };
    return {
      ok: false,
      error: resultado.bloqueado ? TEXTOS_AUTORIZACION.bloqueado(resultado.minutos) : TEXTOS_AUTORIZACION.incorrecta(resultado.quedan),
      requiereClave: true,
    };
  }

  await registrarBitacora(storeId, quien, {
    modulo: "seguridad",
    accion: "autorizacion_concedida",
    descripcion: `${nombreDeQuienPide} hizo “${etiqueta}” con la autorización de ${encontrado.nombre}.`,
    detalle: { evento, autorizo: encontrado.nombre, autorizoId: encontrado.id },
  });
  return { ok: true, autorizo: encontrado.nombre };
}
