import Link from "next/link";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { rangoDeDias } from "@/lib/rango-dias";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import {
  LIMITE_PANTALLA,
  calcularSalidasPorVenta,
  unidadCorta,
  ventaCorta,
  type TipoSalidaVenta,
} from "@/lib/reporte-salidas-venta";
import { Cabecera, Campo, Entrada, Selector, Vacio, clasesBoton } from "@/components/ui";

export const dynamic = "force-dynamic";

/** "29/09/26 20:14": corto, para que la fecha ocupe poco lugar en la tabla. */
function fechaCorta(fecha: Date): string {
  const dia = fecha.toLocaleDateString("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: ZONA_NEGOCIO,
  });
  const hora = fecha.toLocaleTimeString("es-PY", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ZONA_NEGOCIO,
  });
  return `${dia} ${hora}`;
}

/**
 * Salidas por venta: qué insumos descontó cada venta, y por qué producto. Sirve
 * para comprobar cómo sale cada ingrediente cuando se vende algo — una receta
 * con preparaciones, un mitad y mitad, un agregado. Las cancelaciones aparecen
 * como entradas: es el stock que volvió.
 *
 * La tabla es a propósito muy compacta (letra chica, filas casi sin relleno)
 * para ver muchas filas juntas en poco espacio.
 */
