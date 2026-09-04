import { clasesBoton } from "@/components/ui";
import { Suspense } from "react";
import Link from "next/link";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { formatearGuarani } from "@/lib/format";
import { crearProducto, moverProducto } from "./actions";
import { BotonesMover } from "@/components/BotonesMover";
import { DisponibleToggle } from "./DisponibleToggle";
import { sesionActual } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { IngredientesField } from "./IngredientesField";
import { ImagenProductoField } from "./ImagenProductoField";
import { GuardadoToast } from "@/components/GuardadoToast";

export const dynamic = "force-dynamic";

export default async function AdminProductosPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string; guardado?: string }>;
}) {
  // Qué puede hacer quien entró. El empleado ve la carta y puede marcar algo
  // agotado, pero no crear, editar ni reordenar.
  const sesion = await sesionActual();
  const puedeEditar = puede(sesion?.rol, "productos.editar");

  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  const { categoria: categoriaId, guardado } = await searchParams;
  // Si venimos de crear un producto, el formulario queda abierto para
  // poder seguir cargando el siguiente sin tener que volver a desplegarlo.
  const mantenerFormularioAbierto = guardado === "1";

  const categorias = await prisma.category.findMany({
    orderBy: { orden: "asc" },
    include: { _count: { select: { productos: true } } },
  });

  const categoriaActiva = categoriaId
    ? categorias.find((c) => c.id === categoriaId)
    : undefined;

  const productos = categoriaActiva
    ? await prisma.product.findMany({
        where: { categoryId: categoriaActiva.id },
        // El desempate por createdAt importa: sin él, con órdenes repetidas la
        // lista podría salir distinta en cada carga y las flechas moverían el
        // producto equivocado.
        orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
      })
    : [];

  return (
    <div>
      <Suspense fallback={null}>
        <GuardadoToast />
      </Suspense>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-[1.4rem] font-semibold tracking-titular text-tinta">Productos</h1>
        <a
          href="/admin/productos/imprimir"
          target="_blank"
          rel="noopener noreferrer"
          className={clasesBoton("navegar", "sm")}
        >
          Ver reporte / PDF
        </a>
      </div>

      {categorias.length === 0 ? (
        <p className="mb-6 text-sm text-aviso">
          Creá primero una categoría en la sección "Categorías" para poder cargar productos.
        </p>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap gap-2">
            {categorias.map((c) => (
              <Link
                key={c.id}
                href={`/admin/productos?categoria=${c.id}`}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                  categoriaActiva?.id === c.id
                    ? "border-brand bg-brand text-white"
                    : "border-brand/30 bg-brand-light text-brand-texto hover:border-brand"
                }`}
              >
                {c.nombre}{" "}
                <span className={categoriaActiva?.id === c.id ? "opacity-80" : "text-tinta-suave"}>
                  ({c._count.productos})
                </span>
              </Link>
            ))}
          </div>

          {puedeEditar && (
          <details
            open={mantenerFormularioAbierto}
            className="mb-6 rounded-lg border border-linea bg-white p-4"
          >
            <summary className="cursor-pointer font-medium">
              + Nuevo producto
            </summary>
            <form action={crearProducto} className="mt-4 flex flex-col gap-3">
              <input
                name="nombre"
                required
                placeholder="Nombre"
                className="rounded-lg border border-linea px-3 py-2"
              />
              <textarea
                name="descripcion"
                placeholder="Descripción (opcional)"
                className="rounded-lg border border-linea px-3 py-2"
                rows={2}
              />
              <select
                name="categoryId"
                required
                defaultValue={categoriaActiva?.id ?? ""}
                className="rounded-lg border border-linea px-3 py-2"
              >
                <option value="" disabled>
                  Elegí una categoría
                </option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
              <input
                type="number"
                name="precio"
                required
                step="1"
                min="0"
                placeholder="Precio (Gs.)"
                className="rounded-lg border border-linea px-3 py-2"
              />
              <ImagenProductoField initialUrl={null} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="disponible" defaultChecked />
                Disponible en el menú
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="destacado" />
                ⭐ Producto destacado (aparece en el carrusel de la cabecera del menú)
              </label>
              <IngredientesField initial={[]} />
              <button
                type="submit"
                className={clasesBoton("principal")}
              >
                Crear producto
              </button>
            </form>
          </details>
          )}
        </>
      )}

      {!categoriaActiva && categorias.length > 0 && (
        <p className="text-sm text-tinta-suave">
          Elegí una categoría arriba para ver sus productos.
        </p>
      )}

      {categoriaActiva && productos.length > 1 && (
        <p className="mb-2 text-sm text-tinta-media">
          Este es el orden en que tu cliente ve los productos dentro de "
          {categoriaActiva.nombre}". Movelos con las flechas.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {productos.map((p, i) => (
          // Las flechas van FUERA del enlace: adentro, tocarlas abriría el
          // producto en vez de moverlo.
          <div
            key={p.id}
            className="flex items-center gap-3 rounded-lg border border-linea bg-white px-3 py-3"
          >
            {puedeEditar && (
            <BotonesMover
              id={p.id}
              accion={moverProducto}
              esPrimero={i === 0}
              esUltimo={i === productos.length - 1}
              etiqueta={p.nombre}
            />
            )}
            <Link
              prefetch={false}
              href={`/admin/productos/${p.id}`}
              className="flex min-w-0 flex-1 items-center justify-between gap-3 hover:text-brand"
            >
              <p className="min-w-0 truncate font-medium">
                {p.destacado && <span title="Destacado">⭐ </span>}
                {p.nombre}{" "}
                {!p.disponible && (
                  <span className="text-xs text-tinta-suave">(oculto)</span>
                )}
              </p>
              <span className="flex-none font-semibold">
                {formatearGuarani(Number(p.precio))}
              </span>
            </Link>
            <DisponibleToggle id={p.id} disponible={p.disponible} nombre={p.nombre} />
          </div>
        ))}
        {categoriaActiva && productos.length === 0 && (
          <p className="text-sm text-tinta-suave">
            Todavía no hay productos en "{categoriaActiva.nombre}".
          </p>
        )}
      </div>
    </div>
  );
}
