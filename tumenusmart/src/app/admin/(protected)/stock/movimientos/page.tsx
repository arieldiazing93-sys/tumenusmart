import Link from "next/link";
import { pantallaConPermiso } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { formatearGuarani } from "@/lib/format";
import { limitesEnAsuncion, rangoDeDias } from "@/lib/rango-dias";
import { etiquetaUnidadMedida } from "@/lib/unidad-medida";
import { ZONA_NEGOCIO } from "@/lib/timezone";
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
import { NuevoMovimientoAlmacenForm } from "./NuevoMovimientoAlmacenForm";

export const dynamic = "force-dynamic";

const LIMITE = 300;

/**
 * Movimientos de almacén: las entradas y salidas de insumos que no vienen de una
 * compra ni de una venta (mermas, roturas, consumo del personal, lo que llega
 * sin compra). Cada uno descontó o sumó stock y quedó en el historial del insumo.
 */
export default async function MovimientosAlmacenPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; tipo?: string; almacen?: string }>;
}) {
  const sesion = await pantallaConPermiso("stock.ver");
  const puedeEditar = puede(sesion.rol, "stock.editar");
  const db = prismaDelLocal(await idLocalActual());

  const { desde, hasta, tipo, almacen } = await searchParams;
  const rango = rangoDeDias(desde, hasta);
  const tipoFiltro = tipo === "entrada" || tipo === "salida" ? tipo : "";
  const hayFiltros = !!(desde || hasta || tipoFiltro || almacen);

  const [almacenes, movimientos] = await Promise.all([
    db.almacen.findMany({
      orderBy: [{ activo: "desc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { id: true, nombre: true, activo: true },
    }),
    db.movimientoStock.findMany({
      where: {
        tipo: "movimiento",
        createdAt: limitesEnAsuncion(rango),
        ...(tipoFiltro === "entrada" ? { cantidad: { gt: 0 } } : {}),
        ...(tipoFiltro === "salida" ? { cantidad: { lt: 0 } } : {}),
        ...(almacen ? { almacenId: almacen } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: LIMITE,
      select: {
        id: true,
        cantidad: true,
        motivo: true,
        registradoPor: true,
        createdAt: true,
        almacen: { select: { nombre: true } },
        insumo: { select: { nombre: true, unidadMedida: true, costoUnitario: true } },
      },
    }),
  ]);

  const almacenesActivos = almacenes.filter((a) => a.activo);

  // Lo que costó lo que salió, a costo de hoy de cada insumo (los que no tienen costo no suman).
  const costoDeLasSalidas = movimientos.reduce((suma, m) => {
    const cantidad = Number(m.cantidad);
    if (cantidad >= 0 || m.insumo.costoUnitario == null) return suma;
    return suma + Math.abs(cantidad) * Number(m.insumo.costoUnitario);
  }, 0);
  const salidas = movimientos.filter((m) => Number(m.cantidad) < 0).length;

  const hora = (fecha: Date) =>
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
        titulo="Movimientos de almacén"
        bajada="Entradas y salidas de insumos que no son compras ni ventas: lo que se echó a perder, una botella que se rompió, lo que consume el personal. Cada movimiento sube o baja el stock y queda en el historial del insumo."
      />

      {puedeEditar &&
        (almacenesActivos.length === 0 ? (
          <Vacio
            titulo="Primero creá un almacén"
            detalle="Todo movimiento es de un almacén. Creá al menos uno (por ejemplo, Almacén General) y volvé acá."
            accion={
              <Link href="/admin/stock/almacenes" className={clasesBoton("principal")}>
                Ir a Almacenes
              </Link>
            }
          />
        ) : (
          <NuevoMovimientoAlmacenForm almacenes={almacenesActivos.map((a) => ({ id: a.id, nombre: a.nombre }))} />
        ))}

      <form
        method="get"
        className="grid grid-cols-1 gap-3 rounded-xl border border-linea bg-superficie p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Campo etiqueta="Desde">
          <Entrada type="date" name="desde" defaultValue={rango.desde} />
        </Campo>
        <Campo etiqueta="Hasta">
          <Entrada type="date" name="hasta" defaultValue={rango.hasta} />
        </Campo>
        <Campo etiqueta="Tipo">
          <Selector name="tipo" defaultValue={tipoFiltro}>
            <option value="">Entradas y salidas</option>
            <option value="salida">Solo salidas</option>
            <option value="entrada">Solo entradas</option>
          </Selector>
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
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
          <button type="submit" className={clasesBoton("suave", "sm")}>
            Buscar
          </button>
          {hayFiltros && (
            <Link href="/admin/stock/movimientos" className={clasesBoton("fantasma", "sm")}>
              Limpiar filtros
            </Link>
          )}
          <span className="text-xs text-tinta-suave">Sin fechas, muestra el mes actual.</span>
        </div>
      </form>

      {salidas > 0 && (
        <Tarjeta>
          <p className="rotulo">Lo que salió en este período, a costo de hoy</p>
          <p className="cifra mt-1 text-[1.35rem] font-semibold text-tinta">
            {formatearGuarani(Math.round(costoDeLasSalidas))}
          </p>
          <p className="mt-0.5 text-xs text-tinta-suave">
            {salidas} {salidas === 1 ? "salida" : "salidas"}. Los insumos sin costo cargado no suman.
          </p>
        </Tarjeta>
      )}

      {movimientos.length === 0 ? (
        <Vacio
          titulo={hayFiltros ? "Ningún movimiento coincide con ese filtro" : "No hay movimientos de almacén en este período"}
          detalle={hayFiltros ? undefined : "Las mermas y roturas que cargues acá aparecen en esta lista."}
        />
      ) : (
        <>
          <Tabla>
            <thead>
              <tr className="bg-exito-luz">
                <Th>Fecha y hora</Th>
                <Th>Tipo</Th>
                <Th>Almacén</Th>
                <Th>Insumo</Th>
                <Th>Cantidad</Th>
                <Th>Motivo</Th>
                <Th>Registró</Th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((m) => {
                const cantidad = Number(m.cantidad);
                return (
                  <Tr key={m.id}>
                    <Td className="cifra whitespace-nowrap">{hora(m.createdAt)}</Td>
                    <Td>
                      <Pastilla color={cantidad < 0 ? "peligro" : "exito"}>{cantidad < 0 ? "Salida" : "Entrada"}</Pastilla>
                    </Td>
                    <Td>{m.almacen?.nombre ?? "—"}</Td>
                    <Td className="font-medium text-tinta">{m.insumo.nombre}</Td>
                    <Td className={`cifra font-semibold ${cantidad < 0 ? "text-peligro" : "text-exito"}`}>
                      {cantidad > 0 ? "+" : ""}
                      {cantidad} {etiquetaUnidadMedida(m.insumo.unidadMedida)}
                    </Td>
                    <Td>{m.motivo ?? "—"}</Td>
                    <Td>{m.registradoPor ?? "—"}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Tabla>
          {movimientos.length === LIMITE && (
            <p className="text-xs text-tinta-suave">
              Se muestran los {LIMITE} más recientes de este filtro. Acotá las fechas para ver los anteriores.
            </p>
          )}
        </>
      )}
    </div>
  );
}
