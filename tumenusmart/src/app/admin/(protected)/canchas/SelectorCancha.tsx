"use client";

import { useRouter } from "next/navigation";
import { Selector } from "@/components/ui";

/**
 * Elegir UNA cancha para mirar (o "Todas las canchas"): al cambiarla, el calendario se recarga con esa cancha y conserva la
 * vista y el período. Las direcciones ya vienen armadas del servidor (`href`), así este botón no sabe nada de filtros.
 */
export function SelectorCancha({
  opciones,
  elegida,
}: {
  /** La primera es "todas" (valor ""). */
  opciones: { valor: string; etiqueta: string; href: string }[];
  /** El valor elegido ("" = todas). */
  elegida: string;
}) {
  const router = useRouter();

  return (
    <label className="flex items-center gap-2">
      <span className="text-[0.74rem] font-semibold uppercase tracking-rotulo text-tinta-suave">Cancha</span>
      <Selector
        value={elegida}
        onChange={(e) => {
          const destino = opciones.find((o) => o.valor === e.target.value);
          if (destino) router.push(destino.href, { scroll: false });
        }}
        aria-label="Mirar una sola cancha"
        className="h-9 min-w-[10rem] py-0 text-[0.84rem]"
      >
        {opciones.map((o) => (
          <option key={o.valor || "todas"} value={o.valor}>
            {o.etiqueta}
          </option>
        ))}
      </Selector>
    </label>
  );
}
