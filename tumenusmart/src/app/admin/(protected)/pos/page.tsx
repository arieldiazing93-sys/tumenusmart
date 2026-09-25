import { redirect } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { estacionActual } from "@/lib/estacion-actual";
import { nombreCompleto } from "@/lib/agenda-personal";
import { diasParaVencer } from "@/lib/factura-pos";
import { turnoAbierto } from "./turno-actual";
import { PantallaVenta } from "./PantallaVenta";
import { EstacionNoVinculada } from "./EstacionNoVinculada";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  await pantallaConPermiso("pos.vender");
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
    select: { facturaObligatoria: true, ventasACredito: true, pedirPersonalEnVenta: true },
  });

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

  const categorias = await db.category.findMany({
    where: { activa: true },
    orderBy: { orden: "asc" },
    select: {
      id: true,
      nombre: true,
      productos: {
        where: { disponible: true },
        orderBy: { orden: "asc" },
        select: {
          id: true,
          nombre: true,
          precio: true,
          mitadYMitadGrupo: true,
          mitadYMitadModo: true,
          opciones: {
            where: { tipo: "agregado" },
            orderBy: { orden: "asc" },
            select: { id: true, nombre: true, precioExtra: true },
          },
          gruposAgregados: {
            select: {
              group: {
                select: {
                  modificadores: {
                    where: { product: { disponible: true } },
                    select: { product: { select: { id: true, nombre: true, precio: true } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // Los agregados propios (opciones, ya filtradas a tipo "agregado") más
  // los de cualquier grupo reutilizable adjuntado — cada modificador de un
  // grupo ES un Product real (ver OptionGroupProduct), se usa su propio
  // precio. Ver el mismo criterio en src/app/[slug]/page.tsx.
  function agregadosDe(p: (typeof categorias)[number]["productos"][number]) {
    return [
      ...p.opciones.map((o) => ({ id: o.id, nombre: o.nombre, precioExtra: Number(o.precioExtra) })),
      ...p.gruposAgregados.flatMap((g) =>
        g.group.modificadores.map((m) => ({
          id: m.product.id,
          nombre: m.product.nombre,
          precioExtra: Number(m.product.precio),
        }))
      ),
    ];
  }

  const categoriasVenta = categorias
    .filter((c) => c.productos.length > 0)
    .map((c) => ({
      id: c.id,
      nombre: c.nombre,
      productos: c.productos.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        precio: Number(p.precio),
        agregados: agregadosDe(p),
      })),
    }));

  // Mismo agrupado que el menú público (ver src/app/[slug]/page.tsx): los
  // productos con el mismo mitadYMitadGrupo (sin distinguir mayúsculas ni
  // espacios de más) arman un combo, mostrado dentro de la categoría donde
  // están sus productos.
  type ProductoMitad = {
    id: string;
    nombre: string;
    precio: number;
    mitadYMitadModo: string;
    agregados: { id: string; nombre: string; precioExtra: number }[];
  };
  const gruposPorClave = new Map<
    string,
    { nombreVisible: string; categoriaId: string; productos: ProductoMitad[] }
  >();
  for (const c of categorias) {
    for (const p of c.productos) {
      const nombreGrupo = p.mitadYMitadGrupo?.trim();
      if (!nombreGrupo) continue;
      const clave = nombreGrupo.toLowerCase();
      const entrada = gruposPorClave.get(clave) ?? { nombreVisible: nombreGrupo, categoriaId: c.id, productos: [] };
      entrada.productos.push({
        id: p.id,
        nombre: p.nombre,
        precio: Number(p.precio),
        mitadYMitadModo: p.mitadYMitadModo,
        agregados: agregadosDe(p),
      });
      gruposPorClave.set(clave, entrada);
    }
  }
  const gruposMitad = [...gruposPorClave.values()].filter((g) => g.productos.length > 1);

  return (
    <PantallaVenta
      turnoId={turno.id}
      categorias={categoriasVenta}
      gruposMitad={gruposMitad}
      puedeFacturar={puedeFacturar}
      diasParaVencerTimbrado={diasParaVencerTimbrado}
      facturaObligatoria={store?.facturaObligatoria ?? false}
      ventasACredito={store?.ventasACredito ?? false}
      nombreImpresoraTicket={nombreImpresoraTicket}
      impresorasPorArea={impresorasPorArea}
      personal={personalParaVenta}
    />
  );
}
