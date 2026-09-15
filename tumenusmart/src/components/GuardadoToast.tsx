"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const DURACION_MS = 5000;

// Muestra una notificación fija "✓ Guardado" cuando la URL trae ?guardado=1,
// o el motivo en rojo cuando trae ?error=... — las dos las agrega el server
// action al terminar (éxito o validación fallida) para formularios atados
// con <form action={fn}> tal cual, que no pueden devolver {ok,error} sin
// romper esa firma. Después limpia el parámetro de la URL para que un
// refresh no vuelva a mostrar el mismo cartel.
export function GuardadoToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [mensaje, setMensaje] = useState<{ texto: string; esError: boolean } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const error = searchParams.get("error");
    const guardado = searchParams.get("guardado") === "1";
    if (!error && !guardado) return;

    setMensaje(error ? { texto: error, esError: true } : { texto: "Guardado", esError: false });

    const params = new URLSearchParams(searchParams.toString());
    params.delete("guardado");
    params.delete("error");
    const nuevaUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nuevaUrl, { scroll: false });

    // El timer se guarda en un ref, no en el cleanup de este efecto: limpiar
    // la URL de acá arriba cambia `searchParams`, así que este mismo efecto
    // se vuelve a ejecutar. Si el timer se cancelara en el cleanup (atado a
    // esa dependencia), esa segunda corrida entraba derecho al `return` de
    // arriba sin programar uno nuevo — el cartel se quedaba pegado en
    // pantalla para siempre en vez de desaparecer solo.
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setMensaje(null), DURACION_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Cleanup real de desmontaje, separado del efecto de arriba a propósito
  // (ver comentario ahí): este solo corre una vez, al sacar el componente.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!mensaje) return null;

  return (
    <div
      // top-[4.5rem]: la barra de arriba (header) es sticky, mide 3.5rem
      // (56px) y usa z-40. Con top-4 el cartel quedaba flotando adentro de
      // esa franja — por encima del header (z-50) pero tapando el nombre y
      // "Salir" — y se veía como una línea oscura en vez de un cartel.
      className={`fixed top-[4.5rem] right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${
        mensaje.esError ? "bg-peligro" : "bg-exito"
      }`}
    >
      <span>{mensaje.esError ? "⚠" : "✓"}</span>
      {mensaje.texto}
    </div>
  );
}
