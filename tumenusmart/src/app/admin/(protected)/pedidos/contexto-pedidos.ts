import { prisma as prismaGlobal } from "@/lib/prisma";
import type { PrismaLocal } from "@/lib/prisma-local";
import { estacionActual } from "@/lib/estacion-actual";
import { cargarCatalogoDeVenta } from "@/lib/catalogo-venta";
import { metodosPagoHabilitados } from "@/lib/metodos-pago";
import { puedeFacturarDesdeEstaEstacion, textoSinFactura } from "@/lib/factura-estacion";
import { puede } from "@/lib/permisos";
import { turnoAbierto } from "../pos/turno-actual";
import type { ContextoPedidos } from "./tipos-pedido";

/**
 * Todo lo que el detalle de un pedido necesita saber de esta computadora y del local para operarlo (los mismos datos para la lista de
 * Pedidos y para la página de un pedido suelto): los repartidores, las impresoras, la carta (para cargarle productos), las formas de
 * pago habilitadas y si esta computadora puede facturar (para cobrar). Todo atado al local de la sesión.
 */
export async function cargarContextoPedidos(
  db: PrismaLocal,
  storeId: string,
  rol: string | null | undefined
): Promise<ContextoPedidos> {
  const estacion = await estacionActual(db);
  // Cobrar entra a la caja del turno abierto de ESTA computadora: sin caja vinculada o sin turno no se cobra.
  const turno = estacion ? await turnoAbierto(db, estacion.id) : null;
  const cobro: ContextoPedidos["cobro"] = !estacion
    ? { ok: false, sinTurno: false, motivo: "esta computadora no está vinculada a una caja (vinculala en Estaciones, dentro del punto de venta)." }
    : !turno
      ? { ok: false, sinTurno: true, motivo: "no hay un turno de caja abierto." }
      : { ok: true };
  const [repartidores, estacionConImpresoras, catalogo, local, facturacion] = await Promise.all([
    db.repartidor.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
    estacion
      ? db.estacion.findUnique({
          where: { id: estacion.id },
          select: { areaTicketId: true, impresoras: { select: { areaImpresionId: true, nombreImpresora: true } } },
        })
      : Promise.resolve(null),
    cargarCatalogoDeVenta(db),
    // Store no pertenece a ningún local (no está en MODELOS_POR_LOCAL): se lee con el cliente global.
    prismaGlobal.store.findUnique({
      where: { id: storeId },
      select: {
        nombre: true,
        facturaObligatoria: true,
        aceptaEfectivo: true,
        aceptaTransferencia: true,
        aceptaTarjetaDebito: true,
        aceptaTarjetaCredito: true,
      },
    }),
    // ¿Esta computadora tiene un punto de expedición vigente? Si no, no se ofrece factura (igual que el POS).
    puedeFacturarDesdeEstaEstacion(db),
  ]);

  const impresorasPorArea = Object.fromEntries(
    (estacionConImpresoras?.impresoras ?? []).map((i) => [i.areaImpresionId, i.nombreImpresora])
  );
  return {
    nombreLocal: local?.nombre ?? "el local",
    repartidores,
    nombreImpresoraTicket: estacionConImpresoras?.areaTicketId ? (impresorasPorArea[estacionConImpresoras.areaTicketId] ?? null) : null,
    impresorasPorArea,
    categorias: catalogo.categorias,
    gruposMitad: catalogo.gruposMitad,
    metodosPago: metodosPagoHabilitados(local).map((m) => ({ value: m.value, label: m.label })),
    facturaObligatoria: local?.facturaObligatoria ?? false,
    puedeFacturar: facturacion.puedeFacturar,
    motivoSinFactura: facturacion.motivo ? textoSinFactura(facturacion.motivo) : null,
    diasParaVencerTimbrado: facturacion.diasParaVencerTimbrado,
    puedeAgregar: puede(rol, "pedidos.crear"),
    puedeGestionar: puede(rol, "pedidos.cambiarEstado"),
    cobro,
  };
}
