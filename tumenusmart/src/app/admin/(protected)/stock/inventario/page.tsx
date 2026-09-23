import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera, Tabla, Th, Vacio } from "@/components/ui";
import { InsumoInventarioFila } from "./InsumoInventarioFila";

export const dynamic = "force-dynamic";

export default async function InventarioPage() {
  await pantallaConPermiso("stock.ver");
  const prisma = prismaDelLocal(await idLocalActual());

  const insumos = await prisma.insumo.findMany({
    where: { activo: true },
    orderBy: { nombre: "asc" },
    include: { categoria: { select: { nombre: true } } },
  });

  return (
    <div>
      <Cabecera
        titulo="Registro de inventario"
        bajada="Contá lo que hay físicamente y corregí el stock del sistema — la diferencia queda en el historial de cada insumo."
      />

      {insumos.length === 0 ? (
        <Vacio
          titulo="Todavía no hay insumos activos"
          detalle="Cargalos primero en Insumos."
        />
      ) : (
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
              />
            ))}
          </tbody>
        </Tabla>
      )}
    </div>
  );
}
