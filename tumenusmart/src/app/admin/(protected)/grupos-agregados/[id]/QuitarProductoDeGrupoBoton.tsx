"use client";

import { useTransition } from "react";
import { quitarProductoDeGrupo } from "../actions";

export function QuitarProductoDeGrupoBoton({
  groupId,
  productId,
}: {
  groupId: string;
  productId: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => quitarProductoDeGrupo(groupId, productId))}
      className="rounded border border-peligro/30 bg-peligro-luz px-1.5 py-0.5 text-xs font-medium text-peligro hover:bg-peligro hover:text-white disabled:opacity-50"
    >
      Quitar
    </button>
  );
}
