"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { elegirLocal } from "./actions-local";

type LocalItem = { id: string; nombre: string; slug: string };

/**
 * Selector de local del panel.
 *
 * Solo se le muestra al superadmin —el layout ni siquiera lo renderiza para
 * los demás— y aparece recién cuando hay más de un local cargado.
 */
export function SelectorLocal({
  locales,
  actual,
}: {
  locales: LocalItem[];
  actual: string;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();

  if (locales.length <= 1) return null;

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-tinta-suave">Local:</span>
      <select
        value={actual}
        disabled={pendiente}
        onChange={(e) => {
          const id = e.target.value;
          iniciar(async () => {
            await elegirLocal(id);
            router.refresh();
          });
        }}
        className="rounded-lg border border-linea px-2 py-1 text-sm font-medium text-tinta"
      >
        {locales.map((l) => (
          <option key={l.id} value={l.id}>
            {l.nombre} (/{l.slug})
          </option>
        ))}
      </select>
    </label>
  );
}
