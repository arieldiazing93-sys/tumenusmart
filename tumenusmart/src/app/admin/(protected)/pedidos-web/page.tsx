import { pantallaConPermiso } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { prisma } from "@/lib/prisma";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { Cabecera, BotonEnlace } from "@/components/ui";
import { RefrescarCada } from "@/components/RefrescarCada";
import { normalizarRubro } from "@/lib/pedido-web";
import { filaDePedido, sincronizarPedidosConCuentas } from "@/lib/pedido-web-servidor";
import { BandejaPedidosWeb } from "./BandejaPedidosWeb";

export const dynamic = "force-dynamic";

/**
 * Los pedidos que entran por el menú digital. Arriba los nuevos (esperan una decisión: aceptarlos o rechazarlos), después los que
 * están en curso y, al final, lo que se cerró hoy. Lo que se acepta se vuelve una cuenta del Servicio delivery. Se actualiza solo.
 */
export default async function PedidosWebPage() {
  const sesion = await pantallaConPermiso("delivery.ver");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);
  const puedeGestionar = puede(sesion.rol, "delivery.gestionar");
  const puedeCobrar = puedeGestionar && puede(sesion.rol, "pos.vender");

  // Lo que ya se cobró o canceló desde el Servicio delivery se refleja antes de armar la pantalla.
  await sincronizarPedidosConCuentas(storeId);

  const local = await prisma.store.findUnique({
    where: { id: storeId },
    select: { pedidosWebActivo: true, pedidosWebAutoAceptar: true, pedidosWebRubro: true },
  });

  const desde = new Date();
  desde.setHours(0, 0, 0, 0);
  const [abiertos, cerrados] = await Promise.all([
    db.pedidoWeb.findMany({ where: { estado: { in: ["nuevo", "aceptado", "listo"] } }, orderBy: { createdAt: "asc" }, take: 100 }),
    db.pedidoWeb.findMany({
      where: { estado: { in: ["entregado", "rechazado", "cancelado"] }, updatedAt: { gte: desde } },
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
  ]);

  // El número de la cuenta del delivery de cada pedido aceptado (para decir «Cuenta 7» y llevar a la persona).
  const idsDeCuentas = [...abiertos, ...cerrados].map((p) => p.cuentaDeliveryId).filter((x): x is string => !!x);
  const cuentas = idsDeCuentas.length
    ? await db.cuentaDelivery.findMany({ where: { id: { in: idsDeCuentas } }, select: { id: true, numero: true } })
    : [];
  const numeroDeCuenta = new Map(cuentas.map((c) => [c.id, c.numero]));
  const aFila = (p: (typeof abiertos)[number]) => filaDePedido(p, p.cuentaDeliveryId ? (numeroDeCuenta.get(p.cuentaDeliveryId) ?? null) : null);

  const generadoEn = new Date().toISOString();

  return (
    <div className="flex flex-col gap-5">
      <Cabecera
        titulo="Pedidos del menú"
        bajada="Lo que tus clientes piden desde el menú digital. Aceptás con un toque y sale la comanda; después sigue por el Servicio delivery."
        acciones={
          <span className="flex flex-wrap items-center gap-2">
            <RefrescarCada segundos={10} generadoEn={generadoEn} />
            <BotonEnlace href="/admin/delivery" tono="navegar" tam="sm">
              Ir al Servicio delivery
            </BotonEnlace>
          </span>
        }
      />

      {!local?.pedidosWebActivo && (
        <div className="rounded-xl border-2 border-aviso/40 bg-aviso-luz p-4 text-[0.9rem] text-aviso">
          <strong>Los pedidos del menú no están activados.</strong> Mientras tanto el menú arma el mensaje de WhatsApp como siempre.
          Se activan en Configuración → Pedidos del menú digital.
          <div className="mt-2">
            <BotonEnlace href="/admin/configuracion" tono="navegar" tam="sm">
              Ir a Configuración
            </BotonEnlace>
          </div>
        </div>
      )}

      <BandejaPedidosWeb
        abiertos={abiertos.map(aFila)}
        cerrados={cerrados.map(aFila)}
        rubro={normalizarRubro(local?.pedidosWebRubro)}
        puedeGestionar={puedeGestionar}
        puedeCobrar={puedeCobrar}
        aceptaSolo={local?.pedidosWebAutoAceptar ?? false}
      />
    </div>
  );
}
