"use client";

import { useTransition } from "react";
import { eliminarGrupoItem } from "../actions";

export function EliminarGrupoItemBoton({
  groupId,
  itemId,
}: {
  groupId: string;
  itemId: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => eliminarGrupoItem(groupId, itemId))}
      className="rounded border border-peligro/30 bg-peligro-luz px-1.5 py-0.5 text-xs font-medium text-peligro hover:bg-peligro hover:text-white disabled:opacity-50"
    >
      Quitar
    </button>
  );
}
