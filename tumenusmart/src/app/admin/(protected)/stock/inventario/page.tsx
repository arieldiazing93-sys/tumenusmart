import { pantallaConPermiso } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { stockPorAlmacen } from "@/lib/stock-almacen";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { BotonEnlace, Cabecera, Campo, Entrada, Selector, Tabla, Tarjeta, Th, Vacio, clasesBoton } from "@/components/ui";
import { InsumoInventarioFila } from "./InsumoInventarioFila";
import { InventariosRegistrados } from "./InventariosRegistrados";

export const dynamic = "force-dynamic";

/**
 * Registro de inventario, en dos vistas: los inventarios que ya se guardaron
 * (el historial, se abre con doble clic) y el stock actual de cada insumo, con
 * su ajuste puntual. Por defecto se ve el historial.
 */
export default async function InventarioPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string }>;
}) {
  const sesion = await pantallaConPermiso("stock.ver");
  const { vista } = await searchParams;
  const verInsumos = vista === "insumos";

  const idLocal = await idLocalActual();

  return (
    <div>
      <Cabecera
        titulo="Registro de inventario"
        bajada="Los inventarios que contaste en cada almacén, con lo que dijo el sistema, lo que había y la diferencia. Cada diferencia también queda en el historial del insumo."
        acciones={
          puede(sesion.rol, "stock.editar") && (
            <BotonEnlace href="/admin/stock/inventario/nuevo">+ Nuevo inventario</BotonEnlace>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <BotonEnlace href="/admin/stock/inventario" tono={verInsumos ? "suave" : "principal"} tam="sm">
          Inventarios registrados
        </BotonEnlace>
        <BotonEnlace href="/admin/stock/inventario?vista=insumos" tono={verInsumos ? "principal" : "suave"} tam="sm">
          Stock por insumo
        </BotonEnlace>
      </div>

      {verInsumos ? await vistaPorInsumo(idLocal) : await vistaHistorial(idLocal)}
    </div>
  );
}

async function vistaHistorial(idLocal: string) {
  const prisma = prismaDelLocal(idLocal);

  const [inventarios, almacenes] = await Promise.all([
    prisma.inventario.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        createdAt: true,
        almacenNombre: true,
        categorias: true,
        contados: true,
        conDiferencia: true,
      },
    }),
    // Todos, también los desactivados: un inventario viejo pudo ser de uno.
    prisma.almacen.findMany({
      orderBy: [{ activo: "desc" }, { nombre: "asc" }],
      select: { id: true, nombre: true, activo: true },
    }),
  ]);

  return (
    <>
      <InventariosRegistrados
        inventarios={inventarios.map((i) => ({
          id: i.id,
          activo: true,
          fecha: i.createdAt.toLocaleString("es-PY", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: ZONA_NEGOCIO,
          }),
          almacen: i.almacenNombre,
          categorias: i.categorias,
          contados: i.contados,
          conDiferencia: i.conDiferencia,
        }))}
      />

      {/* Reporte: cada botón manda este mismo formulario a su propia dirección
          (el Excel se descarga, el PDF se abre en otra pestaña), así que sale con
          lo que está escrito acá. Sin fechas, es el mes actual. */}
      {inventarios.length > 0 && (
        <Tarjeta className="mt-6 flex flex-col gap-3">
          <p className="rotulo text-[0.8rem] font-bold">Reporte de inventarios</p>
          <form method="get" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Campo etiqueta="Almacén">
              <Selector name="almacen" defaultValue="">
                <option value="">Todos los almacenes</option>
                {almacenes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                    {a.activo ? "" : " (desactivado)"}
                  </option>
                ))}
              </Selector>
            </Campo>
            <Campo etiqueta="Desde">
              <Entrada type="date" name="desde" />
            </Campo>
            <Campo etiqueta="Hasta">
              <Entrada type="date" name="hasta" />
            </Campo>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-3">
              <button
                type="submit"
                formAction="/admin/stock/inventario/exportar"
                className={clasesBoton("principal", "sm")}
              >
                Descargar Excel
              </button>
              <button
                type="submit"
                formAction="/admin/stock/inventario/imprimir"
                formTarget="_blank"
                className={clasesBoton("navegar", "sm")}
              >
                Ver reporte / PDF
              </button>
              <span className="text-xs text-tinta-suave">
                Los inventarios que registraste en ese período, con lo que dijo el sistema, lo que contaste y la
                diferencia. Sin fechas, toma el mes actual.
              </span>
            </div>
          </form>
        </Tarjeta>
      )}
    </>
  );
}

async function vistaPorInsumo(idLocal: string) {
  const prisma = prismaDelLocal(idLocal);

  const [insumos, almacenes, stockDeCadaAlmacen] = await Promise.all([
    prisma.insumo.findMany({
      // Las preparaciones (salsa, masa…) no llevan stock propio: no se cuentan.
      where: { activo: true, esElaborado: false },
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

  if (insumos.length === 0) {
    return <Vacio titulo="Todavía no hay insumos activos" detalle="Cargalos primero en Insumos." />;
  }

  return (
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
  );
}
