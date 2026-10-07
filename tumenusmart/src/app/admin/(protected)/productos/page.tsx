import { Suspense } from "react";
import { clasesBoton, Cabecera } from "@/components/ui";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { pantallaConPermiso } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { GuardadoToast } from "@/components/GuardadoToast";
import { ProductosMaestroDetalle } from "./ProductosMaestroDetalle";
import { FichaProducto } from "./FichaProducto";

export const dynamic = "force-dynamic";

export default async function AdminProductosPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string; producto?: string; guardado?: string }>;
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

  const { categoria: categoriaParam, producto: productoParam } = await searchParams;

  const [categorias, productos, areasImpresion, almacenes] = await Promise.all([
    prisma.category.findMany({
      orderBy: { orden: "asc" },
      select: { id: true, nombre: true },
    }),
    prisma.product.findMany({
      // El desempate por createdAt importa: sin él, con órdenes repetidas la
      // lista podría salir distinta en cada carga y las flechas moverían el
      // producto equivocado.
      orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
      select: { id: true, nombre: true, categoryId: true, precio: true, disponible: true, destacado: true },
    }),
    // Estos dos solo los usa el formulario de "Nuevo producto".
    puedeEditar
      ? prisma.areaImpresion.findMany({
          where: { activa: true },
          orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
          select: { id: true, nombre: true },
        })
      : Promise.resolve([]),
    // El más antiguo primero: es el que queda elegido de entrada en un producto nuevo.
    puedeEditar
      ? prisma.almacen.findMany({
          where: { activo: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true, nombre: true },
        })
      : Promise.resolve([]),
  ]);

  // El producto abierto a la derecha. Sale de la lista del local (nunca se
  // confía en el id de la dirección sin comprobarlo) y solo lo abre quien puede
  // editar: la ficha trae la receta y los costos.
  const abierto = puedeEditar && productoParam ? productos.find((p) => p.id === productoParam) : undefined;

  // Qué categoría muestra la lista: la de la dirección ("todas" = sin filtro); si
  // no vino, la del producto abierto; si tampoco, la primera de la carta.
  let categoriaInicial: string;
  if (categoriaParam === "todas") categoriaInicial = "";
  else if (categoriaParam && categorias.some((c) => c.id === categoriaParam)) categoriaInicial = categoriaParam;
  else if (abierto) categoriaInicial = abierto.categoryId;
  else categoriaInicial = categorias[0]?.id ?? "";

  return (
    <div>
      <Suspense fallback={null}>
        <GuardadoToast />
      </Suspense>

      <Cabecera
        titulo="Productos"
        bajada="Elegí una categoría para ver sus productos y hacé doble clic en uno para abrir toda su información."
        acciones={
          <a
            href="/admin/productos/imprimir"
            target="_blank"
            rel="noopener noreferrer"
            className={clasesBoton("navegar", "sm")}
          >
            Ver reporte / PDF
          </a>
        }
      />

      {categorias.length === 0 ? (
        <p className="mb-6 text-sm text-aviso">
          Creá primero una categoría en la sección "Categorías" para poder cargar productos.
        </p>
      ) : (
        <ProductosMaestroDetalle
          productos={productos.map((p) => ({
            id: p.id,
            nombre: p.nombre,
            categoryId: p.categoryId,
            precio: Number(p.precio),
            disponible: p.disponible,
            destacado: p.destacado,
          }))}
          categorias={categorias}
          areasImpresion={areasImpresion}
          almacenes={almacenes}
          puedeEditar={puedeEditar}
          categoriaInicial={categoriaInicial}
          abiertoId={abierto?.id ?? null}
          detalle={abierto ? <FichaProducto productoId={abierto.id} /> : null}
        />
      )}
    </div>
  );
}
