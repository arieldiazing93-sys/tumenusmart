import type { PrismaLocal } from "@/lib/prisma-local";
import { estacionActual } from "@/lib/estacion-actual";
import { diasParaVencer } from "@/lib/factura-pos";

/** Por qué una computadora no puede emitir facturas. */
export type MotivoSinFactura = "sin_estacion" | "sin_punto" | "no_vigente";

/**
 * ¿Se puede emitir una factura desde ESTA computadora? Solo si está vinculada a una estación que tiene un punto de
 * expedición activo y con el timbrado vigente — es lo mismo que decide el Punto de Venta para ofrecer "Factura".
 * Sin eso no hay folio que numerar, así que no tiene sentido preguntar si va con factura o con ticket.
 *
 * `motivo` dice por qué no (null si sí se puede): no hay estación vinculada, la estación no tiene punto de
 * expedición, o el punto está inactivo o con el timbrado vencido. `diasParaVencerTimbrado` es null si la estación no
 * tiene punto de expedición.
 *
 * `db` tiene que ser el cliente del local (`prismaDelLocal`). Lee la cookie de la computadora, así que solo se puede
 * llamar desde una pantalla o una acción del servidor.
 */
export async function puedeFacturarDesdeEstaEstacion(
  db: PrismaLocal
): Promise<{ puedeFacturar: boolean; motivo: MotivoSinFactura | null; diasParaVencerTimbrado: number | null }> {
  const estacion = await estacionActual(db);
  if (!estacion) return { puedeFacturar: false, motivo: "sin_estacion", diasParaVencerTimbrado: null };

  const conPunto = await db.estacion.findUnique({
    where: { id: estacion.id },
    select: { puntoExpedicion: { select: { activo: true, timbradoHasta: true } } },
  });
  const punto = conPunto?.puntoExpedicion ?? null;
  if (!punto) return { puedeFacturar: false, motivo: "sin_punto", diasParaVencerTimbrado: null };

  const vigente = punto.activo && punto.timbradoHasta > new Date();
  return {
    puedeFacturar: vigente,
    motivo: vigente ? null : "no_vigente",
    diasParaVencerTimbrado: diasParaVencer(punto.timbradoHasta),
  };
}

/**
 * La explicación, en palabras del Punto de Venta, de por qué esta computadora no puede facturar. Solo del servidor:
 * a la pantalla llega ya armada como texto.
 */
export function textoSinFactura(motivo: MotivoSinFactura): string {
  if (motivo === "sin_estacion") {
    return "Esta computadora no está vinculada a una estación, así que no tiene punto de expedición. Vinculala en Estaciones.";
  }
  if (motivo === "sin_punto") {
    return "La estación de esta computadora no tiene un punto de expedición asignado. Pedile al dueño que lo asigne en Estaciones.";
  }
  return "El punto de expedición de esta computadora está inactivo o con el timbrado vencido. No se puede emitir factura.";
}
