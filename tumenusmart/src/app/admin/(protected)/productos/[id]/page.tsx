import { pantallaConPermiso } from "@/lib/auth";
import { Suspense } from "react";
import { Volver } from "@/components/Volver";
import { notFound } from "next/navigation";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { EliminarProductoBoton, EliminarOpcionBoton } from "./EliminarBotones";
import { EditarProductoForm } from "./EditarProductoForm";
import { GruposAgregadosProducto } from "./GruposAgregadosProducto";
import { etiquetaIva } from "@/lib/iva";
import { etiquetaUnidadMedida } from "@/lib/unidad-medida";
import { formatearGuarani } from "@/lib/format";
import { GuardadoToast } from "@/components/GuardadoToast";
import { Tarjeta } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function EditarProductoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await pantallaConPermiso("productos.editar");

  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  const { id } = await params;

  const [producto, categorias, areasImpresion, todosLosGrupos] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: {
        opciones: {
          orderBy: { orden: "asc" },
          select: { id: true, nombre: true, precioExtra: true },
        },
        gruposAgregados: {
          orderBy: [{ orden: "asc" }, { id: "asc" }],
          include: {
            group: {
              include: {
                modificadores: {
                  orderBy: [{ orden: "asc" }, { id: "asc" }],
                  include: {
                    product: {
                      select: { id: true, nombre: true, precio: true, iva: true, unidadMedida: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.category.findMany({ orderBy: { orden: "asc" } }),
    prisma.areaImpresion.findMany({
      where: { activa: true },
      orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
      select: { id: true, nombre: true },
    }),
    prisma.optionGroup.findMany({
      orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
      select: { id: true, nombre: true, _count: { select: { modificadores: true } } },
    }),
  ]);

  if (!producto) notFound();

  const idsAdjuntados = new Set(producto.gruposAgregados.map((g) => g.groupId));
  const gruposDisponibles = todosLosGrupos
    .filter((g) => !idsAdjuntados.has(g.id))
    .map((g) => ({ id: g.id, nombre: g.nombre, cantidadModificadores: g._count.modificadores }));

  return (
    <div className="flex flex-col gap-8">
      <Suspense fallback={null}>
        <GuardadoToast />
      </Suspense>

      <div>
        <div className="mb-4">
          <Volver
            href={`/admin/productos?categoria=${producto.categoryId}`}
            texto={`Volver a ${categorias.find((c) => c.id === producto.categoryId)?.nombre ?? "la categoría"}`}
          />
        </div>

        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-[1.4rem] font-semibold tracking-titular text-tinta">{producto.nombre}</h1>
          <EliminarProductoBoton productId={producto.id} />
        </div>

        <EditarProductoForm
          producto={{
            id: producto.id,
            nombre: producto.nombre,
            descripcion: producto.descripcion,
            categoryId: producto.categoryId,
            areaImpresionId: producto.areaImpresionId,
            precio: Number(producto.precio),
            costo: producto.costo != null ? Number(producto.costo) : null,
            iva: producto.iva,
            unidadMedida: producto.unidadMedida,
            imagenUrl: producto.imagenUrl,
            disponible: producto.disponible,
            destacado: producto.destacado,
            ingredientes: producto.ingredientes,
            mitadYMitadGrupo: producto.mitadYMitadGrupo,
            mitadYMitadModo: producto.mitadYMitadModo,
          }}
          categorias={categorias}
          areasImpresion={areasImpresion}
        />
      </div>

      {producto.opciones.length > 0 && (
        <Tarjeta className="flex flex-col gap-3">
          <div>
            <p className="rotulo text-[0.8rem] font-bold">Agregados propios (forma vieja)</p>
            <p className="text-sm text-tinta-media">
              Cargados antes de que existieran los Grupos de agregados — ya no se pueden crear ni
              editar acá, pero siguen ofreciéndose en la carta y el POS tal cual. Recreálos como
              producto real (en Grupos de agregados) y sacá estos con "Quitar".
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {producto.opciones.map((o) => (
              <div
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-linea bg-white px-3 py-2 text-sm"
              >
                <span>
                  {o.nombre} <span className="text-tinta-suave">· {formatearGuarani(Number(o.precioExtra))}</span>
                </span>
                <EliminarOpcionBoton productId={producto.id} optionId={o.id} />
              </div>
            ))}
          </div>
        </Tarjeta>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-azul/25 bg-azul-luz p-4">
        <div>
          <p className="rotulo text-[0.8rem] font-bold text-azul-oscuro">Grupos de agregados</p>
          <p className="text-sm text-tinta-media">
            Grupos reutilizables (ej: Salsas, Quesos) que se suman a los agregados propios de
            arriba. Cada modificador es un producto real de tu catálogo — buscalo y agregalo acá
            mismo, sin salir de esta pantalla.
          </p>
        </div>
        <GruposAgregadosProducto
          productId={producto.id}
          categoriaNombre={
            categorias.find((c) => c.id === producto.categoryId)?.nombre ?? "esta categoría"
          }
          gruposAdjuntados={producto.gruposAgregados.map((pg) => ({
            id: pg.group.id,
            nombre: pg.group.nombre,
            modificadores: pg.group.modificadores.map((m) => ({
              productId: m.product.id,
              nombre: m.product.nombre,
              precio: Number(m.product.precio),
              iva: etiquetaIva(m.product.iva),
              unidadMedida: etiquetaUnidadMedida(m.product.unidadMedida),
            })),
          }))}
          gruposDisponibles={gruposDisponibles}
        />
      </div>
    </div>
  );
}
