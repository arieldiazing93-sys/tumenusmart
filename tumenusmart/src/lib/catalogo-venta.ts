import type { PrismaLocal } from "@/lib/prisma-local";

/**
 * La carta lista para vender a mano: categorías con sus productos disponibles, los agregados de cada uno y los grupos
 * de "mitad y mitad". Es lo que necesitan el selector de productos del pedido por teléfono y, en espíritu, el del
 * Punto de Venta (que arma lo mismo en su propia pantalla).
 *
 * Es solo para MOSTRAR: el precio que vale es el que vuelve a calcular el servidor al guardar (precio-pedido.ts).
 */

export type AgregadoVenta = { id: string; nombre: string; precioExtra: number };
export type ProductoVenta = {
  id: string;
  nombre: string;
  precio: number;
  esServicio: boolean;
  agregados: AgregadoVenta[];
};
export type CategoriaVenta = { id: string; nombre: string; productos: ProductoVenta[] };
export type ProductoMitadVenta = {
  id: string;
  nombre: string;
  precio: number;
  mitadYMitadModo: string;
  agregados: AgregadoVenta[];
};
export type GrupoMitadVenta = { nombreVisible: string; categoriaId: string; productos: ProductoMitadVenta[] };

export async function cargarCatalogoDeVenta(
  db: PrismaLocal
): Promise<{ categorias: CategoriaVenta[]; gruposMitad: GrupoMitadVenta[] }> {
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
                    select: { product: { select: { id: true, nombre: true, precio: true } } },
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
  // grupo ES un Product real: se usa su propio precio (mismo criterio que la carta pública y el Punto de Venta).
  function agregadosDe(p: (typeof categorias)[number]["productos"][number]): AgregadoVenta[] {
    return [
      ...p.opciones.map((o) => ({ id: o.id, nombre: o.nombre, precioExtra: Number(o.precioExtra) })),
      ...p.gruposAgregados.flatMap((g) =>
        g.group.modificadores.map((m) => ({
          id: m.product.id,
          nombre: m.product.nombre,
          precioExtra: Number(m.product.precio),
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
      });
      gruposPorClave.set(clave, entrada);
    }
  }
  const gruposMitad = [...gruposPorClave.values()].filter((g) => g.productos.length > 1);

  return { categorias: categoriasVenta, gruposMitad };
}
