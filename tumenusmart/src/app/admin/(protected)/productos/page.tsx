import { clasesBoton, Pastilla } from "@/components/ui";
import { Suspense } from "react";
import Link from "next/link";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { formatearGuarani } from "@/lib/format";
import { etiquetaIva } from "@/lib/iva";
import { moverProducto } from "./actions";
import { BotonesMover } from "@/components/BotonesMover";
import { DisponibleToggle } from "./DisponibleToggle";
import { pantallaConPermiso } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { CrearProductoForm } from "./CrearProductoForm";
import { GuardadoToast } from "@/components/GuardadoToast";

export const dynamic = "force-dynamic";

export default async function AdminProductosPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string; guardado?: string }>;
}) {
  // Qué puede hacer quien entró. El empleado ve la carta y puede marcar algo
  // agotado, pero no crear, editar ni reordenar.
  //
  // El chequeo va acá y no solo en el layout: layout y página se renderizan
  // en paralelo, así que una sesión vencida podía terminar en el `throw` de
  // idLocalActual() de acá abajo antes de que el layout redirigiera a
  // /admin/login — un error real en vez de un redirect silencioso.
  const sesion = await pantallaConPermiso("productos.ver");
  const puedeEditar = puede(sesion.rol, "productos.editar");

  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  const { categoria: categoriaId, guardado } = await searchParams;
  // Si venimos de crear un producto, el formulario queda abierto para
  // poder seguir cargando el siguiente sin tener que volver a desplegarlo.
  const mantenerFormularioAbierto = guardado === "1";

  const [categorias, areasImpresion, almacenes] = await Promise.all([
    prisma.category.findMany({
      orderBy: { orden: "asc" },
      include: { _count: { select: { productos: true } } },
    }),
    prisma.areaImpresion.findMany({
      where: { activa: true },
      orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
      select: { id: true, nombre: true },
    }),
    // El más antiguo primero: es el que queda elegido de entrada en un producto nuevo.
    prisma.almacen.findMany({
      where: { activo: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, nombre: true },
    }),
  ]);

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
          <details open={mantenerFormularioAbierto} className="group mb-6">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-exito/30 bg-exito-luz px-3 py-1.5 text-sm font-medium text-exito transition-colors hover:bg-exito hover:text-white">
              <span aria-hidden="true">+</span>
              Nuevo producto
              <span
                aria-hidden="true"
                className="text-xs transition-transform duration-150 group-open:rotate-180"
              >
                ▼
              </span>
            </summary>
            <div className="mt-3 rounded-lg border border-linea bg-white p-4">
              <CrearProductoForm
                categorias={categorias}
                categoriaActivaId={categoriaActiva?.id}
                areasImpresion={areasImpresion}
                almacenes={almacenes}
              />
            </div>
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
            <Pastilla color="neutro">{etiquetaIva(p.iva)}</Pastilla>
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
