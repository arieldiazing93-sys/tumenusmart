import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera, Tabla, Th, Td, Tr, Vacio, Pastilla, Tarjeta, Campo, Entrada, Selector, clasesBoton } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";
import { CrearGastoForm } from "./CrearGastoForm";
import { opcionesCategoriaGasto, etiquetaCategoriaGasto } from "@/lib/categoria-gasto";

export const dynamic = "force-dynamic";

export default async function GastosPage() {
  await pantallaConPermiso("stock.ver");
  const prisma = prismaDelLocal(await idLocalActual());

  const [gastos, proveedores, categoriasPropias] = await Promise.all([
    prisma.gasto.findMany({
      orderBy: { fecha: "desc" },
      include: { proveedor: { select: { nombre: true } } },
      take: 100,
    }),
    prisma.proveedor.findMany({
      where: { activo: true },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true },
    }),
    // Las categorías que creó este local, además de las cinco fijas.
    prisma.categoriaGasto.findMany({ select: { nombre: true } }),
  ]);
  const categorias = opcionesCategoriaGasto(categoriasPropias.map((c) => c.nombre));

  return (
    <div>
      <Cabecera
        titulo="Gastos"
        bajada="Gastos generales del negocio — alquiler, servicios, sueldos... No necesitan estar ligados a una compra ni a un proveedor."
      />

      <CrearGastoForm proveedores={proveedores} categorias={categorias} />

      {/* Reporte: cada botón manda este mismo formulario a su propia dirección
          (el Excel se descarga, el PDF se abre en otra pestaña), así que sale con
          lo que está escrito acá. Sin fechas, es el mes actual. */}
      <Tarjeta className="mb-6 flex flex-col gap-3">
        <p className="rotulo text-[0.8rem] font-bold">Reporte de gastos</p>
        <form method="get" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Campo etiqueta="Desde">
            <Entrada type="date" name="desde" />
          </Campo>
          <Campo etiqueta="Hasta">
            <Entrada type="date" name="hasta" />
          </Campo>
          <Campo etiqueta="Categoría">
            <Selector name="categoria" defaultValue="">
              <option value="">Todas</option>
              {categorias.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.etiqueta}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Proveedor">
            <Selector name="proveedor" defaultValue="">
              <option value="">Todos</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Selector>
          </Campo>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
            <button type="submit" formAction="/admin/stock/gastos/exportar" className={clasesBoton("principal", "sm")}>
              Descargar Excel
            </button>
            <button
              type="submit"
              formAction="/admin/stock/gastos/imprimir"
              formTarget="_blank"
              className={clasesBoton("navegar", "sm")}
            >
              Ver reporte / PDF
            </button>
            <span className="text-xs text-tinta-suave">
              Sin fechas, toma el mes actual. Los dos extremos entran en el reporte.
            </span>
          </div>
        </form>
      </Tarjeta>

      {gastos.length === 0 ? (
        <Vacio titulo="Todavía no cargaste ningún gasto" />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th>Concepto</Th>
              <Th>Categoría</Th>
              <Th>Proveedor</Th>
              <Th>Monto</Th>
            </tr>
          </thead>
          <tbody>
            {gastos.map((g) => (
              <Tr key={g.id}>
                <Td>{g.fecha.toLocaleDateString("es-PY")}</Td>
                <Td className="font-medium text-tinta">{g.concepto}</Td>
                <Td>
                  <Pastilla>{etiquetaCategoriaGasto(g.categoria)}</Pastilla>
                </Td>
                <Td>{g.proveedor?.nombre ?? "—"}</Td>
                <Td className="font-medium text-tinta">{formatearGuarani(Number(g.monto))}</Td>
              </Tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </div>
  );
}
