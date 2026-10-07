import type { PrismaLocal } from "@/lib/prisma-local";
import type { LineaPedida, ProductoBase } from "@/lib/precio-pedido";
import { costoDelProducto } from "@/lib/costo-receta";
import { aplanarReceta } from "@/lib/insumo-elaborado";
import { cargarElaborados } from "@/lib/cargar-elaborados";
import { SELECCION_PROMOCIONES, precioEnPosicion, segundoDeSemanaAsuncion, tramosDeFilas } from "@/lib/precio-promocion";

/**
 * Lee de la base los productos que pidió una persona (con sus agregados, recetas y costos) y los deja en la forma
 * que espera `armarPedido`. Es el mismo armado que hace el checkout público al confirmar un pedido: lo que se pidió
 * se usa solo para saber QUÉ productos y cuántos; el precio sale siempre de la base.
 *
 * `db` tiene que ser el cliente del local (`prismaDelLocal`): el filtro por local lo pone él, así un producto de otro
 * negocio nunca aparece. Un producto de una categoría dada de baja tampoco aparece y el pedido se rechaza solo. No se
 * filtra por `disponible` a propósito, para poder decir QUÉ producto se quedó sin stock.
 *
 * Precios de promoción: el precio que sale en `precio` y en el `precioExtra` de cada agregado es el VIGENTE en `ahora` (el de la
 * franja en que estamos, o el normal). Todos los canales cobran con esto, así que lo que se cobra es igual en el mostrador, el comedor,
 * el delivery y el mozo. `ahora` se pasa para poder probar cualquier instante; en producción es el momento de la llamada.
 *
 * Devuelve [] si el pedido no nombra ningún producto.
 */
export async function cargarCatalogoParaPedido(
  db: PrismaLocal,
  storeId: string,
  items: LineaPedida[],
  ahora: Date = new Date()
): Promise<ProductoBase[]> {
  const idsPedidos = new Set<string>();
  for (const item of items) {
    if (item?.productId) idsPedidos.add(item.productId);
    if (item?.mitadYMitad) {
      idsPedidos.add(item.mitadYMitad.productIdA);
      idsPedidos.add(item.mitadYMitad.productIdB);
    }
  }
  if (idsPedidos.size === 0) return [];

  const productos = await db.product.findMany({
    where: { id: { in: [...idsPedidos] }, category: { activa: true } },
    orderBy: { orden: "asc" },
    include: {
      promociones: SELECCION_PROMOCIONES,
      opciones: { orderBy: { orden: "asc" } },
      receta: {
        select: {
          insumoId: true,
          cantidad: true,
          insumo: { select: { costoUnitario: true } },
        },
      },
      gruposAgregados: {
        select: {
          group: {
            select: {
              modificadores: {
                where: { product: { disponible: true } },
                select: {
                  product: {
                    select: {
                      id: true,
                      nombre: true,
                      precio: true,
                      costo: true,
                      almacenId: true,
                      promociones: SELECCION_PROMOCIONES,
                      receta: {
                        select: {
                          insumoId: true,
                          cantidad: true,
                          insumo: { select: { costoUnitario: true } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // Las preparaciones (salsa, masa…) que lleve alguna receta se abren acá en los insumos con que se hacen.
  const elaborados = await cargarElaborados(storeId);
  // Un solo segundo de la semana para todo el catálogo: ningún producto queda en una franja distinta de otro.
  const posicion = segundoDeSemanaAsuncion(ahora);
  return productos.map((p) => {
    const receta = aplanarReceta(p.receta, elaborados);
    return {
      id: p.id,
      nombre: p.nombre,
      precio: precioEnPosicion(Number(p.precio), tramosDeFilas(p.promociones), posicion).precio,
      disponible: p.disponible,
      ingredientes: p.ingredientes,
      mitadYMitadGrupo: p.mitadYMitadGrupo,
      mitadYMitadModo: p.mitadYMitadModo,
      iva: p.iva,
      receta,
      costo: costoDelProducto(p.costo, receta),
      almacenId: p.almacenId,
      // Los agregados propios más los de cualquier grupo adjuntado, combinados para que armarPedido vea un solo
      // `opciones`. Cada modificador de un grupo ES un Product: se usa su propio precio, costo y receta.
      opciones: [
        ...p.opciones.map((o) => ({
          id: o.id,
          nombre: o.nombre,
          tipo: o.tipo,
          precioExtra: o.precioExtra,
          costo: o.costo,
          receta: [],
          almacenId: null,
        })),
        ...p.gruposAgregados.flatMap((g) =>
          g.group.modificadores.map((m) => {
            const recetaAgregado = aplanarReceta(m.product.receta, elaborados);
            return {
              id: m.product.id,
              nombre: m.product.nombre,
              tipo: "agregado",
              precioExtra: precioEnPosicion(Number(m.product.precio), tramosDeFilas(m.product.promociones), posicion).precio,
              costo: costoDelProducto(m.product.costo, recetaAgregado),
              receta: recetaAgregado,
              almacenId: m.product.almacenId,
            };
          })
        ),
      ],
    };
  });
}
