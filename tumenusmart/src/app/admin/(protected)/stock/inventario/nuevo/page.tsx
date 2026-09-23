import Link from "next/link";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { stockPorAlmacen } from "@/lib/stock-almacen";
import { etiquetaUnidadMedida } from "@/lib/unidad-medida";
import { Cabecera, Vacio, clasesBoton } from "@/components/ui";
import { Volver } from "@/components/Volver";
import { NuevoInventario } from "./NuevoInventario";

export const dynamic = "force-dynamic";

export default async function NuevoInventarioPage() {
  await pantallaConPermiso("stock.editar");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const [insumos, categorias, almacenes, stockDeCadaAlmacen] = await Promise.all([
    prisma.insumo.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } }),
    prisma.categoriaInsumo.findMany({ orderBy: { nombre: "asc" } }),
    prisma.almacen.findMany({
      where: { activo: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, nombre: true },
    }),
    stockPorAlmacen(idLocal),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <Volver href="/admin/stock/inventario" texto="Volver a Registro de inventario" className="self-start" />
      <Cabecera
        titulo="Nuevo inventario"
        bajada="Elegí el almacén y las categorías que vas a contar, escribí lo que hay físicamente y mirá la diferencia con el sistema antes de guardar."
      />

      {almacenes.length === 0 ? (
        <Vacio
          titulo="Primero creá un almacén"
          detalle="El stock siempre está en un almacén, así que hace falta al menos uno para hacer un inventario."
          accion={
            <Link href="/admin/stock/almacenes" className={clasesBoton("principal")}>
              Ir a Almacenes
            </Link>
          }
        />
      ) : insumos.length === 0 ? (
        <Vacio titulo="Todavía no hay insumos activos" detalle="Cargalos primero en Insumos." />
      ) : (
        <NuevoInventario
          almacenes={almacenes}
          categorias={categorias.map((c) => ({ id: c.id, nombre: c.nombre }))}
          insumos={insumos.map((i) => {
            // Cuánto hay de este insumo en cada almacén. Lo que quedó de antes
            // sin almacén no se cuenta acá: un inventario se hace por almacén.
            const stock: Record<string, number> = {};
            for (const s of stockDeCadaAlmacen.get(i.id) ?? []) {
              if (s.almacenId) stock[s.almacenId] = s.cantidad;
            }
            return {
              id: i.id,
              nombre: i.nombre,
              categoriaId: i.categoriaId,
              unidad: etiquetaUnidadMedida(i.unidadMedida),
              costoUnitario: i.costoUnitario != null ? Number(i.costoUnitario) : null,
              stock,
            };
          })}
        />
      )}
    </div>
  );
}
