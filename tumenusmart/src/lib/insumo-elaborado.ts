/**
 * Insumos elaborados ("preparaciones"): una salsa de tomate, una masa, un
 * aderezo. No se compran: se arman con otros insumos, y después se usan en la
 * receta de un producto como cualquier insumo ("la pizza lleva 0,1 kg de
 * salsa").
 *
 * Cómo se descuenta: la preparación NO lleva stock propio. Al vender, la
 * receta del producto se "abre" (se aplana) en los insumos comunes con que se
 * prepara, y son ESOS los que bajan — proporcionalmente: si una tanda de salsa
 * rinde 4 kg y lleva 5 kg de tomate, cada 0,1 kg de salsa descuenta 0,125 kg
 * de tomate. Lo mismo vale para el costo: el de la pizza suma el de los
 * tomates que lleva la salsa, sin cargar nada a mano.
 *
 * Pura y sin Prisma, igual que costo-receta.ts y precio-pedido.ts: recibe los
 * Decimal como vengan (número, texto u objeto) y devuelve números. Así se puede
 * probar sin base, y los lugares que arman la receta (POS, checkout, costos)
 * comparten UNA sola forma de abrirla.
 */

import { costoDeReceta } from "./costo-receta";

type Monto = number | string | { toString(): string };

/** Una línea de receta — la misma forma que traen las consultas de Control de stock. */
export type LineaAplanable = {
  insumoId: string;
  cantidad: Monto;
  insumo: { costoUnitario: Monto | null };
};

/** Una preparación: cuánto rinde una tanda y qué lleva (por tanda). */
export type Elaborado = {
  rindeTanda: Monto | null;
  ingredientes: LineaAplanable[];
};

export type MapaElaborados = Map<string, Elaborado>;

/** Una preparación con la forma en que la trae la base (Insumo + IngredienteElaborado). */
export type FilaElaborado = {
  id: string;
  rindeTanda: Monto | null;
  ingredientes: {
    ingredienteId: string;
    cantidad: Monto;
    ingrediente: { costoUnitario: Monto | null };
  }[];
};

/**
 * Cuántas preparaciones pueden ir una dentro de otra (salsa boloñesa → salsa de
 * tomate → tomate son 2 niveles). Es un tope de seguridad: la validación al
 * guardar ya impide los círculos, esto evita un bucle si alguna vez se cuela uno.
 */
export const MAX_NIVELES_ELABORADO = 8;

function aNumero(valor: Monto): number {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  const n = parseFloat(String(valor));
  return Number.isFinite(n) ? n : 0;
}

/** Arma el mapa id → preparación a partir de las filas de la base. */
export function mapaDeElaborados(filas: FilaElaborado[]): MapaElaborados {
  const mapa: MapaElaborados = new Map();
  for (const f of filas) {
    mapa.set(f.id, {
      rindeTanda: f.rindeTanda,
      ingredientes: f.ingredientes.map((i) => ({
        insumoId: i.ingredienteId,
        cantidad: i.cantidad,
        insumo: { costoUnitario: i.ingrediente.costoUnitario },
      })),
    });
  }
  return mapa;
}

type Acumulado = Map<string, { insumoId: string; cantidad: number; insumo: { costoUnitario: Monto | null } }>;

/** Una preparación se puede abrir si dice cuánto rinde y tiene al menos un ingrediente. */
function sePuedeAbrir(e: Elaborado): boolean {
  return aNumero(e.rindeTanda ?? 0) > 0 && e.ingredientes.length > 0;
}

function expandir(
  linea: LineaAplanable,
  cantidad: number,
  elaborados: MapaElaborados,
  camino: string[],
  acumulado: Acumulado
): void {
  const elaborado = elaborados.get(linea.insumoId);

  if (elaborado && sePuedeAbrir(elaborado) && camino.length < MAX_NIVELES_ELABORADO && !camino.includes(linea.insumoId)) {
    const rinde = aNumero(elaborado.rindeTanda ?? 0);
    for (const ingrediente of elaborado.ingredientes) {
      expandir(
        ingrediente,
        (cantidad * aNumero(ingrediente.cantidad)) / rinde,
        elaborados,
        [...camino, linea.insumoId],
        acumulado
      );
    }
    return;
  }

  // Un insumo común queda tal cual. Una preparación que todavía no se puede
  // abrir (sin rinde o sin ingredientes) también queda como línea, pero SIN
  // costo: así el costo del producto sale "no se puede calcular" en vez de un
  // número que parece exacto y no lo es, y lo consumido igual queda anotado
  // (contra la propia preparación) en vez de perderse.
  const previo = acumulado.get(linea.insumoId);
  if (previo) {
    previo.cantidad += cantidad;
    return;
  }
  acumulado.set(linea.insumoId, {
    insumoId: linea.insumoId,
    cantidad,
    insumo: { costoUnitario: elaborado ? null : linea.insumo.costoUnitario },
  });
}

/**
 * Abre una receta: reemplaza cada preparación por los insumos comunes con que
 * se prepara, en la cantidad proporcional, y suma lo que se repite (el mismo
 * tomate suelto y dentro de la salsa). Si la receta no usa ninguna preparación
 * devuelve la misma lista, sin tocar nada — un local que no usa preparaciones
 * ve exactamente lo de siempre.
 */
export function aplanarReceta<T extends LineaAplanable>(receta: T[], elaborados: MapaElaborados): LineaAplanable[] {
  if (elaborados.size === 0 || !receta.some((l) => elaborados.has(l.insumoId))) return receta;
  const acumulado: Acumulado = new Map();
  for (const linea of receta) {
    expandir(linea, aNumero(linea.cantidad), elaborados, [], acumulado);
  }
  return [...acumulado.values()];
}

/**
 * Cuánto cuesta UNA unidad de una preparación (1 kg, 1 litro…), a partir de lo
 * que cuestan sus ingredientes. Null si no se puede calcular: le falta el
 * rinde, no tiene ingredientes, o a algún ingrediente todavía le falta el costo.
 */
export function costoDeElaborado(id: string, elaborados: MapaElaborados): number | null {
  return costoDeReceta(aplanarReceta([{ insumoId: id, cantidad: 1, insumo: { costoUnitario: null } }], elaborados));
}

/**
 * ¿Agregar `ingredienteId` como ingrediente de `elaboradoId` armaría un
 * círculo? (la salsa lleva pesto, y el pesto lleva salsa). También es un
 * círculo que una preparación se lleve a sí misma.
 */
export function formaCirculo(elaboradoId: string, ingredienteId: string, elaborados: MapaElaborados): boolean {
  const pendientes = [ingredienteId];
  const vistos = new Set<string>();
  while (pendientes.length > 0) {
    const id = pendientes.pop() as string;
    if (id === elaboradoId) return true;
    if (vistos.has(id)) continue;
    vistos.add(id);
    for (const ingrediente of elaborados.get(id)?.ingredientes ?? []) pendientes.push(ingrediente.insumoId);
  }
  return false;
}
