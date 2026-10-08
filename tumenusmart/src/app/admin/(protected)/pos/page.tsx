import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { pantallaConPermiso } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { estacionActual } from "@/lib/estacion-actual";
import { nombreCompleto } from "@/lib/agenda-personal";
import { diasParaVencer } from "@/lib/factura-pos";
import { cargarCatalogoDeVenta } from "@/lib/catalogo-venta";
import { cargarTiposDescuento } from "@/lib/tipos-descuento-servidor";
import { turnoAbierto } from "./turno-actual";
import { PantallaVenta } from "./PantallaVenta";
import { EstacionNoVinculada } from "./EstacionNoVinculada";

export const dynamic = "force-dynamic";

/** La dirección pública de la carta, tomada del dominio con el que se entró al panel. */
async function urlPublicaCarta(slug: string): Promise<string> {
  const cabeceras = await headers();
  const host = cabeceras.get("x-forwarded-host") ?? cabeceras.get("host") ?? "";
  if (!host) return "";
  const protocolo = host.startsWith("localhost") ? "http" : "https";
  return `${protocolo}://${host}/${slug}`;
}

export default async function PosPage() {
  const sesion = await pantallaConPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const estacion = await estacionActual(db);
  if (!estacion) return <EstacionNoVinculada />;

  const turno = await turnoAbierto(db, estacion.id);
  if (!turno) redirect("/admin/pos/abrir");

  // Si esta estación tiene un punto de expedición vigente, el cajero puede
  // elegir Factura además de Ticket al cobrar (ver PantallaVenta).
  const estacionConPunto = await db.estacion.findUnique({
    where: { id: estacion.id },
    select: {
      puntoExpedicion: { select: { activo: true, timbradoHasta: true } },
      areaTicketId: true,
      impresoras: { select: { areaImpresionId: true, nombreImpresora: true } },
    },
  });
  const puntoExpedicion = estacionConPunto?.puntoExpedicion ?? null;
  const puedeFacturar = !!puntoExpedicion?.activo && puntoExpedicion.timbradoHasta > new Date();
  const diasParaVencerTimbrado = puntoExpedicion ? diasParaVencer(puntoExpedicion.timbradoHasta) : null;

  // Impresión automática (QZ Tray) — ver src/lib/impresion-comprobantes.ts.
  // Un mapa área → impresora de ESTA estación, más cuál área imprime el
  // ticket/factura acá.
  const impresorasPorArea = Object.fromEntries(
    (estacionConPunto?.impresoras ?? []).map((i) => [i.areaImpresionId, i.nombreImpresora])
  );
  const nombreImpresoraTicket = estacionConPunto?.areaTicketId
    ? (impresorasPorArea[estacionConPunto.areaTicketId] ?? null)
    : null;

  // Store no pertenece a ningún local (no está en MODELOS_POR_LOCAL), por
  // eso se lee con el cliente global, no con `db`.
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { facturaObligatoria: true, ventasACredito: true, pedirPersonalEnVenta: true, nombre: true, slug: true },
  });
  // La carta pública (enlace y QR) para el botón "Ver mi carta" de arriba.
  const urlCarta = store ? await urlPublicaCarta(store.slug) : "";

  // Solo si el local activó "preguntar el personal al cobrar" (barberías, salones): el personal activo,
  // para elegir a quién se le asigna el trabajo. En los demás negocios el punto de venta no lo muestra.
  const personalParaVenta = store?.pedirPersonalEnVenta
    ? (
        await db.miembroPersonal.findMany({
          where: { activo: true },
          orderBy: [{ orden: "asc" }, { createdAt: "asc" }, { id: "asc" }],
          select: { id: true, nombre: true, apellido: true },
        })
      ).map((p) => ({ id: p.id, nombre: nombreCompleto(p) }))
    : [];

  // La carta lista para vender, con los precios normales y las promociones de cada producto y agregado (mismo armado que usan el
  // comedor, el delivery y el mozo — ver catalogo-venta.ts). La pantalla resuelve sola qué precio vale en cada momento.
  const { categorias: categoriasVenta, gruposMitad, promociones } = await cargarCatalogoDeVenta(db);
  // Los tipos de descuento de Ajustes (Cortesía, Tarjeta…) que se pueden elegir al descontar por porcentaje.
  const tiposDescuento = await cargarTiposDescuento(db);

  return (
    <PantallaVenta
      turnoId={turno.id}
      categorias={categoriasVenta}
      gruposMitad={gruposMitad}
      promociones={promociones}
      tiposDescuento={tiposDescuento}
      puedeFacturar={puedeFacturar}
      diasParaVencerTimbrado={diasParaVencerTimbrado}
      facturaObligatoria={store?.facturaObligatoria ?? false}
      ventasACredito={store?.ventasACredito ?? false}
      nombreImpresoraTicket={nombreImpresoraTicket}
      impresorasPorArea={impresorasPorArea}
      personal={personalParaVenta}
      accesos={{ comedor: puede(sesion.rol, "comedor.ver"), delivery: puede(sesion.rol, "delivery.ver") }}
      carta={store && urlCarta ? { nombre: store.nombre, url: urlCarta } : null}
    />
  );
}
