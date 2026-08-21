export type OpcionSeleccionada = {
  id: string;
  nombre: string;
  tipo: string; // "variante" | "agregado"
  precioExtra: number;
};

export type ItemCarrito = {
  /** combinación única de producto + opciones, para agrupar líneas iguales */
  key: string;
  productId: string;
  nombreProducto: string;
  precioBase: number;
  opciones: OpcionSeleccionada[];
  cantidad: number;
  imagenUrl?: string | null;
};

export function precioUnitario(item: ItemCarrito): number {
  const extras = item.opciones.reduce((suma, o) => suma + o.precioExtra, 0);
  return item.precioBase + extras;
}

export function opcionesTexto(item: ItemCarrito): string {
  return item.opciones.map((o) => o.nombre).join(", ");
}

export function construirKey(productId: string, opcionIds: string[]): string {
  return `${productId}::${[...opcionIds].sort().join(",")}`;
}
