/**
 * La consulta de un RUC en la DNIT (servicio siConsRUC, Manual 9.6): sirve para saber, ANTES de emitir, si el RUC del comprador
 * existe y está en un estado con el que la DNIT acepta la factura, y para traer su razón social. La traducción de lo que contesta
 * está en `ruc.ts`; los mensajes en `ws.ts`; la conexión en `transporte.ts`.
 *
 * Es una comodidad que NUNCA corta una venta por sí sola: si la DNIT no contesta, el local no tiene certificado o el servicio
 * no está habilitado para el RUC del emisor, devuelve "no disponible" y la venta sigue con el control del dígito verificador.
 * Solo bloquea cuando la DNIT dijo con claridad que el RUC no existe o está en un estado que ella misma rechaza.
 *
 * Solo para el servidor. Cada consulta lleva el local explícito: usa el certificado y el ambiente de ESE local.
 */

import { prisma } from "../prisma";
import { prismaDelLocal } from "../prisma-local";
import { cargarMaterialTls } from "./servidor";
import { interpretarRespuestaRuc, prepararConsultaRuc, verificacion, type VerificacionRuc } from "./ruc";
import { transporteHttps, type Transporte } from "./transporte";
import { cuerpoConsultaRuc, leerRespuestaConsultaRuc, nuevoIdDeEnvio, sobreSoap, type AmbienteWs } from "./ws";

export type OpcionesConsultaRuc = {
  transporte?: Transporte;
  ahora?: Date;
  /** Consultar de nuevo aunque haya una respuesta reciente guardada. */
  forzar?: boolean;
};

/** Cuánto espera un cajero a la DNIT antes de seguir sin ella. */
const ESPERA_MAXIMA_MS = 8_000;
/** Cuánto vale una respuesta ya obtenida: lo justo para que buscar y después crear el cliente no consulte dos veces. */
const VIGENCIA_MS = 5 * 60_000;
const MAXIMO_GUARDADAS = 500;

const guardadas = new Map<string, { hasta: number; verificacion: VerificacionRuc }>();

/**
 * Tope de consultas a la DNIT por local y por minuto: una ayuda para el cajero no necesita más, y así nadie con acceso al panel puede
 * usar el certificado del local para llenar a la DNIT de consultas (el botón «Verificar» se salta lo guardado). Lo que se contesta
 * desde lo guardado no cuenta. Es por instancia del servidor: un tope razonable, no una garantía exacta.
 */
const CONSULTAS_POR_MINUTO = 30;
const recientes = new Map<string, number[]>();

function hayCupo(storeId: string, ahora: number): boolean {
  const lista = (recientes.get(storeId) ?? []).filter((t) => t > ahora - 60_000);
  const hay = lista.length < CONSULTAS_POR_MINUTO;
  if (hay) lista.push(ahora);
  recientes.set(storeId, lista);
  return hay;
}

/** Solo se guarda lo que la DNIT contestó con claridad (encontrado / no existe); jamás un "no se pudo". */
function guardar(clave: string, v: VerificacionRuc, ahora: number): void {
  if (v.resultado !== "encontrado" && v.resultado !== "no_existe") return;
  if (guardadas.size >= MAXIMO_GUARDADAS) {
    for (const [k, g] of guardadas) if (g.hasta <= ahora) guardadas.delete(k);
    if (guardadas.size >= MAXIMO_GUARDADAS) guardadas.clear();
  }
  guardadas.set(clave, { hasta: ahora + VIGENCIA_MS, verificacion: v });
}

/** Para las pruebas: olvida todo lo guardado. */
export function olvidarConsultasDeRuc(): void {
  guardadas.clear();
  recientes.clear();
}

/**
 * Verifica un RUC ("80012345-0") contra la DNIT. Nunca lanza.
 *
 * Orden: primero lo que se puede saber sin la DNIT (forma del número y dígito verificador); después, si el local tiene
 * certificado, la consulta al servicio.
 */
export async function verificarRucEnLaDnit(storeId: string, entrada: string, opciones: OpcionesConsultaRuc = {}): Promise<VerificacionRuc> {
  const preparada = prepararConsultaRuc(entrada);
  if (!preparada.ok) return preparada.verificacion;

  const ahora = opciones.ahora ?? new Date();
  const transporte = opciones.transporte ?? transporteHttps;
  const completo = `${preparada.numero}-${preparada.dvCorrecto}`;
  // Sin la DNIT (local sin certificado, o un fallo): lo único que se sabe es que el dígito está bien. No se muestra nada: no es una falla.
  const sinConsulta = (mensaje: string | null): VerificacionRuc => verificacion({ resultado: "no_disponible", nivel: "info", mensaje, rucCompleto: completo });

  try {
    const db = prismaDelLocal(storeId);
    // Un local que no factura electrónico no tiene certificado: no hay con qué consultar y tampoco hay nada que avisar.
    if ((await db.certificadoFirma.count({ where: { storeId, activo: true } })) === 0) return sinConsulta(null);

    const config = await db.configFacturacionElectronica.findFirst({});
    const ambiente: AmbienteWs = config?.ambiente === "produccion" ? "produccion" : "pruebas";
    const clave = `${storeId}:${ambiente}:${preparada.numero}`;
    if (!opciones.forzar) {
      const previa = guardadas.get(clave);
      if (previa && previa.hasta > ahora.getTime()) return previa.verificacion;
    }

    if (!hayCupo(storeId, ahora.getTime())) return sinConsulta("Se hicieron demasiadas consultas seguidas a la DNIT: esperá un minuto. Se controló solo el dígito verificador.");

    // El cliente común y no el atado al local (`db`): las funciones de servidor.ts lo piden así para poder usarse también dentro de una
    // transacción. Es lo mismo para esta consulta: ya filtra por `storeId` en cada lectura.
    const tls = await cargarMaterialTls(prisma, storeId);
    if (!tls.ok) return sinConsulta(`${tls.error} Se controló solo el dígito verificador.`);

    const contestacion = await transporte({
      servicio: "consultaRuc",
      ambiente,
      cuerpo: sobreSoap(cuerpoConsultaRuc(nuevoIdDeEnvio(ahora), preparada.numero)),
      certificadoPem: tls.certificadoPem,
      clavePem: tls.clavePem,
      tiempoLimiteMs: ESPERA_MAXIMA_MS,
    });
    const resultado = interpretarRespuestaRuc(leerRespuestaConsultaRuc(contestacion.cuerpo), preparada);
    // Una página de error del servidor (HTTP 5xx con HTML) no es una respuesta de la DNIT: ya salió como "no disponible" por ilegible.
    guardar(clave, resultado, ahora.getTime());
    return resultado;
  } catch (e) {
    const motivo = e instanceof Error ? e.message : "sin comunicación";
    return sinConsulta(`No se pudo consultar a la DNIT (${motivo.slice(0, 120)}). Se controló solo el dígito verificador.`);
  }
}
