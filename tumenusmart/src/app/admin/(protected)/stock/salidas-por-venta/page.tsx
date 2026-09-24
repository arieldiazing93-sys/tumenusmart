import Link from "next/link";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { rangoDeDias } from "@/lib/rango-dias";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import {
  LIMITE_PANTALLA,
  calcularSalidasPorVenta,
  type TipoSalidaVenta,
} from "@/lib/reporte-salidas-venta";
import {
  Cabecera,
  Campo,
  Entrada,
  Pastilla,
  Selector,
  Tabla,
  Tarjeta,
  Td,
  Th,
  Tr,
  Vacio,
  clasesBoton,
} from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Salidas por venta: qué insumos descontó cada venta, y por qué producto. Sirve
 * para comprobar cómo sale cada ingrediente cuando se vende algo — una receta
 * con preparaciones, un mitad y mitad, un agregado. Las cancelaciones aparecen
 * como entradas: es el stock que volvió.
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

  const fechaYHora = (fecha: Date) =>
    fecha.toLocaleString("es-PY", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: ZONA_NEGOCIO,
    });

  return (
    <div className="flex flex-col gap-4">
      <Cabecera
        titulo="Salidas por venta"
        bajada="Qué insumos descontó cada venta y por qué producto: fecha y hora, la venta, lo que se vendió, el insumo y la cantidad que salió del almacén. Sirve para comprobar cómo sale cada ingrediente."
      />

      <form
        method="get"
        className="grid grid-cols-1 gap-3 rounded-xl border border-linea bg-superficie p-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <Campo etiqueta="Desde">
          <Entrada type="date" name="desde" defaultValue={rango.desde} />
        </Campo>
        <Campo etiqueta="Hasta">
          <Entrada type="date" name="hasta" defaultValue={rango.hasta} />
        </Campo>
        <Campo etiqueta="Tipo">
          <Selector name="tipo" defaultValue={tipoFiltro ?? ""}>
            <option value="">Salidas por venta y cancelaciones</option>
            <option value="venta">Solo salidas por venta</option>
            <option value="cancelacion">Solo cancelaciones (stock que volvió)</option>
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
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-3">
          <button type="submit" className={clasesBoton("suave", "sm")}>
            Buscar
          </button>
          {hayFiltros && (
            <Link href="/admin/stock/salidas-por-venta" className={clasesBoton("fantasma", "sm")}>
              Limpiar filtros
            </Link>
          )}
          <span className="text-xs text-tinta-suave">Sin fechas, muestra el mes actual.</span>
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <a href={`/admin/stock/salidas-por-venta/exportar${consulta}`} className={clasesBoton("suave", "sm")}>
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
          <Tarjeta>
            <p className="rotulo">En este período</p>
            <p className="cifra mt-1 text-[1.35rem] font-semibold text-tinta">
              {reporte.filas.length} {reporte.filas.length === 1 ? "movimiento" : "movimientos"} de {reporte.ventas}{" "}
              {reporte.ventas === 1 ? "venta" : "ventas"}
            </p>
          </Tarjeta>

          <Tabla>
            <thead>
              <tr className="bg-exito-luz">
                <Th>Fecha y hora</Th>
                <Th>Venta</Th>
                <Th>Qué se vendió</Th>
                <Th>Insumo</Th>
                <Th>Cantidad</Th>
                <Th>Almacén</Th>
              </tr>
            </thead>
            <tbody>
              {reporte.filas.map((f) => (
                <Tr key={f.id}>
                  <Td className="cifra whitespace-nowrap">{f.inicioDeGrupo ? fechaYHora(f.fecha) : ""}</Td>
                  <Td className="whitespace-nowrap">
                    {f.inicioDeGrupo && (
                      <span className="flex flex-wrap items-center gap-1.5">
                        {f.venta}
                        {f.tipo === "cancelacion" && <Pastilla color="marca">Cancelada</Pastilla>}
                      </span>
                    )}
                  </Td>
                  <Td className="font-medium text-tinta">{f.inicioDeGrupo ? f.producto : ""}</Td>
                  <Td>{f.insumo}</Td>
                  <Td className={`cifra whitespace-nowrap font-semibold ${f.cantidad < 0 ? "text-peligro" : "text-exito"}`}>
                    {f.cantidad > 0 ? "+" : ""}
                    {f.cantidad} {f.unidad}
                  </Td>
                  <Td>{f.almacen}</Td>
                </Tr>
              ))}
            </tbody>
          </Tabla>
          {reporte.recortado && (
            <p className="text-xs text-tinta-suave">
              Se muestran los {LIMITE_PANTALLA} movimientos más recientes de este filtro. Acotá las fechas para ver los
              anteriores, o descargá el Excel, que trae más.
            </p>
          )}
          <p className="text-xs text-tinta-suave">
            Cada fila es lo que un producto vendido le sacó a un insumo. Si el producto lleva una preparación (salsa,
            masa…), se ven los insumos con que se hace. En un mitad y mitad, cada sabor descuenta la mitad de su receta.
            Las ventas de antes de que existiera este reporte no guardaron qué producto descontó cada insumo: figuran
            como “Toda la venta”.
          </p>
        </>
      )}
    </div>
  );
}
