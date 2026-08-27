"use client";

import { useRouter } from "next/navigation";

/**
 * Elegir de qué día es el informe.
 *
 * Existe porque el encargado que entra al turno de la noche suele imprimir la
 * hoja del día siguiente antes de irse. Sin esto habría que volver al
 * calendario, pararse en ese día y recién ahí imprimir.
 */
export function SelectorDiaInforme({ dia }: { dia: string }) {
  const router = useRouter();

  return (
    <label className="flex items-center gap-2 text-[0.82rem] text-tinta-media">
      Día
      <input
        type="date"
        value={dia}
        onChange={(e) => {
          if (e.target.value) router.push(`/admin/reservas/imprimir?dia=${e.target.value}`);
        }}
        className="rounded-lg border border-linea bg-white px-2.5 py-1.5 text-[0.82rem] text-tinta focus:border-brand focus:outline-none"
      />
    </label>
  );
}
