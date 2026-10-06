import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { cargarCatalogoDeVenta } from "@/lib/catalogo-venta";
import { BotonEnlace, Cabecera, Vacio } from "@/components/ui";
import { NuevoPedidoForm } from "./NuevoPedidoForm";

export const dynamic = "force-dynamic";

/**
 * Cargar un pedido a mano: lo que el cliente mandó por WhatsApp (el menú digital solo arma ese mensaje) o por teléfono. Es la ÚNICA
 * forma de que un pedido entre al sistema.
 *
 * El pedido se carga ABIERTO, igual que la cuenta de una mesa del Servicio comedor: no se cobra ni se factura todavía. Desde su
 * detalle se le cargan más productos, se le da un descuento o se cancela algo si se cargó mal, y recién al final se cobra (forma de pago
 * y comprobante), que es cuando entra a la caja del turno abierto. Por eso crearlo no exige turno de caja; cobrarlo sí.
 */
export default async function NuevoPedidoPage() {
  await pantallaConPermiso("pedidos.crear");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const [catalogo, zonas] = await Promise.all([
    cargarCatalogoDeVenta(db),
    db.deliveryZone.findMany({
      where: { activo: true },
      orderBy: [{ radioKm: "asc" }, { nombre: "asc" }],
      select: { id: true, nombre: true, costoEnvio: true },
    }),
  ]);

  return (
    <div>
      <Cabecera
        titulo="Nuevo pedido"
        bajada="Cargá acá lo que el cliente mandó por WhatsApp o por teléfono. El pedido queda abierto: podés corregirlo (más productos, descuento, cancelar algo) y al final lo cobrás con la forma de pago y el comprobante que corresponda."
        acciones={
          <BotonEnlace href="/admin/pedidos" tono="navegar" tam="md">
            Volver a pedidos
          </BotonEnlace>
        }
      />

      {catalogo.categorias.length === 0 ? (
        <Vacio
          titulo="Todavía no hay productos para vender"
          detalle="Cargá productos disponibles en tu carta para poder armar pedidos."
          accion={
            <BotonEnlace href="/admin/productos" tono="principal" tam="md">
              Ir a Productos
            </BotonEnlace>
          }
        />
      ) : (
        <NuevoPedidoForm
          categorias={catalogo.categorias}
          gruposMitad={catalogo.gruposMitad}
          zonas={zonas.map((z) => ({ id: z.id, nombre: z.nombre, costoEnvio: Number(z.costoEnvio) }))}
        />
      )}
    </div>
  );
}
