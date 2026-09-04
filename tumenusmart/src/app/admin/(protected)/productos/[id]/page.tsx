import { pantallaConPermiso } from "@/lib/auth";
import { Suspense } from "react";
import { Volver } from "@/components/Volver";
import { notFound } from "next/navigation";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { formatearGuarani } from "@/lib/format";
import { EliminarProductoBoton, EliminarOpcionBoton } from "./EliminarBotones";
import { EditarProductoForm } from "./EditarProductoForm";
import { AgregarOpcionForm } from "./AgregarOpcionForm";
import { GuardadoToast } from "@/components/GuardadoToast";

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

  const [producto, categorias] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: { opciones: { orderBy: { orden: "asc" } } },
    }),
    prisma.category.findMany({ orderBy: { orden: "asc" } }),
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
            precio: Number(producto.precio),
            costo: producto.costo != null ? Number(producto.costo) : null,
            imagenUrl: producto.imagenUrl,
            disponible: producto.disponible,
            destacado: producto.destacado,
            ingredientes: producto.ingredientes,
            mitadYMitadGrupo: producto.mitadYMitadGrupo,
            mitadYMitadModo: producto.mitadYMitadModo,
          }}
          categorias={categorias}
        />
      </div>

      <div>
        <h2 className="mb-3 font-semibold text-tinta">
          Agregados
        </h2>
        <p className="mb-3 text-sm text-tinta-media">
          Extras que el cliente puede sumar a este producto (ej: borde relleno, extra queso).
        </p>

        <div className="mb-4 flex flex-col gap-2">
          {producto.opciones.map((o) => (
            <div
              key={o.id}
              className="flex items-center justify-between rounded-lg border border-linea bg-white px-3 py-2 text-sm"
            >
              <span>
                {o.nombre}
                {Number(o.precioExtra) > 0 && (
                  <span className="text-tinta-suave">
                    {" "}
                    · +{formatearGuarani(Number(o.precioExtra))}
                  </span>
                )}
              </span>
              <EliminarOpcionBoton productId={producto.id} optionId={o.id} />
            </div>
          ))}
          {producto.opciones.length === 0 && (
            <p className="text-sm text-tinta-suave">Sin agregados todavía.</p>
          )}
        </div>

        <AgregarOpcionForm productId={producto.id} />
      </div>
    </div>
  );
}
