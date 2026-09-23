import { pantallaConPermiso } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { stockPorAlmacen } from "@/lib/stock-almacen";
import { BotonEnlace, Cabecera, Tabla, Th, Vacio } from "@/components/ui";
import { InsumoInventarioFila } from "./InsumoInventarioFila";

export const dynamic = "force-dynamic";

export default async function InventarioPage() {
  const sesion = await pantallaConPermiso("stock.ver");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const [insumos, almacenes, stockDeCadaAlmacen] = await Promise.all([
    prisma.insumo.findMany({
      where: { activo: true },
      orderBy: { nombre: "asc" },
      include: { categoria: { select: { nombre: true } } },
    }),
    // Todos, también los desactivados: el stock que quedó en uno se sigue mostrando.
    prisma.almacen.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, nombre: true, activo: true },
    }),
    stockPorAlmacen(idLocal),
  ]);

  const nombreDeAlmacen = new Map(almacenes.map((a) => [a.id, a.nombre]));
  const almacenesActivos = almacenes.filter((a) => a.activo).map((a) => ({ id: a.id, nombre: a.nombre }));

  return (
    <div>
      <Cabecera
        titulo="Registro de inventario"
        bajada="Contá lo que hay físicamente en cada almacén y corregí el stock del sistema — la diferencia queda en el historial de cada insumo."
        acciones={
          puede(sesion.rol, "stock.editar") && (
            <BotonEnlace href="/admin/stock/inventario/nuevo">+ Nuevo inventario</BotonEnlace>
          )
        }
      />

      {insumos.length === 0 ? (
        <Vacio
          titulo="Todavía no hay insumos activos"
          detalle="Cargalos primero en Insumos."
        />
      ) : (
        <>
          {almacenesActivos.length === 0 && (
            <p className="mb-3 text-sm text-tinta-media">
              Para ajustar el stock primero creá un almacén en Almacenes: el stock siempre queda guardado en uno.
            </p>
          )}
          <Tabla>
            <thead>
              <tr>
                <Th>Insumo</Th>
                <Th>Categoría</Th>
                <Th>Stock del sistema</Th>
                <Th>
                  <span className="sr-only">Ajustar</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {insumos.map((i) => (
                <InsumoInventarioFila
                  key={i.id}
                  id={i.id}
                  nombre={i.nombre}
                  categoriaNombre={i.categoria?.nombre ?? "—"}
                  stockActual={Number(i.stockActual)}
                  unidadMedida={i.unidadMedida}
                  porAlmacen={(stockDeCadaAlmacen.get(i.id) ?? []).map((s) => ({
                    almacenId: s.almacenId,
                    nombre: s.almacenId ? (nombreDeAlmacen.get(s.almacenId) ?? "Almacén eliminado") : "Sin almacén",
                    cantidad: s.cantidad,
                  }))}
                  almacenes={almacenesActivos}
                />
              ))}
            </tbody>
          </Tabla>
        </>
      )}
    </div>
  );
}
