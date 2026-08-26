/**
 * Cartas de arranque por rubro.
 *
 * Un local que empieza con la pantalla vacía tiene que cargar cuarenta
 * productos desde el celular antes de poder mostrarle nada a nadie. La mayoría
 * lo deja por la mitad, y un menú a medio armar no se comparte — así se pierde
 * un cliente en la primera semana, que es cuando se pierden casi todos.
 *
 * Arrancar con una carta cargada cambia el trabajo: en vez de crear, edita.
 * Los precios son de referencia y el dueño los cambia; lo que importa es que
 * la estructura ya esté y que pueda compartir su carta el mismo día.
 */

export type ProductoPlantilla = {
  nombre: string;
  descripcion?: string;
  precio: number;
  destacado?: boolean;
  /** Productos con el mismo grupo se pueden combinar mitad y mitad. */
  mitadYMitadGrupo?: string;
};

export type CategoriaPlantilla = {
  nombre: string;
  productos: ProductoPlantilla[];
};

export type PlantillaMenu = {
  clave: string;
  etiqueta: string;
  descripcion: string;
  categorias: CategoriaPlantilla[];
};

const BEBIDAS: CategoriaPlantilla = {
  nombre: "Bebidas",
  productos: [
    { nombre: "Gaseosa 1.5L", precio: 15000 },
    { nombre: "Gaseosa 500ml", precio: 8000 },
    { nombre: "Agua sin gas 500ml", precio: 6000 },
  ],
};

export const PLANTILLAS: PlantillaMenu[] = [
  {
    clave: "pizzeria",
    etiqueta: "Pizzería",
    descripcion: "Pizzas con mitad y mitad, empanadas y bebidas",
    categorias: [
      {
        nombre: "Pizzas",
        productos: [
          {
            nombre: "Pizza Muzzarella",
            descripcion: "Salsa de tomate, muzzarella y orégano",
            precio: 55000,
            destacado: true,
            mitadYMitadGrupo: "Pizza Grande",
          },
          {
            nombre: "Pizza Napolitana",
            descripcion: "Muzzarella, rodajas de tomate y ajo",
            precio: 65000,
            mitadYMitadGrupo: "Pizza Grande",
          },
          {
            nombre: "Pizza Especial",
            descripcion: "Muzzarella, jamón, morrón y aceitunas",
            precio: 70000,
            destacado: true,
            mitadYMitadGrupo: "Pizza Grande",
          },
        ],
      },
      {
        nombre: "Empanadas",
        productos: [
          { nombre: "Empanada de carne", precio: 10000 },
          { nombre: "Empanada de jamón y queso", precio: 10000 },
        ],
      },
      BEBIDAS,
    ],
  },
  {
    clave: "hamburgueseria",
    etiqueta: "Hamburguesería",
    descripcion: "Hamburguesas, papas y bebidas",
    categorias: [
      {
        nombre: "Hamburguesas",
        productos: [
          {
            nombre: "Hamburguesa Simple",
            descripcion: "Medallón, queso, lechuga y tomate",
            precio: 35000,
            destacado: true,
          },
          {
            nombre: "Hamburguesa Doble",
            descripcion: "Doble medallón y doble queso",
            precio: 50000,
            destacado: true,
          },
          { nombre: "Hamburguesa de pollo", precio: 38000 },
        ],
      },
      {
        nombre: "Para acompañar",
        productos: [
          { nombre: "Papas fritas", precio: 18000 },
          { nombre: "Papas con cheddar", precio: 25000 },
        ],
      },
      BEBIDAS,
    ],
  },
  {
    clave: "parrilla",
    etiqueta: "Parrilla",
    descripcion: "Cortes, guarniciones y bebidas",
    categorias: [
      {
        nombre: "Carnes",
        productos: [
          { nombre: "Asado de tira", precio: 75000, destacado: true },
          { nombre: "Vacío", precio: 80000 },
          { nombre: "Costilla", precio: 70000 },
          { nombre: "Pollo a la parrilla", precio: 55000 },
        ],
      },
      {
        nombre: "Guarniciones",
        productos: [
          { nombre: "Mandioca", precio: 12000 },
          { nombre: "Ensalada mixta", precio: 18000 },
          { nombre: "Puré", precio: 15000 },
        ],
      },
      BEBIDAS,
    ],
  },
  {
    clave: "comida_rapida",
    etiqueta: "Comida rápida / Lomitería",
    descripcion: "Lomitos, milanesas y bebidas",
    categorias: [
      {
        nombre: "Lomitos",
        productos: [
          { nombre: "Lomito completo", precio: 40000, destacado: true },
          { nombre: "Lomito árabe", precio: 35000 },
        ],
      },
      {
        nombre: "Milanesas",
        productos: [
          { nombre: "Milanesa napolitana", precio: 45000 },
          { nombre: "Sándwich de milanesa", precio: 32000, destacado: true },
        ],
      },
      BEBIDAS,
    ],
  },
  {
    clave: "vacio",
    etiqueta: "Empezar vacío",
    descripcion: "Sin productos: el dueño carga todo desde cero",
    categorias: [],
  },
];

export function plantillaPorClave(clave: string): PlantillaMenu | null {
  return PLANTILLAS.find((p) => p.clave === clave) ?? null;
}

/** Cuántos productos trae una plantilla, para mostrarlo antes de elegir. */
export function contarProductos(plantilla: PlantillaMenu): number {
  return plantilla.categorias.reduce((suma, c) => suma + c.productos.length, 0);
}
