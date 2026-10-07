import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { etiquetaIva } from "@/lib/iva";
import { etiquetaUnidadMedida } from "@/lib/unidad-medida";
import { Cabecera } from "@/components/ui";
import { GruposMaestroDetalle } from "./GruposMaestroDetalle";

export const dynamic = "force-dynamic";

/**
 * Grupos de agregados reutilizables (ej. "Salsas", "Quesos") — un grupo se
 * adjunta a varios productos a la vez desde la tarjeta "Grupos de
 * agregados" de cada producto. Cada modificador del grupo es un Producto
 * real del catálogo (ver OptionGroupProduct), así que corregir su precio
 * en /admin/productos lo corrige en todos los productos que lo usan, sin
 * recargarlo a mano en cada uno. A diferencia de los agregados propios de
 * un producto (ProductOption, que solo se pueden quitar desde la ficha del
 * producto), esto es un catálogo aparte.
 *
 * En dos paneles, como Insumos y Productos: la lista a la izquierda y, con doble
 * clic, el grupo completo a la derecha.
 */
export default async function GruposAgregadosPage({
  searchParams,
}: {
  searchParams: Promise<{ grupo?: string }>;
}) {
  await pantallaConPermiso("productos.editar");
  const prisma = prismaDelLocal(await idLocalActual());

  const { grupo: grupoParam } = await searchParams;

  const grupos = await prisma.optionGroup.findMany({
    orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
    include: {
      modificadores: {
        orderBy: [{ orden: "asc" }, { id: "asc" }],
        include: {
          product: {
            select: {
              id: true,
              categoryId: true,
              nombre: true,
              precio: true,
              iva: true,
              unidadMedida: true,
              disponible: true,
            },
          },
        },
      },
      _count: { select: { productos: true } },
    },
  });

  // El grupo de la dirección (enlaces viejos a /grupos-agregados/<id>) solo se abre si es de este local.
  const abiertoInicialId = grupoParam && grupos.some((g) => g.id === grupoParam) ? grupoParam : null;

  return (
    <div>
      <Cabecera
        titulo="Grupos de agregados"
        bajada="Un grupo con nombre (ej. Salsas, Quesos) que se adjunta a varios productos a la vez. Cada modificador es un producto real de tu catálogo (creálo primero en Productos)."
      />

      <GruposMaestroDetalle
        grupos={grupos.map((g) => ({
          id: g.id,
          nombre: g.nombre,
          cantidadProductos: g._count.productos,
          modificadores: g.modificadores.map((m) => ({
            id: m.id,
            productId: m.product.id,
            categoryId: m.product.categoryId,
            nombre: m.product.nombre,
            precio: Number(m.product.precio),
            iva: etiquetaIva(m.product.iva),
            unidadMedida: etiquetaUnidadMedida(m.product.unidadMedida),
            disponible: m.product.disponible,
          })),
        }))}
        abiertoInicialId={abiertoInicialId}
      />
    </div>
  );
}
