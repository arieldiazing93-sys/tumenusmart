import { pantallaConPermiso } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { cargarCatalogoDeVenta } from "@/lib/catalogo-venta";
import { metodosPagoHabilitados } from "@/lib/metodos-pago";
import { puedeFacturarDesdeEstaEstacion, textoSinFactura } from "@/lib/factura-estacion";
import { BotonEnlace, Cabecera, Vacio } from "@/components/ui";
import { NuevoPedidoForm } from "./NuevoPedidoForm";

export const dynamic = "force-dynamic";

/**
 * Cargar un pedido a mano: el cliente llamó por teléfono. Entra en la misma tabla que los del menú digital, así que
 * desde ahí sigue el mismo circuito (en preparación, repartidor, en despacho, entregado, factura).
 */
export default async function NuevoPedidoPage() {
  await pantallaConPermiso("pedidos.crear");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const [catalogo, zonas, store, facturacion] = await Promise.all([
    cargarCatalogoDeVenta(db),
    db.deliveryZone.findMany({
      where: { activo: true },
      orderBy: [{ radioKm: "asc" }, { nombre: "asc" }],
      select: { id: true, nombre: true, costoEnvio: true },
    }),
    // Store no pertenece a ningún local (no está en MODELOS_POR_LOCAL): se lee con el cliente global.
    prisma.store.findUnique({
      where: { id: storeId },
      select: {
        aceptaEfectivo: true,
        aceptaTransferencia: true,
        aceptaTarjetaDebito: true,
        aceptaTarjetaCredito: true,
        facturaObligatoria: true,
      },
    }),
    // ¿Esta computadora tiene un punto de expedición vigente? Si no, no se pregunta por factura (igual que el POS).
    puedeFacturarDesdeEstaEstacion(db),
  ]);

  // Las mismas formas de pago que el local tiene habilitadas para el cliente (el servidor las vuelve a comprobar).
  const metodosPago = metodosPagoHabilitados(store).map((m) => ({ value: m.value, label: m.label }));

  return (
    <div>
      <Cabecera
        titulo="Nuevo pedido"
        bajada="Para el cliente que llama por teléfono. Se carga acá y sigue el mismo camino que los del menú digital: preparación, repartidor, despacho y entrega."
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
          metodosPago={metodosPago}
          facturaObligatoria={store?.facturaObligatoria ?? false}
          puedeFacturar={facturacion.puedeFacturar}
          motivoSinFactura={facturacion.motivo ? textoSinFactura(facturacion.motivo) : null}
          diasParaVencerTimbrado={facturacion.diasParaVencerTimbrado}
        />
      )}
    </div>
  );
}
