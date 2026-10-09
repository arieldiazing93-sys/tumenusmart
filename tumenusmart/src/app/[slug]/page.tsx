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
import { prismaDelLocal } from "@/lib/prisma-local";
import { cargarPromociones } from "@/lib/promociones-servidor";
import { etiquetaDePromo, promoVigenteDe } from "@/lib/promociones";
import {
  SELECCION_PROMOCIONES,
  precioEnPosicion,
  segundoDeSemanaAsuncion,
  tramosDeFilas,
  type FilaDePromocion,
} from "@/lib/precio-promocion";

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
  G extends {
    group: { modificadores: { product: { id: string; nombre: string; precio: unknown; promociones: FilaDePromocion[] } }[] };
  },
>(opciones: O[], gruposAgregados: G[], posicion: number) {
  return [
    ...opciones,
    ...gruposAgregados.flatMap((g) =>
      g.group.modificadores.map((m) => ({
        id: m.product.id,
        nombre: m.product.nombre,
        // El precio de ESTE momento: un agregado con precio de promoción sale con el de la franja en que estamos.
        precioExtra: precioEnPosicion(Number(m.product.precio), tramosDeFilas(m.product.promociones), posicion).precio,
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

  const [categoriasCrudas, destacados, estadoTienda, promociones] = await Promise.all([
    prisma.category.findMany({
      where: { storeId, activa: true },
      orderBy: { orden: "asc" },
      include: {
        productos: {
          where: { storeId, disponible: true },
          orderBy: { orden: "asc" },
          include: {
            promociones: SELECCION_PROMOCIONES,
            opciones: { orderBy: { orden: "asc" } },
            gruposAgregados: {
              select: {
                group: {
                  select: {
                    modificadores: {
                      where: { product: { disponible: true } },
                      select: { product: { select: { id: true, nombre: true, precio: true, promociones: SELECCION_PROMOCIONES } } },
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
      include: { promociones: SELECCION_PROMOCIONES },
    }),
    obtenerEstadoTienda(storeId),
    // Las Promociones activas (por descuento y por volumen): ver src/lib/promociones.ts.
    cargarPromociones(prismaDelLocal(storeId)),
  ]);

  // Una categoría con tramos de bloqueo propios (ej: "Hamburguesas Simple"
  // oculta lunes y martes) desaparece entera durante esos tramos, aunque el
  // local esté abierto y el resto de la carta siga normal. Sin tramos
  // cargados, la categoría se muestra siempre — esto es una excepción que
  // configura el que la necesita, no algo que haya que definir por default.
  const ahora = new Date();
  // Un solo segundo de la semana para toda la carta: ningún producto queda en una franja distinta de otro. Los precios de promoción
  // (de lunes a viernes de 18 a 20, por ejemplo) salen con el precio de este momento; ver SincronizarPrecios para cuando cambian.
  const posicion = segundoDeSemanaAsuncion(ahora);
  const vigente = (p: { precio: unknown; promociones: FilaDePromocion[] }) =>
    precioEnPosicion(Number(p.precio), tramosDeFilas(p.promociones), posicion);
  // Lo que ve el cliente de un producto: el precio de ahora (promoción de precio, y después el descuento de una Promoción si rige), el precio
  // normal para tacharlo y la etiqueta de la promoción ("−20 %", "2x1"). Las Promociones por volumen no cambian el precio: solo se anuncian.
  const precioPublico = (p: { id: string; precio: unknown; promociones: FilaDePromocion[] }) => {
    const v = vigente(p);
    const promo = promoVigenteDe(promociones, p.id, posicion);
    if (promo && promo.tipo === "descuento" && promo.porcentaje) {
      return {
        precio: Math.round(v.precio * (1 - promo.porcentaje / 100)),
        precioNormal: Number(p.precio),
        enPromocion: true,
        etiquetaPromo: etiquetaDePromo(promo),
      };
    }
    return {
      precio: v.precio,
      precioNormal: Number(p.precio),
      enPromocion: v.enPromocion,
      etiquetaPromo: promo ? etiquetaDePromo(promo) : undefined,
    };
  };
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
        precio: vigente(producto).precio,
        precioNormal: Number(producto.precio),
        enPromocion: vigente(producto).enPromocion,
        mitadYMitadModo: producto.mitadYMitadModo,
        opciones: combinarOpciones(producto.opciones, producto.gruposAgregados, posicion).map((o) => ({
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
      ...precioPublico(p),
      imagenUrl: p.imagenUrl,
      ingredientes: p.ingredientes,
      opciones: combinarOpciones(p.opciones, p.gruposAgregados, posicion).map((o) => ({
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

  return (
    <>
      <main className="mx-auto max-w-2xl pb-40">
        {/* ---------- portada: el color del local, con círculos suaves de adorno ---------- */}
        <div className="relative h-32 overflow-hidden bg-brand sm:rounded-b-3xl">
          <span aria-hidden="true" className="absolute -right-10 -top-14 h-48 w-48 rounded-full bg-white/10" />
          <span aria-hidden="true" className="absolute -left-12 top-14 h-40 w-40 rounded-full bg-white/10" />
          <span aria-hidden="true" className="absolute right-28 top-16 h-20 w-20 rounded-full bg-black/10" />
        </div>

        {/* ---------- cabecera del local: el logo sube sobre la portada ---------- */}
        <header className="relative -mt-12 px-4 animate-[subir_0.5s_cubic-bezier(0.22,0.7,0.3,1)]">
          {store.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={store.logoUrl}
              alt={store.nombre}
              width={96}
              height={96}
              decoding="async"
              className="h-24 w-24 rounded-3xl border-4 border-papel-suave bg-superficie object-cover shadow-media"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-24 w-24 items-center justify-center rounded-3xl border-4 border-papel-suave bg-brand-light text-3xl font-bold tracking-titular text-brand-texto shadow-media"
            >
              {store.nombre.slice(0, 2).toUpperCase()}
            </span>
          )}

          <h1 className="mt-3 text-[1.75rem] font-semibold leading-tight tracking-titular text-tinta">{store.nombre}</h1>
          {store.direccion && <p className="mt-0.5 text-[0.9rem] text-tinta-suave">{store.direccion}</p>}

          <div className="mt-3">
            <EstadoAperturaBadge estado={estadoTienda} />
          </div>

          {/*
            Reservar mesa va DEBAJO del estado de apertura: primero de qué local se trata, después si está abierto y
            recién entonces qué se puede hacer. Solo aparece si el local reserva mesas con anticipación — hay
            locales que solo hacen delivery/retiro y no tienen mesas físicas. Acá NO va "Reservar turno": la página de turnos
            (peluquerías, salones) es otro servicio con su propio enlace y no se ofrece desde el menú digital.
          */}
          {store.aceptaReservas && (
            <div className="mt-4">
              <Link
                href={`/${slug}/reservas`}
                className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-azul px-5 text-[0.92rem] font-semibold text-white shadow-media transition-all hover:bg-azul-oscuro active:scale-[0.98]"
              >
                Reservar mesa
              </Link>
            </div>
          )}
        </header>

        <div className="px-4">
          <div className="mt-5">
            <AvisoTienda estado={estadoTienda} />
          </div>

          <CarruselDestacados
            productos={destacados.map((p) => ({
              id: p.id,
              nombre: p.nombre,
              ...precioPublico(p),
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

          {/* La firma de la plataforma, al pie (antes iba en una franja arriba de todo, donde le sacaba lugar al local). */}
          <p className="mt-12 text-center">
            <Link
              href="/"
              className="-mr-[0.14em] inline-block py-1.5 font-mono text-[0.74rem] font-semibold uppercase leading-tight tracking-[0.14em] text-tinta-suave transition-colors hover:text-tinta hover:underline"
            >
              Desarrollado por tumenusmart.com
            </Link>
          </p>
        </div>
      </main>

      <CartBar />
    </>
  );
}
