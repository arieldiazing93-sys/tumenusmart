"use server";

import { passwordCoincide } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  ETIQUETA_TIPO,
  MAXIMO_INTENTOS_PIN,
  MINUTOS_BLOQUEO_PIN,
  SEGUNDOS_ENTRE_MARCAS,
  calcularTardanza,
  esTipoMarcacion,
  gestosValidos,
  pinValido,
  type MarcaReciente,
  type TipoMarcacion,
} from "@/lib/asistencia";
import { estadoDeMarcacion, localPorToken } from "@/lib/asistencia-servidor";
import { subirFotoAsistencia } from "@/lib/supabase-storage";
import { claveDiaAsuncion, horaAsuncion } from "@/lib/timezone";

/**
 * Las acciones del celular fijo del Registro de asistencia (/asistencia/[token]), sin usuario ni contraseña.
 *
 * Quien tiene el enlace llega hasta la lista de personas; para marcar hace falta además el PIN de esa persona.
 * Cada acción vuelve a resolver el local desde la llave y busca a la persona SOLO dentro de ese local: aunque
 * alguien arme un id a mano, nunca toca a otro negocio. El PIN se bloquea unos minutos tras varios errores
 * seguidos, así no se puede adivinar probando.
 *
 * Lo que el celular dice sobre los gestos ("hizo parpadeo y boca") lo comprueba el propio celular: el servidor
 * no puede verlo. Por eso cada marcación guarda la foto, que es la prueba que el dueño revisa.
 */

type ColaboradorVerificado = {
  id: string;
  nombre: string;
  horaEntrada: string | null;
  toleranciaMin: number;
};

function texto(valor: FormDataEntryValue | null): string {
  return String(valor ?? "").trim();
}

/** Comprueba el PIN de una persona del local, con el bloqueo por intentos fallidos. */
async function comprobarPin(
  storeId: string,
  colaboradorId: string,
  pin: string
): Promise<{ ok: true; colaborador: ColaboradorVerificado } | { ok: false; error: string }> {
  const colaborador = await prisma.colaborador.findFirst({
    where: { id: colaboradorId, storeId, activo: true },
    select: {
      id: true,
      nombre: true,
      pinHash: true,
      horaEntrada: true,
      toleranciaMin: true,
      intentosFallidos: true,
      bloqueadoHasta: true,
    },
  });
  if (!colaborador) return { ok: false, error: "No se encontró a esa persona." };

  const ahora = new Date();
  if (colaborador.bloqueadoHasta && colaborador.bloqueadoHasta > ahora) {
    const minutos = Math.max(1, Math.ceil((colaborador.bloqueadoHasta.getTime() - ahora.getTime()) / 60000));
    return { ok: false, error: `Demasiados intentos con el PIN. Probá de nuevo en ${minutos} min.` };
  }

  if (!pinValido(pin)) return { ok: false, error: "El PIN tiene entre 4 y 6 números." };

  if (!(await passwordCoincide(pin, colaborador.pinHash))) {
    // El incremento es atómico: dos intentos a la vez no se pisan el conteo.
    const { intentosFallidos } = await prisma.colaborador.update({
      where: { id: colaborador.id },
      data: { intentosFallidos: { increment: 1 } },
      select: { intentosFallidos: true },
    });
    if (intentosFallidos >= MAXIMO_INTENTOS_PIN) {
      await prisma.colaborador.update({
        where: { id: colaborador.id },
        data: { intentosFallidos: 0, bloqueadoHasta: new Date(ahora.getTime() + MINUTOS_BLOQUEO_PIN * 60000) },
      });
      return { ok: false, error: `PIN incorrecto. Se bloqueó por ${MINUTOS_BLOQUEO_PIN} minutos.` };
    }
    const quedan = MAXIMO_INTENTOS_PIN - intentosFallidos;
    return { ok: false, error: `PIN incorrecto. Te ${quedan === 1 ? "queda 1 intento" : `quedan ${quedan} intentos`}.` };
  }

  if (colaborador.intentosFallidos > 0 || colaborador.bloqueadoHasta) {
    await prisma.colaborador.update({
      where: { id: colaborador.id },
      data: { intentosFallidos: 0, bloqueadoHasta: null },
    });
  }

  return {
    ok: true,
    colaborador: {
      id: colaborador.id,
      nombre: colaborador.nombre,
      horaEntrada: colaborador.horaEntrada,
      toleranciaMin: colaborador.toleranciaMin,
    },
  };
}

