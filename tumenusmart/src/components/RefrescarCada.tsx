"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clasesBoton } from "@/components/ui";

/**
 * Vuelve a pedir los datos de la pantalla cada tantos segundos (no se ve nada: solo actualiza lo que muestra). Se pone
 * dentro de una pantalla que tiene que mostrar lo último sin que nadie recargue, como las mesas abiertas del comedor.
 *
 *  - Mientras la pestaña está a la vista actualiza cada `segundos`. Mientras está oculta, no (sería gastar para nada).
 *  - Apenas se vuelve a la pestaña o a la ventana, actualiza en el acto: si estuvo en segundo plano, el navegador frena o
 *    atrasa los relojes, y sin esto lo nuevo recién aparecía en el próximo ciclo (o tras recargar a mano).
 *  - Con `generadoEn` (la hora en que el servidor armó la pantalla) muestra "Actualizado hace N s" y un botón "Actualizar":
 *    así se ve si realmente está al día. Si pasa mucho sin llegar datos nuevos, avisa en amarillo.
 */
export function RefrescarCada({ segundos, generadoEn }: { segundos: number; generadoEn?: string }) {
  const router = useRouter();
  const mostrar = generadoEn !== undefined;
  const ultimoPedido = useRef(Date.now());
  // Cuándo (en el reloj de este navegador) llegaron los últimos datos: se mide acá y no con la hora del servidor, para que no
  // importe si los dos relojes están desfasados.
  const llegaronEn = useRef<number>(Date.now());
  const [hace, setHace] = useState(0);

  useEffect(() => {
    function refrescar() {
      ultimoPedido.current = Date.now();
      router.refresh();
    }
    const reloj = setInterval(() => {
      if (document.visibilityState === "visible") refrescar();
    }, segundos * 1000);
    // Al volver a la pestaña o a la ventana (o al volver la conexión): se actualiza ya, sin esperar al próximo ciclo.
    const alVolver = () => {
      if (document.visibilityState === "visible" && Date.now() - ultimoPedido.current > 3000) refrescar();
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    window.addEventListener("online", alVolver);
    return () => {
      clearInterval(reloj);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
      window.removeEventListener("online", alVolver);
    };
  }, [router, segundos]);

  // Llegaron datos nuevos (cambió la hora con la que el servidor armó la pantalla): el contador vuelve a cero.
  useEffect(() => {
    llegaronEn.current = Date.now();
    setHace(0);
  }, [generadoEn]);

  useEffect(() => {
    if (!mostrar) return;
    const reloj = setInterval(() => setHace(Math.max(0, Math.round((Date.now() - llegaronEn.current) / 1000))), 1000);
    return () => clearInterval(reloj);
  }, [mostrar]);

  if (!mostrar) return null;

  // Más de tres ciclos sin datos nuevos con la pestaña a la vista: algo no está llegando.
  const atrasado = hace > segundos * 3;
  return (
    <span className={`inline-flex items-center gap-2 text-[0.78rem] ${atrasado ? "font-medium text-amarillo-oscuro" : "text-tinta-suave"}`}>
      {atrasado ? `Sin datos nuevos hace ${hace} s` : `Actualizado hace ${hace} s`}
      <button
        type="button"
        onClick={() => {
          ultimoPedido.current = Date.now();
          router.refresh();
        }}
        className={clasesBoton("suave", "sm")}
      >
        Actualizar
      </button>
    </span>
  );
}
