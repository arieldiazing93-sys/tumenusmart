import { pantallaConPermiso } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { BotonEnlace, Cabecera } from "@/components/ui";
import { CodigosMaestroDetalle } from "./CodigosMaestroDetalle";

export const dynamic = "force-dynamic";

/**
 * Códigos de barras: el código de cada producto (el de fábrica, que se escanea, o uno propio que genera el sistema) para venderlo apuntando
 * con un lector en el punto de venta, y las etiquetas para pegarlo en los productos que no traen uno. Los servicios no llevan código.
 */
export default async function CodigosBarrasPage() {
  // Verlo es del permiso de ver productos; guardar, generar y quitar códigos es del de editarlos (lo vuelve a exigir cada acción).
  const sesion = await pantallaConPermiso("productos.ver");
  const puedeEditar = puede(sesion.rol, "productos.editar");

  // Todas las consultas de acá abajo quedan atadas a este local.
  const db = prismaDelLocal(await idLocalActual());

  const [categorias, productos] = await Promise.all([
    db.category.findMany({ orderBy: [{ orden: "asc" }, { createdAt: "asc" }], select: { id: true, nombre: true } }),
    db.product.findMany({
      where: { esServicio: false },
      orderBy: [{ category: { orden: "asc" } }, { orden: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { id: true, nombre: true, categoryId: true, precio: true, disponible: true, codigoBarras: true },
    }),
  ]);
  const nombreDeCategoria = new Map(categorias.map((c) => [c.id, c.nombre]));

  return (
    <div>
      <Cabecera
        titulo="Códigos de barras"
        bajada="El código de cada producto, para venderlo escaneándolo con un lector en el punto de venta. Cargá el de fábrica o generá uno propio e imprimí la etiqueta para pegarla."
        acciones={
          <BotonEnlace href="/admin/codigos-barras/etiquetas" tono="navegar" tam="sm">
            🏷 Imprimir etiquetas
          </BotonEnlace>
        }
      />

      <CodigosMaestroDetalle
        productos={productos.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          categoryId: p.categoryId,
          categoria: nombreDeCategoria.get(p.categoryId) ?? "",
          precio: Number(p.precio),
          disponible: p.disponible,
          codigoBarras: p.codigoBarras,
        }))}
        categorias={categorias}
        puedeEditar={puedeEditar}
      />
    </div>
  );
}
