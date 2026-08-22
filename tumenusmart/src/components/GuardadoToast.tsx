"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Muestra una notificación fija "✓ Guardado" cuando la URL trae ?guardado=1
// (lo agrega el server action al terminar con éxito), y después limpia ese
// parámetro de la URL para que un refresh no la vuelva a mostrar.
export function GuardadoToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (searchParams.get("guardado") !== "1") return;

    setVisible(true);

    const params = new URLSearchParams(searchParams.toString());
    params.delete("guardado");
    const nuevaUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nuevaUrl, { scroll: false });

    const timer = setTimeout(() => setVisible(false), 2500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  if (!visible) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-3 text-sm font-medium text-white shadow-lg">
      <span>✓</span>
      Guardado
    </div>
  );
}
