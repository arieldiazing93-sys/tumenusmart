"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { llamarAlServidor } from "@/lib/llamar-servidor";
import { quitarInsumoDeProducto } from "../actions";

export function QuitarInsumoDeRecetaBoton({
  productId,
  insumoId,
}: {
  productId: string;
  insumoId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await llamarAlServidor(async () => {
            await quitarInsumoDeProducto(productId, insumoId);
            return { ok: true as const };
          });
          if (!r.ok) {
            alert(r.error);
            return;
          }
          router.refresh();
        })
      }
      className="rounded border border-peligro/30 bg-peligro-luz px-1.5 py-0.5 text-xs font-medium text-peligro hover:bg-peligro hover:text-white disabled:opacity-50"
    >
      Quitar
    </button>
  );
}
