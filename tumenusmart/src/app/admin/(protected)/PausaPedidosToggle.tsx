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
  variante = "tarjeta",
}: {
  pausado: boolean;
  mensaje: string | null;
  compacto?: boolean;
  /**
   * "tarjeta" es el bloque completo de Configuración, con su texto y el
   * mensaje para el cliente. "barra" es solo el botón, para la línea de estado
   * de Pedidos, donde el texto lo pone la barra.
   */
  variante?: "tarjeta" | "barra";
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

  // En la barra de estado de Pedidos solo va el botón: el texto de qué está
  // pasando lo pone la barra, que además sabe si el local está fuera de
  // horario. Tenerlo en los dos lugares llevaba a que se contradijeran —
  // la tarjeta decía "acepta pedidos con normalidad" justo arriba de
  // "el menú no está tomando pedidos".
  if (variante === "barra") {
    return (
      <span className="flex flex-none items-center gap-2">
        {error && <span className="text-[0.76rem] text-peligro">{error}</span>}
        <button
          type="button"
          onClick={alternar}
          disabled={pending}
          className={`flex-none rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold transition-colors duration-150 disabled:opacity-50 ${
            activo
              ? "bg-exito text-white hover:opacity-90"
              : "border border-linea bg-white text-tinta-media hover:border-aviso hover:text-aviso"
          }`}
        >
          {pending ? "Guardando…" : activo ? "Reanudar pedidos" : "Pausar pedidos"}
        </button>
      </span>
    );
  }

  return (
    <div
      className={`rounded-lg border p-4 ${
        activo ? "border-aviso/30 bg-aviso-luz" : "border-linea bg-white"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-tinta">
            {activo ? "⏸ Pedidos pausados" : "▶ Tomando pedidos"}
          </p>
          <p className="text-sm text-tinta-media">
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
            activo ? "bg-exito hover:opacity-90" : "bg-aviso hover:opacity-90"
          }`}
        >
          {pending ? "Guardando..." : activo ? "Reanudar pedidos" : "Pausar pedidos"}
        </button>
      </div>

      {!compacto && (
        <div className="mt-3 border-t border-linea/70 pt-3">
          <label className="mb-1 block text-xs font-medium text-tinta-media">
            Mensaje que ve el cliente mientras está pausado (opcional)
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ej: Estamos con mucha demanda, volvemos en 30 minutos."
              className="min-w-[220px] flex-1 rounded-lg border border-linea px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={guardarTexto}
              className="rounded-lg bg-noche-panel px-3 py-2 text-sm font-medium text-white hover:bg-noche-panel"
            >
              Guardar
            </button>
          </div>
          {guardadoTexto && <p className="mt-1 text-xs text-exito">✓ Mensaje guardado</p>}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-peligro">{error}</p>}
    </div>
  );
}
