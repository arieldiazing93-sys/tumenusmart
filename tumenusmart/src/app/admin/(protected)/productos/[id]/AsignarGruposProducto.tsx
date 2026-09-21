"use client";

import { useState } from "react";
import { asignarGrupoAProducto } from "../actions";

type Grupo = { id: string; nombre: string; cantidadItems: number };

/**
 * Qué grupos de agregados reutilizables (ver /admin/grupos-agregados) están
 * adjuntados a este producto — un checkbox por grupo, se guarda solo al
 * tildar/destildar, sin botón "Guardar" aparte (mismo patrón que los
 * <select> de EstacionFila.tsx para Estacion↔AreaImpresion).
 */
export function AsignarGruposProducto({
  productId,
  grupos,
  gruposAdjuntadosIds,
}: {
  productId: string;
  grupos: Grupo[];
  gruposAdjuntadosIds: string[];
}) {
  const [adjuntados, setAdjuntados] = useState(new Set(gruposAdjuntadosIds));
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function alternar(groupId: string) {
    const yaAdjuntado = adjuntados.has(groupId);
    setGuardando(groupId);
    setError(null);
    const resultado = await asignarGrupoAProducto(productId, groupId, !yaAdjuntado);
    setGuardando(null);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setAdjuntados((prev) => {
      const copia = new Set(prev);
      if (yaAdjuntado) copia.delete(groupId);
      else copia.add(groupId);
      return copia;
    });
  }

  if (grupos.length === 0) {
    return (
      <p className="text-sm text-tinta-suave">
        Todavía no hay grupos de agregados creados. Se crean en{" "}
        <span className="font-medium">Grupos de agregados</span>, en el menú.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {grupos.map((g) => (
        <label
          key={g.id}
          className="flex items-center gap-2 rounded-lg border border-linea bg-white px-3 py-2 text-sm"
        >
          <input
            type="checkbox"
            checked={adjuntados.has(g.id)}
            disabled={guardando === g.id}
            onChange={() => alternar(g.id)}
            className="h-4 w-4"
          />
          <span className="flex-1">{g.nombre}</span>
          <span className="text-xs text-tinta-suave">{g.cantidadItems} ítem(s)</span>
        </label>
      ))}
      {error && <p className="text-xs text-peligro">{error}</p>}
    </div>
  );
}
