import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ProductCard } from "@/components/ProductCard";
import { CartBar } from "@/components/CartBar";
import { MitadYMitadPicker } from "@/components/MitadYMitadPicker";
import { CarruselDestacados } from "@/components/CarruselDestacados";

export const dynamic = "force-dynamic";

export default async function CatalogoPage() {
  const [store, categorias, destacados] = await Promise.all([
    prisma.store.findFirst(),
    prisma.category.findMany({
      where: { activa: true },
      orderBy: { orden: "asc" },
      include: {
        productos: {
          where: { disponible: true },
          orderBy: { orden: "asc" },
          include: { opciones: { orderBy: { orden: "asc" } } },
        },
      },
    }),
    prisma.product.findMany({
      where: { destacado: true, disponible: true },
      orderBy: { orden: "asc" },
    }),
  ]);

  // Agrupa TODOS los productos disponibles (de cualquier categoría) por su
  // "grupo mitad y mitad" — así un "Pizza Grande" no se mezcla con un
  // "Pizza Mediana" aunque convivan en la misma categoría del menú.
  type ProductoMitad = {
    id: string;
    nombre: string;
    precio: number;
    mitadYMitadModo: string;
    opciones: { id: string; nombre: string; tipo: string; precioExtra: number }[];
  };
  // La clave de agrupación ignora mayúsculas/minúsculas y espacios de más,
  // para que "Pizza Grande" y "pizza grande " se traten como el mismo grupo.
  const gruposMitadYMitad = new Map<
    string,
    { nombreVisible: string; productos: ProductoMitad[] }
  >();
  for (const categoria of categorias) {
    for (const producto of categoria.productos) {
      const grupoOriginal = producto.mitadYMitadGrupo?.trim();
      if (!grupoOriginal) continue;
      const clave = grupoOriginal.toLowerCase();
      const entrada = gruposMitadYMitad.get(clave) ?? { nombreVisible: grupoOriginal, productos: [] };
      entrada.productos.push({
        id: producto.id,
        nombre: producto.nombre,
        precio: Number(producto.precio),
        mitadYMitadModo: producto.mitadYMitadModo,
        opciones: producto.opciones.map((o) => ({ ...o, precioExtra: Number(o.precioExtra) })),
      });
      gruposMitadYMitad.set(clave, entrada);
    }
  }

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

      <div className="mb-6 flex justify-end">
        <Link
          href="/reservas"
          className="inline-flex items-center gap-1.5 rounded-lg border border-brand px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand-light"
        >
          📅 Reservar mesa
        </Link>
      </div>

      <CarruselDestacados
        productos={destacados.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          precio: Number(p.precio),
          imagenUrl: p.imagenUrl,
        }))}
      />

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
            </section>
          ))}
      </div>

      {gruposMitadYMitad.size > 0 && (
        <div className="mt-10 flex flex-col gap-4">
          {[...gruposMitadYMitad.entries()]
            .filter(([, entrada]) => entrada.productos.length >= 2)
            .map(([clave, entrada]) => (
              <MitadYMitadPicker
                key={clave}
                grupoNombre={entrada.nombreVisible}
                productos={entrada.productos}
              />
            ))}
        </div>
      )}

      <CartBar />
    </main>
  );
}
