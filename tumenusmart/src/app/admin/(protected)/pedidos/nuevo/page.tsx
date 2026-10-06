import { redirect } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { estacionActual } from "@/lib/estacion-actual";
import { cargarCatalogoDeVenta } from "@/lib/catalogo-venta";
import { metodosPagoHabilitados } from "@/lib/metodos-pago";
import { puedeFacturarDesdeEstaEstacion, textoSinFactura } from "@/lib/factura-estacion";
import { rutaParaAbrirTurno } from "@/lib/turno-requerido";
import { BotonEnlace, Cabecera, Vacio } from "@/components/ui";
import { turnoAbierto } from "../../pos/turno-actual";
import { EstacionNoVinculada } from "../../pos/EstacionNoVinculada";
import { NuevoPedidoForm } from "./NuevoPedidoForm";

export const dynamic = "force-dynamic";

/**
 * Cargar un pedido a mano: lo que el cliente mandó por WhatsApp (el menú digital solo arma ese mensaje) o por teléfono. Es la ÚNICA
 * forma de que un pedido entre al sistema: se cobra y, si es con factura, se emite en el acto. Desde ahí sigue el circuito de la
 * entrega (en preparación, repartidor, en despacho, entregado).
 *
 * Como cobrar entra a la caja del turno abierto, sin turno no se carga: esta pantalla manda directo a abrirlo y vuelve.
 */
export default async function NuevoPedidoPage() {
  await pantallaConPermiso("pedidos.crear");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const estacion = await estacionActual(db);
  if (!estacion) return <EstacionNoVinculada />;
  const turno = await turnoAbierto(db, estacion.id);
  if (!turno) redirect(rutaParaAbrirTurno("/admin/pedidos/nuevo"));

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
        bajada="Cargá acá lo que el cliente mandó por WhatsApp o por teléfono. Se cobra al crearlo (entra a la caja del turno abierto), la factura se emite en el acto y sigue su camino: preparación, repartidor, despacho y entrega."
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
