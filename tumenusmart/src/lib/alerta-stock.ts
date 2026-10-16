/**
 * La alerta de existencias de un insumo, en UN solo lugar: el puntito rojo de la lista de Insumos, la etiqueta de su ficha, el filtro «Stock
 * bajo» y la columna «Estado» del reporte (Excel y PDF) salen todos de acá, así nunca se contradicen.
 *
 *   · "negativo": se vendió o sacó más de lo que había registrado (stock por debajo de cero);
 *   · "bajo":     hay menos que el «Stock mínimo» que el dueño le puso al insumo (estrictamente menos: justo en el mínimo todavía no avisa);
 *   · "ok":       el resto. Un insumo SIN stock mínimo nunca está «bajo» (solo puede estar negativo), y una preparación (salsa, masa…) no lleva
 *                 stock propio, así que nunca avisa.
 */
export type EstadoStock = "negativo" | "bajo" | "ok";

export function estadoDeStock(
  stock: number,
  stockMinimo: number | null | undefined,
  esPreparacion = false
): EstadoStock {
  if (esPreparacion) return "ok";
  if (stock < 0) return "negativo";
  if (stockMinimo != null && stock < stockMinimo) return "bajo";
  return "ok";
}

/** Si hay algo que avisar (negativo o bajo el mínimo): lo que trae el filtro «Stock bajo». */
export function tieneAlertaDeStock(estado: EstadoStock): boolean {
  return estado !== "ok";
}
