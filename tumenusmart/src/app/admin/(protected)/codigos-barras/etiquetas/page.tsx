import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { BotonEnlace, Cabecera } from "@/components/ui";
import { Etiquetas } from "./Etiquetas";

export const dynamic = "force-dynamic";

/**
 * Imprimir las etiquetas con el código de barras de los productos, para pegarlas en cada uno. Se elige qué productos y cuántas copias, el tamaño
 * de la etiqueta y la impresora, se ve cómo queda y se imprime desde el navegador (sirve con cualquier impresora, también una térmica de
 * etiquetas con su driver de Windows). `?producto=ID` abre con ese producto marcado; `?prueba=1`, con una etiqueta de prueba.
 */
export default async function EtiquetasPage({
  searchParams,
}: {
  searchParams: Promise<{ producto?: string; prueba?: string }>;
}) {
  await pantallaConPermiso("productos.ver");
  const { producto, prueba } = await searchParams;

  // Todas las consultas de acá abajo quedan atadas a este local.
  const db = prismaDelLocal(await idLocalActual());
  const [categorias, productos, sinCodigo] = await Promise.all([
    db.category.findMany({ orderBy: [{ orden: "asc" }, { createdAt: "asc" }], select: { id: true, nombre: true } }),
    db.product.findMany({
      where: { esServicio: false, codigoBarras: { not: null } },
      orderBy: [{ category: { orden: "asc" } }, { orden: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { id: true, nombre: true, categoryId: true, precio: true, codigoBarras: true },
    }),
    db.product.count({ where: { esServicio: false, codigoBarras: null } }),
  ]);

  return (
    <div>
      <div className="print:hidden">
        <Cabecera
          titulo="Etiquetas"
          bajada="Elegí los productos, el tamaño de la etiqueta y tu impresora, mirá cómo queda e imprimí. Antes de imprimir muchas, probá con una y escanealá."
          acciones={
            <BotonEnlace href="/admin/codigos-barras" tono="navegar" tam="sm">
              Volver a Códigos de barras
            </BotonEnlace>
          }
        />
      </div>

      <Etiquetas
        productos={productos.flatMap((p) =>
          p.codigoBarras ? [{ id: p.id, nombre: p.nombre, categoryId: p.categoryId, precio: Number(p.precio), codigo: p.codigoBarras }] : []
        )}
        categorias={categorias}
        sinCodigo={sinCodigo}
        inicialId={producto && productos.some((p) => p.id === producto) ? producto : null}
        prueba={prueba === "1"}
      />
    </div>
  );
}
