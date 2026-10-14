"use client";

import { useRouter } from "next/navigation";
import { Selector } from "@/components/ui";

/**
 * Filtra el reporte de mozos por un mozo (o "Todos los mozos"): al elegir uno, la pantalla se recarga con ese mozo y conserva el
 * período que ya estaba elegido (`conservar` son los demás filtros: fecha, desde, hasta).
 */
export function SelectorMozo({
  accion,
  mozos,
  elegido,
  conservar,
}: {
  accion: string;
  mozos: { id: string; nombre: string; activo: boolean }[];
  /** El mozo elegido, o "" para todos. */
  elegido: string;
  conservar: Record<string, string>;
}) {
  const router = useRouter();

  function elegir(id: string) {
    const params = new URLSearchParams(conservar);
    if (id) params.set("mozo", id);
    router.push(`${accion}?${params.toString()}`);
  }

  return (
    <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
      <span className="text-[0.74rem] font-semibold uppercase tracking-rotulo text-tinta-suave">Mozo</span>
      <Selector
        value={elegido}
        onChange={(e) => elegir(e.target.value)}
        aria-label="Filtrar por mozo"
        className="min-w-[14rem] sm:w-auto"
      >
        <option value="">Todos los mozos</option>
        {mozos.map((m) => (
          <option key={m.id} value={m.id}>
            {m.nombre}
            {m.activo ? "" : " (desactivado)"}
          </option>
        ))}
      </Selector>
    </label>
  );
}
