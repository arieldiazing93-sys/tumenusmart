export type OpcionSeleccionada = {
  id: string;
  nombre: string;
  tipo: string; // "variante" | "agregado"
  precioExtra: number;
};

export type MitadYMitad = {
  productIdA: string;
  nombreA: string;
  productIdB: string;
  nombreB: string;
  modo: "mayor" | "proporcional";
};

export type ItemCarrito = {
  /** combinación única de producto + opciones + ingredientes quitados, para agrupar líneas iguales */
  key: string;
  /** para ítems normales, el id real del producto. Para "mitad y mitad", un id sintético (no existe como producto). */
  productId: string;
  nombreProducto: string;
  /** precio unitario ya calculado — para "mitad y mitad" ya incluye la lógica de precio mayor/proporcional */
  precioBase: number;
  opciones: OpcionSeleccionada[];
  /** nombres de ingredientes de base que el cliente decidió sacar */
  ingredientesQuitados?: string[];
  /** presente solo cuando este ítem es un combo "mitad y mitad" */
  mitadYMitad?: MitadYMitad;
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

export function ingredientesQuitadosTexto(item: ItemCarrito): string {
  if (!item.ingredientesQuitados || item.ingredientesQuitados.length === 0) return "";
  return `Sin: ${item.ingredientesQuitados.join(", ")}`;
}

export function construirKey(
  productId: string,
  opcionIds: string[],
  ingredientesQuitados: string[] = []
): string {
  const opcionesParte = [...opcionIds].sort().join(",");
  const quitadosParte = [...ingredientesQuitados].sort().join(",");
  return `${productId}::${opcionesParte}::${quitadosParte}`;
}
