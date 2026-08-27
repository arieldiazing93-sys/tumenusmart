"use client";

import { useTransition } from "react";
import { eliminarProducto, eliminarOpcion } from "../actions";

export function EliminarProductoBoton({ productId }: { productId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("¿Borrar este producto? No se puede deshacer.")) return;
        startTransition(() => eliminarProducto(productId));
      }}
      className="text-sm text-peligro hover:underline disabled:opacity-50"
    >
      Borrar producto
    </button>
  );
}

export function EliminarOpcionBoton({
  productId,
  optionId,
}: {
  productId: string;
  optionId: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => eliminarOpcion(productId, optionId))}
      className="text-xs text-peligro hover:underline disabled:opacity-50"
    >
      Quitar
    </button>
  );
}
