import { prisma } from "@/lib/prisma";
import { ProductCard } from "@/components/ProductCard";
import { CartBar } from "@/components/CartBar";
import { MitadYMitadPicker } from "@/components/MitadYMitadPicker";

export const dynamic = "force-dynamic";

export default async function CatalogoPage() {
  const [store, categorias] = await Promise.all([
    prisma.store.findFirst(),
    prisma.category.findMany({
      orderBy: { orden: "asc" },
      include: {
        productos: {
          where: { disponible: true },
          orderBy: { orden: "asc" },
          include: { opciones: { orderBy: { orden: "asc" } } },
        },
      },
    }),
  ]);

  return (
    <main className="mx-auto max-w-2xl px-4 pb-28 pt-8">
      <header className="mb-8 flex items-center gap-4">
        {store?.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={store.logoUrl}
            alt={store.nombre}
            className="h-16 w-16 rounded-full object-cover"
          />
        )}
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">
            {store?.nombre ?? "Nuestro menú"}
          </h1>
          {store?.direccion && (
            <p className="text-sm text-neutral-500">{store.direccion}</p>
          )}
        </div>
      </header>

      {categorias.length === 0 && (
        <p className="text-neutral-500">
          Todavía no hay productos cargados. Entrá al panel admin para agregar el menú.
        </p>
      )}

      <div className="flex flex-col gap-8">
        {categorias
          .filter((c) => c.productos.length > 0)
          .map((categoria) => (
            <section key={categoria.id}>
              <h2 className="mb-3 text-lg font-semibold text-neutral-800">
                {categoria.nombre}
              </h2>
              <div className="flex flex-col gap-3">
                {categoria.productos.map((producto) => (
                  <ProductCard
                    key={producto.id}
                    producto={{
                      ...producto,
                      precio: Number(producto.precio),
                      opciones: producto.opciones.map((o) => ({
                        ...o,
                        precioExtra: Number(o.precioExtra),
                      })),
                    }}
                  />
                ))}
              </div>

              {categoria.permiteMitadYMitad && categoria.productos.length >= 2 && (
                <div className="mt-3">
                  <MitadYMitadPicker
                    categoriaNombre={categoria.nombre}
                    modo={categoria.modoPrecioMitad === "proporcional" ? "proporcional" : "mayor"}
                    productos={categoria.productos.map((p) => ({
                      id: p.id,
                      nombre: p.nombre,
                      precio: Number(p.precio),
                      opciones: p.opciones.map((o) => ({
                        ...o,
                        precioExtra: Number(o.precioExtra),
                      })),
                    }))}
                  />
                </div>
              )}
            </section>
          ))}
      </div>

      <CartBar />
    </main>
  );
}
