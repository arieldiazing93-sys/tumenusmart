import Link from "next/link";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera, Tabla, Th, Td, Tr, Vacio, Pastilla, Campo, Entrada, Selector, BotonEnlace, clasesBoton } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";

export const dynamic = "force-dynamic";

type Filtros = { proveedor?: string; desde?: string; hasta?: string; folio?: string };

function aFecha(texto: string | undefined): Date | undefined {
  if (!texto) return undefined;
  const fecha = new Date(texto);
  return Number.isNaN(fecha.getTime()) ? undefined : fecha;
}

export default async function ComprasPage({ searchParams }: { searchParams: Promise<Filtros> }) {
  await pantallaConPermiso("stock.ver");
  const prisma = prismaDelLocal(await idLocalActual());

  const { proveedor, desde, hasta, folio } = await searchParams;
  const fechaDesde = aFecha(desde);
  const fechaHasta = aFecha(hasta);
  const hayFiltros = !!(proveedor || desde || hasta || folio?.trim());

  const [compras, proveedores] = await Promise.all([
    prisma.compra.findMany({
      where: {
        ...(proveedor ? { proveedorId: proveedor } : {}),
        ...(fechaDesde || fechaHasta
          ? { fecha: { ...(fechaDesde ? { gte: fechaDesde } : {}), ...(fechaHasta ? { lte: fechaHasta } : {}) } }
          : {}),
        ...(folio?.trim() ? { numeroComprobante: { contains: folio.trim(), mode: "insensitive" as const } } : {}),
      },
      orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
      include: { proveedor: { select: { nombre: true } }, _count: { select: { items: true } } },
      take: 200,
    }),
    prisma.proveedor.findMany({ orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
  ]);

  return (
    <div>
      <Cabecera
        titulo="Compras"
        bajada="Cada compra suma stock a los insumos que trae y actualiza su costo de reposición. Una compra cargada por error se anula desde su detalle."
        acciones={<BotonEnlace href="/admin/stock/compras/nueva">+ Nueva compra</BotonEnlace>}
      />

      <form method="get" className="mb-5 grid grid-cols-1 gap-3 rounded-xl border border-linea bg-superficie p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Campo etiqueta="Proveedor">
          <Selector name="proveedor" defaultValue={proveedor ?? ""}>
            <option value="">Todos</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Folio de factura">
          <Entrada name="folio" defaultValue={folio ?? ""} placeholder="Ej: 001-001" />
        </Campo>
        <Campo etiqueta="Desde">
          <Entrada type="date" name="desde" defaultValue={desde ?? ""} />
        </Campo>
        <Campo etiqueta="Hasta">
          <Entrada type="date" name="hasta" defaultValue={hasta ?? ""} />
        </Campo>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
          <button type="submit" className={clasesBoton("suave")}>
            Buscar
          </button>
          {hayFiltros && (
            <Link href="/admin/stock/compras" className={clasesBoton("fantasma")}>
              Limpiar filtros
            </Link>
          )}
        </div>

        {/* El reporte sale con lo que está escrito arriba (proveedor y fechas),
            sin tener que apretar Buscar antes: cada botón manda este mismo
            formulario a su propia dirección. Sin fechas, es el mes actual. */}
        <div className="flex flex-wrap items-center gap-2 border-t border-linea pt-3 sm:col-span-2 lg:col-span-4">
          <span className="text-sm font-medium text-tinta">Reporte de compras</span>
          <button type="submit" formAction="/admin/stock/compras/exportar" className={clasesBoton("principal", "sm")}>
            Descargar Excel
          </button>
          <button
            type="submit"
            formAction="/admin/stock/compras/imprimir"
            formTarget="_blank"
            className={clasesBoton("navegar", "sm")}
          >
            Ver reporte / PDF
          </button>
          <span className="text-xs text-tinta-suave">
            Usa el proveedor y el rango Desde / Hasta de arriba. Sin fechas, toma el mes actual.
          </span>
        </div>
      </form>

      {compras.length === 0 ? (
        <Vacio
          titulo={hayFiltros ? "Ninguna compra coincide con esa búsqueda" : "Todavía no registraste ninguna compra"}
          detalle={hayFiltros ? undefined : "Registrá la primera con el botón de arriba."}
        />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th>Proveedor</Th>
              <Th>Folio</Th>
              <Th>Condición</Th>
              <Th>Insumos</Th>
              <Th>Total</Th>
              <Th>
                <span className="sr-only">Acciones</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {compras.map((c) => (
              <Tr key={c.id}>
                <Td className={c.cancelada ? "opacity-60" : ""}>{c.fecha.toLocaleDateString("es-PY")}</Td>
                <Td className={c.cancelada ? "opacity-60" : ""}>{c.proveedor?.nombre ?? "—"}</Td>
                <Td className={c.cancelada ? "opacity-60" : ""}>{c.numeroComprobante ?? "—"}</Td>
                <Td>
                  {c.cancelada ? (
                    <Pastilla color="peligro">Cancelada</Pastilla>
                  ) : c.condicionPago === "credito" ? (
                    <Pastilla color="aviso">
                      A crédito{c.fechaVencimiento ? ` · vence ${c.fechaVencimiento.toLocaleDateString("es-PY")}` : ""}
                    </Pastilla>
                  ) : (
                    <Pastilla color="exito">Al contado</Pastilla>
                  )}
                </Td>
                <Td className={c.cancelada ? "opacity-60" : ""}>{c._count.items}</Td>
                <Td className={`font-medium text-tinta ${c.cancelada ? "line-through opacity-60" : ""}`}>
                  {formatearGuarani(Number(c.total))}
                </Td>
                <Td>
                  <BotonEnlace href={`/admin/stock/compras/${c.id}`} tono="navegar" tam="sm">
                    Ver
                  </BotonEnlace>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </div>
  );
}
