import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual, localActual } from "@/lib/local-actual";
import { formatearGuarani } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { ImprimirBoton } from "../../estadisticas/imprimir/ImprimirBoton";

export const dynamic = "force-dynamic";

export default async function ImprimirProductosPage() {
  await pantallaConPermiso("productos.ver");

  const storeId = await idLocalActual();
  const prisma = prismaDelLocal(storeId);

  // Dos consultas separadas y no un include anidado: así las dos pasan por el
  // mismo filtro de local (prismaDelLocal), en vez de confiar en que la
  // relación categoría→producto alcance sola para no mezclar negocios.
  const [local, categorias, productos] = await Promise.all([
    localActual(),
    prisma.category.findMany({ orderBy: { orden: "asc" } }),
    prisma.product.findMany({ orderBy: [{ categoryId: "asc" }, { orden: "asc" }] }),
  ]);

  const productosPorCategoria = new Map<string, typeof productos>();
  for (const p of productos) {
    const lista = productosPorCategoria.get(p.categoryId) ?? [];
    lista.push(p);
    productosPorCategoria.set(p.categoryId, lista);
  }

  const totalProductos = productos.length;
  const generado = new Date().toLocaleString("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ZONA_NEGOCIO,
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="mb-6 flex justify-end print:hidden">
        <ImprimirBoton />
      </div>

      <div className="mb-8 flex items-center gap-4 border-b border-linea pb-6">
        {local.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={local.logoUrl}
            alt={local.nombre}
            className="h-16 w-16 flex-none rounded-full object-cover"
          />
        )}
        <div>
          <h1 className="text-2xl font-bold text-tinta">{local.nombre} — Productos</h1>
          <p className="mt-1 text-sm text-tinta-media">
            {totalProductos} productos en {categorias.length}{" "}
            {categorias.length === 1 ? "categoría" : "categorías"} · Generado el {generado}
          </p>
        </div>
      </div>

      {categorias.length === 0 ? (
        <p className="text-sm text-tinta-suave">Todavía no hay categorías cargadas.</p>
      ) : (
        categorias.map((c) => {
          const productosDeCategoria = productosPorCategoria.get(c.id) ?? [];
          return (
          <div key={c.id} className="mb-8 break-inside-avoid">
            <h2 className="mb-2 font-semibold text-tinta">
              {c.nombre}
              {!c.activa && (
                <span className="ml-2 text-xs font-normal text-tinta-suave">(categoría oculta)</span>
              )}
            </h2>
            {productosDeCategoria.length === 0 ? (
              <p className="text-sm text-tinta-suave">Sin productos en esta categoría.</p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-tinta-media">
                    <th className="py-1.5">Producto</th>
                    <th className="py-1.5 text-right">Precio</th>
                  </tr>
                </thead>
                <tbody>
                  {productosDeCategoria.map((p) => (
                    <tr key={p.id} className="border-b border-linea-fina break-inside-avoid">
                      <td className="py-1.5 text-tinta">
                        {p.nombre}
                        {!p.disponible && (
                          <span className="ml-2 text-xs text-tinta-suave">(oculto)</span>
                        )}
                      </td>
                      <td className="py-1.5 text-right font-medium text-tinta">
                        {formatearGuarani(Number(p.precio))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          );
        })
      )}

      <p className="mt-10 text-[0.72rem] text-tinta-suave">Generado desde TuMenuSmart.</p>
    </div>
  );
}
