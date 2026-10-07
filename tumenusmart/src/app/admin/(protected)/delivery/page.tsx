import { pantallaConPermiso } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { prisma } from "@/lib/prisma";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { estacionActual } from "@/lib/estacion-actual";
import { diasParaVencer } from "@/lib/factura-pos";
import { cargarCatalogoDeVenta } from "@/lib/catalogo-venta";
import { formatearGuarani } from "@/lib/format";
import { SIN_REGISTRO_FISCAL } from "@/lib/tipo-cliente";
import { SEGUNDOS_LATIDO_IMPRESION, descuentoDeCuenta, impuestosDeCuenta, lineasDeCobro } from "@/lib/comedor";
import { ESTADOS_DELIVERY_ABIERTA, lineaDeEnvio, totalesDeDelivery } from "@/lib/delivery";
import { BotonEnlace, Cabecera, Pastilla } from "@/components/ui";
import { RefrescarCada } from "@/components/RefrescarCada";
import { turnoAbierto } from "../pos/turno-actual";
import { DeliveryCaja } from "./DeliveryCaja";
import type { ContextoDelivery, CuentaDeliveryFila } from "./tipos-delivery";

export const dynamic = "force-dynamic";

/**
 * Servicio delivery: las cuentas de los pedidos a domicilio. La caja abre una cuenta con los datos del cliente y su dirección, le
 * carga los productos, la imprime, le asigna un repartidor (que ya lo ve en su enlace) y la cobra; puede haber varias abiertas a la
 * vez. A la izquierda la lista; con doble clic en una se abre su detalle a la derecha. Al cobrarse, la cuenta sale de la lista.
 * Se actualiza solo.
 */