export type ResultadoPin =
  | { ok: true; nombre: string; permitidas: TipoMarcacion[]; recientes: MarcaReciente[] }
  | { ok: false; error: string };

/**
 * Primer paso: la persona eligió su nombre y puso su PIN. Si es correcto devuelve qué puede marcar ahora y lo
 * que ya marcó en este turno, así el celular le muestra solo los botones que tienen sentido.
 */
export async function verificarPin(token: string, colaboradorId: string, pin: string): Promise<ResultadoPin> {
  const local = await localPorToken(token);
  if (!local) return { ok: false, error: "Este enlace ya no está activo." };

  const comprobado = await comprobarPin(local.id, colaboradorId, pin);
  if (!comprobado.ok) return comprobado;

  const estado = await estadoDeMarcacion(local.id, comprobado.colaborador.id);
  return {
    ok: true,
    nombre: comprobado.colaborador.nombre,
    permitidas: estado.permitidas,
    recientes: estado.recientes,
  };
}

export type ResultadoMarcacion =
  | {
      ok: true;
      tipo: TipoMarcacion;
      hora: string;
      nombre: string;
      /** Minutos de tardanza si marcó la entrada fuera de la tolerancia; 0 o NULL = a tiempo / sin control. */
      tardanzaMin: number | null;
      verificada: boolean;
    }
  | { ok: false; error: string };

/**
 * Segundo paso: guarda la marcación. Llega todo junto en el formulario (token, persona, PIN, qué marca, los
 * gestos y la foto). El PIN se vuelve a comprobar acá: el paso anterior no deja "sesión" de ningún tipo.
 */
export async function registrarMarcacion(formData: FormData): Promise<ResultadoMarcacion> {
  const local = await localPorToken(texto(formData.get("token")));
  if (!local) return { ok: false, error: "Este enlace ya no está activo." };

  const comprobado = await comprobarPin(local.id, texto(formData.get("colaboradorId")), texto(formData.get("pin")));
  if (!comprobado.ok) return comprobado;
  const colaborador = comprobado.colaborador;

  const tipo = texto(formData.get("tipo"));
  if (!esTipoMarcacion(tipo)) return { ok: false, error: "Esa marcación no existe." };

  const ahora = new Date();
  const estado = await estadoDeMarcacion(local.id, colaborador.id, ahora);
  if (!estado.permitidas.includes(tipo)) {
    return { ok: false, error: `Ahora no podés marcar "${ETIQUETA_TIPO[tipo]}". Volvé a empezar.` };
  }
  if (estado.ultima && ahora.getTime() - estado.ultima.fecha.getTime() < SEGUNDOS_ENTRE_MARCAS * 1000) {
    return { ok: false, error: "Ya marcaste hace un momento. Esperá unos segundos." };
  }

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File)) return { ok: false, error: "Falta la foto. Probá de nuevo." };

  let fotoUrl: string;
  try {
    fotoUrl = await subirFotoAsistencia(archivo);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo guardar la foto." };
  }

  let gestos: string[] = [];
  try {
    gestos = gestosValidos(JSON.parse(texto(formData.get("gestos")) || "[]"));
  } catch {
    gestos = [];
  }
  const verificada = texto(formData.get("verificada")) === "1" && gestos.length > 0;

  const hora = horaAsuncion(ahora);
  // La salida, el almuerzo y la vuelta son del turno que ya está abierto (su jornada es la de la entrada);
  // una entrada abre la jornada de hoy.
  const dia = tipo === "entrada" || !estado.ultima ? claveDiaAsuncion(ahora) : estado.ultima.dia;
  const tardanzaMin =
    tipo === "entrada" ? calcularTardanza(colaborador.horaEntrada, colaborador.toleranciaMin, hora) : null;

  await prisma.marcacionAsistencia.create({
    data: {
      storeId: local.id,
      colaboradorId: colaborador.id,
      tipo,
      fecha: ahora,
      dia,
      fotoUrl,
      gestos,
      verificada,
      tardanzaMin,
    },
  });

  return { ok: true, tipo, hora, nombre: colaborador.nombre, tardanzaMin, verificada };
}
