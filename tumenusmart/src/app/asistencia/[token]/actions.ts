"use server";

import { prisma } from "@/lib/prisma";
import {
  ETIQUETA_TIPO,
  MAXIMO_INTENTOS_PIN,
  MINUTOS_BLOQUEO_PIN,
  calcularTardanza,
  esTipoMarcacion,
  mensajeDeEspera,
  pinValido,
  type TipoMarcacion,
} from "@/lib/asistencia";
import {
  claveDePin,
  estadoDeMarcacion,
  localPorToken,
  type LocalAsistencia,
} from "@/lib/asistencia-servidor";
import { subirFotoAsistencia } from "@/lib/supabase-storage";
import { claveDiaAsuncion, horaAsuncion } from "@/lib/timezone";

/**
 * Las acciones del celular fijo del Registro de asistencia (/asistencia/[token]), sin usuario ni contraseña.
 *
 * La persona toca "Registrar asistencia", pone SU PIN y se saca la selfie: el PIN es lo que la identifica (por eso
 * no se puede repetir dentro de un local), y el sistema decide solo qué marcación le toca (entrada, salida a almorzar,
 * vuelta o salida) según lo último que marcó. Cada acción vuelve a resolver el local desde la llave y busca a la
 * persona SOLO dentro de ese local: aunque alguien arme un dato a mano, nunca toca a otro negocio.
 *
 * Como el PIN identifica, no se puede bloquear "a esa persona" por errarle: se bloquea el celular unos minutos tras
 * varios PIN incorrectos seguidos (cualquier marcación buena vuelve el conteo a cero). Y que la cámara haya visto una
 * cara de frente lo comprueba el propio celular: el servidor no puede verlo, por eso cada marcación guarda la foto,
 * que es la prueba que el dueño revisa contra la selfie del alta.
 */

type ColaboradorIdentificado = {
  id: string;
  nombre: string;
  haceAlmuerzo: boolean;
  horaEntrada: string | null;
  toleranciaMin: number;
};

function texto(valor: FormDataEntryValue | null): string {
  return String(valor ?? "").trim();
}

/** Busca a la persona por su PIN (dentro del local) y lleva la cuenta de los errores seguidos. */
async function identificarPorPin(
  local: LocalAsistencia,
  pin: string
): Promise<{ ok: true; colaborador: ColaboradorIdentificado } | { ok: false; error: string }> {
  const ahora = new Date();
  if (local.bloqueoAsistenciaHasta && local.bloqueoAsistenciaHasta > ahora) {
    const minutos = Math.max(1, Math.ceil((local.bloqueoAsistenciaHasta.getTime() - ahora.getTime()) / 60000));
    return { ok: false, error: `Demasiados PIN incorrectos. Probá de nuevo en ${minutos} min.` };
  }

  if (!pinValido(pin)) return { ok: false, error: "El PIN tiene entre 4 y 6 números." };

  const colaborador = await prisma.colaborador.findFirst({
    where: { storeId: local.id, pinClave: claveDePin(local.id, pin), activo: true },
    select: { id: true, nombre: true, haceAlmuerzo: true, horaEntrada: true, toleranciaMin: true },
  });

  if (!colaborador) {
    // El incremento es atómico: dos intentos a la vez no se pisan el conteo.
    const { intentosPinAsistencia } = await prisma.store.update({
      where: { id: local.id },
      data: { intentosPinAsistencia: { increment: 1 } },
      select: { intentosPinAsistencia: true },
    });
    if (intentosPinAsistencia >= MAXIMO_INTENTOS_PIN) {
      await prisma.store.update({
        where: { id: local.id },
        data: {
          intentosPinAsistencia: 0,
          bloqueoAsistenciaHasta: new Date(ahora.getTime() + MINUTOS_BLOQUEO_PIN * 60000),
        },
      });
      return { ok: false, error: `PIN incorrecto. El celular se bloquea ${MINUTOS_BLOQUEO_PIN} minutos.` };
    }
    const quedan = MAXIMO_INTENTOS_PIN - intentosPinAsistencia;
    return {
      ok: false,
      error: `PIN incorrecto. ${quedan === 1 ? "Te queda 1 intento" : `Te quedan ${quedan} intentos`}.`,
    };
  }

  if (local.intentosPinAsistencia > 0 || local.bloqueoAsistenciaHasta) {
    await prisma.store.update({
      where: { id: local.id },
      data: { intentosPinAsistencia: 0, bloqueoAsistenciaHasta: null },
    });
  }

  return { ok: true, colaborador };
}

