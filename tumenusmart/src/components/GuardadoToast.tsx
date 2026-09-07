"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

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

    const timer = setTimeout(() => setMensaje(null), error ? 5000 : 2500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  if (!mensaje) return null;

  return (
    <div
      className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${
        mensaje.esError ? "bg-peligro" : "bg-neutral-900"
      }`}
    >
      <span>{mensaje.esError ? "⚠" : "✓"}</span>
      {mensaje.texto}
    </div>
  );
}
