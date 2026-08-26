import type { EstadoTienda } from "@/lib/estado-tienda";
import { motivoSinPedidos } from "@/lib/estado-tienda";

/**
 * El cartel que avisa que ahora no se puede pedir.
 *
 * No aparece cuando el local atiende con normalidad. Cuando aparece, dice las
 * dos cosas que le importan al cliente en ese momento: por qué no puede pedir,
 * y que igual puede seguir mirando la carta — porque la mayoría vuelve después
 * si no lo echan de la página.
 */
export function AvisoTienda({ estado }: { estado: EstadoTienda }) {
  const motivo = motivoSinPedidos(estado);
  if (!motivo) return null;

  return (
    <div className="rounded-xl border border-aviso/30 bg-aviso-luz p-4">
      <p className="text-[0.9rem] font-semibold text-aviso">
        {estado.pausado ? "Pedidos pausados" : "Cerrado en este momento"}
      </p>
      <p className="mt-1 text-[0.84rem] leading-relaxed text-tinta-media">
        {motivo} Podés mirar la carta tranquilo — cuando abran, el pedido se manda en dos
        toques.
      </p>
    </div>
  );
}
