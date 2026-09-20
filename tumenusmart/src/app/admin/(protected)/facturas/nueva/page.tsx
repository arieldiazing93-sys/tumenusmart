import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { estacionActual } from "@/lib/estacion-actual";
import { Cabecera, Tarjeta } from "@/components/ui";
import { Volver } from "@/components/Volver";
import { NuevaFacturaForm } from "./NuevaFacturaForm";

export const dynamic = "force-dynamic";

/**
 * Emitir una factura nueva reusando un pedido/cuenta cuya factura anterior
 * se anuló sola (remisión — ver Fase 11 del plan). No es un alta de venta:
 * no se cargan productos acá, se ADJUNTA una cuenta ya existente.
 */
export default async function NuevaFacturaPage() {
  await pantallaConPermiso("pos.verHistorico");

  // Impresión automática (QZ Tray) del ticket/factura al generar la
  // remisión — mismo mecanismo que el resto del panel (ver
  // src/lib/impresion-comprobantes.ts), para no depender del diálogo de
  // impresión del navegador (PDF/elegir impresora).
  const db = prismaDelLocal(await idLocalActual());
  const estacion = await estacionActual(db);
  const estacionConImpresoras = estacion
    ? await db.estacion.findUnique({
        where: { id: estacion.id },
        select: { areaTicketId: true, impresoras: { select: { areaImpresionId: true, nombreImpresora: true } } },
      })
    : null;
  const impresorasPorArea = Object.fromEntries(
    (estacionConImpresoras?.impresoras ?? []).map((i) => [i.areaImpresionId, i.nombreImpresora])
  );
  const nombreImpresoraTicket = estacionConImpresoras?.areaTicketId
    ? (impresorasPorArea[estacionConImpresoras.areaTicketId] ?? null)
    : null;

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4">
        <Volver href="/admin/facturas" texto="Volver a Facturas" />
      </div>
      <Cabecera
        titulo="Nueva factura"
        bajada="Para cuando una factura se anuló por un dato mal cargado (RUC, razón social) y hay que volver a emitirla con los datos corregidos, sobre la misma cuenta."
      />
      <Tarjeta className="shadow-sm">
        <NuevaFacturaForm nombreImpresoraTicket={nombreImpresoraTicket} />
      </Tarjeta>
    </div>
  );
}
