"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  conPromosVigentes,
  promosDeLaCarta,
  type CategoriaVenta,
  type GrupoMitadVenta,
} from "@/lib/catalogo-venta";
import { segundosHastaElProximoCambio } from "@/lib/precio-promocion";

/**
 * Los precios de la carta de ESTE momento, para una pantalla que queda abierta todo el día (el Punto de venta, la caja
 * del comedor y del delivery, la tablet del mozo). Recibe la carta con el precio normal y las promociones de cada
 * producto y devuelve la misma carta con el precio que vale ahora. Se vuelve a calcular sola justo cuando empieza o
 * termina una promoción (un temporizador hasta ese segundo, no un reloj que consulte cada rato), y también al volver a
 * la pestaña y, como máximo, cada minuto — por si la computadora estuvo dormida o se movió el reloj.
 *
 * `refrescar` fuerza el recálculo en el acto: se usa cuando el servidor avisa que un precio cambió.
 *
 * Sin ninguna promoción en la carta no pone ni un temporizador: la pantalla se comporta igual que siempre.
 */
export function usePromosVigentes(categorias: CategoriaVenta[], gruposMitad: GrupoMitadVenta[]) {
  const promos = useMemo(() => promosDeLaCarta(categorias, gruposMitad), [categorias, gruposMitad]);
  const hayPromos = promos.length > 0;
  const [ahora, setAhora] = useState(() => Date.now());
  const refrescar = useCallback(() => setAhora(Date.now()), []);

  useEffect(() => {
    if (!hayPromos) return;
    const falta = segundosHastaElProximoCambio(promos, ahora);
    // Un instante DESPUÉS del cambio, para caer del lado nuevo; y nunca más de un minuto sin volver a mirar.
    const espera = Math.min((falta ?? 60) * 1000 + 40, 60_000);
    const temporizador = setTimeout(refrescar, espera);
    return () => clearTimeout(temporizador);
  }, [promos, hayPromos, ahora, refrescar]);

  useEffect(() => {
    if (!hayPromos) return;
    const alVolver = () => {
      if (document.visibilityState === "visible") refrescar();
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", refrescar);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", refrescar);
    };
  }, [hayPromos, refrescar]);

  const vigentes = useMemo(() => conPromosVigentes(categorias, gruposMitad, ahora), [categorias, gruposMitad, ahora]);
  return { categorias: vigentes.categorias, gruposMitad: vigentes.gruposMitad, refrescar };
}
