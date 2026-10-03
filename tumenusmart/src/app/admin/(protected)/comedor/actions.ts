"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal, siguienteNumeroVentaPos, upsertClienteFiscal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { exigirPermiso } from "@/lib/auth";
import { estacionActual } from "@/lib/estacion-actual";
import { registrarBitacora } from "@/lib/bitacora";
import { devolverConsumo } from "@/lib/movimientos-stock";
import { validarPagosDeVenta } from "@/lib/pago-venta";
import { FORMA_PAGO_A_CREDITO } from "@/lib/turno-pos";
import { desglosarIva, formatearNumeroFactura } from "@/lib/factura-pos";
import { crearComprobante, descripcionDeItem } from "@/lib/comprobante";
import { SIN_REGISTRO_FISCAL } from "@/lib/tipo-cliente";
import { calcularDescuento, textoPorcentaje } from "@/lib/descuento-venta";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import {
  ESTADOS_CUENTA_ABIERTA,
  contenidoParaGuardar,
  descuentoDeCuenta,
  textoAnulacion,
  textoCuenta,
  totalDeLineas,
  totalesDeCuenta,
} from "@/lib/comedor";
import { guardarRonda, pistaDelError, type LineaDeRonda } from "@/lib/comedor-servidor";
import { turnoAbierto } from "../pos/turno-actual";

/**
 * Lo que la CAJA hace con la cuenta de una mesa desde el panel (Servicio comedor): cargar productos, cancelar uno o toda la
 * cuenta (con motivo), dar un descuento, imprimir la cuenta (queda "por cobrar": el mozo ya no puede cargarle más), reabrirla
 * y pagarla. El mozo nunca hace nada de esto.
 *
 * Cada acción exige su permiso al empezar y busca la cuenta SOLO dentro del local de la sesión. Todas devuelven un resultado
 * en vez de lanzar, para que la pantalla pueda decir por qué no se pudo (Next.js oculta en producción el mensaje de una
 * excepción de una acción del servidor).
 */

type Resultado = { ok: true } | { ok: false; error: string };

/** Un fallo que se le explica a la persona tal cual (no es un error inesperado). Se lanza dentro de una transacción. */
class ErrorDeUsuario extends Error {}

/** Desde Vercel hasta la base cada consulta tarda: las transacciones largas necesitan más que los 5 s de fábrica. */
const OPCIONES_TX = { timeout: 15_000, maxWait: 10_000 } as const;

const MENSAJE_MOTIVO = "Escribí el motivo (al menos 3 letras).";

/** El motivo escrito por la persona, sin caracteres raros y con tope; null si es muy corto. */
function limpiarMotivo(texto: unknown): string | null {
  const limpio = String(texto ?? "")
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  return limpio.length >= 3 ? limpio : null;
}

function nombreDe(sesion: { nombre?: string | null; email: string }): string {
  return sesion.nombre?.trim() || sesion.email;
}

function textoNoEditable(estado: string): string {
  if (estado === "por_cobrar") return "La cuenta ya está impresa. Reabrila para hacer cambios.";
  return "Esa cuenta ya está cerrada.";
}

function horaDeAhora(): string {
  return new Date().toLocaleString("es-PY", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ZONA_NEGOCIO,
  });
}

function refrescar() {
  revalidatePath("/admin/comedor");
}

// ---------------------------------------------------------------------------------------------------------------------
//  Cancelar productos o la cuenta
// ---------------------------------------------------------------------------------------------------------------------

type ItemParaAnular = {
  id: string;
  cantidad: number;
  nombreProducto: string;
  opcionesTexto: string | null;
  areaImpresionId: string | null;
  consumo: Prisma.JsonValue;
};

/** Lo que descontó un producto al enviarse, tal como quedó guardado (se ignora lo que no tenga la forma esperada). */
function leerConsumo(valor: Prisma.JsonValue): { insumoId: string; almacenId: string | null; cantidad: number }[] {
  if (!Array.isArray(valor)) return [];
  const lista: { insumoId: string; almacenId: string | null; cantidad: number }[] = [];
  for (const x of valor) {
    if (x && typeof x === "object" && !Array.isArray(x)) {
      const o = x as { insumoId?: unknown; almacenId?: unknown; cantidad?: unknown };
      if (typeof o.insumoId === "string" && typeof o.cantidad === "number") {
        lista.push({
          insumoId: o.insumoId,
          almacenId: typeof o.almacenId === "string" ? o.almacenId : null,
          cantidad: o.cantidad,
        });
      }
    }
  }
  return lista;
}

/**
 * Cancela productos de una cuenta, dentro de la transacción de quien llama: los marca (con quién y por qué), devuelve al stock
 * lo que habían descontado y le avisa a su área (Cocina, Barra…) con un papel de "ANULADO" para que no lo preparen.
 */
