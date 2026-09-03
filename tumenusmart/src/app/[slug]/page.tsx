import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { CartBar } from "@/components/CartBar";
import { CarruselDestacados } from "@/components/CarruselDestacados";
import { AvisoTienda } from "@/components/AvisoTienda";
import { EstadoAperturaBadge } from "@/components/EstadoAperturaBadge";
import { Carta, type CategoriaCarta } from "@/components/Carta";
import { obtenerEstadoTienda } from "@/lib/estado-tienda";
import { localPorSlug } from "@/lib/local-por-slug";

export const dynamic = "force-dynamic";

export default async function CatalogoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const store = await localPorSlug(slug);
  const storeId = store.id;

  const [categoriasCrudas, destacados, estadoTienda] = await Promise.all([
    prisma.category.findMany({
      where: { storeId, activa: true },
      orderBy: { orden: "asc" },
      include: {
        productos: {
          where: { storeId, disponible: true },
          orderBy: { orden: "asc" },
          include: { opciones: { orderBy: { orden: "asc" } } },
        },
      },
    }),
    prisma.product.findMany({
      where: { storeId, destacado: true, disponible: true },
      orderBy: { orden: "asc" },
    }),
    obtenerEstadoTienda(storeId),
  ]);

  const conProductos = categoriasCrudas.filter((c) => c.productos.length > 0);

  // Los combos "mitad y mitad" se agrupan por su nombre de grupo, ignorando
  // mayúsculas y espacios de más, para que "Pizza Grande" y "pizza grande "
  // sean el mismo grupo. Cada grupo se muestra dentro de la categoría donde
  // están sus productos, y no todos juntos al final: ahí nadie los veía.
  type ProductoMitad = CategoriaCarta["grupos"][number]["productos"][number];
  const grupos = new Map<
    string,
    { nombreVisible: string; productos: ProductoMitad[]; categoriaId: string }
  >();

  for (const categoria of conProductos) {
    for (const producto of categoria.productos) {
      const nombreGrupo = producto.mitadYMitadGrupo?.trim();
      if (!nombreGrupo) continue;
      const clave = nombreGrupo.toLowerCase();
      const entrada =
        grupos.get(clave) ??
        { nombreVisible: nombreGrupo, productos: [], categoriaId: categoria.id };
      entrada.productos.push({
        id: producto.id,
        nombre: producto.nombre,
        precio: Number(producto.precio),
        mitadYMitadModo: producto.mitadYMitadModo,
        opciones: producto.opciones.map((o) => ({
          id: o.id,
          nombre: o.nombre,
          tipo: o.tipo,
          precioExtra: Number(o.precioExtra),
        })),
      });
      grupos.set(clave, entrada);
    }
  }

  const categorias: CategoriaCarta[] = conProductos.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    productos: c.productos.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion,
      precio: Number(p.precio),
      imagenUrl: p.imagenUrl,
      ingredientes: p.ingredientes,
      opciones: p.opciones.map((o) => ({
        id: o.id,
        nombre: o.nombre,
        tipo: o.tipo,
        precioExtra: Number(o.precioExtra),
      })),
    })),
    grupos: [...grupos.entries()]
      .filter(([, g]) => g.categoriaId === c.id && g.productos.length >= 2)
      .map(([clave, g]) => ({
        clave,
        nombreVisible: g.nombreVisible,
        productos: g.productos,
      })),
  }));

  // Las tres dudas que tiene cualquiera antes de mirar la carta: si está

  return (
    <main className="mx-auto max-w-2xl px-4 pb-32">
      {/* ---------- cabecera del local ---------- */}
      <header className="animate-[subir_0.5s_cubic-bezier(0.22,0.7,0.3,1)]">
        {/*
          Banner de marca, igual para todos los locales — no es algo que el
          dueño suba ni edite. Es identidad de la plataforma, como el
          "powered by" que ya usan otras apps de pedidos. El -mx-4 lo lleva de
          borde a borde (mismo truco que usa Carta.tsx para sus cabeceras de
          categoría).
        */}
        <div className="-mx-4 -mt-6 flex h-28 flex-col items-center justify-center gap-1 bg-brand px-4 text-center text-white sm:h-32">
          <p className="text-[1rem] font-semibold tracking-titular sm:text-[1.1rem]">
            Estamos en línea para recibir tu pedido
          </p>
          <p className="text-[0.7rem] font-medium uppercase tracking-[0.14em] text-white/75">
            Desarrollado por TuMenuSmart
          </p>
        </div>
        <div className="flex items-center gap-3.5 pt-4">
          {store.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={store.logoUrl}
              alt={store.nombre}
              width={96}
              height={96}
              decoding="async"
              className="h-24 w-24 flex-none rounded-2xl object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-24 w-24 flex-none items-center justify-center rounded-2xl bg-brand-light text-2xl font-bold tracking-titular text-brand"
            >
              {store.nombre.slice(0, 2).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[1.4rem] font-semibold tracking-titular">
              {store.nombre}
            </h1>
            {store.direccion && (
              <p className="truncate text-[0.82rem] text-tinta-suave">{store.direccion}</p>
            )}
          </div>
        </div>

        <div className="mt-3">
          <EstadoAperturaBadge estado={estadoTienda} />
        </div>

        {/*
          Reservar mesa va DEBAJO del estado de apertura, no arriba a la
          derecha. Antes competía por el mismo renglón que el nombre del local
          y le quitaba ancho al logo. Y el orden de lectura ahora es el que
          corresponde: primero de qué local se trata, después si está abierto,
          y recién entonces qué se puede hacer.
        */}
        <div className="mt-3.5">
          <Link
            href={`/${slug}/reservas`}
            className="inline-flex items-center rounded-xl bg-azul px-5 py-2.5 text-[0.88rem] font-semibold text-white shadow-media transition-colors hover:bg-azul-oscuro"
          >
            Reservar mesa
          </Link>
        </div>
      </header>

      <div className="mt-5">
        <AvisoTienda estado={estadoTienda} />
      </div>

      <CarruselDestacados
        productos={destacados.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          precio: Number(p.precio),
          imagenUrl: p.imagenUrl,
        }))}
      />

      {categorias.length === 0 ? (
        <p className="py-14 text-center text-[0.9rem] text-tinta-suave">
          Este negocio todavía está cargando su carta.
        </p>
      ) : (
        <Carta categorias={categorias} estilo={store.estiloCarta} />
      )}

      <CartBar />
    </main>
  );
}
