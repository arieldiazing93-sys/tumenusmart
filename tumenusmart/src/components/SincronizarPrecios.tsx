"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "./CartProvider";

/**
 * Mantiene al día los precios del carrito del cliente con los de la carta.
 *
 * Con precios de promoción, el precio de un producto cambia con el día y la hora (de lunes a viernes de 18 a 20 horas sale 27.000,
 * después vuelve a 30.000). El servidor entrega acá los precios VIGENTES de la carta (`precios`) y cuántos segundos faltan
 * para el próximo cambio (`refrescarEn`):
 *  - los precios van al carrito, que se vuelve a calcular con ellos (ver CartProvider);
 *  - justo cuando cambia un precio, la página le pide al servidor la carta nueva, así la carta, la ficha del producto y el
 *    carrito quedan con el precio de ese momento aunque la persona haya dejado el menú abierto.
 *
 * Se pone UNA vez, en el diseño de la carta del local, así vale para el menú, el carrito y el pedido.
 */
export function SincronizarPrecios({
  precios,
  descuentos,
  refrescarEn,
}: {
  precios: Record<string, number>;
  /** El porcentaje de la Promoción por descuento que rige ahora, por producto. */
  descuentos?: Record<string, number>;
  refrescarEn: number | null;
}) {
  const { fijarPrecios } = useCart();
  const router = useRouter();

  useEffect(() => {
    fijarPrecios(precios, descuentos);
  }, [precios, descuentos, fijarPrecios]);

  useEffect(() => {
    if (refrescarEn === null) return;
    // Un instante DESPUÉS del cambio, para que el servidor ya calcule del lado nuevo. Un temporizador largo puede quedar dormido
    // si el teléfono bloquea la pantalla: al volver, si la hora ya pasó, se actualiza en el acto.
    const objetivo = Date.now() + refrescarEn * 1000 + 600;
    const temporizador = setTimeout(() => router.refresh(), Math.max(0, objetivo - Date.now()));
    const alVolver = () => {
      if (document.visibilityState === "visible" && Date.now() >= objetivo) router.refresh();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearTimeout(temporizador);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [refrescarEn, router, precios]);

  return null;
}