async function anularItems(
  tx: Prisma.TransactionClient,
  storeId: string,
  cuenta: { id: string; mesa: string },
  items: ItemParaAnular[],
  razon: string,
  quien: string
): Promise<void> {
  const ahora = new Date();
  const hora = horaDeAhora();
  const idsDeAreas = [...new Set(items.map((i) => i.areaImpresionId).filter((a): a is string => !!a))];
  const areas = idsDeAreas.length
    ? await tx.areaImpresion.findMany({ where: { id: { in: idsDeAreas }, storeId }, select: { id: true, nombre: true } })
    : [];
  const nombreDeArea = new Map(areas.map((a) => [a.id, a.nombre]));

  for (const item of items) {
    // La condición va en el update: si otra caja lo canceló en el mismo instante, acá no encuentra nada que marcar.
    const marcado = await tx.itemCuentaMesa.updateMany({
      where: { id: item.id, storeId, cuentaId: cuenta.id, estado: "activo" },
      data: { estado: "anulado", anuladoPor: quien, anuladoEn: ahora, motivoAnulacion: razon },
    });
    if (marcado.count !== 1) throw new ErrorDeUsuario("Ese producto ya estaba cancelado. Actualizá la pantalla.");

    await devolverConsumo(
      tx,
      storeId,
      leerConsumo(item.consumo),
      { cuentaMesaId: cuenta.id },
      `Cancelado: ${item.cantidad} × ${item.nombreProducto} (${razon})`,
      quien
    );

    if (item.areaImpresionId) {
      const area = nombreDeArea.get(item.areaImpresionId) ?? "Comanda";
      await tx.trabajoImpresion.create({
        data: {
          storeId,
          tipo: "anulacion",
          titulo: `Mesa ${cuenta.mesa} · ${area} · anulado`,
          areaImpresionId: item.areaImpresionId,
          contenido: contenidoParaGuardar(
            textoAnulacion({
              mesa: cuenta.mesa,
              area,
              hora,
              quien,
              cantidad: item.cantidad,
              nombre: item.nombreProducto,
              opciones: item.opcionesTexto,
              motivo: razon,
            })
          ),
          cuentaMesaId: cuenta.id,
        },
      });
    }
  }
}

/** Cancela UN producto de una cuenta abierta, con motivo. */
export async function anularProducto(cuentaId: string, itemId: string, motivo: string): Promise<Resultado> {
  const sesion = await exigirPermiso("comedor.gestionar");
  const storeId = await idLocalActual();
  const razon = limpiarMotivo(motivo);
  if (!razon) return { ok: false, error: MENSAJE_MOTIVO };
  const quien = nombreDe(sesion);

  let resumen = "";
  try {
    resumen = await prisma.$transaction(async (tx) => {
      const cuenta = await tx.cuentaMesa.findFirst({
        where: { id: String(cuentaId), storeId },
        select: { id: true, mesa: true, estado: true },
      });
      if (!cuenta) throw new ErrorDeUsuario("No encontré esa cuenta.");
      if (cuenta.estado !== "abierta") throw new ErrorDeUsuario(textoNoEditable(cuenta.estado));
      const item = await tx.itemCuentaMesa.findFirst({
        where: { id: String(itemId), cuentaId: cuenta.id, storeId },
        select: {
          id: true,
          cantidad: true,
          nombreProducto: true,
          opcionesTexto: true,
          areaImpresionId: true,
          consumo: true,
          estado: true,
        },
      });
      if (!item) throw new ErrorDeUsuario("No encontré ese producto.");
      if (item.estado !== "activo") throw new ErrorDeUsuario("Ese producto ya estaba cancelado.");
      await anularItems(tx, storeId, cuenta, [item], razon, quien);
      return `${item.cantidad} × ${item.nombreProducto} de la mesa ${cuenta.mesa}`;
    }, OPCIONES_TX);
  } catch (e) {
    if (e instanceof ErrorDeUsuario) return { ok: false, error: e.message };
    console.error("[comedor] anularProducto falló", e);
    return { ok: false, error: `No se pudo cancelar el producto. (Detalle: ${pistaDelError(e)})` };
  }

  await registrarBitacora(storeId, sesion, {
    modulo: "comedor",
    accion: "producto_cancelado",
    descripcion: `Canceló ${resumen}. Motivo: ${razon}.`,
    entidad: "CuentaMesa",
    entidadId: String(cuentaId),
    detalle: { producto: resumen, motivo: razon },
  });
  refrescar();
  return { ok: true };
}