export default async function SalidasPorVentaPage({
  searchParams,
}: {
  searchParams: Promise<{
    desde?: string;
    hasta?: string;
    tipo?: string;
    almacen?: string;
    insumo?: string;
    producto?: string;
  }>;
}) {
  await pantallaConPermiso("stock.ver");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const { desde, hasta, tipo, almacen, insumo, producto } = await searchParams;
  const rango = rangoDeDias(desde, hasta);
  const tipoFiltro: TipoSalidaVenta | null = tipo === "venta" || tipo === "cancelacion" ? tipo : null;
  const hayFiltros = !!(desde || hasta || tipoFiltro || almacen || insumo?.trim() || producto?.trim());

  const [almacenes, reporte] = await Promise.all([
    db.almacen.findMany({
      orderBy: [{ activo: "desc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { id: true, nombre: true, activo: true },
    }),
    calcularSalidasPorVenta(
      idLocal,
      rango,
      { tipo: tipoFiltro, almacen: almacen || null, insumo: insumo || null, producto: producto || null },
      LIMITE_PANTALLA
    ),
  ]);

  // Los mismos filtros, para los botones de Excel y PDF.
  const consulta = (() => {
    const params = new URLSearchParams();
    params.set("desde", rango.desde);
    params.set("hasta", rango.hasta);
    if (tipoFiltro) params.set("tipo", tipoFiltro);
    if (almacen) params.set("almacen", almacen);
    if (insumo?.trim()) params.set("insumo", insumo.trim());
    if (producto?.trim()) params.set("producto", producto.trim());
    return `?${params.toString()}`;
  })();

  // Con un solo almacén la columna no dice nada nuevo: se saca para ganar lugar.
  const almacenesUsados = new Set(reporte.filas.map((f) => f.almacen));
  const mostrarAlmacen = almacenesUsados.size > 1;

  return (
    <div className="flex flex-col gap-3">
      <Cabecera
        titulo="Salidas por venta"
        bajada="Qué insumos descontó cada venta y por qué producto. Sirve para comprobar cómo sale cada ingrediente."
      />

      <form
        method="get"
        className="grid grid-cols-2 gap-2 rounded-xl border border-linea bg-superficie p-3 sm:grid-cols-3 lg:grid-cols-6"
      >
        <Campo etiqueta="Desde">
          <Entrada type="date" name="desde" defaultValue={rango.desde} />
        </Campo>
        <Campo etiqueta="Hasta">
          <Entrada type="date" name="hasta" defaultValue={rango.hasta} />
        </Campo>
        <Campo etiqueta="Tipo">
          <Selector name="tipo" defaultValue={tipoFiltro ?? ""}>
            <option value="">Ventas y cancelaciones</option>
            <option value="venta">Solo salidas por venta</option>
            <option value="cancelacion">Solo cancelaciones</option>
          </Selector>
        </Campo>
        <Campo etiqueta="Producto vendido">
          <Entrada type="search" name="producto" defaultValue={producto ?? ""} placeholder="Ej: pizza" />
        </Campo>
        <Campo etiqueta="Insumo">
          <Entrada type="search" name="insumo" defaultValue={insumo ?? ""} placeholder="Ej: tomate" />
        </Campo>
        <Campo etiqueta="Almacén">
          <Selector name="almacen" defaultValue={almacen ?? ""}>
            <option value="">Todos</option>
            {almacenes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
                {a.activo ? "" : " (desactivado)"}
              </option>
            ))}
          </Selector>
        </Campo>
        <div className="col-span-full flex flex-wrap items-center gap-2">
          <button type="submit" className={clasesBoton("principal", "sm")}>
            Buscar
          </button>
          {hayFiltros && (
            <Link href="/admin/stock/salidas-por-venta" className={clasesBoton("fantasma", "sm")}>
              Limpiar filtros
            </Link>
          )}
          <span className="text-xs text-tinta-suave">Sin fechas, muestra el mes actual.</span>
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <a href={`/admin/stock/salidas-por-venta/exportar${consulta}`} className={clasesBoton("exito", "sm")}>
              Descargar Excel
            </a>
            <a
              href={`/admin/stock/salidas-por-venta/imprimir${consulta}`}
              target="_blank"
              rel="noopener noreferrer"
              className={clasesBoton("navegar", "sm")}
            >
              Ver reporte / PDF
            </a>
          </div>
        </div>
      </form>

      {reporte.filas.length === 0 ? (
        <Vacio
          titulo={hayFiltros ? "Ninguna salida coincide con ese filtro" : "Todavía no hay salidas por venta en este período"}
          detalle={
            hayFiltros
              ? undefined
              : "Cuando se venda un producto que tenga receta, acá aparece qué insumos descontó."
          }
        />
      ) : (
        <>
          <p className="text-xs text-tinta-suave">
            <span className="font-semibold text-tinta">
              {reporte.filas.length} {reporte.filas.length === 1 ? "movimiento" : "movimientos"} de {reporte.ventas}{" "}
              {reporte.ventas === 1 ? "venta" : "ventas"}
            </span>
            {!mostrarAlmacen && ` · Almacén: ${[...almacenesUsados][0]}`}
          </p>

          <div className="overflow-x-auto rounded-lg border border-linea bg-superficie">
            <table className="w-full min-w-[30rem] border-collapse text-left text-[0.74rem] leading-[1.2]">
              <thead>
                <tr className="bg-exito-luz text-[0.64rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
                  <th scope="col" className="px-2 py-1">
                    Fecha y hora
                  </th>
                  <th scope="col" className="px-2 py-1">
                    Venta
                  </th>
                  <th scope="col" className="px-2 py-1">
                    Qué se vendió
                  </th>
                  <th scope="col" className="px-2 py-1">
                    Insumo
                  </th>
                  <th scope="col" className="px-2 py-1 text-right">
                    Cantidad
                  </th>
                  {mostrarAlmacen && (
                    <th scope="col" className="px-2 py-1">
                      Almacén
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {reporte.filas.map((f) => (
                  <tr
                    key={f.id}
                    className={`hover:bg-papel-suave ${f.inicioDeGrupo ? "border-t border-linea" : ""}`}
                  >
                    <td className="cifra whitespace-nowrap px-2 py-[2px] align-top text-tinta-media">
                      {f.inicioDeGrupo ? fechaCorta(f.fecha) : ""}
                    </td>
                    <td className="whitespace-nowrap px-2 py-[2px] align-top text-tinta-media">
                      {f.inicioDeGrupo && (
                        <>
                          {ventaCorta(f.venta)}
                          {f.tipo === "cancelacion" && (
                            <span className="ml-1 rounded bg-brand-light px-1 text-[0.62rem] font-semibold text-brand-texto">
                              Cancelada
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-2 py-[2px] align-top font-medium text-tinta">
                      {f.inicioDeGrupo ? f.producto : ""}
                    </td>
                    <td className="px-2 py-[2px] text-tinta">{f.insumo}</td>
                    <td
                      className={`cifra whitespace-nowrap px-2 py-[2px] text-right font-semibold ${
                        f.cantidad < 0 ? "text-peligro" : "text-exito"
                      }`}
                    >
                      {f.cantidad > 0 ? "+" : ""}
                      {f.cantidad} {unidadCorta(f.unidad)}
                    </td>
                    {mostrarAlmacen && <td className="px-2 py-[2px] text-tinta-media">{f.almacen}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {reporte.recortado && (
            <p className="text-xs text-tinta-suave">
              Se muestran los {LIMITE_PANTALLA} movimientos más recientes de este filtro. Acotá las fechas para ver los
              anteriores, o descargá el Excel, que trae más.
            </p>
          )}
          <p className="text-xs text-tinta-suave">
            Cada fila es lo que un producto vendido le sacó a un insumo. Si el producto lleva una preparación (salsa,
            masa…), se ven los insumos con que se hace; en un mitad y mitad, cada sabor descuenta la mitad de su receta.
            Las ventas de antes de este reporte figuran como “Toda la venta”: no se guardó qué producto descontó cada
            insumo.
          </p>
        </>
      )}
    </div>
  );
}
