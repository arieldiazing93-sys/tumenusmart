// Pasos que ve el CLIENTE en la pantalla de seguimiento. Es una vista
// simplificada de los estados internos: "pendiente" se muestra como
// "Recibido", y el paso de reparto cambia de texto según sea delivery o
// retiro en el local.
export type PasoSeguimiento = {
  estado: string;
  titulo: string;
  detalle: string;
  emoji: string;
};

export function pasosSeguimiento(tipoEntrega: string): PasoSeguimiento[] {
  const pasoDespacho =
    tipoEntrega === "delivery"
      ? { titulo: "En camino", detalle: "El repartidor salió con tu pedido.", emoji: "🛵" }
      : tipoEntrega === "mesa"
        ? { titulo: "Casi listo", detalle: "Ya casi te lo llevamos a la mesa.", emoji: "🍽️" }
        : { titulo: "Listo para retirar", detalle: "Ya podés pasar a buscarlo por el local.", emoji: "🛍" };

  const pasoFinal =
    tipoEntrega === "delivery"
      ? { titulo: "Entregado", emoji: "🎉" }
      : tipoEntrega === "mesa"
        ? { titulo: "Servido", emoji: "🎉" }
        : { titulo: "Retirado", emoji: "🎉" };

  return [
    {
      estado: "pendiente",
      titulo: "Pedido recibido",
      detalle: "Esperando que el local lo confirme.",
      emoji: "📝",
    },
    {
      estado: "confirmado",
      titulo: "Confirmado",
      detalle: "El local aceptó tu pedido.",
      emoji: "✅",
    },
    {
      estado: "en_preparacion",
      titulo: "En preparación",
      detalle: "Lo están cocinando.",
      emoji: "👨‍🍳",
    },
    {
      estado: "en_despacho",
      titulo: pasoDespacho.titulo,
      detalle: pasoDespacho.detalle,
      emoji: pasoDespacho.emoji,
    },
    {
      estado: "entregado",
      titulo: pasoFinal.titulo,
      detalle: "¡Que lo disfrutes!",
      emoji: pasoFinal.emoji,
    },
  ];
}

/** Posición del estado actual dentro de la secuencia (-1 si no aplica). */
export function indicePaso(estado: string, tipoEntrega: string): number {
  return pasosSeguimiento(tipoEntrega).findIndex((p) => p.estado === estado);
}