/** Cancela la cuenta entera (la mesa queda libre): devuelve el stock de todo lo que tenía y avisa a las áreas. */
export async function cancelarCuenta(cuentaId: string, motivo: string): Promise<Resultado> {
  const sesion = await exigirPermiso("comedor.gestionar");
  const storeId = await idLocalActual();
  const razon = limpiarMotivo(motivo);
  if (!razon) return { ok: false, error: MENSAJE_MOTIVO };
  const quien = nombreDe(sesion);

  let resumen = "";
  try {
    resumen = await prisma.$transaction(async (tx) => {
      const cuenta = await tx.cuentaMesa.findFirst({
        where: { id: String(cuentaId), storeId, estado: { in: [...ESTADOS_CUENTA_ABIERTA] } },
        select: { id: true, numero: true, mesa: true },
      });
      if (!cuenta) throw new ErrorDeUsuario("Esa cuenta ya está cerrada.");
      const activos = await tx.itemCuentaMesa.findMany({
        where: { cuentaId: cuenta.id, storeId, estado: "activo" },
        select: {
          id: true,
          cantidad: true,
          nombreProducto: true,
          opcionesTexto: true,
          areaImpresionId: true,
          consumo: true,
        },
      });
      await anularItems(tx, storeId, cuenta, activos, razon, quien);
      // El estado va en la condición: si la pagaron en el mismo instante, no se pisa.
      const cerrada = await tx.cuentaMesa.updateMany({
        where: { id: cuenta.id, storeId, estado: { in: [...ESTADOS_CUENTA_ABIERTA] } },
        data: { estado: "anulada", mesaAbierta: null, cerradaEn: new Date(), cerradaPor: quien, motivoCierre: razon },
      });
      if (cerrada.count !== 1) throw new ErrorDeUsuario("Esa cuenta ya está cerrada.");
      return `la cuenta ${formatearNumero(cuenta.numero)} de la mesa ${cuenta.mesa}`;
    }, OPCIONES_TX);
  } catch (e) {
    if (e instanceof ErrorDeUsuario) return { ok: false, error: e.message };
    console.error("[comedor] cancelarCuenta falló", e);
    return { ok: false, error: `No se pudo cancelar la cuenta. (Detalle: ${pistaDelError(e)})` };
  }

  await registrarBitacora(storeId, sesion, {
    modulo: "comedor",
    accion: "cuenta_cancelada",
    descripcion: `Canceló ${resumen}. Motivo: ${razon}.`,
    entidad: "CuentaMesa",
    entidadId: String(cuentaId),
    detalle: { cuenta: resumen, motivo: razon },
  });
  refrescar();
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------------
//  Descuento
// ---------------------------------------------------------------------------------------------------------------------

export type DatosDescuentoCuenta = { tipo: "porcentaje" | "monto"; valor: number };

/**
 * Pone (o, con `null`, quita) el descuento general de la cuenta. Va con motivo. El monto en guaraníes se calcula acá, sobre lo
 * que vale la cuenta en este momento; si después se cancelan productos, un descuento por porcentaje se ajusta solo.
 */
export async function aplicarDescuento(
  cuentaId: string,
  descuento: DatosDescuentoCuenta | null,
  motivo: string
): Promise<Resultado> {
  const sesion = await exigirPermiso("comedor.gestionar");
  const storeId = await idLocalActual();
  const quien = nombreDe(sesion);

  const razon = descuento ? limpiarMotivo(motivo) : null;
  if (descuento) {
    if (descuento.tipo !== "porcentaje" && descuento.tipo !== "monto") {
      return { ok: false, error: "El descuento no es válido." };
    }
    if (!razon) return { ok: false, error: MENSAJE_MOTIVO };
  }

  let descripcion = "";
  try {
    descripcion = await prisma.$transaction(async (tx) => {
      const cuenta = await tx.cuentaMesa.findFirst({
        where: { id: String(cuentaId), storeId },
        select: { id: true, numero: true, mesa: true, estado: true },
      });
      if (!cuenta) throw new ErrorDeUsuario("No encontré esa cuenta.");
      if (cuenta.estado !== "abierta") throw new ErrorDeUsuario(textoNoEditable(cuenta.estado));

      if (!descuento) {
        await tx.cuentaMesa.update({
          where: { id: cuenta.id },
          data: { descuentoTipo: null, descuentoValor: null, descuentoMotivo: null, descuentoPor: null },
        });
        return `Quitó el descuento de la mesa ${cuenta.mesa}.`;
      }

      const activos = await tx.itemCuentaMesa.findMany({
        where: { cuentaId: cuenta.id, storeId, estado: "activo" },
        select: { cantidad: true, precioUnitario: true },
      });
      const subtotal = totalDeLineas(activos.map((i) => ({ precioUnitario: Number(i.precioUnitario), cantidad: i.cantidad })));
      const calculado = calcularDescuento(subtotal, { tipo: descuento.tipo, valor: Number(descuento.valor) });
      if (!calculado.ok) throw new ErrorDeUsuario(calculado.error);
      if (calculado.monto <= 0) throw new ErrorDeUsuario("Escribí un descuento mayor a cero.");

      await tx.cuentaMesa.update({
        where: { id: cuenta.id },
        data: {
          descuentoTipo: descuento.tipo,
          descuentoValor: Number(descuento.valor),
          descuentoMotivo: razon,
          descuentoPor: quien,
        },
      });
      const cuanto =
        calculado.porcentaje != null
          ? `${textoPorcentaje(calculado.porcentaje)}% (${formatearGuarani(calculado.monto)})`
          : formatearGuarani(calculado.monto);
      return `Dio un descuento de ${cuanto} a la mesa ${cuenta.mesa}. Motivo: ${razon}.`;
    }, OPCIONES_TX);
  } catch (e) {
    if (e instanceof ErrorDeUsuario) return { ok: false, error: e.message };
    console.error("[comedor] aplicarDescuento falló", e);
    return { ok: false, error: `No se pudo guardar el descuento. (Detalle: ${pistaDelError(e)})` };
  }

  await registrarBitacora(storeId, sesion, {
    modulo: "comedor",
    accion: descuento ? "descuento_aplicado" : "descuento_quitado",
    descripcion: descripcion,
    entidad: "CuentaMesa",
    entidadId: String(cuentaId),
    detalle: descuento ? { tipo: descuento.tipo, valor: descuento.valor, motivo: razon } : {},
  });
  refrescar();
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------------
//  Imprimir la cuenta y reabrirla
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Imprime la cuenta para el cliente (no es una factura) en la impresora del ticket de ESTA estación, y la deja "por cobrar":
 * desde ese momento el mozo ya no puede cargarle productos hasta que la caja la reabra. Se puede volver a imprimir.
 */
export async function imprimirCuenta(cuentaId: string): Promise<Resultado> {
  const sesion = await exigirPermiso("comedor.gestionar");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);
  const quien = nombreDe(sesion);

  // La cuenta sale en la impresora del ticket de la estación de esta computadora; sin eso nadie la podría imprimir.
  const estacion = await estacionActual(db);
  if (!estacion) {
    return { ok: false, error: "Esta computadora no está vinculada a una estación. Vinculala en Estaciones para imprimir la cuenta." };
  }
  const datosEstacion = await db.estacion.findUnique({
    where: { id: estacion.id },
    select: { areaTicketId: true, impresoras: { select: { areaImpresionId: true } } },
  });
  const areaTicketId = datosEstacion?.areaTicketId ?? null;
  if (!areaTicketId || !datosEstacion?.impresoras.some((i) => i.areaImpresionId === areaTicketId)) {
    return {
      ok: false,
      error:
        "Esta estación no tiene impresora para el ticket. En Estaciones elegí el “Área del ticket/factura” y asignale una impresora.",
    };
  }

  const local = await prisma.store.findUnique({ where: { id: storeId }, select: { nombre: true } });

  let titulo = "";
  try {
    titulo = await prisma.$transaction(async (tx) => {
      const cuenta = await tx.cuentaMesa.findFirst({
        where: { id: String(cuentaId), storeId, estado: { in: [...ESTADOS_CUENTA_ABIERTA] } },
        include: {
          mozo: { select: { nombre: true, apellido: true } },
          items: { where: { estado: "activo" }, orderBy: [{ ronda: "asc" }, { linea: "asc" }] },
        },
      });
      if (!cuenta) throw new ErrorDeUsuario("Esa cuenta ya está cerrada.");
      if (cuenta.items.length === 0) throw new ErrorDeUsuario("La cuenta no tiene productos para imprimir.");

      const lineas = cuenta.items.map((i) => ({ precioUnitario: Number(i.precioUnitario), cantidad: i.cantidad }));
      const totales = totalesDeCuenta(lineas, descuentoDeCuenta(cuenta));
      if (totales.descuentoInvalido) {
        throw new ErrorDeUsuario(`El descuento ya no corresponde a esta cuenta (${totales.descuentoInvalido}) Quitalo o cambialo.`);
      }

      const ahora = new Date();
      const nombreMozo = [cuenta.mozo.nombre, cuenta.mozo.apellido].filter(Boolean).join(" ");
      const reimpresion = cuenta.estado === "por_cobrar";
      const tituloTrabajo = `Mesa ${cuenta.mesa} · Cuenta${reimpresion ? " (otra copia)" : ""}`;
      await tx.trabajoImpresion.create({
        data: {
          storeId,
          tipo: "ticket",
          titulo: tituloTrabajo,
          areaImpresionId: areaTicketId,
          contenido: contenidoParaGuardar(
            textoCuenta({
              local: local?.nombre ?? "Cuenta",
              mesa: cuenta.mesa,
              numero: cuenta.numero,
              mozo: nombreMozo,
              hora: horaDeAhora(),
              lineas: cuenta.items.map((i) => ({
                cantidad: i.cantidad,
                nombre: i.nombreProducto,
                opciones: i.opcionesTexto,
                precioUnitario: Number(i.precioUnitario),
              })),
              totales,
            })
          ),
          cuentaMesaId: cuenta.id,
        },
      });
      // El estado va en la condición: si la pagaron o cancelaron en el mismo instante, no se pisa.
      const marcada = await tx.cuentaMesa.updateMany({
        where: { id: cuenta.id, storeId, estado: { in: [...ESTADOS_CUENTA_ABIERTA] } },
        data: { estado: "por_cobrar", impresaEn: ahora, impresaPor: quien },
      });
      if (marcada.count !== 1) throw new ErrorDeUsuario("Esa cuenta ya está cerrada.");
      return `${tituloTrabajo} · ${formatearGuarani(totales.total)}`;
    }, OPCIONES_TX);
  } catch (e) {
    if (e instanceof ErrorDeUsuario) return { ok: false, error: e.message };
    console.error("[comedor] imprimirCuenta falló", e);
    return { ok: false, error: `No se pudo imprimir la cuenta. (Detalle: ${pistaDelError(e)})` };
  }

  await registrarBitacora(storeId, sesion, {
    modulo: "comedor",
    accion: "cuenta_impresa",
    descripcion: `Imprimió la cuenta: ${titulo}.`,
    entidad: "CuentaMesa",
    entidadId: String(cuentaId),
    detalle: { cuenta: titulo },
  });
  refrescar();
  return { ok: true };
}

/** Vuelve a abrir una cuenta que ya se había impreso, para que el mozo (o la caja) pueda cargarle más productos. */
export async function reabrirCuenta(cuentaId: string): Promise<Resultado> {
  const sesion = await exigirPermiso("comedor.gestionar");
  const storeId = await idLocalActual();

  const cuenta = await prisma.cuentaMesa.findFirst({
    where: { id: String(cuentaId), storeId },
    select: { id: true, mesa: true, estado: true },
  });
  if (!cuenta) return { ok: false, error: "No encontré esa cuenta." };
  if (cuenta.estado !== "por_cobrar") {
    return { ok: false, error: cuenta.estado === "abierta" ? "Esa cuenta ya está abierta." : "Esa cuenta ya está cerrada." };
  }

  // El estado va en la condición: si justo la pagaron, no se reabre.
  const reabierta = await prisma.cuentaMesa.updateMany({
    where: { id: cuenta.id, storeId, estado: "por_cobrar" },
    data: { estado: "abierta", impresaEn: null, impresaPor: null },
  });
  if (reabierta.count !== 1) return { ok: false, error: "Esa cuenta ya no está impresa. Actualizá la pantalla." };

  await registrarBitacora(storeId, sesion, {
    modulo: "comedor",
    accion: "cuenta_reabierta",
    descripcion: `Reabrió la cuenta de la mesa ${cuenta.mesa} para cargarle más productos.`,
    entidad: "CuentaMesa",
    entidadId: cuenta.id,
    detalle: { mesa: cuenta.mesa },
  });
  refrescar();
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------------
//  Cargar productos desde la caja
// ---------------------------------------------------------------------------------------------------------------------

export type ResultadoCargaCaja =
  | { ok: true; ronda: number; totalEnvio: number; areas: string[]; yaEnviado: boolean }
  | { ok: false; error: string };

/**
 * La caja le carga productos a una cuenta abierta desde el panel (cuando el mozo no está, o el cliente pide algo en la
 * caja). Hace lo mismo que cuando envía el mozo: precio recalculado en el servidor, stock descontado y comanda en la cola.
 */
export async function cargarProductosCaja(
  cuentaId: string,
  datos: { envioId: string; items: LineaDeRonda[] }
): Promise<ResultadoCargaCaja> {
  const sesion = await exigirPermiso("comedor.gestionar");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);
  const quien = nombreDe(sesion);

  const cuenta = await db.cuentaMesa.findFirst({
    where: { id: String(cuentaId) },
    select: { id: true, mesa: true, mozoId: true, estado: true },
  });
  if (!cuenta) return { ok: false, error: "No encontré esa cuenta." };
  if (cuenta.estado !== "abierta") return { ok: false, error: textoNoEditable(cuenta.estado) };

  const r = await guardarRonda({
    storeId,
    mesa: cuenta.mesa,
    comensales: null,
    envioId: String(datos?.envioId ?? ""),
    items: Array.isArray(datos?.items) ? datos.items : [],
    mozoId: cuenta.mozoId,
    quien: `Caja - ${quien}`,
    cargadoPor: quien,
    detalleTecnico: true,
    cuentaId: cuenta.id,
  });
  if (!r.ok) return r;

  if (!r.yaEnviado) {
    await registrarBitacora(storeId, sesion, {
      modulo: "comedor",
      accion: "productos_cargados_en_caja",
      descripcion: `Cargó el pedido ${r.ronda} en la mesa ${r.mesa} desde la caja (${formatearGuarani(r.totalEnvio)}).`,
      entidad: "CuentaMesa",
      entidadId: r.cuentaId,
      detalle: { cuenta: r.cuentaNumero, mesa: r.mesa, ronda: r.ronda, total: r.totalEnvio },
    });
  }
  refrescar();
  return { ok: true, ronda: r.ronda, totalEnvio: r.totalEnvio, areas: r.areas, yaEnviado: r.yaEnviado };
}

// ---------------------------------------------------------------------------------------------------------------------
//  Pagar la cuenta
// ---------------------------------------------------------------------------------------------------------------------

export type DatosCobroCuenta = {
  /** Cómo paga el cliente: una forma, o varias si divide el pago (ver validarPagosDeVenta). */
  pagos: { forma: string; monto: number }[];
  /** "ticket" | "factura": factura solo si la estación tiene un punto de expedición vigente. */
  comprobanteTipo: string;
  facturaTipoIdentificacion?: string;
  facturaNumeroIdentificacion?: string;
  facturaRazonSocial?: string;
  facturaEmail?: string;
};

export type ResultadoPagoCuenta = { ok: true; ventaId: string; total: number } | { ok: false; error: string };

/**
 * Cobra la cuenta y la cierra: genera una venta del Punto de Venta (entra en el turno de caja de ESTA estación, en el cierre
 * y en todos los reportes) con la misma regla de factura o ticket que el mostrador, según el punto de expedición de la
 * estación. El stock NO se vuelve a descontar: ya bajó cuando se envió cada pedido. Los precios son los que quedaron en la
 * cuenta (los recalculó el servidor al enviarse); lo único que llega del navegador es cómo se paga y los datos de la factura.
 */
export async function pagarCuenta(cuentaId: string, datos: DatosCobroCuenta): Promise<ResultadoPagoCuenta> {
  await exigirPermiso("comedor.gestionar");
  const sesion = await exigirPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);
  const registradoPor = nombreDe(sesion);

  // La estación de esta computadora y su turno de caja abierto: la venta entra ahí.
  const estacion = await estacionActual(db);
  if (!estacion) {
    return { ok: false, error: "Esta computadora no está vinculada a una estación. Vinculala en Estaciones para poder cobrar." };
  }
  const turno = await turnoAbierto(db, estacion.id);
  if (!turno) {
    return { ok: false, error: "No hay un turno de caja abierto en esta estación. Abrilo en Punto de venta y volvé a cobrar." };
  }
  const puntoExpedicion = (
    await db.estacion.findUnique({ where: { id: estacion.id }, select: { puntoExpedicion: true } })
  )?.puntoExpedicion ?? null;
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { facturaObligatoria: true } });

  // ------------------------------------------------------------ factura o ticket (mismas reglas que el mostrador)
  const esFactura = datos?.comprobanteTipo === "factura";
  const esSinRegistroFiscal = datos?.facturaTipoIdentificacion === SIN_REGISTRO_FISCAL.tipo;
  const facturaObligatoria = store?.facturaObligatoria ?? false;
  const puntoVigente = !!puntoExpedicion && puntoExpedicion.activo && puntoExpedicion.timbradoHasta > new Date();

  if (facturaObligatoria) {
    if (!puntoVigente) {
      return {
        ok: false,
        error:
          "Este local exige facturar todas las ventas y esta estación no tiene un punto de expedición vigente asignado. Pedile al dueño que lo asigne en Puntos de expedición.",
      };
    }
    if (!esFactura) return { ok: false, error: "Este local exige facturar todas las ventas — no se puede cobrar como ticket." };
  }
  if (esFactura) {
    if (!datos.facturaTipoIdentificacion) return { ok: false, error: "Elegí con o sin registro fiscal." };
    if (!esSinRegistroFiscal && (!datos.facturaNumeroIdentificacion?.trim() || !datos.facturaRazonSocial?.trim())) {
      return { ok: false, error: "Para factura con registro fiscal hacen falta el número y la razón social." };
    }
    if (!esSinRegistroFiscal && datos.facturaEmail?.trim() && !datos.facturaEmail.includes("@")) {
      return { ok: false, error: "El correo electrónico no es válido." };
    }
    if (!puntoExpedicion) {
      return {
        ok: false,
        error:
          "Esta estación no tiene un punto de expedición asignado. Cobrá como ticket, o pedile al dueño que lo asigne en Estaciones.",
      };
    }
    if (!puntoExpedicion.activo || puntoExpedicion.timbradoHasta < new Date()) {
      return { ok: false, error: "El timbrado de este punto de expedición está vencido. No se puede emitir factura." };
    }
  }

  // ------------------------------------------------------------------------- la cuenta y lo que vale
  const cuenta = await db.cuentaMesa.findFirst({
    where: { id: String(cuentaId), estado: { in: [...ESTADOS_CUENTA_ABIERTA] } },
    include: { items: { where: { estado: "activo" }, orderBy: [{ ronda: "asc" }, { linea: "asc" }] } },
  });
  if (!cuenta) return { ok: false, error: "Esa cuenta ya está cerrada." };
  if (cuenta.items.length === 0) return { ok: false, error: "La cuenta no tiene productos para cobrar." };

  const filas = cuenta.items.map((i) => ({
    productId: i.productId,
    nombreProducto: i.nombreProducto,
    cantidad: i.cantidad,
    precioUnitario: Number(i.precioUnitario),
    iva: i.iva,
    opcionesTexto: i.opcionesTexto,
    costoProducto: i.costoProducto == null ? null : Number(i.costoProducto),
    costoAgregados: i.costoAgregados == null ? null : Number(i.costoAgregados),
    precioAgregados: Number(i.precioAgregados),
  }));
  const totales = totalesDeCuenta(filas, descuentoDeCuenta(cuenta));
  if (totales.descuentoInvalido) {
    return { ok: false, error: `El descuento ya no corresponde a esta cuenta (${totales.descuentoInvalido}) Quitalo o cambialo.` };
  }
  const total = totales.total;
  if (total <= 0) return { ok: false, error: "El total tiene que ser mayor a cero." };

  // Una cuenta de mesa no se cobra a crédito (por ahora): pide un cliente al que cobrarle después, y eso no está acá.
  if (Array.isArray(datos?.pagos) && datos.pagos.some((p) => String(p?.forma ?? "").trim().toLowerCase() === FORMA_PAGO_A_CREDITO)) {
    return { ok: false, error: "Las cuentas de mesa todavía no se pueden cobrar a crédito. Elegí otra forma de pago." };
  }
  const pagosValidados = validarPagosDeVenta(datos?.pagos, total);
  if (!pagosValidados.ok) return { ok: false, error: pagosValidados.error };

  // Para la factura, cada línea lleva su unidad de medida y si es un servicio.
  const idsDeProductos = [...new Set(filas.flatMap((f) => (f.productId ? [f.productId] : [])))];
  const datosProductos = esFactura && idsDeProductos.length
    ? await db.product.findMany({ where: { id: { in: idsDeProductos } }, select: { id: true, unidadMedida: true, esServicio: true } })
    : [];
  const unidadDelProducto = new Map(datosProductos.map((p) => [p.id, p.unidadMedida]));
  const esServicioElProducto = new Map(datosProductos.map((p) => [p.id, p.esServicio]));

  const numero = await siguienteNumeroVentaPos(storeId);
  const notaVenta = `Mesa ${cuenta.mesa} · Cuenta ${formatearNumero(cuenta.numero)}`;

  let ventaId = "";
  try {
    ventaId = await prisma.$transaction(async (tx) => {
      // Primero se cierra la cuenta, con el estado en la condición: si otra caja la cobró (o se canceló) en el mismo
      // instante, acá no encuentra nada, se deshace todo y no queda una factura de más.
      const cerrada = await tx.cuentaMesa.updateMany({
        where: { id: cuenta.id, storeId, estado: { in: [...ESTADOS_CUENTA_ABIERTA] } },
        data: { estado: "pagada", mesaAbierta: null, cerradaEn: new Date(), cerradaPor: registradoPor },
      });
      if (cerrada.count !== 1) throw new ErrorDeUsuario("Esa cuenta ya fue cobrada o cancelada. Actualizá la pantalla.");

      let datosFactura: Record<string, unknown> = { comprobanteTipo: "ticket" };
      let correlativoFactura: number | null = null;

      if (esFactura && puntoExpedicion) {
        if (!esSinRegistroFiscal) {
          await upsertClienteFiscal(tx, storeId, {
            tipoIdentificacion: datos.facturaTipoIdentificacion!,
            numeroIdentificacion: datos.facturaNumeroIdentificacion!.trim(),
            razonSocial: datos.facturaRazonSocial!.trim(),
            email: datos.facturaEmail?.trim() ?? "",
          });
        }
        // Atómico: se incrementa PRIMERO y se usa el valor ya incrementado (dos cobros a la vez no toman el mismo número).
        const peActualizado = await tx.puntoExpedicion.update({
          where: { id: puntoExpedicion.id },
          data: { ultimoNumeroFactura: { increment: 1 } },
          select: { ultimoNumeroFactura: true },
        });
        correlativoFactura = peActualizado.ultimoNumeroFactura;
        const desglose = desglosarIva(filas, totales.descuento);
        datosFactura = {
          comprobanteTipo: "factura",
          facturaTipoIdentificacion: datos.facturaTipoIdentificacion,
          facturaRazonSocial: esSinRegistroFiscal ? null : datos.facturaRazonSocial!.trim(),
          facturaRuc: esSinRegistroFiscal ? SIN_REGISTRO_FISCAL.numero : datos.facturaNumeroIdentificacion!.trim(),
          facturaNumero: formatearNumeroFactura(
            puntoExpedicion.establecimiento,
            puntoExpedicion.puntoExpedicion,
            peActualizado.ultimoNumeroFactura
          ),
          facturaTimbrado: puntoExpedicion.numeroTimbrado,
          facturaVencimiento: puntoExpedicion.timbradoHasta,
          facturaGravado10: desglose.gravado10,
          facturaGravado5: desglose.gravado5,
          facturaExento: desglose.exento,
          facturaIva10: desglose.iva10,
          facturaIva5: desglose.iva5,
          facturaRazonSocialEmisor: puntoExpedicion.razonSocialEmisor,
          facturaRucEmisor: puntoExpedicion.rucEmisor,
        };
      }

      const venta = await tx.ventaPos.create({
        data: {
          storeId,
          turnoPosId: turno.id,
          numero,
          formaPago: pagosValidados.formaPago,
          pagos: {
            create: pagosValidados.pagos.map((p, i) => ({ storeId, forma: p.forma, monto: p.monto, orden: i })),
          },
          total,
          descuento: totales.descuento,
          descuentoPorcentaje: totales.porcentaje,
          registradoPor,
          clienteNombre: esFactura && !esSinRegistroFiscal ? datos.facturaRazonSocial!.trim() : null,
          tipoEntrega: "local",
          nota: notaVenta,
          ...datosFactura,
          items: {
            create: filas.map((f) => ({
              storeId,
              productId: f.productId,
              nombreProducto: f.nombreProducto,
              cantidad: f.cantidad,
              precioUnitario: f.precioUnitario,
              iva: f.iva,
              opcionesTexto: f.opcionesTexto,
              costoProducto: f.costoProducto,
              costoAgregados: f.costoAgregados,
              precioAgregados: f.precioAgregados,
            })),
          },
        },
        select: { id: true },
      });

      if (esFactura && puntoExpedicion && correlativoFactura !== null) {
        await crearComprobante(tx, {
          storeId,
          origen: { ventaPosId: venta.id },
          punto: puntoExpedicion,
          correlativo: correlativoFactura,
          receptor: {
            tipoIdentificacion: datos.facturaTipoIdentificacion!,
            numeroIdentificacion: esSinRegistroFiscal ? SIN_REGISTRO_FISCAL.numero : datos.facturaNumeroIdentificacion!.trim(),
            razonSocial: esSinRegistroFiscal ? null : datos.facturaRazonSocial!.trim(),
            email: esSinRegistroFiscal ? null : datos.facturaEmail?.trim() || null,
          },
          presencia: "presencial",
          condicion: "contado",
          fechaVencimientoCredito: null,
          items: filas.map((f) => ({
            productId: f.productId ?? null,
            descripcion: descripcionDeItem(f.nombreProducto, f.opcionesTexto ?? undefined),
            unidadMedida: f.productId ? (unidadDelProducto.get(f.productId) ?? null) : null,
            // Un combo mitad y mitad (sin producto único) es comida: mercadería.
            esServicio: f.productId ? (esServicioElProducto.get(f.productId) ?? false) : false,
            cantidad: f.cantidad,
            precioUnitario: f.precioUnitario,
            iva: f.iva,
          })),
          descuento: totales.descuento,
          emitidoPor: registradoPor,
        });
      }

      await tx.cuentaMesa.update({ where: { id: cuenta.id }, data: { ventaPosId: venta.id } });
      return venta.id;
    }, OPCIONES_TX);
  } catch (e) {
    if (e instanceof ErrorDeUsuario) return { ok: false, error: e.message };
    console.error("[comedor] pagarCuenta falló", e);
    return {
      ok: false,
      error: `No se pudo confirmar el cobro. Antes de volver a intentar, fijate en el Historial de cuentas si la venta quedó registrada. (Detalle: ${pistaDelError(e)})`,
    };
  }

  await registrarBitacora(storeId, sesion, {
    modulo: "comedor",
    accion: "cuenta_pagada",
    descripcion: `Cobró la cuenta ${formatearNumero(cuenta.numero)} de la mesa ${cuenta.mesa} por ${formatearGuarani(total)}${
      esFactura ? " con factura" : " con ticket"
    }${totales.descuento > 0 ? `, con un descuento de ${formatearGuarani(totales.descuento)}` : ""}.`,
    entidad: "VentaPos",
    entidadId: ventaId,
    detalle: {
      cuenta: formatearNumero(cuenta.numero),
      mesa: cuenta.mesa,
      subtotal: totales.subtotal,
      descuento: totales.descuento,
      total,
      comprobante: esFactura ? "factura" : "ticket",
    },
  });

  revalidatePath("/admin/comedor");
  revalidatePath("/admin/pos");
  revalidatePath("/admin/pos/cuentas");
  return { ok: true, ventaId, total };
}
