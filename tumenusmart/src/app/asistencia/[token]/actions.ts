"use server";

import { prisma } from "@/lib/prisma";
import {
  MINUTOS_BLOQUEO_PIN,
  calcularTardanza,
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
import { pedirIntentoDePin, resolverIntentoDePin } from "@/lib/limite-pin";
import { compararRostros, rostroValido, tieneRostro } from "@/lib/reconocimiento-facial";
import { registrarBitacora } from "@/lib/bitacora";
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
 * varios PIN incorrectos seguidos (cualquier marcación buena vuelve el conteo a cero). Que la cámara haya visto una
 * cara de frente lo comprueba el propio celular: el servidor no puede verlo, por eso cada marcación guarda la foto,
 * que es la prueba que el dueño revisa contra la selfie del alta.
 *
 * Que la cara sea LA DE ESA PERSONA sí lo comprueba el servidor: el celular manda los 128 números del rostro de la selfie
 * (src/lib/reconocimiento-facial.ts) y acá se comparan con el rostro guardado en el alta. Si es otra cara, la marcación se
 * rechaza, no se guarda la foto, se anota en la Bitácora y cuenta como un error más para el freno del celular. Quien todavía
 * no tiene rostro registrado marca como antes (con el aviso en el panel para que el dueño se lo registre).
 */

type ColaboradorIdentificado = {
  id: string;
  nombre: string;
  haceAlmuerzo: boolean;
  horaEntrada: string | null;
  toleranciaMin: number;
  /** Su rostro del alta (128 números), o vacío si todavía no se lo registraron. */
  rostro: number[];
};

const QUIEN_MARCA = { email: "celular fijo de asistencia", rol: "colaborador" } as const;

/**
 * Una cara que no coincidió (o que no se pudo comprobar) cuenta como un error más del celular: sin esto, alguien con el PIN de otro
 * podría probar caras sin límite. Es el mismo contador de los PIN incorrectos, así que también se llega al bloqueo de unos minutos.
 */
async function contarFalloDeRostro(storeId: string): Promise<void> {
  const intento = await pedirIntentoDePin("asistencia", storeId);
  if (intento.ok) await resolverIntentoDePin("asistencia", storeId, false, intento.n);
}

function texto(valor: FormDataEntryValue | null): string {
  return String(valor ?? "").trim();
}

/** Busca a la persona por su PIN (dentro del local) y lleva la cuenta de los errores seguidos. */
async function identificarPorPin(
  local: LocalAsistencia,
  pin: string
): Promise<{ ok: true; colaborador: ColaboradorIdentificado } | { ok: false; error: string }> {
  if (!pinValido(pin)) return { ok: false, error: "El PIN tiene entre 4 y 6 números." };

  // El intento se cuenta ANTES de mirar el PIN (ver src/lib/limite-pin.ts): una ráfaga de pedidos simultáneos no puede
  // probar más PIN que el tope, y acertar con el PIN propio no borra los errores seguidos de los demás.
  const intento = await pedirIntentoDePin("asistencia", local.id);
  if (!intento.ok) {
    return { ok: false, error: `Demasiados PIN incorrectos. Probá de nuevo en ${intento.minutos} min.` };
  }

  const colaborador = await prisma.colaborador.findFirst({
    where: { storeId: local.id, pinClave: claveDePin(local.id, pin), activo: true },
    select: { id: true, nombre: true, haceAlmuerzo: true, horaEntrada: true, toleranciaMin: true, rostro: true },
  });

  const resultado = await resolverIntentoDePin("asistencia", local.id, !!colaborador, intento.n);
  if (!colaborador) {
    if (resultado.bloqueado) {
      return { ok: false, error: `PIN incorrecto. El celular se bloquea ${MINUTOS_BLOQUEO_PIN} minutos.` };
    }
    const quedan = resultado.quedan;
    return {
      ok: false,
      error: `PIN incorrecto. ${quedan === 1 ? "Te queda 1 intento" : `Te quedan ${quedan} intentos`}.`,
    };
  }

  return { ok: true, colaborador };
}

export type ResultadoIdentificacion =
  | {
      ok: true;
      nombre: string;
      /** La marcación que le toca, la que se registra sola (la decide el sistema, no la persona). */
      tipo: TipoMarcacion;
      /** Si ya tiene rostro registrado: la selfie se comprueba contra él (el celular saca los 128 números y los manda). */
      tieneRostro: boolean;
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
  const estado = await estadoDeMarcacion(local, colaborador.id, colaborador.haceAlmuerzo, ahora);
  const espera = mensajeDeEspera(estado.ultima, local.minutosEntreMarcas, ahora);
  if (espera) return { ok: false, error: espera };

  return { ok: true, nombre: colaborador.nombre, tipo: estado.proxima, tieneRostro: tieneRostro(colaborador.rostro) };
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
  | {
      ok: false;
      error: string;
      /** La cara no se pudo comprobar o no coincidió: el celular le deja volver a sacarse la selfie (unas pocas veces). */
      reintentar?: true;
    };

/**
 * Segundo paso: guarda la marcación. Llega todo junto en el formulario (token, PIN, si la cámara vio su cara y la
 * foto). El PIN se vuelve a comprobar acá: el paso anterior no deja "sesión" de ningún tipo. Qué marcación es la
 * vuelve a decidir el servidor con la hora de ESTE momento: si alguien puso el PIN a las 14:59 y se sacó la selfie a
 * las 15:01, queda la que corresponde a las 15:01, y la pantalla de "Listo" le dice cuál fue.
 */
export async function registrarMarcacion(formData: FormData): Promise<ResultadoMarcacion> {
  const local = await localPorToken(texto(formData.get("token")));
  if (!local) return { ok: false, error: "Este enlace ya no está activo." };

  const identificado = await identificarPorPin(local, texto(formData.get("pin")));
  if (!identificado.ok) return identificado;
  const colaborador = identificado.colaborador;

  // Qué marcación es la decide el servidor en este mismo momento, no el celular: la persona no elige nada.
  const ahora = new Date();
  const estado = await estadoDeMarcacion(local, colaborador.id, colaborador.haceAlmuerzo, ahora);
  const tipo = estado.proxima;
  const espera = mensajeDeEspera(estado.ultima, local.minutosEntreMarcas, ahora);
  if (espera) return { ok: false, error: espera };

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File)) return { ok: false, error: "Falta la foto. Probá de nuevo." };

  // ¿Es la cara de esa persona? Se compara el rostro de la selfie con el que se guardó en el alta. Si todavía no tiene rostro
  // registrado, marca como antes. Va ANTES de guardar la foto: una cara rechazada no deja nada en el almacenamiento.
  let distanciaRostro: number | null = null;
  if (tieneRostro(colaborador.rostro)) {
    const enviado = rostroValido(formData.get("rostro"));
    if (!enviado) {
      await contarFalloDeRostro(local.id);
      return {
        ok: false,
        error: "No pudimos comprobar tu cara. Mirá de frente a la cámara, con buena luz, y probá de nuevo.",
        reintentar: true,
      };
    }
    const comparacion = compararRostros(colaborador.rostro, enviado);
    if (!comparacion.coincide) {
      await contarFalloDeRostro(local.id);
      await registrarBitacora(
        local.id,
        { nombre: colaborador.nombre, ...QUIEN_MARCA },
        {
          modulo: "asistencia",
          accion: "marcacion_rechazada_cara",
          descripcion: `Rechazó una marcación hecha con el PIN de ${colaborador.nombre}: la cara de la selfie no coincidió con la del alta.`,
          entidad: "Colaborador",
          entidadId: colaborador.id,
          detalle: { distancia: comparacion.distancia, tipoQueLeTocaba: tipo },
        }
      );
      return {
        ok: false,
        error: `La cara no coincide con la de ${colaborador.nombre}. Si sos vos, probá de nuevo, de frente y con buena luz.`,
        reintentar: true,
      };
    }
    distanciaRostro = comparacion.distancia;
  }

  let fotoUrl: string;
  try {
    fotoUrl = await subirFotoAsistencia(archivo);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo guardar la foto." };
  }

  // Con rostro comparado y coincidente la persona queda verificada por el servidor. Sin rostro registrado, el celular dice si su
  // cámara llegó a ver una cara de frente; si no, la marcación queda para revisar.
  const verificada = distanciaRostro !== null || texto(formData.get("verificada")) === "1";

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
      distanciaRostro,
      tardanzaMin,
    },
  });

  return { ok: true, tipo, hora, nombre: colaborador.nombre, tardanzaMin, verificada };
}