export type ResultadoIdentificacion =
  | {
      ok: true;
      nombre: string;
      /** La marcación que toca, la que se registra sola. */
      tipo: TipoMarcacion;
      /** Si hay otra posible (quien no almorzó y se va), para que la pueda elegir en vez de la sugerida. */
      alternativas: TipoMarcacion[];
    }
  | { ok: false; error: string };

/**
 * Primer paso: la persona puso su PIN. Si es de alguien del local devuelve su nombre y qué marcación le toca, así el
 * celular le muestra "Hola, Ariel: vas a marcar la entrada" antes de sacarle la selfie. Si todavía no pasó el tiempo
 * mínimo desde su última marcación, se lo dice acá (antes de la selfie) y le avisa a qué hora puede volver.
 */
export async function identificarPin(token: string, pin: string): Promise<ResultadoIdentificacion> {
  const local = await localPorToken(token);
  if (!local) return { ok: false, error: "Este enlace ya no está activo." };

  const identificado = await identificarPorPin(local, pin);
  if (!identificado.ok) return identificado;
  const { colaborador } = identificado;

  const ahora = new Date();
  const estado = await estadoDeMarcacion(local.id, colaborador.id, colaborador.haceAlmuerzo, ahora);
  const espera = mensajeDeEspera(estado.ultima, local.minutosEntreMarcas, ahora);
  if (espera) return { ok: false, error: espera };

  return {
    ok: true,
    nombre: colaborador.nombre,
    tipo: estado.permitidas[0],
    alternativas: estado.permitidas.slice(1),
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
 * Segundo paso: guarda la marcación. Llega todo junto en el formulario (token, PIN, qué marca, si la cámara vio su cara
 * y la foto). El PIN se vuelve a comprobar acá: el paso anterior no deja "sesión" de ningún tipo.
 */
export async function registrarMarcacion(formData: FormData): Promise<ResultadoMarcacion> {
  const local = await localPorToken(texto(formData.get("token")));
  if (!local) return { ok: false, error: "Este enlace ya no está activo." };

  const identificado = await identificarPorPin(local, texto(formData.get("pin")));
  if (!identificado.ok) return identificado;
  const colaborador = identificado.colaborador;

  const tipo = texto(formData.get("tipo"));
  if (!esTipoMarcacion(tipo)) return { ok: false, error: "Esa marcación no existe." };

  const ahora = new Date();
  const estado = await estadoDeMarcacion(local.id, colaborador.id, colaborador.haceAlmuerzo, ahora);
  if (!estado.permitidas.includes(tipo)) {
    return { ok: false, error: `Ahora no podés marcar "${ETIQUETA_TIPO[tipo]}". Volvé a empezar.` };
  }
  const espera = mensajeDeEspera(estado.ultima, local.minutosEntreMarcas, ahora);
  if (espera) return { ok: false, error: espera };

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File)) return { ok: false, error: "Falta la foto. Probá de nuevo." };

  let fotoUrl: string;
  try {
    fotoUrl = await subirFotoAsistencia(archivo);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo guardar la foto." };
  }

  // El celular dice si su cámara llegó a ver una cara de frente; si no, la marcación queda para revisar.
  const verificada = texto(formData.get("verificada")) === "1";

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
      verificada,
      tardanzaMin,
    },
  });

  return { ok: true, tipo, hora, nombre: colaborador.nombre, tardanzaMin, verificada };
}
