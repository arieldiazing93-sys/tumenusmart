import { redirect } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { estacionActual } from "@/lib/estacion-actual";
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
        },
      },
    },
  });

  const categoriasVenta = categorias
    .filter((c) => c.productos.length > 0)
    .map((c) => ({
      id: c.id,
      nombre: c.nombre,
      productos: c.productos.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        precio: Number(p.precio),
        agregados: p.opciones.map((o) => ({ id: o.id, nombre: o.nombre, precioExtra: Number(o.precioExtra) })),
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
        agregados: p.opciones.map((o) => ({ id: o.id, nombre: o.nombre, precioExtra: Number(o.precioExtra) })),
      });
      gruposPorClave.set(clave, entrada);
    }
  }
  const gruposMitad = [...gruposPorClave.values()].filter((g) => g.productos.length > 1);

  return <PantallaVenta turnoId={turno.id} categorias={categoriasVenta} gruposMitad={gruposMitad} />;
}
