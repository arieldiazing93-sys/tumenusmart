import { pantallaConPermiso } from "@/lib/auth";
import { Suspense } from "react";
import { Volver } from "@/components/Volver";
import { notFound } from "next/navigation";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { EliminarProductoBoton, EliminarOpcionBoton } from "./EliminarBotones";
import { EditarProductoForm } from "./EditarProductoForm";
import { AgregarOpcionForm } from "./AgregarOpcionForm";
import { AplicarAgregadosBoton } from "./AplicarAgregadosBoton";
import { EditarNombreOpcion } from "./EditarNombreOpcion";
import { EditarCostoOpcion } from "./EditarCostoOpcion";
import { EditarPrecioExtraOpcion } from "./EditarPrecioExtraOpcion";
import { EditarFiscalOpcion } from "./EditarFiscalOpcion";
import { AsignarGruposProducto } from "./AsignarGruposProducto";
import { GuardadoToast } from "@/components/GuardadoToast";
import { BotonesMover } from "@/components/BotonesMover";
import { moverOpcion } from "../actions";
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

  const [producto, categorias, areasImpresion, gruposAgregados] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: {
        opciones: { orderBy: { orden: "asc" } },
        gruposAgregados: { select: { groupId: true } },
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

      <Tarjeta className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="rotulo text-[0.8rem] font-bold">Agregados</p>
            <p className="text-sm text-tinta-media">
              Extras que el cliente puede sumar a este producto (ej: borde relleno, extra queso).
            </p>
          </div>
          <AplicarAgregadosBoton
            productId={producto.id}
            categoriaNombre={
              categorias.find((c) => c.id === producto.categoryId)?.nombre ?? "esta categoría"
            }
            cantidadAgregados={producto.opciones.length}
          />
        </div>

        <div className="flex flex-col gap-2">
          {producto.opciones.map((o, i) => (
            <div
              key={o.id}
              className="flex flex-col gap-2 rounded-lg border border-linea bg-white px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-wrap items-center gap-2">
                <BotonesMover
                  id={o.id}
                  accion={moverOpcion}
                  esPrimero={i === 0}
                  esUltimo={i === producto.opciones.length - 1}
                  etiqueta={o.nombre}
                />
                <EditarNombreOpcion
                  productId={producto.id}
                  optionId={o.id}
                  nombreActual={o.nombre}
                  sinCosto={o.costo == null}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <EditarPrecioExtraOpcion
                  productId={producto.id}
                  optionId={o.id}
                  precioActual={Number(o.precioExtra)}
                />
                <EditarCostoOpcion
                  productId={producto.id}
                  optionId={o.id}
                  costoActual={o.costo != null ? Number(o.costo) : null}
                />
                <EditarFiscalOpcion
                  productId={producto.id}
                  optionId={o.id}
                  ivaActual={o.iva}
                  unidadMedidaActual={o.unidadMedida}
                />
                <EliminarOpcionBoton productId={producto.id} optionId={o.id} />
              </div>
            </div>
          ))}
          {producto.opciones.length === 0 && (
            <p className="text-sm text-tinta-suave">Sin agregados todavía.</p>
          )}
        </div>

        <AgregarOpcionForm productId={producto.id} />
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-3">
        <div>
          <p className="rotulo text-[0.8rem] font-bold">Grupos de agregados</p>
          <p className="text-sm text-tinta-media">
            Grupos reutilizables (ej: Salsas, Quesos) que se suman a los agregados propios de
            arriba. Cada modificador es un producto real de tu catálogo. Se crean y editan en
            Grupos de agregados, en el menú.
          </p>
        </div>
        <AsignarGruposProducto
          productId={producto.id}
          grupos={gruposAgregados.map((g) => ({
            id: g.id,
            nombre: g.nombre,
            cantidadItems: g._count.modificadores,
          }))}
          gruposAdjuntadosIds={producto.gruposAgregados.map((g) => g.groupId)}
        />
      </Tarjeta>
    </div>
  );
}
