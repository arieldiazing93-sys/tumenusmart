import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera, Tarjeta, Campo, Entrada, Selector, clasesBoton } from "@/components/ui";
import { AlmacenesMaestroDetalle } from "./AlmacenesMaestroDetalle";

export const dynamic = "force-dynamic";

export default async function AlmacenesPage() {
  await pantallaConPermiso("stock.ver");
  const prisma = prismaDelLocal(await idLocalActual());

  const almacenes = await prisma.almacen.findMany({
    orderBy: [{ activo: "desc" }, { nombre: "asc" }],
  });

  return (
    <div>
      <Cabecera
        titulo="Almacenes"
        bajada="Depósitos donde guardás la mercadería (Cocina, Bodega...). Se elige el almacén en cada línea al registrar una compra."
      />

      <AlmacenesMaestroDetalle
        almacenes={almacenes.map((a) => ({ id: a.id, nombre: a.nombre, activo: a.activo }))}
      />

      {/* Reporte: cada botón manda este mismo formulario a su propia dirección
          (el Excel se descarga, el PDF se abre en otra pestaña), así que sale con
          lo que está escrito acá. Sin fechas, es el mes actual. */}
      {almacenes.length > 0 && (
        <Tarjeta className="mt-6 flex flex-col gap-3">
          <p className="rotulo text-[0.8rem] font-bold">Reporte de almacén</p>
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
                formAction="/admin/stock/almacenes/exportar"
                className={clasesBoton("principal", "sm")}
              >
                Descargar Excel
              </button>
              <button
                type="submit"
                formAction="/admin/stock/almacenes/imprimir"
                formTarget="_blank"
                className={clasesBoton("navegar", "sm")}
              >
                Ver reporte / PDF
              </button>
              <span className="text-xs text-tinta-suave">
                Con qué arrancó cada insumo, lo que entró y salió, y con qué terminó. Sin fechas, toma el mes actual.
              </span>
            </div>
          </form>
        </Tarjeta>
      )}
    </div>
  );
}
