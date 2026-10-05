import { pantallaConPermiso } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { prisma } from "@/lib/prisma";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { estacionActual } from "@/lib/estacion-actual";
import { diasParaVencer } from "@/lib/factura-pos";
import { cargarCatalogoDeVenta } from "@/lib/catalogo-venta";
import { formatearGuarani } from "@/lib/format";
import {
  ESTADOS_CUENTA_ABIERTA,
  SEGUNDOS_LATIDO_IMPRESION,
  claveDeMesa,
  descuentoDeCuenta,
  totalesDeCuenta,
} from "@/lib/comedor";
import { BotonEnlace, Cabecera, Pastilla } from "@/components/ui";
import { RefrescarCada } from "@/components/RefrescarCada";
import { turnoAbierto } from "../pos/turno-actual";
import { ComedorCaja, type ContextoCaja, type CuentaCajaFila } from "./ComedorCaja";

export const dynamic = "force-dynamic";

/**
 * Servicio comedor: las cuentas de las mesas, con lo que cargaron los mozos, y desde acá la caja las opera: carga productos,
 * cancela con motivo, da descuento, imprime la cuenta (queda por cobrar), la reabre y la cobra. A la izquierda la lista de
 * mesas; con doble clic en una se abre su detalle a la derecha. Se actualiza solo.
 */
export default async function ComedorPage() {
  const sesion = await pantallaConPermiso("comedor.ver");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);
  const puedeGestionar = puede(sesion.rol, "comedor.gestionar");
  const puedeCobrar = puedeGestionar && puede(sesion.rol, "pos.vender");

  const desdeLatido = new Date(Date.now() - SEGUNDOS_LATIDO_IMPRESION * 1000);
  const [cuentas, enEspera, imprimiendo] = await Promise.all([
    db.cuentaMesa.findMany({
      where: { estado: { in: [...ESTADOS_CUENTA_ABIERTA] } },
      orderBy: { abiertaEn: "asc" },
      include: {
        mozo: { select: { nombre: true, apellido: true } },
        items: {
          orderBy: [{ ronda: "asc" }, { linea: "asc" }],
          include: { mozo: { select: { nombre: true, apellido: true } } },
        },
      },
    }),
    db.trabajoImpresion.count({ where: { estado: { in: ["pendiente", "imprimiendo"] } } }),
    db.estacion.findFirst({ where: { impresionVistaEn: { gte: desdeLatido } }, select: { id: true } }),
  ]);

  const nombre = (m: { nombre: string; apellido: string | null }) => [m.nombre, m.apellido].filter(Boolean).join(" ");

  const filas = cuentas.map((c): CuentaCajaFila => {
    const activos = c.items.filter((i) => i.estado === "activo");
    const totales = totalesDeCuenta(
      activos.map((i) => ({ precioUnitario: Number(i.precioUnitario), cantidad: i.cantidad })),
      descuentoDeCuenta(c)
    );
    return {
      id: c.id,
      numero: c.numero,
      mesa: c.mesa,
      estado: c.estado,
      mozo: nombre(c.mozo),
      mozoId: c.mozoId,
      abiertaEn: c.abiertaEn.toISOString(),
      comensales: c.comensales,
      impresaEn: c.impresaEn ? c.impresaEn.toISOString() : null,
      descuento: descuentoDeCuenta(c)
        ? {
            tipo: c.descuentoTipo === "porcentaje" ? "porcentaje" : "monto",
            valor: Number(c.descuentoValor),
            motivo: c.descuentoMotivo ?? "",
            por: c.descuentoPor ?? "",
          }
        : null,
      totales,
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
        mozo: nombre(i.mozo),
      })),
    };
  });
  const totalAbierto = filas.reduce((s, f) => s + f.totales.total, 0);

  // ---------------------------------------------------------------- lo que hace falta para operar desde esta computadora
  let contexto: ContextoCaja = {
    puedeGestionar,
    puedeCobrar,
    categorias: [],
    gruposMitad: [],
    apertura: { mozos: [], mesas: [], sectores: [], mesasOcupadas: [] },
    imprimirCuenta: { ok: false, motivo: "" },
    cobro: { ok: false, motivo: "" },
  };

  if (puedeGestionar) {
    const estacion = await estacionActual(db);
    const catalogo = await cargarCatalogoDeVenta(db);

    // Para abrir una cuenta desde la caja: los mozos (el que se elige es simbólico), las mesas del salón y cuáles están ocupadas.
    const [mozos, mesasCargadas, sectores] = await Promise.all([
      db.mozo.findMany({
        where: { activo: true },
        orderBy: [{ nombre: "asc" }, { apellido: "asc" }],
        select: { id: true, nombre: true, apellido: true },
      }),
      db.mesaComedor.findMany({
        where: { activa: true },
        orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
        select: { nombre: true, clave: true, sectorId: true },
      }),
      db.sectorComedor.findMany({ orderBy: [{ orden: "asc" }, { createdAt: "asc" }], select: { id: true, nombre: true } }),
    ]);
    const ocupadas = new Set(cuentas.map((c) => claveDeMesa(c.mesa)));
    contexto = {
      ...contexto,
      categorias: catalogo.categorias,
      gruposMitad: catalogo.gruposMitad,
      apertura: {
        mozos: mozos.map((m) => ({ id: m.id, nombre: nombre(m) })),
        mesas: mesasCargadas.map((m) => ({ nombre: m.nombre, sectorId: m.sectorId, ocupada: ocupadas.has(m.clave) })),
        sectores,
        mesasOcupadas: cuentas.map((c) => c.mesa),
      },
    };

    if (!estacion) {
      const motivo = "Esta computadora no está vinculada a una estación. Vinculala en Estaciones.";
      contexto = { ...contexto, imprimirCuenta: { ok: false, motivo }, cobro: { ok: false, motivo } };
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
        titulo="Servicio comedor"
        bajada="Las mesas abiertas y lo que cargaron los mozos. Se actualiza solo."
        acciones={
          <>
            {puedeGestionar && (
              <BotonEnlace href="/admin/impresion" tono="navegar" tam="md">
                Impresión automática
              </BotonEnlace>
            )}
            {/* Sin acceso directo a la configuración del comedor: es de administración y se llega desde Ajustes, no desde la
                pantalla donde trabaja el personal. */}
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
          {filas.length} {filas.length === 1 ? "mesa abierta" : "mesas abiertas"} · {formatearGuarani(totalAbierto)} en cuentas
        </span>
        {/* Se actualiza sola cada 15 s mientras la pantalla está a la vista, y en el acto al volver a ella. No muestra nada: sin
            `generadoEn` no dibuja el contador "Actualizado hace N s" (ese se activa pasándole `generadoEn`, si hiciera falta). */}
        <RefrescarCada segundos={15} />
      </div>

      <ComedorCaja cuentas={filas} contexto={contexto} />
    </div>
  );
}
