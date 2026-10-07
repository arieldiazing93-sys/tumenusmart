import type { PrismaLocal } from "@/lib/prisma-local";
import {
  SELECCION_PROMOCIONES,
  precioEnPosicion,
  segundoDeSemanaAsuncion,
  tramosDeFilas,
  type TramoPromocion,
} from "@/lib/precio-promocion";
import { etiquetaDePromo, promoVigenteDe, type PromoDef, type TipoPromocion } from "@/lib/promociones";
import { cargarPromociones } from "@/lib/promociones-servidor";

/**
 * La carta lista para vender a mano: categorías con sus productos disponibles, los agregados de cada uno y los grupos
 * de "mitad y mitad". Es lo que necesitan el selector de productos del pedido por teléfono y, en espíritu, el del
 * Punto de Venta (que arma lo mismo en su propia pantalla).
 *
 * Es solo para MOSTRAR: el precio que vale es el que vuelve a calcular el servidor al guardar (precio-pedido.ts).
 *
 * Precios de promoción: cada producto y cada agregado viaja con su precio NORMAL (`precio`, `precioExtra`) y con sus
 * promociones (`promos`). La pantalla las resuelve con `conPromosVigentes` según la hora de ese momento y las vuelve a
 * resolver sola cuando cambia la franja — así una pantalla que queda abierta todo el día muestra siempre el precio que
 * cobra el servidor.
 */

/** La promoción que rige para un producto en este momento, para la etiqueta de su tarjeta (solo después de `conPromosVigentes`). */
export type PromoDeTarjeta = { nombre: string; etiqueta: string; tipo: TipoPromocion };

export type AgregadoVenta = {
  id: string;
  nombre: string;
  /** El precio normal; con `conPromosVigentes` pasa a ser el vigente. */
  precioExtra: number;
  /** Las promociones de este agregado (si es un producto de un grupo). Las quita `conPromosVigentes`. */
  promos?: TramoPromocion[];
  /** Solo después de `conPromosVigentes`: el precio normal y si el vigente es el de una promoción. */
  precioNormal?: number;
  enPromocion?: boolean;
};
export type ProductoVenta = {
  id: string;
  nombre: string;
  /** El precio normal; con `conPromosVigentes` pasa a ser el vigente. */
  precio: number;
  esServicio: boolean;
  agregados: AgregadoVenta[];
  promos?: TramoPromocion[];
  precioNormal?: number;
  enPromocion?: boolean;
  /** Solo después de `conPromosVigentes`: la promoción por descuento o por volumen que rige ahora para este producto. */
  promo?: PromoDeTarjeta;
};
export type CategoriaVenta = { id: string; nombre: string; productos: ProductoVenta[] };
export type ProductoMitadVenta = {
  id: string;
  nombre: string;
  precio: number;
  mitadYMitadModo: string;
  agregados: AgregadoVenta[];
  promos?: TramoPromocion[];
  precioNormal?: number;
  enPromocion?: boolean;
  promo?: PromoDeTarjeta;
};
export type GrupoMitadVenta = { nombreVisible: string; categoriaId: string; productos: ProductoMitadVenta[] };

/** La parte de un `select` de Prisma que trae las promociones de un producto. */
const PROMOS = { promociones: SELECCION_PROMOCIONES } as const;

