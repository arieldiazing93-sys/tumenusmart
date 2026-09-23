import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { CartBar } from "@/components/CartBar";
import { CarruselDestacados } from "@/components/CarruselDestacados";
import { AvisoTienda } from "@/components/AvisoTienda";
import { EstadoAperturaBadge } from "@/components/EstadoAperturaBadge";
import { Carta, type CategoriaCarta } from "@/components/Carta";
import { obtenerEstadoTienda } from "@/lib/estado-tienda";
import { localPorSlug } from "@/lib/local-por-slug";
import { categoriaOcultaPorHorario } from "@/lib/horario-atencion";

export const dynamic = "force-dynamic";

/**
 * Un producto ofrece dos fuentes de agregados: los propios (ProductOption)
 * y los de cualquier grupo reutilizable que tenga adjuntado (ver
 * src/app/admin/(protected)/grupos-agregados/) — se combinan en un solo
 * array acá, así el resto de la carta y el motor de precios
 * (src/lib/precio-pedido.ts) siguen viendo un único `opciones` como
 * siempre, sin saber ni importarles de dónde salió cada ítem. Cada
 * modificador de un grupo ES un Product real (ver OptionGroupProduct) — se
 * usa su propio nombre/precio, no datos duplicados — y siempre cuenta como
 * "agregado" (los grupos no tienen variantes).
 */
function combinarOpciones<
  O extends { id: string; nombre: string; tipo: string; precioExtra: unknown },
  G extends { group: { modificadores: { product: { id: string; nombre: string; precio: unknown } }[] } },
>(opciones: O[], gruposAgregados: G[]) {
  return [
    ...opciones,
    ...gruposAgregados.flatMap((g) =>
      g.group.modificadores.map((m) => ({
        id: m.product.id,
        nombre: m.product.nombre,
        precioExtra: m.product.precio,
        tipo: "agregado" as const,
      }))
    ),
  ];
}

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
          include: {
            opciones: { orderBy: { orden: "asc" } },
            gruposAgregados: {
              select: {
                group: {
                  select: {
                    modificadores: {
                      where: { product: { disponible: true } },
                      select: { product: { select: { id: true, nombre: true, precio: true } } },
                    },
                  },
                },
              },
            },
          },
        },
        horarios: { select: { diaSemana: true, abre: true, cierra: true } },
      },
    }),
    prisma.product.findMany({
      where: { storeId, destacado: true, disponible: true },
      orderBy: { orden: "asc" },
    }),
    obtenerEstadoTienda(storeId),
  ]);

  // Una categoría con tramos de bloqueo propios (ej: "Hamburguesas Simple"
  // oculta lunes y martes) desaparece entera durante esos tramos, aunque el
  // local esté abierto y el resto de la carta siga normal. Sin tramos
  // cargados, la categoría se muestra siempre — esto es una excepción que
  // configura el que la necesita, no algo que haya que definir por default.
  const ahora = new Date();
  const conProductos = categoriasCrudas.filter(
    (c) => c.productos.length > 0 && !categoriaOcultaPorHorario(c.horarios, ahora)
  );

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
        opciones: combinarOpciones(producto.opciones, producto.gruposAgregados).map((o) => ({
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
      opciones: combinarOpciones(p.opciones, p.gruposAgregados).map((o) => ({
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
    <>
      {/*
        Banner de marca, igual para todos los locales — no es algo que el
        dueño suba ni edite. Es identidad de la plataforma, como el "powered
        by" que ya usan otras apps de pedidos.

        Va AFUERA de <main> a propósito, como hermano antes que ella, y no
        adentro con un margen negativo para "escaparse" de su padding. Ese
        margen negativo dependía de que se cancelara justo contra el padding
        de arriba de todos sus ancestros (colapso de márgenes) — algo frágil
        que en el navegador del celular no siempre daba el mismo resultado y
        dejaba un hueco arriba del banner. Como primer elemento de la página,
        ahora no hay nada de qué "escaparse": arranca pegado al borde
        superior real de la pantalla, siempre.

        El wrapper de acá abajo repite el mismo ancho máximo y centrado que
        <main>, pero sin su padding lateral: así el banner queda del mismo
        ancho que el resto del contenido en pantallas anchas (en vez de
        estirarse a todo el monitor) y edge-to-edge en el celular (donde el
        viewport ya es más angosto que ese máximo).
      */}
      <div className="mx-auto max-w-2xl">
        <div className="flex h-9 items-center justify-center bg-brand px-4 text-center text-white">
          <Link
            href="/"
            // El -mr compensa el espacio que "tracking" agrega DESPUÉS de la
            // última letra: sin esto, el texto se ve corrido a la izquierda
            // del centro real del banner (el espacio de más queda del lado
            // derecho, así que el centrado automático lo cuenta de más).
            className="mr-[-0.14em] text-[0.7rem] font-medium uppercase tracking-[0.14em] text-white/75 hover:text-white hover:underline"
          >
            Desarrollado por tumenusmart.com
          </Link>
        </div>
      </div>

      <main className="mx-auto max-w-2xl px-4 pb-32">
      {/* ---------- cabecera del local ---------- */}
      <header className="animate-[subir_0.5s_cubic-bezier(0.22,0.7,0.3,1)]">
        {/*
          Los datos del local van en su propia tarjeta, igual que "Tus datos"
          en el checkout — no sueltos sobre el fondo de la página. Separada
          del banner con espacio de sobra: solapada (como estaba antes, con
          un margen negativo) se leía como si las esquinas de la tarjeta le
          pisaran el texto de abajo al banner.
        */}
        <div className="relative mt-4 rounded-xl border border-linea bg-superficie p-4 shadow-media">
          <div className="flex items-center gap-3.5">
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
            derecha. Antes competía por el mismo renglón que el nombre del
            local y le quitaba ancho al logo. Y el orden de lectura ahora es
            el que corresponde: primero de qué local se trata, después si
            está abierto, y recién entonces qué se puede hacer.

            Solo aparece si el local reserva mesas con anticipación — hay
            locales que solo hacen delivery/retiro y no tienen mesas físicas.
          */}
          {store.aceptaReservas && (
            <div className="mt-3.5">
              <Link
                href={`/${slug}/reservas`}
                className="inline-flex items-center rounded-xl bg-azul px-5 py-2.5 text-[0.88rem] font-semibold text-white shadow-media transition-colors hover:bg-azul-oscuro"
              >
                Reservar mesa
              </Link>
            </div>
          )}
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
    </>
  );
}
