import { pantallaConPermiso } from "@/lib/auth";
import { Suspense } from "react";
import { Volver } from "@/components/Volver";
import { notFound } from "next/navigation";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { EliminarProductoBoton, EliminarOpcionBoton } from "./EliminarBotones";
import { EditarProductoForm } from "./EditarProductoForm";
import { GruposAgregadosProducto } from "./GruposAgregadosProducto";
import { RecetaProducto } from "./RecetaProducto";
import { etiquetaIva } from "@/lib/iva";
import { etiquetaUnidadMedida } from "@/lib/unidad-medida";
import { formatearGuarani } from "@/lib/format";
import { costoDeReceta } from "@/lib/costo-receta";
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

  const [producto, categorias, areasImpresion, todosLosAlmacenes, todosLosGrupos] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: {
        opciones: {
          orderBy: { orden: "asc" },
          select: { id: true, nombre: true, precioExtra: true },
        },
        receta: {
          select: {
            cantidad: true,
            insumo: { select: { id: true, nombre: true, unidadMedida: true, costoUnitario: true } },
          },
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
    // Todos, no solo los activos: uno desactivado que este producto ya tenía
    // elegido se tiene que poder seguir viendo (se filtra abajo).
    prisma.almacen.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, nombre: true, activo: true },
    }),
    prisma.optionGroup.findMany({
      orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
      select: { id: true, nombre: true, _count: { select: { modificadores: true } } },
    }),
  ]);

  if (!producto) notFound();

  const almacenes = todosLosAlmacenes.filter((a) => a.activo || a.id === producto.almacenId);
  const costoPorReceta = costoDeReceta(producto.receta);

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
            almacenId: producto.almacenId,
            precio: Number(producto.precio),
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
          almacenes={almacenes}
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

      <div className="flex flex-col gap-3 rounded-xl border border-linea bg-superficie p-4">
        <div>
          <p className="rotulo text-[0.8rem] font-bold">Receta (Control de stock)</p>
          <p className="text-sm text-tinta-media">
            Qué insumos descuenta cada unidad vendida de este producto, y cuánto de cada uno.
            Sin receta, este producto no descuenta ningún insumo. Un "extra" de Grupos de
            agregados es también un producto — armale la receta en su propia ficha para que
            también descuente.
          </p>
        </div>
        <RecetaProducto
          productId={producto.id}
          receta={producto.receta.map((r) => ({
            insumoId: r.insumo.id,
            nombre: r.insumo.nombre,
            cantidad: Number(r.cantidad),
            unidadMedida: etiquetaUnidadMedida(r.insumo.unidadMedida),
          }))}
        />
        {/* El costo del producto ya no se carga a mano: sale de esta receta. */}
        {producto.receta.length > 0 ? (
          <p className="text-sm text-tinta-media">
            {costoPorReceta != null ? (
              <>
                Costo de preparar una unidad, según esta receta:{" "}
                <span className="font-semibold text-tinta">{formatearGuarani(costoPorReceta)}</span>
                <span className="mt-0.5 block text-xs text-tinta-suave">
                  Es la suma, por cada insumo, de la cantidad de la receta × el costo de ese insumo (el de su
                  última compra, por unidad y sin IVA).
                </span>
              </>
            ) : (
              "Todavía no se puede calcular el costo: a algún insumo de la receta le falta el costo (se completa al registrar una compra)."
            )}
          </p>
        ) : (
          producto.costo != null && (
            <p className="text-sm text-tinta-media">
              Costo cargado antes a mano: {formatearGuarani(Number(producto.costo))}. Se sigue usando
              hasta que armes la receta.
            </p>
          )
        )}
      </div>
    </div>
  );
}
