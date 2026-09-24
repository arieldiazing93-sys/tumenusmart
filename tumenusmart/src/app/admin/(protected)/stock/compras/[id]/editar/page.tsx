import Link from "next/link";
import { notFound } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera, Vacio, clasesBoton } from "@/components/ui";
import { Volver } from "@/components/Volver";
import { costoConIvaDesdeNeto } from "@/lib/compra-calculo";
import { etiquetaUnidadMedida } from "@/lib/unidad-medida";
import { NuevaCompraForm, type CompraInicial } from "../../nueva/NuevaCompraForm";

export const dynamic = "force-dynamic";

/**
 * Corregir una compra ya guardada: el mismo formulario de Nueva compra, abierto
 * con lo que se cargó. Al guardar, el stock se ajusta por la diferencia.
 */
export default async function EditarCompraPage({ params }: { params: Promise<{ id: string }> }) {
  await pantallaConPermiso("stock.editar");
  const { id } = await params;
  const prisma = prismaDelLocal(await idLocalActual());

  const compra = await prisma.compra.findUnique({
    where: { id },
    include: {
      items: {
        orderBy: { id: "asc" },
        include: { insumo: { select: { nombre: true, unidadMedida: true, iva: true, rendimiento: true } } },
      },
    },
  });
  if (!compra) notFound();

  const titulo = `Editar compra ${compra.numeroComprobante ? `— folio ${compra.numeroComprobante}` : "sin folio"}`;

  if (compra.cancelada) {
    return (
      <div className="flex flex-col gap-4">
        <Volver href={`/admin/stock/compras/${compra.id}`} texto="Volver a la compra" className="self-start" />
        <Cabecera titulo={titulo} />
        <Vacio
          titulo="Esta compra está cancelada"
          detalle="Una compra cancelada no se puede editar. Si hace falta, registrá una compra nueva con los datos correctos."
          accion={
            <Link href={`/admin/stock/compras/${compra.id}`} className={clasesBoton("principal")}>
              Volver a la compra
            </Link>
          }
        />
      </div>
    );
  }

  const idsAlmacenesUsados = [...new Set(compra.items.map((i) => i.almacenId).filter((a): a is string => !!a))];

  const [proveedores, almacenesDb] = await Promise.all([
    // Un proveedor desactivado después de la compra tiene que seguir apareciendo elegido.
    prisma.proveedor.findMany({
      where: compra.proveedorId ? { OR: [{ activo: true }, { id: compra.proveedorId }] } : { activo: true },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true, ruc: true },
    }),
    // Igual con los almacenes: los de la compra se ven aunque ya no estén activos
    // (guardar con uno desactivado da un aviso claro, y se cambia por otro).
    prisma.almacen.findMany({
      where: { OR: [{ activo: true }, { id: { in: idsAlmacenesUsados } }] },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, nombre: true, activo: true },
    }),
  ]);

  // Los activos primero: el primero de la lista es el que se propone en las líneas nuevas.
  const almacenes = [...almacenesDb]
    .sort((a, b) => Number(b.activo) - Number(a.activo))
    .map((a) => ({ id: a.id, nombre: a.activo ? a.nombre : `${a.nombre} (desactivado)` }));

  const inicial: CompraInicial = {
    compraId: compra.id,
    proveedorId: compra.proveedorId ?? "",
    // La fecha se guardó como medianoche UTC del día elegido: así vuelve al mismo día.
    fecha: compra.fecha.toISOString().slice(0, 10),
    folioFactura: compra.numeroComprobante ?? "",
    condicionPago: compra.condicionPago === "credito" ? "credito" : "contado",
    fechaVencimiento: compra.fechaVencimiento ? compra.fechaVencimiento.toISOString().slice(0, 10) : "",
    notas: compra.notas ?? "",
    descuentoGeneral:
      compra.descuentoGeneralPorcentaje != null ? String(Number(compra.descuentoGeneralPorcentaje)) : "",
    lineas: compra.items.map((i) => ({
      insumoId: i.insumoId,
      nombre: i.insumo.nombre,
      unidadMedida: etiquetaUnidadMedida(i.insumo.unidadMedida),
      iva: i.insumo.iva,
      rendimiento: Number(i.insumo.rendimiento),
      almacenId: i.almacenId ?? almacenes[0]?.id ?? "",
      cantidad: String(Number(i.cantidad)),
      // Se guardó el costo neto: acá se vuelve a mostrar con IVA, como se cargó.
      costo: String(costoConIvaDesdeNeto(Number(i.costoUnitario), i.insumo.iva)),
      descuentoPorcentaje: i.descuentoPorcentaje != null ? String(Number(i.descuentoPorcentaje)) : "",
    })),
  };

  return (
    <div className="flex flex-col gap-4">
      <Volver href={`/admin/stock/compras/${compra.id}`} texto="Volver a la compra" className="self-start" />
      <Cabecera
        titulo={titulo}
        bajada="Corregí lo que cargaste mal. Al guardar, el stock de los insumos se ajusta por la diferencia y queda un movimiento de corrección en su historial."
      />
      <NuevaCompraForm proveedores={proveedores} almacenes={almacenes} inicial={inicial} />
    </div>
  );
}
