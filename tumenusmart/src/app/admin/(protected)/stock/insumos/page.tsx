import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera, Tabla, Th, Td, Tr, Vacio, Pastilla, BotonEnlace } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";
import { etiquetaUnidadMedida } from "@/lib/unidad-medida";
import { etiquetaIva } from "@/lib/iva";
import { CrearInsumoForm } from "./CrearInsumoForm";

export const dynamic = "force-dynamic";

export default async function InsumosPage() {
  await pantallaConPermiso("stock.ver");
  const prisma = prismaDelLocal(await idLocalActual());

  const [insumos, categorias] = await Promise.all([
    prisma.insumo.findMany({
      orderBy: [{ activo: "desc" }, { nombre: "asc" }],
      include: { categoria: { select: { nombre: true } } },
    }),
    prisma.categoriaInsumo.findMany({ orderBy: { nombre: "asc" } }),
  ]);

  return (
    <div>
      <Cabecera
        titulo="Insumos"
        bajada="Materia prima que controlás aparte de la carta — se le arma una receta a cada producto (en su propia ficha) para que la venta descuente sola."
      />

      <CrearInsumoForm categorias={categorias} />

      {insumos.length === 0 ? (
        <Vacio
          titulo="Todavía no cargaste ningún insumo"
          detalle="Agregá el primero arriba — categoría, unidad y stock inicial son opcionales."
        />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Nombre</Th>
              <Th>Categoría</Th>
              <Th>Stock actual</Th>
              <Th>IVA</Th>
              <Th>Costo unitario</Th>
              <Th>
                <span className="sr-only">Acciones</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {insumos.map((i) => {
              const stock = Number(i.stockActual);
              const bajoMinimo = i.stockMinimo != null && stock < Number(i.stockMinimo);
              return (
                <Tr key={i.id}>
                  <Td className="font-medium text-tinta">
                    {i.nombre}
                    {!i.activo && <span className="ml-2 text-xs text-tinta-suave">(desactivado)</span>}
                  </Td>
                  <Td>{i.categoria?.nombre ?? "—"}</Td>
                  <Td>
                    <span className={bajoMinimo ? "font-semibold text-peligro" : ""}>
                      {stock} {etiquetaUnidadMedida(i.unidadMedida)}
                    </span>
                    {stock < 0 && <Pastilla color="peligro">Negativo</Pastilla>}
                  </Td>
                  <Td>{etiquetaIva(i.iva)}</Td>
                  <Td>{i.costoUnitario != null ? formatearGuarani(Number(i.costoUnitario)) : "—"}</Td>
                  <Td>
                    <BotonEnlace href={`/admin/stock/insumos/${i.id}`} tono="navegar" tam="sm">
                      Editar
                    </BotonEnlace>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Tabla>
      )}
    </div>
  );
}