export default async function DeliveryPage() {
  const sesion = await pantallaConPermiso("delivery.ver");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);
  const puedeGestionar = puede(sesion.rol, "delivery.gestionar");
  const puedeCobrar = puedeGestionar && puede(sesion.rol, "pos.vender");

  const desdeLatido = new Date(Date.now() - SEGUNDOS_LATIDO_IMPRESION * 1000);
  const [cuentas, enEspera, imprimiendo] = await Promise.all([
    db.cuentaDelivery.findMany({
      // Las cuentas que se siguen operando. Al cobrarse (o cancelarse) una cuenta sale de la lista y queda en el Historial de cuentas.
      where: { estado: { in: [...ESTADOS_DELIVERY_ABIERTA] } },
      orderBy: { abiertaEn: "asc" },
      include: {
        repartidor: { select: { nombre: true } },
        items: { orderBy: [{ ronda: "asc" }, { linea: "asc" }] },
        // La factura que ya salió con la "factura rápida" (una vigente a la vez).
        comprobantes: {
          where: { estado: "vigente" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { numero: true, receptorRazonSocial: true, receptorTipoIdentificacion: true, fechaEmision: true },
        },
      },
    }),
    db.trabajoImpresion.count({ where: { estado: { in: ["pendiente", "imprimiendo"] } } }),
    db.estacion.findFirst({ where: { impresionVistaEn: { gte: desdeLatido } }, select: { id: true } }),
  ]);

  const filas = cuentas.map((c): CuentaDeliveryFila => {
    const activos = c.items.filter((i) => i.estado === "activo");
    const lineas = activos.map((i) => ({ precioUnitario: Number(i.precioUnitario), cantidad: i.cantidad }));
    const totales = totalesDeDelivery(lineas, Number(c.costoEnvio), descuentoDeCuenta(c));
    // El IVA que lleva la cuenta, con las mismas líneas (productos y envío) y la misma cuenta que después usa la factura.
    const envio = lineaDeEnvio(totales.envio);
    const filasDeCobro = lineasDeCobro(
      activos.map((i) => ({
        productId: i.productId,
        nombreProducto: i.nombreProducto,
        cantidad: i.cantidad,
        precioUnitario: Number(i.precioUnitario),
        iva: i.iva,
        opcionesTexto: i.opcionesTexto,
        costoProducto: i.costoProducto == null ? null : Number(i.costoProducto),
        costoAgregados: i.costoAgregados == null ? null : Number(i.costoAgregados),
        precioAgregados: Number(i.precioAgregados),
      }))
    );
    const impuestos = impuestosDeCuenta(envio ? [...filasDeCobro, envio] : filasDeCobro, totales.descuento);
    return {
      id: c.id,
      activo: true,
      numero: c.numero,
      estado: c.estado,
      abiertaEn: c.abiertaEn.toISOString(),
      clienteNombre: c.clienteNombre,
      clienteTelefono: c.clienteTelefono,
      ficha:
        c.facturaRuc && c.facturaRazonSocial
          ? {
              tipo: c.facturaTipoIdentificacion ?? "ruc",
              numero: c.facturaRuc,
              razon: c.facturaRazonSocial,
              email: c.facturaEmail ?? "",
            }
          : null,
      direccion: c.direccion,
      clienteLat: c.clienteLat,
      clienteLng: c.clienteLng,
      zonaId: c.deliveryZoneId,
      zonaNombre: c.zonaNombre ?? "A coordinar",
      costoEnvio: Number(c.costoEnvio),
      notas: c.notas,
      repartidorId: c.repartidorId,
      repartidor: c.repartidor?.nombre ?? null,
      asignadaEn: c.salioEn ? c.salioEn.toISOString() : null,
      impresaEn: c.impresaEn ? c.impresaEn.toISOString() : null,
      factura: c.comprobantes[0]
        ? {
            numero: c.comprobantes[0].numero,
            cliente:
              c.comprobantes[0].receptorTipoIdentificacion === SIN_REGISTRO_FISCAL.tipo
                ? SIN_REGISTRO_FISCAL.etiquetaDisplay
                : (c.comprobantes[0].receptorRazonSocial ?? ""),
            emitidaEn: c.comprobantes[0].fechaEmision.toISOString(),
          }
        : null,
      descuento: descuentoDeCuenta(c)
        ? {
            tipo: c.descuentoTipo === "porcentaje" ? "porcentaje" : "monto",
            valor: Number(c.descuentoValor),
            motivo: c.descuentoMotivo ?? "",
            por: c.descuentoPor ?? "",
          }
        : null,
      totales,
      impuestos,
      items: c.items.map((i) => ({
        id: i.id,
        ronda: i.ronda,
        enviadoEn: i.enviadoEn.toISOString(),
        cantidad: i.cantidad,
        nombre: i.nombreProducto,
        opciones: i.opcionesTexto,
        quitados: i.ingredientesQuitadosTexto,
        nota: i.nota,
        precioUnitario: Number(i.precioUnitario),
        anulado: i.estado === "anulado",
        motivoAnulacion: i.motivoAnulacion,
        anuladoPor: i.anuladoPor,
        cargadoPor: i.cargadoPor,
      })),
    };
  });
  // Lo que todavía no se cobró: la plata que está en la calle o por cobrar.
  const porCobrar = filas.filter((f) => f.estado !== "pagada");
  const totalPorCobrar = porCobrar.reduce((s, f) => s + f.totales.total, 0);

  // ---------------------------------------------------------------- lo que hace falta para operar desde esta computadora
  let contexto: ContextoDelivery = {
    puedeGestionar,
    puedeCobrar,
    categorias: [],
    gruposMitad: [],
    promociones: [],
    zonas: [],
    repartidores: [],
    imprimirCuenta: { ok: false, motivo: "" },
    facturaRapida: { ok: false, motivo: "" },
    cobro: { ok: false, motivo: "" },
  };

  if (puedeGestionar) {
    const estacion = await estacionActual(db);
    const [catalogo, zonas, repartidores] = await Promise.all([
      cargarCatalogoDeVenta(db),
      db.deliveryZone.findMany({
        where: { activo: true },
        orderBy: [{ radioKm: "asc" }, { nombre: "asc" }],
        select: { id: true, nombre: true, costoEnvio: true },
      }),
      db.repartidor.findMany({ where: { activo: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
    ]);
    contexto = {
      ...contexto,
      categorias: catalogo.categorias,
      gruposMitad: catalogo.gruposMitad,
      promociones: catalogo.promociones,
      zonas: zonas.map((z) => ({ id: z.id, nombre: z.nombre, costoEnvio: Number(z.costoEnvio) })),
      repartidores,
    };

    if (!estacion) {
      const motivo = "Esta computadora no está vinculada a una estación. Vinculala en Estaciones.";
      contexto = {
        ...contexto,
        imprimirCuenta: { ok: false, motivo },
        facturaRapida: { ok: false, motivo },
        cobro: { ok: false, motivo },
      };
    } else {
      const datos = await db.estacion.findUnique({
        where: { id: estacion.id },
        select: {
          areaTicketId: true,
          impresoras: { select: { areaImpresionId: true, nombreImpresora: true } },
          puntoExpedicion: { select: { activo: true, timbradoHasta: true } },
        },
      });
      const impresoraDelTicket = datos?.areaTicketId
        ? (datos.impresoras.find((i) => i.areaImpresionId === datos.areaTicketId)?.nombreImpresora ?? null)
        : null;
      contexto = {
        ...contexto,
        imprimirCuenta: impresoraDelTicket
          ? { ok: true }
          : {
              ok: false,
              motivo:
                "Esta estación no tiene impresora para el ticket. En Estaciones elegí el “Área del ticket/factura” y asignale una impresora.",
            },
      };

      // La "factura rápida" no registra ninguna venta: no necesita turno de caja abierto, solo un punto de expedición vigente.
      const puntoDeFactura = datos?.puntoExpedicion ?? null;
      const puntoVigente = !!puntoDeFactura?.activo && puntoDeFactura.timbradoHasta > new Date();
      contexto = {
        ...contexto,
        facturaRapida: !puedeCobrar
          ? { ok: false, motivo: "No tenés permiso para facturar." }
          : puntoVigente && puntoDeFactura
            ? { ok: true, diasParaVencerTimbrado: diasParaVencer(puntoDeFactura.timbradoHasta), nombreImpresoraTicket: impresoraDelTicket }
            : { ok: false, motivo: "Esta estación no tiene un punto de expedición vigente: no puede emitir facturas." },
      };

      if (puedeCobrar) {
        const turno = await turnoAbierto(db, estacion.id);
        const punto = datos?.puntoExpedicion ?? null;
        const store = await prisma.store.findUnique({
          where: { id: storeId },
          select: { facturaObligatoria: true, ventasACredito: true },
        });
        contexto = {
          ...contexto,
          cobro: turno
            ? {
                ok: true,
                puedeFacturar: !!punto?.activo && punto.timbradoHasta > new Date(),
                diasParaVencerTimbrado: punto ? diasParaVencer(punto.timbradoHasta) : null,
                facturaObligatoria: store?.facturaObligatoria ?? false,
                nombreImpresoraTicket: impresoraDelTicket,
                permiteCredito: store?.ventasACredito ?? false,
              }
            : {
                ok: false,
                motivo: "No hay un turno de caja abierto en esta estación.",
                sinTurno: true,
              },
        };
      } else {
        contexto = { ...contexto, cobro: { ok: false, motivo: "No tenés permiso para cobrar." } };
      }
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Cabecera
        titulo="Servicio delivery"
        bajada="Las cuentas de los pedidos a domicilio: abrí una con los datos del cliente y su dirección, cargale los productos, mandala con el repartidor y cobrala. Se actualiza solo."
        acciones={
          <>
            {puedeGestionar && (
              <BotonEnlace href="/admin/impresion" tono="navegar" tam="md">
                Impresión automática
              </BotonEnlace>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {imprimiendo ? (
          <Pastilla color="exito" punto>
            Impresión conectada
          </Pastilla>
        ) : (
          <Pastilla color="amarillo" punto>
            Nadie está imprimiendo
          </Pastilla>
        )}
        {enEspera > 0 && (
          <Pastilla color="amarillo">
            {enEspera} {enEspera === 1 ? "comanda en espera" : "comandas en espera"}
          </Pastilla>
        )}
        <span className="text-[0.82rem] text-tinta-media">
          {filas.length} {filas.length === 1 ? "cuenta" : "cuentas"} · {formatearGuarani(totalPorCobrar)} por cobrar
        </span>
        {/* Se actualiza sola cada 15 s mientras la pantalla está a la vista, y en el acto al volver a ella. */}
        <RefrescarCada segundos={15} />
      </div>

      <DeliveryCaja cuentas={filas} contexto={contexto} />
    </div>
  );
}
