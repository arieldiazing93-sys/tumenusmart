"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { alternarPausaPedidos, guardarMensajePausa } from "./configuracion/actions";

/**
 * Corte manual de pedidos. Se guarda al instante (sin botón "Guardar"),
 * porque el momento típico de uso es la cocina saturada un sábado a la
 * noche — ahí no hay tiempo para navegar formularios.
 */
export function PausaPedidosToggle({
  pausado,
  mensaje,
  compacto = false,
}: {
  pausado: boolean;
  mensaje: string | null;
  compacto?: boolean;
}) {
  const router = useRouter();
  const [activo, setActivo] = useState(pausado);
  const [texto, setTexto] = useState(mensaje ?? "");
  const [guardadoTexto, setGuardadoTexto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function alternar() {
    const nuevo = !activo;
    setActivo(nuevo);
    setError(null);
    startTransition(async () => {
      try {
        await alternarPausaPedidos(nuevo);
        router.refresh();
      } catch (err) {
        setActivo(!nuevo); // vuelve atrás si no se pudo guardar
        setError(err instanceof Error ? err.message : "No se pudo cambiar el estado");
      }
    });
  }

  async function guardarTexto() {
    setError(null);
    try {
      await guardarMensajePausa(texto);
      setGuardadoTexto(true);
      setTimeout(() => setGuardadoTexto(false), 2500);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el mensaje");
    }
  }

  return (
    <div
      className={`rounded-lg border p-4 ${
        activo ? "border-amber-300 bg-amber-50" : "border-neutral-200 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-neutral-900">
            {activo ? "⏸ Pedidos pausados" : "▶ Tomando pedidos"}
          </p>
          <p className="text-sm text-neutral-500">
            {activo
              ? "Los clientes ven el menú pero no pueden confirmar pedidos."
              : "El menú acepta pedidos con normalidad, dentro del horario."}
          </p>
        </div>
        <button
          type="button"
          onClick={alternar}
          disabled={pending}
          className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
            activo ? "bg-green-600 hover:bg-green-700" : "bg-amber-600 hover:bg-amber-700"
          }`}
        >
          {pending ? "Guardando..." : activo ? "Reanudar pedidos" : "Pausar pedidos"}
        </button>
      </div>

      {!compacto && (
        <div className="mt-3 border-t border-neutral-200/70 pt-3">
          <label className="mb-1 block text-xs font-medium text-neutral-500">
            Mensaje que ve el cliente mientras está pausado (opcional)
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ej: Estamos con mucha demanda, volvemos en 30 minutos."
              className="min-w-[220px] flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={guardarTexto}
              className="rounded-lg bg-neutral-800 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700"
            >
              Guardar
            </button>
          </div>
          {guardadoTexto && <p className="mt-1 text-xs text-green-600">✓ Mensaje guardado</p>}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
