/**
 * Las reglas de la carta pública, sin nada de React.
 *
 * Están acá y no adentro de los componentes por un motivo concreto: así se
 * pueden probar de verdad. En este proyecto no se puede compilar el proyecto
 * entero para probar, pero un archivo sin React sí se compila solo y se corre
 * en Node — y estas tres reglas son las que deciden si el cliente encuentra lo
 * que busca y cuántos toques le cuesta pedirlo.
 */

export type OpcionCarta = {
  id: string;
  nombre: string;
  tipo: string;
  precioExtra: number;
};

export type ProductoCarta = {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  imagenUrl: string | null;
  ingredientes: string[];
  opciones: OpcionCarta[];
};

export type GrupoMitad = {
  clave: string;
  nombreVisible: string;
  productos: {
    id: string;
    nombre: string;
    precio: number;
    mitadYMitadModo: string;
    opciones: OpcionCarta[];
  }[];
};

export type CategoriaCarta = {
  id: string;
  nombre: string;
  productos: ProductoCarta[];
  /** Combos de mitad y mitad que corresponden a esta categoría. */
  grupos: GrupoMitad[];
};

/**
 * Un producto sin opciones ni ingredientes se agrega de un toque, sin ficha.
 *
 * Abrir una ficha para preguntar nada es un toque regalado, y cada toque de
 * más es gente que abandona el pedido a mitad de camino.
 */
export function necesitaFicha(p: ProductoCarta): boolean {
  return p.opciones.length > 0 || p.ingredientes.length > 0;
}

/**
 * Texto sin tildes y en minúsculas.
 *
 * Nadie escribe "jalapeño" con la ñ en el buscador del celular, y "MILANESA"
 * tiene que encontrar "Milanesa". El rango \u0300-\u036f son las tildes que
 * NFD deja sueltas después de separarlas de su letra.
 */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Filtra la carta por lo que escribió el cliente.
 *
 * Busca en el nombre y en la descripción, porque muchos locales ponen los
 * ingredientes ahí ("con jamón y morrón") y el cliente busca por eso.
 * Las categorías que quedan sin ningún producto desaparecen, y los combos
 * de mitad y mitad también: buscando, estorban.
 */
export function filtrarCarta(
  categorias: CategoriaCarta[],
  busqueda: string
): CategoriaCarta[] {
  const consulta = normalizar(busqueda.trim());
  if (!consulta) return categorias;

  return categorias
    .map((c) => ({
      ...c,
      productos: c.productos.filter((p) =>
        normalizar(`${p.nombre} ${p.descripcion ?? ""}`).includes(consulta)
      ),
      grupos: [],
    }))
    .filter((c) => c.productos.length > 0);
}
