import { cache } from "react";
import { prismaDelLocal } from "./prisma-local";
import { lunesDeLaSemana } from "./analista";
import { ZONA_NEGOCIO } from "./timezone";

export type IdeaGuardada = {
  id: string;
  semana: string;
  clave: string;
  tipo: "oportunidad" | "alerta" | "dato";
  titulo: string;
  dato: string;
  accion: string;
  confianza: "alta" | "media" | "baja";
  detalle: { etiqueta: string; valor: string }[] | null;
  vista: boolean;
};

/**
 * La idea que le toca a este local esta semana, o null si todavía no hay.
 *
 * Va envuelta en cache() porque la consultan tanto el encabezado del panel
 * —para saber si mostrar el aviso— como la pantalla de Pedidos y la de Ideas.
 * Con eso, las tres preguntas se resuelven con una sola consulta a la base.
 */
export const ideaDeLaSemana = cache(
  async (storeId: string): Promise<IdeaGuardada | null> => {
    if (!storeId) return null;

    const semana = lunesDeLaSemana(new Date(), ZONA_NEGOCIO);
    const db = prismaDelLocal(storeId);

    const fila = await db.ideaSemanal.findFirst({ where: { semana } });
    if (!fila) return null;

    return {
      id: fila.id,
      semana: fila.semana,
      clave: fila.clave,
      tipo: normalizarTipo(fila.tipo),
      titulo: fila.titulo,
      dato: fila.dato,
      accion: fila.accion,
      confianza: normalizarConfianza(fila.confianza),
      detalle: leerDetalle(fila.detalle),
      vista: fila.vistaEn != null,
    };
  }
);

/**
 * Marca la idea como leída, para que deje de aparecer el aviso.
 *
 * Solo escribe si estaba sin ver, así llamarla varias veces no hace nada.
 */
export async function marcarIdeaVista(storeId: string, ideaId: string): Promise<void> {
  const db = prismaDelLocal(storeId);
  await db.ideaSemanal.updateMany({
    where: { id: ideaId, vistaEn: null },
    data: { vistaEn: new Date() },
  });
}

function normalizarTipo(valor: string): IdeaGuardada["tipo"] {
  if (valor === "alerta" || valor === "oportunidad") return valor;
  return "dato";
}

function normalizarConfianza(valor: string): IdeaGuardada["confianza"] {
  if (valor === "alta" || valor === "baja") return valor;
  return "media";
}

/**
 * El detalle se guarda como texto JSON. Si por lo que fuera quedara mal
 * escrito, se ignora en vez de romper la pantalla: es información de apoyo,
 * no el contenido principal.
 */
function leerDetalle(crudo: string | null): IdeaGuardada["detalle"] {
  if (!crudo) return null;
  try {
    const valor = JSON.parse(crudo);
    if (!Array.isArray(valor)) return null;
    return valor
      .filter((x) => x && typeof x.etiqueta === "string" && typeof x.valor === "string")
      .map((x) => ({ etiqueta: String(x.etiqueta), valor: String(x.valor) }));
  } catch {
    return null;
  }
}