export async function cargarCatalogoDeVenta(
  db: PrismaLocal
): Promise<{ categorias: CategoriaVenta[]; gruposMitad: GrupoMitadVenta[]; promociones: PromoDef[] }> {
  const categorias = await db.category.findMany({
    where: { activa: true },
    orderBy: { orden: "asc" },
    select: {
      id: true,
      nombre: true,
      productos: {
        where: { disponible: true },
        orderBy: { orden: "asc" },
        select: {
          id: true,
          nombre: true,
          precio: true,
          esServicio: true,
          mitadYMitadGrupo: true,
          mitadYMitadModo: true,
          ...PROMOS,
          opciones: {
            where: { tipo: "agregado" },
            orderBy: { orden: "asc" },
            select: { id: true, nombre: true, precioExtra: true },
          },
          gruposAgregados: {
            select: {
              group: {
                select: {
                  modificadores: {
                    where: { product: { disponible: true } },
                    select: { product: { select: { id: true, nombre: true, precio: true, ...PROMOS } } },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // Los agregados propios del producto más los de cualquier grupo reutilizable adjuntado. Cada modificador de un
  // grupo ES un Product real: se usa su propio precio y sus propias promociones (mismo criterio que la carta pública y
  // el Punto de Venta).
  function agregadosDe(p: (typeof categorias)[number]["productos"][number]): AgregadoVenta[] {
    return [
      ...p.opciones.map((o) => ({ id: o.id, nombre: o.nombre, precioExtra: Number(o.precioExtra) })),
      ...p.gruposAgregados.flatMap((g) =>
        g.group.modificadores.map((m) => ({
          id: m.product.id,
          nombre: m.product.nombre,
          precioExtra: Number(m.product.precio),
          promos: tramosDeFilas(m.product.promociones),
        }))
      ),
    ];
  }

  const categoriasVenta: CategoriaVenta[] = categorias
    .filter((c) => c.productos.length > 0)
    .map((c) => ({
      id: c.id,
      nombre: c.nombre,
      productos: c.productos.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        precio: Number(p.precio),
        esServicio: p.esServicio,
        agregados: agregadosDe(p),
        promos: tramosDeFilas(p.promociones),
      })),
    }));

  // Los productos con el mismo mitadYMitadGrupo (sin distinguir mayúsculas ni espacios de más) arman un combo,
  // mostrado dentro de la categoría donde están sus productos.
  const gruposPorClave = new Map<string, GrupoMitadVenta>();
  for (const c of categorias) {
    for (const p of c.productos) {
      const nombreGrupo = p.mitadYMitadGrupo?.trim();
      if (!nombreGrupo) continue;
      const clave = nombreGrupo.toLowerCase();
      const entrada = gruposPorClave.get(clave) ?? { nombreVisible: nombreGrupo, categoriaId: c.id, productos: [] };
      entrada.productos.push({
        id: p.id,
        nombre: p.nombre,
        precio: Number(p.precio),
        mitadYMitadModo: p.mitadYMitadModo,
        agregados: agregadosDe(p),
        promos: tramosDeFilas(p.promociones),
      });
      gruposPorClave.set(clave, entrada);
    }
  }
  const gruposMitad = [...gruposPorClave.values()].filter((g) => g.productos.length > 1);

  // Las promociones activas (por descuento y por volumen): la pantalla las aplica según el día y la hora (ver conPromosVigentes).
  const promociones = await cargarPromociones(db);

  return { categorias: categoriasVenta, gruposMitad, promociones };
}

/**
 * La carta con los precios de ESTE momento: a cada producto y agregado con promociones le pone el precio de la
 * franja en que estamos (o el normal). Siempre se calcula desde la carta ORIGINAL (con sus `promos`), nunca desde su
 * propio resultado: por eso devuelve copias sin `promos`, con `precioNormal` y `enPromocion` para poder tachar el
 * precio de lista. Se calcula el segundo de la semana una sola vez, así toda la carta queda en el mismo instante.
 */
export function conPromosVigentes(
  categorias: CategoriaVenta[],
  gruposMitad: GrupoMitadVenta[],
  ahora: Date | number,
  promociones: PromoDef[] = []
): { categorias: CategoriaVenta[]; gruposMitad: GrupoMitadVenta[] } {
  const pos = segundoDeSemanaAsuncion(ahora);

  // La etiqueta de la tarjeta: la promoción por descuento o por volumen que rige ahora para el producto (si alguna).
  const etiquetaDe = (productId: string): PromoDeTarjeta | undefined => {
    const p = promoVigenteDe(promociones, productId, pos);
    return p ? { nombre: p.nombre, etiqueta: etiquetaDePromo(p), tipo: p.tipo } : undefined;
  };

  const agregado = (a: AgregadoVenta): AgregadoVenta => {
    const { promos, ...resto } = a;
    const v = precioEnPosicion(a.precioExtra, promos, pos);
    return { ...resto, precioExtra: v.precio, precioNormal: v.precioNormal, enPromocion: v.enPromocion };
  };

  const producto = (p: ProductoVenta): ProductoVenta => {
    const { promos, ...resto } = p;
    const v = precioEnPosicion(p.precio, promos, pos);
    return {
      ...resto,
      precio: v.precio,
      precioNormal: v.precioNormal,
      enPromocion: v.enPromocion,
      agregados: p.agregados.map(agregado),
      promo: etiquetaDe(p.id),
    };
  };

  return {
    categorias: categorias.map((c) => ({ ...c, productos: c.productos.map(producto) })),
    gruposMitad: gruposMitad.map((g) => ({
      ...g,
      productos: g.productos.map((p) => {
        const { promos, ...resto } = p;
        const v = precioEnPosicion(p.precio, promos, pos);
        return {
          ...resto,
          precio: v.precio,
          precioNormal: v.precioNormal,
          enPromocion: v.enPromocion,
          agregados: p.agregados.map(agregado),
          promo: etiquetaDe(p.id),
        };
      }),
    })),
  };
}

/** Todas las promociones de una carta, juntas: para saber cuándo cambia el próximo precio. */
export function promosDeLaCarta(
  categorias: CategoriaVenta[],
  gruposMitad: GrupoMitadVenta[],
  promociones: PromoDef[] = []
): TramoPromocion[] {
  const todas: TramoPromocion[] = [];
  // Los días y horas de las Promociones también cambian precios (empiezan y terminan): cuentan como límites de cambio.
  for (const pr of promociones) for (const f of pr.franjas) todas.push({ ...f, precio: 0 });
  const sumar = (p: { promos?: TramoPromocion[]; agregados: AgregadoVenta[] }) => {
    if (p.promos) todas.push(...p.promos);
    for (const a of p.agregados) if (a.promos) todas.push(...a.promos);
  };
  for (const c of categorias) for (const p of c.productos) sumar(p);
  for (const g of gruposMitad) for (const p of g.productos) sumar(p);
  return todas;
}
