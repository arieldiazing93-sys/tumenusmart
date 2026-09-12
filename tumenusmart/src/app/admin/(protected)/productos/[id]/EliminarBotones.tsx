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
        startTransition(async () => {
          // alert() y no un texto en pantalla: mismo motivo que en zonas de
          // envío — el mensaje explica por qué no se borró y qué hacer en
          // su lugar, y es demasiado largo para un texto chico al lado del
          // botón.
          const resultado = await eliminarProducto(productId);
          if (!resultado.ok) alert(resultado.error);
        });
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
      className="rounded border border-peligro/30 bg-peligro-luz px-1.5 py-0.5 text-xs font-medium text-peligro hover:bg-peligro hover:text-white disabled:opacity-50"
    >
      Quitar
    </button>
  );
}
