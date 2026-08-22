"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Vuelve a pedirle los datos al servidor cada tantos segundos, sin recargar
 * la página entera. Se usa en la pantalla de seguimiento del pedido para que
 * el cliente vea el cambio de estado sin tener que refrescar a mano.
 */
export function AutoRefresh({ segundos = 25 }: { segundos?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), segundos * 1000);
    return () => clearInterval(id);
  }, [router, segundos]);

  return null;
}
