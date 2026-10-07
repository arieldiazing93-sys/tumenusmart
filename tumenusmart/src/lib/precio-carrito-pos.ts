/**
 * Cuánto vale AHORA cada línea del carrito del Punto de venta.
 *
 * El carrito se arma tocando productos, pero el precio que se cobra lo calcula el servidor en el momento de cobrar
 * (precio-pedido.ts, con el precio vigente de ese instante). Si el carrito se quedara con el precio de cuando se tocó el
 * producto, una promoción que empieza o termina mientras tanto haría que la pantalla muestre una cosa y se cobre otra.
 * Por eso el carrito guarda solo QUÉ se pidió (producto, agregados, cantidad) y el precio de cada línea se vuelve a
 * calcular con la carta vigente: es la misma cuenta que hace `armarPedido` en el servidor.
 *
 * Lógica pura: se prueba contra `armarPedido` con miles de casos.
 */

import { calcularPrecioMitadYMitad } from "./mitad-mitad";
import type { AgregadoVenta, CategoriaVenta, GrupoMitadVenta, ProductoMitadVenta, ProductoVenta } from "./catalogo-venta";
import type { LineaDePromo } from "./promociones";

export type LineaDeCarrito =
  | { tipo: "producto"; productId: string; agregadoIds: string[]; precio: number }
  | { tipo: "combo"; productIdA: string; productIdB: string; agregadoIds: string[]; precio: number };

/** Los agregados que se pueden elegir en un combo: los de la primera mitad y después los de la segunda, sin repetir nombre (igual que `agregadosDeCombo`). */
function agregadosDeUnCombo(a: ProductoMitadVenta, b: ProductoMitadVenta): AgregadoVenta[] {
  const vistos = new Set<string>();
  const lista: AgregadoVenta[] = [];
  for (const p of [a, b]) {
    for (const ag of p.agregados) {
      const clave = ag.nombre.trim().toLowerCase();
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      lista.push(ag);
    }
  }
  return lista;
}

function sumaAgregados(disponibles: AgregadoVenta[], ids: string[]): number {
  const elegidos = new Set(ids);
  return disponibles.filter((a) => elegidos.has(a.id)).reduce((s, a) => s + a.precioExtra, 0);
}

/**
 * Los precios de las líneas del carrito con la carta VIGENTE (la que devuelve `conPromosVigentes`). Una línea cuyo
 * producto ya no está en la carta (se ocultó, se desactivó la categoría) queda con el precio que tenía: al cobrar, el
 * servidor la rechaza por su cuenta. Devuelve el mismo arreglo si ningún precio cambió, para no provocar dibujos de más.
 */
export function repreciarCarrito<T extends LineaDeCarrito>(
  carrito: T[],
  categorias: CategoriaVenta[],
  gruposMitad: GrupoMitadVenta[]
): T[] {
  if (carrito.length === 0) return carrito;

  const productos = new Map<string, ProductoVenta>();
  for (const c of categorias) for (const p of c.productos) productos.set(p.id, p);
  const mitades = new Map<string, ProductoMitadVenta>();
  for (const g of gruposMitad) for (const p of g.productos) mitades.set(p.id, p);

  let cambio = false;
  const nuevo = carrito.map((linea) => {
    let precio: number | null = null;
    if (linea.tipo === "producto") {
      const p = productos.get(linea.productId);
      if (p) precio = p.precio + sumaAgregados(p.agregados, linea.agregadoIds);
    } else {
      const a = mitades.get(linea.productIdA);
      const b = mitades.get(linea.productIdB);
      if (a && b) {
        const modo = a.mitadYMitadModo === "proporcional" ? "proporcional" : "mayor";
        precio = calcularPrecioMitadYMitad(a.precio, b.precio, modo) + sumaAgregados(agregadosDeUnCombo(a, b), linea.agregadoIds);
      }
    }
    if (precio === null || precio === linea.precio) return linea;
    cambio = true;
    return { ...linea, precio };
  });
  return cambio ? nuevo : carrito;
}

/**
 * Las líneas del carrito como las necesitan las promociones (`aplicarPromociones`): una por línea del carrito, en el mismo orden. Lo que
 * hace falta además del precio es cuánto de ese precio son agregados (la promoción puede incluirlos o no). Un combo mitad y mitad, o un
 * producto que ya no está en la carta, va sin `productId`: no entra en ninguna promoción (igual que en el servidor).
 */
export function lineasParaPromos<T extends LineaDeCarrito & { cantidad: number }>(
  carrito: T[],
  categorias: CategoriaVenta[]
): LineaDePromo[] {
  const productos = new Map<string, ProductoVenta>();
  for (const c of categorias) for (const p of c.productos) productos.set(p.id, p);
  return carrito.map((linea) => {
    if (linea.tipo === "combo") return { productId: undefined, cantidad: linea.cantidad, precioUnitario: linea.precio, precioAgregados: 0 };
    const p = productos.get(linea.productId);
    return {
      productId: p ? p.id : undefined,
      cantidad: linea.cantidad,
      precioUnitario: linea.precio,
      precioAgregados: p ? sumaAgregados(p.agregados, linea.agregadoIds) : 0,
    };
  });
}
