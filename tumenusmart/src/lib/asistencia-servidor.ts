/**
 * Registro de asistencia — lo que el servidor consulta para el celular fijo del local.
 *
 * El celular fijo no tiene sesión de usuario: la llave es el `tokenAsistencia` de la URL (larga, al azar,
 * imposible de adivinar), que lleva al local. Por eso acá se usa el cliente de Prisma SIN filtro, con el
 * `storeId` que sale de ese token siempre explícito en cada consulta: nunca se toca un dato de otro negocio.
 */

import { prisma } from "./prisma";
import { HORAS_TURNO_ABIERTO, esTipoMarcacion, marcacionesPermitidas, type MarcaReciente } from "./asistencia";
import { horaAsuncion } from "./timezone";

const FORMATO_TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

/** El local al que lleva esta llave, o null si no existe o ya se apagó/regeneró. */
export async function localPorToken(token: string) {
  if (!FORMATO_TOKEN.test(token)) return null;
  return prisma.store.findUnique({
    where: { tokenAsistencia: token },
    select: { id: true, nombre: true, logoUrl: true },
  });
}

/**
 * Lo que ya marcó esta persona en el turno actual y lo que puede marcar ahora. Se mira lo de las últimas
 * `HORAS_TURNO_ABIERTO` horas (no solo "hoy") para que un turno que cruza la medianoche siga siendo uno.
 */
export async function estadoDeMarcacion(storeId: string, colaboradorId: string, ahora: Date = new Date()) {
  const desde = new Date(ahora.getTime() - HORAS_TURNO_ABIERTO * 3600_000);
  const filas = await prisma.marcacionAsistencia.findMany({
    where: { storeId, colaboradorId, fecha: { gte: desde } },
    orderBy: { fecha: "desc" },
    take: 8,
    select: { tipo: true, dia: true, fecha: true },
  });

  const ultima = filas[0] ?? null;
  const ultimoTipo = ultima && esTipoMarcacion(ultima.tipo) ? ultima.tipo : null;
  const recientes: MarcaReciente[] = [];
  for (const f of [...filas].reverse()) {
    if (esTipoMarcacion(f.tipo)) recientes.push({ tipo: f.tipo, hora: horaAsuncion(f.fecha) });
  }

  return {
    ultima,
    permitidas: marcacionesPermitidas(ultimoTipo),
    recientes,
  };
}
