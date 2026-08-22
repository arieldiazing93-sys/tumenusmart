import type { EstadoTienda } from "@/lib/estado-tienda";
import { motivoSinPedidos } from "@/lib/estado-tienda";

/**
 * Cartel que avisa al cliente que el local está cerrado o pausado.
 * No renderiza nada cuando se pueden tomar pedidos con normalidad.
 */
export function AvisoTienda({ estado }: { estado: EstadoTienda }) {
  const motivo = motivoSinPedidos(estado);
  if (!motivo) return null;

  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <span className="text-xl leading-none">{estado.pausado ? "⏸" : "🕒"}</span>
      <div>
        <p className="font-semibold text-amber-900">
          {estado.pausado ? "Pedidos pausados" : "Cerrado en este momento"}
        </p>
        <p className="mt-0.5 text-sm text-amber-800">{motivo}</p>
        <p className="mt-1 text-sm text-amber-700">
          Podés mirar el menú tranquilo, pero todavía no se pueden confirmar pedidos.
        </p>
      </div>
    </div>
  );
}
