"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import type { ItemCuentaDelivery, Prisma } from "@prisma/client";
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
import { anularComprobantes, crearComprobante, descripcionDeItem } from "@/lib/comprobante";
import { esElectronico } from "@/lib/modalidad-punto";
import { ErrorFacturaElectronica, problemaParaEmitirElectronico } from "@/lib/sifen/servidor";
import { SIN_REGISTRO_FISCAL } from "@/lib/tipo-cliente";
import { limpiarTexto, validarDatosFiscales } from "@/lib/datos-fiscales";
import { extraerUbicacion } from "@/lib/ubicacion-mapa";
import { calcularDescuento, textoPorcentaje } from "@/lib/descuento-venta";
import { resolverDescuentoConTipos } from "@/lib/tipos-descuento";
import { cargarTiposDescuento } from "@/lib/tipos-descuento-servidor";
import { exigirAutorizacion } from "@/lib/seguridad-servidor";
import { claveDiaAsuncion } from "@/lib/timezone";
import { formatearCantidad, formatearGuarani, formatearNumero } from "@/lib/format";
import { repartirConsumo } from "@/lib/division-cuenta";
import { cortesiasSobrantes } from "@/lib/promociones";
import { cargarPromocionesEnTransaccion } from "@/lib/promociones-servidor";
import {
  contenidoParaGuardar,
  descuentoDeCuenta,
  leerConsumoGuardado,
  lineasDeCobro,
  textoAnulacion,
  totalDeLineas,
} from "@/lib/comedor";
import {
  ENVIO_MAXIMO,
  ESTADOS_DELIVERY_ABIERTA,
  LARGO_DELIVERY,
  NOMBRE_LINEA_ENVIO,
  lineaDeEnvio,
  nombreDeCuentaDelivery,
  totalesDeDelivery,
} from "@/lib/delivery";
import { encolarCuentaDelivery, guardarRondaDelivery } from "@/lib/delivery-servidor";
import { ErrorDeUsuario, horaDeAhora, pistaDelError, type LineaDeRonda } from "@/lib/comedor-servidor";
import { turnoAbierto } from "../pos/turno-actual";

/**
 * Lo que la CAJA hace con las cuentas de delivery: abrir la cuenta con los datos del cliente y su dirección, cargarle productos,
 * cancelar uno (con motivo), dar un descuento, imprimirla (queda "por cobrar"), reabrirla, asignarle repartidor, marcar cuándo sale y
 * cuándo llega, y cobrarla. Es el espejo de las acciones del Servicio comedor, con las tablas del delivery.
 *
 * Cada acción exige su permiso al empezar y busca la cuenta SOLO dentro del local de la sesión. Todas devuelven un resultado en
 * vez de lanzar, para que la pantalla pueda decir por qué no se pudo (Next.js oculta en producción el mensaje de una excepción
 * de una acción del servidor).
 */

/** `requiereClave`: la acción está protegida (Ajustes → Seguridad) y falta la contraseña de un usuario autorizado, o no es correcta. */
type Resultado = { ok: true } | { ok: false; error: string; requiereClave?: true };

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

function refrescar() {
  revalidatePath("/admin/delivery");
}

function recortar(valor: string | undefined, max: number): string | undefined {
  const limpio = valor?.trim();
  return limpio ? limpio.slice(0, max) : undefined;
}

// ---------------------------------------------------------------------------------------------------------------------
//  Buscar al cliente
// ---------------------------------------------------------------------------------------------------------------------

export type ClienteFiscalEncontrado = {
  tipoIdentificacion: string;
  numeroIdentificacion: string;
  razonSocial: string;
  email: string | null;
};

export type ResultadoBuscarClienteDelivery =
  | {
      ok: true;
      nombre: string;
      /** Los datos de la última factura con registro fiscal de este cliente (para completarlos), o null. */
      facturaAnterior: ClienteFiscalEncontrado | null;
    }
  | { ok: false };

/**
 * Cuando se busca el teléfono: si ya es cliente del local, devuelve su nombre y los datos de su última factura con registro fiscal,
 * para que un cliente recurrente no tenga que cargarse de nuevo. Solo lee; nunca crea nada.
 *
 * A propósito NO devuelve la dirección, la zona ni el costo de envío de cuentas anteriores (regla del dueño): un mismo cliente pide
 * desde varios lugares, y arrastrar el de la vez pasada es mandar el pedido a otro lado y cobrar mal el envío. La dirección (el enlace
 * de Google Maps que manda el cliente), la zona y el costo se cargan SIEMPRE a mano, en cada cuenta.
 */
export async function buscarClienteDelivery(telefono: string): Promise<ResultadoBuscarClienteDelivery> {
  await exigirPermiso("delivery.gestionar");
  const db = prismaDelLocal(await idLocalActual());

  const numero = String(telefono ?? "").trim().slice(0, LARGO_DELIVERY.telefono);
  if (!numero) return { ok: false };

  const [cliente, anteriores] = await Promise.all([
    db.customer.findFirst({ where: { telefono: numero }, select: { nombre: true } }),
    db.cuentaDelivery.findMany({
      where: { clienteTelefono: numero, estado: { not: "anulada" } },
      orderBy: { abiertaEn: "desc" },
      take: 10,
      select: {
        clienteNombre: true,
        facturaTipoIdentificacion: true,
        facturaRuc: true,
        facturaRazonSocial: true,
        facturaEmail: true,
      },
    }),
  ]);
  if (!cliente && anteriores.length === 0) return { ok: false };

  const conFicha = anteriores.find((c) => c.facturaRuc && c.facturaRazonSocial);
  return {
    ok: true,
    nombre: cliente?.nombre ?? anteriores[0]?.clienteNombre ?? "",
    facturaAnterior:
      conFicha?.facturaRuc && conFicha.facturaRazonSocial
        ? {
            tipoIdentificacion: conFicha.facturaTipoIdentificacion ?? "ruc",
            numeroIdentificacion: conFicha.facturaRuc,
            razonSocial: conFicha.facturaRazonSocial,
            email: conFicha.facturaEmail,
          }
        : null,
  };
}

/**
 * La lupa del número de documento (RUC, cédula…): busca si el cliente ya existe en el sistema, para traer su razón social y su
 * correo en vez de volver a tipearlos. Solo busca en los clientes de ESTE local y devuelve unos pocos; nunca crea nada.
 */
export async function buscarClienteFiscalPorNumero(numero: string): Promise<ClienteFiscalEncontrado[]> {
  await exigirPermiso("delivery.gestionar");
  const db = prismaDelLocal(await idLocalActual());

  const texto = limpiarTexto(numero);
  if (texto.length < 3 || texto.length > LARGO_DELIVERY.documento) return [];

  const filas = await db.customer.findMany({
    where: { numeroIdentificacion: { contains: texto, mode: "insensitive" } },
    orderBy: { nombre: "asc" },
    select: { tipoIdentificacion: true, numeroIdentificacion: true, nombre: true, email: true },
    take: 6,
  });
  return filas.flatMap((f) =>
    f.numeroIdentificacion
      ? [
          {
            tipoIdentificacion: f.tipoIdentificacion ?? "ruc",
            numeroIdentificacion: f.numeroIdentificacion,
            razonSocial: f.nombre,
            email: f.email,
          },
        ]
      : []
  );
}

// ---------------------------------------------------------------------------------------------------------------------
//  Abrir una cuenta y cambiar sus datos
// ---------------------------------------------------------------------------------------------------------------------

/** Lo que se escribe en el formulario de la cuenta: el cliente, su dirección y el envío. */
export type DatosCuentaDelivery = {
  clienteNombre: string;
  clienteTelefono: string;
  /** Los datos de factura del cliente, si los dio (número, tipo, razón social y correo). Opcionales. */
  clienteFiscal?: { tipoIdentificacion: string; numeroIdentificacion: string; razonSocial: string; email?: string };
  /** La dirección escrita, o el enlace de Google Maps que mandó el cliente (se pega tal cual). */
  direccion: string;
  /** La zona de envío elegida. Sin zona hay que decir `aCoordinar` a propósito: así el envío nunca queda en 0 por olvido. */
  deliveryZoneId?: string;
  aCoordinar?: boolean;
  /** Lo que se cobra de envío, acordado con el cliente. Si no viene, se usa el de la zona (o 0). */
  costoEnvio?: number;
  notas?: string;
};

type DatosValidados = {
  nombre: string;
  telefono: string;
  ficha: { tipoIdentificacion: string; numeroIdentificacion: string; razonSocial: string | null; email: string | null } | null;
  direccion: string;
  ubicacion: { lat: number; lng: number } | null;
  zonaId: string | null;
  zonaNombre: string;
  costoZona: number;
  costoEnvio: number;
  notas: string | null;
};

/** Revisa lo que escribió la caja (en el servidor, no solo en la pantalla) y lo deja limpio para guardar. */
async function validarDatosDeCuenta(
  db: ReturnType<typeof prismaDelLocal>,
  datos: DatosCuentaDelivery
): Promise<{ ok: true; v: DatosValidados } | { ok: false; error: string }> {
  const nombre = recortar(datos?.clienteNombre, LARGO_DELIVERY.nombre);
  const telefono = recortar(datos?.clienteTelefono, LARGO_DELIVERY.telefono);
  if (!nombre || !telefono) return { ok: false, error: "Cargá el nombre y el teléfono del cliente." };

  const direccion = recortar(datos?.direccion, LARGO_DELIVERY.direccion);
  if (!direccion) return { ok: false, error: "Cargá la dirección: es lo que ve el repartidor. Podés pegar el enlace de Google Maps." };
  // La dirección puede ser el enlace de Google Maps con la ubicación del cliente (llega por WhatsApp): se leen sus coordenadas.
  const ubicacion = extraerUbicacion(direccion);

  // La ficha de factura del cliente: solo si trae algo escrito, y revisada con la misma validación mínima de la factura (el RUC con
  // su dígito, razón social de al menos 4 letras, correo con forma de correo).
  let ficha: DatosValidados["ficha"] = null;
  const cf = datos?.clienteFiscal;
  if (cf && (limpiarTexto(cf.numeroIdentificacion) || limpiarTexto(cf.razonSocial))) {
    const revisada = validarDatosFiscales({
      modo: "con_registro",
      tipoIdentificacion: cf.tipoIdentificacion,
      numeroIdentificacion: cf.numeroIdentificacion,
      razonSocial: cf.razonSocial,
      email: cf.email,
    });
    if (!revisada.ok) return { ok: false, error: `Datos de factura del cliente: ${revisada.error}` };
    ficha = revisada.datos;
  }

  let zonaId: string | null = null;
  let zonaNombre = "A coordinar";
  let costoZona = 0;
  if (datos?.deliveryZoneId && !datos.aCoordinar) {
    const zona = await db.deliveryZone.findFirst({ where: { id: String(datos.deliveryZoneId), activo: true } });
    if (!zona) return { ok: false, error: "La zona de envío que elegiste ya no existe. Elegí otra." };
    zonaId = zona.id;
    zonaNombre = zona.nombre;
    costoZona = Number(zona.costoEnvio);
  } else if (!datos?.aCoordinar) {
    return { ok: false, error: "Elegí la zona de envío. Si todavía no se sabe, elegí “A coordinar”." };
  }

  let costoEnvio = costoZona;
  if (datos?.costoEnvio !== undefined) {
    if (!Number.isFinite(datos.costoEnvio) || datos.costoEnvio < 0 || datos.costoEnvio > ENVIO_MAXIMO) {
      return { ok: false, error: "El costo de envío no es válido." };
    }
    costoEnvio = Math.round(datos.costoEnvio);
  }

  return {
    ok: true,
    v: {
      nombre,
      telefono,
      ficha,
      direccion,
      ubicacion,
      zonaId,
      zonaNombre,
      costoZona,
      costoEnvio,
      notas: recortar(datos?.notas, LARGO_DELIVERY.notas) ?? null,
    },
  };
}

export type ResultadoAbrirCuentaDelivery =
  | { ok: true; cuentaId: string; cuentaNumero: number }
  | { ok: false; error: string };

/**
 * Abre la cuenta de un delivery: el cliente, su dirección, la zona y el envío (y, si ya los dio, sus datos de factura). La cuenta
 * nace SIN productos: la pantalla abre enseguida la carta para cargárselos (con `cargarProductosDelivery`). Mientras tanto la cuenta
 * está abierta; no se cobra ni se factura nada hasta el final. Pueden estar abiertas varias a la vez.
 */
export async function abrirCuentaDelivery(datos: DatosCuentaDelivery): Promise<ResultadoAbrirCuentaDelivery> {
  const sesion = await exigirPermiso("delivery.gestionar");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const r = await validarDatosDeCuenta(db, datos);
  if (!r.ok) return r;
  const v = r.v;

  let cuenta: { id: string; numero: number };
  try {
    cuenta = await prisma.$transaction(async (tx) => {
      // El cliente es de este local: cada negocio tiene su propia ficha de esa persona.
      const customer = await tx.customer.upsert({
        where: { storeId_telefono: { storeId, telefono: v.telefono } },
        update: { nombre: v.nombre },
        create: { storeId, nombre: v.nombre, telefono: v.telefono },
      });
      // El cliente con datos fiscales (la ficha) queda guardado, o se le actualiza el nombre y el correo, para la próxima vez.
      if (v.ficha?.razonSocial) {
        await upsertClienteFiscal(tx, storeId, {
          tipoIdentificacion: v.ficha.tipoIdentificacion,
          numeroIdentificacion: v.ficha.numeroIdentificacion,
          razonSocial: v.ficha.razonSocial,
          email: v.ficha.email ?? "",
        });
      }
      const { contadorCuentasDelivery } = await tx.store.update({
        where: { id: storeId },
        data: { contadorCuentasDelivery: { increment: 1 } },
        select: { contadorCuentasDelivery: true },
      });
      return tx.cuentaDelivery.create({
        data: {
          storeId,
          numero: contadorCuentasDelivery,
          customerId: customer.id,
          clienteNombre: v.nombre,
          clienteTelefono: v.telefono,
          facturaTipoIdentificacion: v.ficha?.tipoIdentificacion,
          facturaRuc: v.ficha?.numeroIdentificacion,
          facturaRazonSocial: v.ficha?.razonSocial,
          facturaEmail: v.ficha?.email,
          direccion: v.direccion,
          clienteLat: v.ubicacion?.lat,
          clienteLng: v.ubicacion?.lng,
          deliveryZoneId: v.zonaId,
          zonaNombre: v.zonaNombre,
          costoEnvio: v.costoEnvio,
          notas: v.notas,
        },
        select: { id: true, numero: true },
      });
    }, OPCIONES_TX);
  } catch (e) {
    console.error("[delivery] abrirCuentaDelivery falló", e);
    return { ok: false, error: `No se pudo abrir la cuenta. Probá de nuevo. (Detalle: ${pistaDelError(e)})` };
  }

  await registrarBitacora(storeId, sesion, {
    modulo: "delivery",
    accion: "cuenta_abierta",
    descripcion: `Abrió la cuenta ${formatearNumero(cuenta.numero)} de delivery para ${v.nombre} (${v.zonaNombre}, envío ${formatearGuarani(v.costoEnvio)}).`,
    entidad: "CuentaDelivery",
    entidadId: cuenta.id,
    detalle: {
      cuenta: cuenta.numero,
      cliente: v.nombre,
      zona: v.zonaNombre,
      costoEnvio: v.costoEnvio,
      costoDeLaZona: v.zonaId ? v.costoZona : null,
      conFicha: !!v.ficha,
    },
  });
  refrescar();
  return { ok: true, cuentaId: cuenta.id, cuentaNumero: cuenta.numero };
}

/**
 * Corrige los datos de una cuenta abierta (el cliente, la dirección, la zona, el envío o la ficha de factura). Solo con la cuenta
 * abierta: una cuenta impresa ya le llegó al cliente con un total, así que primero se reabre.
 */
export async function editarDatosDelivery(cuentaId: string, datos: DatosCuentaDelivery): Promise<Resultado> {
  const sesion = await exigirPermiso("delivery.gestionar");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const cuenta = await db.cuentaDelivery.findFirst({ where: { id: String(cuentaId) }, select: { id: true, numero: true, estado: true } });
  if (!cuenta) return { ok: false, error: "No encontré esa cuenta." };
  if (cuenta.estado !== "abierta") return { ok: false, error: textoNoEditable(cuenta.estado) };

  const r = await validarDatosDeCuenta(db, datos);
  if (!r.ok) return r;
  const v = r.v;

  try {
    await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.upsert({
        where: { storeId_telefono: { storeId, telefono: v.telefono } },
        update: { nombre: v.nombre },
        create: { storeId, nombre: v.nombre, telefono: v.telefono },
      });
      if (v.ficha?.razonSocial) {
        await upsertClienteFiscal(tx, storeId, {
          tipoIdentificacion: v.ficha.tipoIdentificacion,
          numeroIdentificacion: v.ficha.numeroIdentificacion,
          razonSocial: v.ficha.razonSocial,
          email: v.ficha.email ?? "",
        });
      }
      // El estado va en la condición: si justo la imprimieron o la cobraron, no se cambia.
      const cambiada = await tx.cuentaDelivery.updateMany({
        where: { id: cuenta.id, storeId, estado: "abierta" },
        data: {
          customerId: customer.id,
          clienteNombre: v.nombre,
          clienteTelefono: v.telefono,
          facturaTipoIdentificacion: v.ficha?.tipoIdentificacion ?? null,
          facturaRuc: v.ficha?.numeroIdentificacion ?? null,
          facturaRazonSocial: v.ficha?.razonSocial ?? null,
          facturaEmail: v.ficha?.email ?? null,
          direccion: v.direccion,
          clienteLat: v.ubicacion?.lat ?? null,
          clienteLng: v.ubicacion?.lng ?? null,
          deliveryZoneId: v.zonaId,
          zonaNombre: v.zonaNombre,
          costoEnvio: v.costoEnvio,
          notas: v.notas,
        },
      });
      if (cambiada.count !== 1) throw new ErrorDeUsuario("La cuenta ya no está abierta. Actualizá la pantalla.");
    }, OPCIONES_TX);
  } catch (e) {
    if (e instanceof ErrorDeUsuario) return { ok: false, error: e.message };
    console.error("[delivery] editarDatosDelivery falló", e);
    return { ok: false, error: `No se pudieron guardar los datos. (Detalle: ${pistaDelError(e)})` };
  }

  await registrarBitacora(storeId, sesion, {
    modulo: "delivery",
    accion: "datos_editados",
    descripcion: `Cambió los datos de la cuenta ${formatearNumero(cuenta.numero)} de delivery: ${v.nombre}, ${v.zonaNombre}, envío ${formatearGuarani(v.costoEnvio)}.`,
    entidad: "CuentaDelivery",
    entidadId: cuenta.id,
    detalle: { cuenta: cuenta.numero, cliente: v.nombre, zona: v.zonaNombre, costoEnvio: v.costoEnvio },
  });
  refrescar();
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------------
//  Cargar productos
// ---------------------------------------------------------------------------------------------------------------------

export type ResultadoCargaDelivery =
  | { ok: true; ronda: number; totalEnvio: number; areas: string[]; yaEnviado: boolean }
  | { ok: false; error: string };

/**
 * La caja le carga productos a una cuenta abierta. El precio lo recalcula el servidor (la pantalla solo dice qué y cuántos), el
 * stock baja y cada área (Cocina, Barra…) recibe su comanda en la cola de impresión.
 */
export async function cargarProductosDelivery(
  cuentaId: string,
  datos: { envioId: string; items: LineaDeRonda[] }
): Promise<ResultadoCargaDelivery> {
  const sesion = await exigirPermiso("delivery.gestionar");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);
  const quien = nombreDe(sesion);

  const cuenta = await db.cuentaDelivery.findFirst({ where: { id: String(cuentaId) }, select: { id: true, numero: true, estado: true } });
  if (!cuenta) return { ok: false, error: "No encontré esa cuenta." };
  if (cuenta.estado !== "abierta") return { ok: false, error: textoNoEditable(cuenta.estado) };

  const r = await guardarRondaDelivery({
    storeId,
    cuentaId: cuenta.id,
    envioId: String(datos?.envioId ?? ""),
    items: Array.isArray(datos?.items) ? datos.items : [],
    quien: `Caja - ${quien}`,
    cargadoPor: quien,
  });
  if (!r.ok) return r;

  if (!r.yaEnviado) {
    await registrarBitacora(storeId, sesion, {
      modulo: "delivery",
      accion: "productos_cargados",
      descripcion: `Cargó el pedido ${r.ronda} en la cuenta ${formatearNumero(r.cuentaNumero)} de delivery (${formatearGuarani(r.totalEnvio)}).`,
      entidad: "CuentaDelivery",
      entidadId: r.cuentaId,
      detalle: { cuenta: r.cuentaNumero, ronda: r.ronda, total: r.totalEnvio },
    });
  }
  revalidatePath("/admin/stock/insumos");
  refrescar();
  return { ok: true, ronda: r.ronda, totalEnvio: r.totalEnvio, areas: r.areas, yaEnviado: r.yaEnviado };
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

/** Le avisa a la cocina o la barra (por la cola de impresión) que un producto se cancela: que no lo preparen. */
async function avisarAnulacion(
  tx: Prisma.TransactionClient,
  storeId: string,
  cuenta: { id: string; numero: number },
  item: { areaImpresionId: string | null; cantidad: number; nombreProducto: string; opcionesTexto: string | null },
  nombreDeArea: string,
  razon: string,
  quien: string
): Promise<void> {
  if (!item.areaImpresionId) return;
  const nombre = nombreDeCuentaDelivery(cuenta.numero);
  await tx.trabajoImpresion.create({
    data: {
      storeId,
      tipo: "anulacion",
      titulo: `${nombre} · ${nombreDeArea} · anulado`,
      areaImpresionId: item.areaImpresionId,
      contenido: contenidoParaGuardar(
        textoAnulacion({
          mesa: "",
          titulo: nombre,
          area: nombreDeArea,
          hora: horaDeAhora(),
          quien,
          cantidad: item.cantidad,
          nombre: item.nombreProducto,
          opciones: item.opcionesTexto,
          motivo: razon,
        })
      ),
      cuentaDeliveryId: cuenta.id,
    },
  });
}

/**
 * Cancela productos de una cuenta, dentro de la transacción de quien llama: los marca (con quién y por qué), devuelve al stock lo
 * que habían descontado y le avisa a su área (Cocina, Barra…) con un papel de "ANULADO" para que no lo preparen.
 */
async function anularItems(
  tx: Prisma.TransactionClient,
  storeId: string,
  cuenta: { id: string; numero: number },
  items: ItemParaAnular[],
  razon: string,
  quien: string
): Promise<void> {
  const ahora = new Date();
  const idsDeAreas = [...new Set(items.map((i) => i.areaImpresionId).filter((a): a is string => !!a))];
  const areas = idsDeAreas.length
    ? await tx.areaImpresion.findMany({ where: { id: { in: idsDeAreas }, storeId }, select: { id: true, nombre: true } })
    : [];
  const nombreDeArea = new Map(areas.map((a) => [a.id, a.nombre]));

  for (const item of items) {
    // La condición va en el update: si otra caja lo canceló en el mismo instante, acá no encuentra nada que marcar.
    const marcado = await tx.itemCuentaDelivery.updateMany({
      where: { id: item.id, storeId, cuentaId: cuenta.id, estado: "activo" },
      data: { estado: "anulado", anuladoPor: quien, anuladoEn: ahora, motivoAnulacion: razon },
    });
    if (marcado.count !== 1) throw new ErrorDeUsuario("Ese producto ya estaba cancelado. Actualizá la pantalla.");

    await devolverConsumo(
      tx,
      storeId,
      leerConsumoGuardado(item.consumo),
      { cuentaDeliveryId: cuenta.id },
      `Cancelado: ${item.cantidad} × ${item.nombreProducto} (${razon})`,
      quien
    );
    await avisarAnulacion(tx, storeId, cuenta, item, nombreDeArea.get(item.areaImpresionId ?? "") ?? "Comanda", razon, quien);
  }
}

/**
 * Cancela ALGUNAS unidades de un producto: se cargaron 5 empanadas y eran 4. La línea se queda con las que siguen (4: su cantidad y
 * lo que descontó del stock bajan en proporción) y las canceladas pasan a una fila propia, marcada como cancelada (con quién y por
 * qué), de modo que el rastro de la cuenta muestra las dos cosas. Se devuelve al stock solo lo de las unidades canceladas y se le
 * avisa a la cocina o la barra de que no preparen esas. Va dentro de la transacción de quien llama.
 */
async function anularParteDeItem(
  tx: Prisma.TransactionClient,
  storeId: string,
  cuenta: { id: string; numero: number },
  item: ItemCuentaDelivery,
  cantidad: number,
  razon: string,
  quien: string
): Promise<void> {
  const ahora = new Date();
  const quedan = item.cantidad - cantidad;
  const [consumoQueda, consumoAnulado] = repartirConsumo(leerConsumoGuardado(item.consumo), [
    quedan / item.cantidad,
    cantidad / item.cantidad,
  ]);

  // La cantidad que se leyó va en la condición: si otra caja la cambió (o la canceló) en el mismo instante, acá no encuentra nada.
  const reducida = await tx.itemCuentaDelivery.updateMany({
    where: { id: item.id, storeId, cuentaId: cuenta.id, estado: "activo", cantidad: item.cantidad },
    data: { cantidad: quedan, consumo: consumoQueda as unknown as Prisma.InputJsonValue },
  });
  if (reducida.count !== 1) throw new ErrorDeUsuario("Ese producto cambió mientras lo cancelabas. Actualizá la pantalla.");

  await tx.itemCuentaDelivery.create({
    data: {
      storeId,
      cuentaId: cuenta.id,
      ronda: item.ronda,
      // Una fila nueva necesita su propio par envío/línea (es único): este "envío" es la cancelación.
      envioId: `anulacion-${randomUUID()}`,
      linea: item.linea,
      cargadoPor: item.cargadoPor,
      productId: item.productId,
      nombreProducto: item.nombreProducto,
      cantidad,
      precioUnitario: item.precioUnitario,
      iva: item.iva,
      opcionesTexto: item.opcionesTexto,
      ingredientesQuitadosTexto: item.ingredientesQuitadosTexto,
      nota: item.nota,
      costoProducto: item.costoProducto,
      costoAgregados: item.costoAgregados,
      precioAgregados: item.precioAgregados,
      areaImpresionId: item.areaImpresionId,
      consumo: consumoAnulado as unknown as Prisma.InputJsonValue,
      // Conserva la promoción y si era la parte regalada: la fila cancelada es el rastro de lo que había.
      promocionId: item.promocionId,
      cortesia: item.cortesia,
      precioAntesPromo: item.precioAntesPromo,
      estado: "anulado",
      anuladoPor: quien,
      anuladoEn: ahora,
      motivoAnulacion: razon,
      enviadoEn: item.enviadoEn,
    },
  });

  await devolverConsumo(
    tx,
    storeId,
    consumoAnulado,
    { cuentaDeliveryId: cuenta.id },
    `Cancelado: ${cantidad} de ${item.cantidad} × ${item.nombreProducto} (${razon})`,
    quien
  );
  if (item.areaImpresionId) {
    const area = await tx.areaImpresion.findFirst({ where: { id: item.areaImpresionId, storeId }, select: { nombre: true } });
    await avisarAnulacion(tx, storeId, cuenta, { ...item, cantidad }, area?.nombre ?? "Comanda", razon, quien);
  }
}

/**
 * Después de cancelar productos: si la cuenta tenía cortesías de una promoción por volumen ("por cada 2, regalar 1") que ya no
 * corresponden (se cancelaron las que se pagaban), las cancela también, empezando por las últimas cargadas, con el mismo motivo.
 * Va dentro de la transacción de quien llama. Devuelve cuántas unidades de cortesía recortó.
 */
async function recortarCortesias(
  tx: Prisma.TransactionClient,
  storeId: string,
  cuenta: { id: string; numero: number },
  razon: string,
  quien: string
): Promise<number> {
  const activos = await tx.itemCuentaDelivery.findMany({
    where: { cuentaId: cuenta.id, storeId, estado: "activo", promocionId: { not: null } },
    orderBy: [{ ronda: "asc" }, { linea: "asc" }],
  });
  if (activos.length === 0) return 0;
  const promos = await cargarPromocionesEnTransaccion(tx, storeId);
  const sobrantes = cortesiasSobrantes(
    activos.map((i) => ({ id: i.id, productId: i.productId, cantidad: i.cantidad, promocionId: i.promocionId, cortesia: i.cortesia })),
    promos
  );
  let recortadas = 0;
  const motivo = `La promoción ya no corresponde (${razon})`;
  for (const s of sobrantes) {
    const item = activos.find((a) => a.id === s.itemId);
    // Una cuenta dividida puede dejar fracciones (0,5): esas no se tocan.
    if (!item || !Number.isInteger(item.cantidad) || !Number.isInteger(s.cantidad)) continue;
    if (s.cantidad >= item.cantidad) await anularItems(tx, storeId, cuenta, [item], motivo, quien);
    else await anularParteDeItem(tx, storeId, cuenta, item, s.cantidad, motivo, quien);
    recortadas += s.cantidad;
  }
  return recortadas;
}

/**
 * Cancela de una sola vez varias partes de la cuenta, con UN motivo: cada parte es un producto de la cuenta y cuántas unidades se
 * cancelan de él (sin `cantidad`, todo). Todo ocurre en una transacción: si una parte falla, no se cancela ninguna.
 */
export async function anularProductosDelivery(
  cuentaId: string,
  partes: { itemId: string; cantidad?: number }[],
  motivo: string,
  autorizacion?: string
): Promise<Resultado> {
  const sesion = await exigirPermiso("delivery.gestionar");
  const storeId = await idLocalActual();
  const razon = limpiarMotivo(motivo);
  if (!razon) return { ok: false, error: MENSAJE_MOTIVO };
  const quien = nombreDe(sesion);

  // Lo que llega del navegador se comprueba antes de tocar nada.
  if (!Array.isArray(partes) || partes.length === 0 || partes.length > 100) {
    return { ok: false, error: "No hay nada para cancelar. Actualizá la pantalla." };
  }
  const vistos = new Set<string>();
  for (const p of partes) {
    if (!p || typeof p.itemId !== "string" || vistos.has(p.itemId)) {
      return { ok: false, error: "El producto elegido no es válido. Actualizá la pantalla." };
    }
    vistos.add(p.itemId);
    if (p.cantidad !== undefined && (typeof p.cantidad !== "number" || !Number.isFinite(p.cantidad) || p.cantidad <= 0)) {
      return { ok: false, error: "La cantidad a cancelar tiene que ser mayor a cero." };
    }
  }

  // Seguridad (Ajustes): si cancelar productos pide contraseña, se exige acá, antes de tocar nada.
  const clave = await exigirAutorizacion(storeId, sesion, "cancelar_productos", autorizacion);
  if (!clave.ok) return clave;

  let resumen = "";
  let canceladas = 0;
  try {
    resumen = await prisma.$transaction(async (tx) => {
      const cuenta = await tx.cuentaDelivery.findFirst({
        where: { id: String(cuentaId), storeId },
        select: { id: true, numero: true, estado: true },
      });
      if (!cuenta) throw new ErrorDeUsuario("No encontré esa cuenta.");
      if (cuenta.estado !== "abierta") throw new ErrorDeUsuario(textoNoEditable(cuenta.estado));

      const detalles: string[] = [];
      for (const p of partes) {
        const item = await tx.itemCuentaDelivery.findFirst({ where: { id: p.itemId, cuentaId: cuenta.id, storeId } });
        if (!item) throw new ErrorDeUsuario("No encontré ese producto. Actualizá la pantalla.");
        if (item.estado !== "activo") throw new ErrorDeUsuario("Ese producto ya estaba cancelado. Actualizá la pantalla.");

        const pedida = p.cantidad ?? item.cantidad;
        if (pedida > item.cantidad) {
          throw new ErrorDeUsuario(`Solo hay ${formatearCantidad(item.cantidad)} de ese producto en la cuenta.`);
        }
        // Todo el producto: se marca cancelado tal cual.
        if (pedida === item.cantidad) {
          canceladas += item.cantidad;
          await anularItems(tx, storeId, cuenta, [item], razon, quien);
          detalles.push(`${formatearCantidad(item.cantidad)} × ${item.nombreProducto}`);
          continue;
        }
        // Solo algunas unidades: tienen que ser enteras.
        if (!Number.isInteger(pedida)) throw new ErrorDeUsuario("Solo se pueden cancelar unidades enteras.");
        canceladas += pedida;
        await anularParteDeItem(tx, storeId, cuenta, item, pedida, razon, quien);
        detalles.push(`${pedida} de ${item.cantidad} × ${item.nombreProducto} (quedan ${item.cantidad - pedida})`);
      }
      // Si había cortesías de una promoción por volumen que ya no corresponden, se cancelan también.
      const recortadas = await recortarCortesias(tx, storeId, cuenta, razon, quien);
      if (recortadas > 0) detalles.push(`${recortadas} de cortesía de promoción`);
      return `${detalles.join(" y ")} de la cuenta ${formatearNumero(cuenta.numero)} de delivery`;
    }, OPCIONES_TX);
  } catch (e) {
    if (e instanceof ErrorDeUsuario) return { ok: false, error: e.message };
    console.error("[delivery] anularProductosDelivery falló", e);
    return { ok: false, error: `No se pudo cancelar el producto. (Detalle: ${pistaDelError(e)})` };
  }

  await registrarBitacora(storeId, sesion, {
    modulo: "delivery",
    accion: "producto_cancelado",
    descripcion: `Canceló ${resumen}. Motivo: ${razon}.`,
    entidad: "CuentaDelivery",
    entidadId: String(cuentaId),
    detalle: { producto: resumen, motivo: razon, canceladas },
  });
  revalidatePath("/admin/stock/insumos");
  refrescar();
  return { ok: true };
}

/**
 * Cierra una cuenta que quedó SIN productos activos (se cancelaron todos, o se abrió por error).
 *
 * Una cuenta con productos NO se cancela mientras se atiende: si ya se imprimió o se mandó con el repartidor, cancelarla de golpe es
 * justo la forma de que una cuenta desaparezca sin dejar plata en la caja. Se cobra, y si hace falta se cancela la venta desde el
 * Historial de cuentas (que devuelve el stock y deja el rastro). Los productos se cancelan de a uno (con motivo).
 */
export async function cancelarCuentaDelivery(cuentaId: string, motivo: string, autorizacion?: string): Promise<Resultado> {
  const sesion = await exigirPermiso("delivery.gestionar");
  const storeId = await idLocalActual();
  const razon = limpiarMotivo(motivo);
  if (!razon) return { ok: false, error: MENSAJE_MOTIVO };
  const quien = nombreDe(sesion);

  // Seguridad (Ajustes): si las cancelaciones piden contraseña, se exige acá, antes de tocar nada.
  const clave = await exigirAutorizacion(storeId, sesion, "cancelaciones", autorizacion);
  if (!clave.ok) return clave;

  let resumen = "";
  try {
    resumen = await prisma.$transaction(async (tx) => {
      const cuenta = await tx.cuentaDelivery.findFirst({
        where: { id: String(cuentaId), storeId, estado: { in: [...ESTADOS_DELIVERY_ABIERTA] } },
        select: { id: true, numero: true, clienteNombre: true, impresaEn: true },
      });
      if (!cuenta) throw new ErrorDeUsuario("Esa cuenta ya está cerrada.");
      const productos = await tx.itemCuentaDelivery.findMany({
        where: { cuentaId: cuenta.id, storeId },
        select: { cantidad: true, precioUnitario: true, estado: true },
      });
      if (productos.some((p) => p.estado === "activo")) {
        throw new ErrorDeUsuario(
          "Una cuenta con productos no se cancela mientras se atiende. Cobrala y, si hace falta, cancelá la venta desde el Historial de cuentas."
        );
      }
      // Lo que se había cargado queda en el rastro: si alguien cancela de a uno todos los productos y cierra la cuenta, el Historial
      // muestra de cuánta plata se trataba.
      const cargado = totalDeLineas(productos.map((p) => ({ precioUnitario: Number(p.precioUnitario), cantidad: p.cantidad })));
      // Las comandas que todavía no salieron (la impresora estaba apagada) ya no tienen sentido: no se imprimen después.
      await tx.trabajoImpresion.updateMany({
        where: { storeId, cuentaDeliveryId: cuenta.id, tipo: "comanda", estado: "pendiente" },
        data: { estado: "error", error: "La cuenta se canceló antes de imprimirse." },
      });
      // El estado va en la condición: si la pagaron en el mismo instante, no se pisa.
      const cerrada = await tx.cuentaDelivery.updateMany({
        where: { id: cuenta.id, storeId, estado: { in: [...ESTADOS_DELIVERY_ABIERTA] } },
        data: { estado: "anulada", cerradaEn: new Date(), cerradaPor: quien, motivoCierre: razon },
      });
      if (cerrada.count !== 1) throw new ErrorDeUsuario("Esa cuenta ya está cerrada.");
      return (
        `la cuenta vacía ${formatearNumero(cuenta.numero)} de delivery de ${cuenta.clienteNombre} ` +
        `(se habían cargado ${formatearGuarani(cargado)}, todo cancelado producto por producto` +
        `${cuenta.impresaEn ? "; la cuenta había llegado a imprimirse" : ""})`
      );
    }, OPCIONES_TX);
  } catch (e) {
    if (e instanceof ErrorDeUsuario) return { ok: false, error: e.message };
    console.error("[delivery] cancelarCuentaDelivery falló", e);
    return { ok: false, error: `No se pudo cerrar la cuenta. (Detalle: ${pistaDelError(e)})` };
  }

  await registrarBitacora(storeId, sesion, {
    modulo: "delivery",
    accion: "cuenta_cancelada",
    descripcion: `Cerró ${resumen}. Motivo: ${razon}.`,
    entidad: "CuentaDelivery",
    entidadId: String(cuentaId),
    detalle: { cuenta: resumen, motivo: razon },
  });
  refrescar();
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------------
//  Descuento
// ---------------------------------------------------------------------------------------------------------------------

/** `tipoDescuentoId`: el tipo de descuento de Ajustes que se eligió (Cortesía, Tarjeta…): el porcentaje sale de él y no de `valor`. */
export type DatosDescuentoDelivery = { tipo: "porcentaje" | "monto"; valor: number; tipoDescuentoId?: string };

/**
 * Pone (o, con `null`, quita) el descuento general de la cuenta. Va con motivo. El monto en guaraníes se calcula acá, sobre lo que
 * valen los PRODUCTOS de la cuenta en este momento (el envío no se descuenta); si después se cancelan productos, un descuento por
 * porcentaje se ajusta solo.
 */
export async function aplicarDescuentoDelivery(
  cuentaId: string,
  descuento: DatosDescuentoDelivery | null,
  motivo: string,
  autorizacion?: string
): Promise<Resultado> {
  const sesion = await exigirPermiso("delivery.gestionar");
  const storeId = await idLocalActual();
  const quien = nombreDe(sesion);

  // Un descuento de 0 es "sin descuento": reemplaza al que la cuenta tenía y la deja en su monto original (sirve para corregir uno
  // mal puesto: se escribe 0 y se guarda). No pide motivo, igual que quitarlo.
  const sinDescuento = !descuento || (Number(descuento.valor) === 0 && !descuento.tipoDescuentoId);
  const razon = sinDescuento ? null : limpiarMotivo(motivo);
  // Lo que se calcula de verdad: con un tipo de descuento elegido, SU porcentaje (el 100 % de una cortesía solo sale de un tipo).
  let efectivo: { tipo: "porcentaje" | "monto"; valor: number } | null = null;
  if (descuento && !sinDescuento) {
    if (descuento.tipo !== "porcentaje" && descuento.tipo !== "monto") return { ok: false, error: "El descuento no es válido." };
    if (!razon) return { ok: false, error: MENSAJE_MOTIVO };
    const resuelto = resolverDescuentoConTipos(
      { tipo: descuento.tipo, valor: Number(descuento.valor), tipoDescuentoId: descuento.tipoDescuentoId },
      await cargarTiposDescuento(prismaDelLocal(storeId))
    );
    if (!resuelto.ok) return { ok: false, error: resuelto.error };
    efectivo = resuelto.descuento ? { tipo: resuelto.descuento.tipo, valor: resuelto.descuento.valor } : null;
  }

  // Seguridad (Ajustes): dar o cambiar un descuento pide contraseña si el local lo protegió (quitarlo no). Se exige antes de tocar nada.
  if (efectivo) {
    const clave = await exigirAutorizacion(storeId, sesion, "descuentos", autorizacion);
    if (!clave.ok) return clave;
  }

  let descripcion = "";
  try {
    descripcion = await prisma.$transaction(async (tx) => {
      const cuenta = await tx.cuentaDelivery.findFirst({
        where: { id: String(cuentaId), storeId },
        select: { id: true, numero: true, estado: true },
      });
      if (!cuenta) throw new ErrorDeUsuario("No encontré esa cuenta.");
      if (cuenta.estado !== "abierta") throw new ErrorDeUsuario(textoNoEditable(cuenta.estado));

      if (!efectivo) {
        await tx.cuentaDelivery.update({
          where: { id: cuenta.id },
          data: { descuentoTipo: null, descuentoValor: null, descuentoMotivo: null, descuentoPor: null },
        });
        return `Quitó el descuento de la cuenta ${formatearNumero(cuenta.numero)} de delivery: vuelve a su monto original.`;
      }

      const activos = await tx.itemCuentaDelivery.findMany({
        where: { cuentaId: cuenta.id, storeId, estado: "activo" },
        select: { cantidad: true, precioUnitario: true },
      });
      const subtotal = totalDeLineas(activos.map((i) => ({ precioUnitario: Number(i.precioUnitario), cantidad: i.cantidad })));
      const calculado = calcularDescuento(subtotal, { tipo: efectivo.tipo, valor: efectivo.valor });
      if (!calculado.ok) throw new ErrorDeUsuario(calculado.error);
      if (calculado.monto <= 0) throw new ErrorDeUsuario("Escribí un descuento mayor a cero.");

      await tx.cuentaDelivery.update({
        where: { id: cuenta.id },
        data: {
          descuentoTipo: efectivo.tipo,
          descuentoValor: efectivo.valor,
          descuentoMotivo: razon,
          descuentoPor: quien,
        },
      });
      const cuanto =
        calculado.porcentaje != null
          ? `${textoPorcentaje(calculado.porcentaje)}% (${formatearGuarani(calculado.monto)})`
          : formatearGuarani(calculado.monto);
      return `Dio un descuento de ${cuanto} a la cuenta ${formatearNumero(cuenta.numero)} de delivery. Motivo: ${razon}.`;
    }, OPCIONES_TX);
  } catch (e) {
    if (e instanceof ErrorDeUsuario) return { ok: false, error: e.message };
    console.error("[delivery] aplicarDescuentoDelivery falló", e);
    return { ok: false, error: `No se pudo guardar el descuento. (Detalle: ${pistaDelError(e)})` };
  }

  await registrarBitacora(storeId, sesion, {
    modulo: "delivery",
    accion: sinDescuento ? "descuento_quitado" : "descuento_aplicado",
    descripcion,
    entidad: "CuentaDelivery",
    entidadId: String(cuentaId),
    detalle: efectivo ? { tipo: efectivo.tipo, valor: efectivo.valor, motivo: razon, conTipo: !!descuento?.tipoDescuentoId } : {},
  });
  refrescar();
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------------
//  Imprimir la cuenta y reabrirla
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Imprime la cuenta para el cliente (no es una factura) en la impresora del ticket de ESTA estación, y la deja "por cobrar": desde
 * ese momento no se le carga nada hasta que la caja la reabra. Sale con el repartidor. Se puede volver a imprimir.
 */
export async function imprimirCuentaDelivery(cuentaId: string): Promise<Resultado> {
  const sesion = await exigirPermiso("delivery.gestionar");
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
    titulo = await prisma.$transaction(
      (tx) => encolarCuentaDelivery(tx, { storeId, cuentaId: String(cuentaId), areaTicketId, quien, local: local?.nombre ?? "Cuenta" }),
      OPCIONES_TX
    );
  } catch (e) {
    if (e instanceof ErrorDeUsuario) return { ok: false, error: e.message };
    console.error("[delivery] imprimirCuentaDelivery falló", e);
    return { ok: false, error: `No se pudo imprimir la cuenta. (Detalle: ${pistaDelError(e)})` };
  }

  await registrarBitacora(storeId, sesion, {
    modulo: "delivery",
    accion: "cuenta_impresa",
    descripcion: `Imprimió la cuenta: ${titulo}.`,
    entidad: "CuentaDelivery",
    entidadId: String(cuentaId),
    detalle: { cuenta: titulo },
  });
  refrescar();
  return { ok: true };
}

/** Vuelve a abrir una cuenta que ya se había impreso, para poder cargarle más productos o corregir sus datos. */
export async function reabrirCuentaDelivery(cuentaId: string, autorizacion?: string): Promise<Resultado> {
  const sesion = await exigirPermiso("delivery.gestionar");
  const storeId = await idLocalActual();

  // Seguridad (Ajustes): si reabrir cuentas pide contraseña, se exige acá, antes de tocar nada.
  const clave = await exigirAutorizacion(storeId, sesion, "reabrir_cuentas", autorizacion);
  if (!clave.ok) return clave;

  const cuenta = await prisma.cuentaDelivery.findFirst({
    where: { id: String(cuentaId), storeId },
    select: { id: true, numero: true, estado: true },
  });
  if (!cuenta) return { ok: false, error: "No encontré esa cuenta." };
  if (cuenta.estado !== "por_cobrar") {
    return { ok: false, error: cuenta.estado === "abierta" ? "Esa cuenta ya está abierta." : "Esa cuenta ya está cerrada." };
  }

  // Con la factura ya emitida la cuenta no se puede reabrir: cargarle o sacarle algo dejaría una factura que no dice lo que se cobra.
  // Se revisa en la misma transacción que el cambio de estado: si justo ahora se emitió la factura, no queda reabierta con ella.
  try {
    await prisma.$transaction(async (tx) => {
      // El estado va en la condición: si justo la pagaron, no se reabre. (Escribir primero bloquea la fila: una factura que se esté
      // emitiendo en este mismo instante espera a que esto termine, y después ya no encuentra la cuenta "por cobrar".)
      const reabierta = await tx.cuentaDelivery.updateMany({
        where: { id: cuenta.id, storeId, estado: "por_cobrar" },
        data: { estado: "abierta", impresaEn: null, impresaPor: null },
      });
      if (reabierta.count !== 1) throw new ErrorDeUsuario("Esa cuenta ya no está impresa. Actualizá la pantalla.");
      const conFactura = await tx.comprobante.count({ where: { storeId, cuentaDeliveryId: cuenta.id, estado: "vigente" } });
      if (conFactura > 0) {
        throw new ErrorDeUsuario("Esta cuenta ya tiene la factura emitida: no se puede reabrir. Anulá la factura primero.");
      }
    }, OPCIONES_TX);
  } catch (e) {
    if (e instanceof ErrorDeUsuario) return { ok: false, error: e.message };
    console.error("[delivery] reabrirCuentaDelivery falló", e);
    return { ok: false, error: `No se pudo reabrir la cuenta. (Detalle: ${pistaDelError(e)})` };
  }

  await registrarBitacora(storeId, sesion, {
    modulo: "delivery",
    accion: "cuenta_reabierta",
    descripcion: `Reabrió la cuenta ${formatearNumero(cuenta.numero)} de delivery.`,
    entidad: "CuentaDelivery",
    entidadId: cuenta.id,
    detalle: { cuenta: cuenta.numero },
  });
  refrescar();
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------------
//  Factura rápida: la factura sale ANTES de cobrar la cuenta
// ---------------------------------------------------------------------------------------------------------------------

export type DatosFacturaRapida = {
  /** "sin_nombre" para consumidor final, o el tipo (ruc, cedula…) si se factura con registro fiscal. */
  facturaTipoIdentificacion: string;
  facturaNumeroIdentificacion?: string;
  facturaRazonSocial?: string;
  facturaEmail?: string;
  /** El total que la persona tenía en pantalla: sirve para avisar si la cuenta cambió mientras se emitía la factura. */
  totalMostrado?: number;
};

export type ResultadoFacturaDelivery = { ok: true; numero: string } | { ok: false; error: string };

/**
 * "Factura rápida": emite SOLO la factura de la cuenta (con su número de timbrado, su comprobante y los datos del cliente), sin cobrar y
 * sin registrar la venta: no entra en el turno de caja ni en los reportes de ventas hasta que se cobre la cuenta. Sirve cuando el
 * repartidor tiene que salir ya con todos los documentos (la cuenta impresa y la factura) y la plata se registra recién cuando vuelve.
 *
 * Una factura emitida es un documento fiscal: su número se consume para siempre y la cuenta queda CONGELADA (no se reabre, no se le
 * cargan ni cancelan productos, no cambia el descuento) hasta cobrarla; si hay que corregir algo se anula la factura (queda registrada
 * como anulada) y se emite otra. Al cobrar, la venta usa esta misma factura: no sale otra ni se vuelve a consumir un número.
 *
 * Exige que la cuenta esté impresa ("por cobrar") y una estación con un punto de expedición vigente. No pide turno de caja abierto.
 */
export async function emitirFacturaDelivery(cuentaId: string, datos: DatosFacturaRapida): Promise<ResultadoFacturaDelivery> {
  await exigirPermiso("delivery.gestionar");
  const sesion = await exigirPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);
  const emitidoPor = nombreDe(sesion);

  // La factura sale del punto de expedición de la estación de esta computadora.
  const estacion = await estacionActual(db);
  if (!estacion) {
    return { ok: false, error: "Esta computadora no está vinculada a una estación. Vinculala en Estaciones para emitir la factura." };
  }
  const puntoExpedicion = (
    await db.estacion.findUnique({ where: { id: estacion.id }, select: { puntoExpedicion: true } })
  )?.puntoExpedicion ?? null;
  if (!puntoExpedicion) {
    return { ok: false, error: "Esta estación no tiene un punto de expedición asignado. Pedile al dueño que lo asigne en Estaciones." };
  }
  if (!puntoExpedicion.activo || puntoExpedicion.timbradoHasta < new Date()) {
    return { ok: false, error: "El timbrado de este punto de expedición está vencido. No se puede emitir factura." };
  }
  // La factura electrónica lleva adentro la forma de pago y se firma al emitirla: no se puede sacar antes de cobrar.
  if (esElectronico(puntoExpedicion.modalidad)) {
    return {
      ok: false,
      error: "Con facturación electrónica la factura se emite al cobrar la cuenta, cuando ya se sabe la forma de pago. Cobrá la cuenta con factura.",
    };
  }

  // A quién se factura: "Sin Nombre" (Consumidor Final) o los datos ya revisados (texto limpio).
  if (!datos?.facturaTipoIdentificacion) return { ok: false, error: "Elegí con o sin registro fiscal." };
  const esSinRegistroFiscal = datos.facturaTipoIdentificacion === SIN_REGISTRO_FISCAL.tipo;
  let comprador: { tipoIdentificacion: string; numeroIdentificacion: string; razonSocial: string | null; email: string | null } | null =
    null;
  if (!esSinRegistroFiscal) {
    const revisado = validarDatosFiscales({
      modo: "con_registro",
      tipoIdentificacion: datos.facturaTipoIdentificacion,
      numeroIdentificacion: datos.facturaNumeroIdentificacion,
      razonSocial: datos.facturaRazonSocial,
      email: datos.facturaEmail,
    });
    if (!revisado.ok) return { ok: false, error: revisado.error };
    comprador = revisado.datos;
  }
  const compradorFinal = comprador;
  const tipoIdFactura = esSinRegistroFiscal ? SIN_REGISTRO_FISCAL.tipo : (compradorFinal?.tipoIdentificacion ?? "");
  const numeroIdFactura = esSinRegistroFiscal ? SIN_REGISTRO_FISCAL.numero : (compradorFinal?.numeroIdentificacion ?? "");
  const razonSocialFactura = esSinRegistroFiscal ? null : (compradorFinal?.razonSocial ?? null);
  const emailFactura = esSinRegistroFiscal ? null : (compradorFinal?.email ?? null);

  // La cuenta y lo que vale: la misma cuenta que el cobro (los productos, el descuento y el envío como una línea más).
  const cuenta = await db.cuentaDelivery.findFirst({
    where: { id: String(cuentaId), estado: "por_cobrar" },
    include: { items: { where: { estado: "activo" }, orderBy: [{ ronda: "asc" }, { linea: "asc" }] } },
  });
  if (!cuenta) {
    return { ok: false, error: "Primero imprimí la cuenta: la factura se emite con la cuenta ya impresa (o esa cuenta ya se cerró)." };
  }
  if (cuenta.items.length === 0) return { ok: false, error: "La cuenta no tiene productos para facturar." };

  const filas = lineasDeCobro(
    cuenta.items.map((i) => ({
      productId: i.productId,
      nombreProducto: i.nombreProducto,
      cantidad: i.cantidad,
      precioUnitario: Number(i.precioUnitario),
      iva: i.iva,
      opcionesTexto: i.opcionesTexto,
      costoProducto: i.costoProducto == null ? null : Number(i.costoProducto),
      costoAgregados: i.costoAgregados == null ? null : Number(i.costoAgregados),
      precioAgregados: Number(i.precioAgregados),
      // La promoción de la línea: pasa a la venta, para el reporte de Promociones.
      promocionId: i.promocionId,
      cortesia: i.cortesia,
      precioAntesPromo: i.precioAntesPromo == null ? null : Number(i.precioAntesPromo),
    }))
  );
  const totales = totalesDeDelivery(filas, Number(cuenta.costoEnvio), descuentoDeCuenta(cuenta));
  if (totales.descuentoInvalido) {
    return { ok: false, error: `El descuento ya no corresponde a esta cuenta (${totales.descuentoInvalido}) Quitalo o cambialo.` };
  }
  const total = totales.total;
  // Un total en cero es válido cuando es una cortesía (descuento del 100 %): se vende y se factura en cero, y si hace falta se anula la factura.
  if (!Number.isFinite(total) || total < 0) return { ok: false, error: "El total de la cuenta no es válido." };
  const envio = lineaDeEnvio(totales.envio);
  const filasVenta = envio ? [...filas, envio] : filas;

  if (datos?.totalMostrado != null && Math.round(Number(datos.totalMostrado)) !== Math.round(total)) {
    return {
      ok: false,
      error: `La cuenta cambió mientras emitías la factura: ahora es de ${formatearGuarani(total)}. Cerrá este cuadro y volvé a abrirlo.`,
    };
  }

  // Para la factura, cada línea lleva su unidad de medida y si es un servicio.
  const idsDeProductos = [...new Set(filas.flatMap((f) => (f.productId ? [f.productId] : [])))];
  const datosProductos = idsDeProductos.length
    ? await db.product.findMany({ where: { id: { in: idsDeProductos } }, select: { id: true, unidadMedida: true, esServicio: true } })
    : [];
  const unidadDelProducto = new Map(datosProductos.map((p) => [p.id, p.unidadMedida]));
  const esServicioElProducto = new Map(datosProductos.map((p) => [p.id, p.esServicio]));

  let numeroFactura = "";
  try {
    numeroFactura = await prisma.$transaction(async (tx) => {
      // Primero se escribe en la cuenta, con el estado en la condición: bloquea la fila (dos facturas a la vez para la misma cuenta
      // se hacen en fila) y asegura que no la cobraron, cancelaron ni reabrieron mientras tanto.
      const bloqueada = await tx.cuentaDelivery.updateMany({
        where: { id: cuenta.id, storeId, estado: "por_cobrar" },
        data: { estado: "por_cobrar" },
      });
      if (bloqueada.count !== 1) throw new ErrorDeUsuario("Esa cuenta ya fue cobrada, cancelada o reabierta. Actualizá la pantalla.");
      const yaTiene = await tx.comprobante.count({ where: { storeId, cuentaDeliveryId: cuenta.id, estado: "vigente" } });
      if (yaTiene > 0) throw new ErrorDeUsuario("Esa cuenta ya tiene una factura emitida.");

      if (compradorFinal?.razonSocial) {
        await upsertClienteFiscal(tx, storeId, {
          tipoIdentificacion: compradorFinal.tipoIdentificacion,
          numeroIdentificacion: compradorFinal.numeroIdentificacion,
          razonSocial: compradorFinal.razonSocial,
          email: compradorFinal.email ?? "",
        });
        // La ficha de la cuenta queda con los datos con que se facturó.
        await tx.cuentaDelivery.update({
          where: { id: cuenta.id },
          data: {
            facturaTipoIdentificacion: compradorFinal.tipoIdentificacion,
            facturaRuc: compradorFinal.numeroIdentificacion,
            facturaRazonSocial: compradorFinal.razonSocial,
            facturaEmail: compradorFinal.email,
          },
        });
      }

      // Atómico: se incrementa PRIMERO y se usa el valor ya incrementado (dos facturas a la vez no toman el mismo número).
      const peActualizado = await tx.puntoExpedicion.update({
        where: { id: puntoExpedicion.id },
        data: { ultimoNumeroFactura: { increment: 1 } },
        select: { ultimoNumeroFactura: true },
      });
      const comprobante = await crearComprobante(tx, {
        storeId,
        origen: { cuentaDeliveryId: cuenta.id },
        punto: puntoExpedicion,
        correlativo: peActualizado.ultimoNumeroFactura,
        receptor: {
          tipoIdentificacion: tipoIdFactura,
          numeroIdentificacion: numeroIdFactura,
          razonSocial: razonSocialFactura,
          email: emailFactura,
        },
        presencia: "domicilio",
        // La factura rápida es siempre al contado: el crédito se decide al cobrar y no se combina con una factura ya emitida.
        condicion: "contado",
        fechaVencimientoCredito: null,
        items: filasVenta.map((f) => ({
          productId: f.productId ?? null,
          descripcion: descripcionDeItem(f.nombreProducto, f.opcionesTexto ?? undefined),
          unidadMedida: f.productId ? (unidadDelProducto.get(f.productId) ?? null) : f.nombreProducto === NOMBRE_LINEA_ENVIO ? "unidad" : null,
          esServicio: f.productId ? (esServicioElProducto.get(f.productId) ?? false) : f.nombreProducto === NOMBRE_LINEA_ENVIO ? null : false,
          cantidad: f.cantidad,
          precioUnitario: f.precioUnitario,
          iva: f.iva,
          // El descuento es sobre los productos: la línea de envío sale completa en la factura.
          sinDescuento: f.productId === null && f.nombreProducto === NOMBRE_LINEA_ENVIO,
        })),
        descuento: totales.descuento,
        emitidoPor,
      });
      return comprobante.numero;
    }, OPCIONES_TX);
  } catch (e) {
    if (e instanceof ErrorDeUsuario) return { ok: false, error: e.message };
    console.error("[delivery] emitirFacturaDelivery falló", e);
    return {
      ok: false,
      error: `No se pudo emitir la factura. Antes de volver a intentar, fijate en el detalle de la cuenta si la factura quedó emitida. (Detalle: ${pistaDelError(e)})`,
    };
  }

  await registrarBitacora(storeId, sesion, {
    modulo: "delivery",
    accion: "factura_emitida",
    descripcion: `Emitió la factura ${numeroFactura} de la cuenta ${formatearNumero(cuenta.numero)} de delivery (${cuenta.clienteNombre}) por ${formatearGuarani(total)}, antes de cobrarla.`,
    entidad: "CuentaDelivery",
    entidadId: cuenta.id,
    detalle: { cuenta: cuenta.numero, factura: numeroFactura, total, cliente: razonSocialFactura ?? SIN_REGISTRO_FISCAL.etiquetaDisplay },
  });
  refrescar();
  return { ok: true, numero: numeroFactura };
}

/**
 * Anula la factura emitida con la "factura rápida" (porque estaba mal, o porque hay que cambiar la cuenta). El número queda consumido
 * para siempre y registrado como anulado, con quién lo anuló y por qué; la cuenta vuelve a poder reabrirse y se puede emitir otra
 * factura. Solo mientras la cuenta no se haya cobrado: una vez cobrada, la factura se anula desde Facturas (o cancelando la venta).
 */
export async function anularFacturaDelivery(cuentaId: string, motivo: string): Promise<Resultado> {
  await exigirPermiso("delivery.gestionar");
  const sesion = await exigirPermiso("pos.vender");
  const storeId = await idLocalActual();
  const razon = limpiarMotivo(motivo);
  if (!razon) return { ok: false, error: MENSAJE_MOTIVO };
  const quien = nombreDe(sesion);

  let numeroFactura = "";
  let numeroCuenta = 0;
  try {
    const hecho = await prisma.$transaction(async (tx) => {
      // Se bloquea la fila de la cuenta, con el estado en la condición: si la cobran justo ahora, no se anula.
      const cuenta = await tx.cuentaDelivery.findFirst({
        where: { id: String(cuentaId), storeId, estado: "por_cobrar" },
        select: { id: true, numero: true },
      });
      if (!cuenta) throw new ErrorDeUsuario("Esa cuenta ya fue cobrada o cerrada: la factura ya no se anula desde acá.");
      const bloqueada = await tx.cuentaDelivery.updateMany({
        where: { id: cuenta.id, storeId, estado: "por_cobrar" },
        data: { estado: "por_cobrar" },
      });
      if (bloqueada.count !== 1) throw new ErrorDeUsuario("Esa cuenta ya fue cobrada o cerrada. Actualizá la pantalla.");
      const comprobante = await tx.comprobante.findFirst({
        where: { storeId, cuentaDeliveryId: cuenta.id, estado: "vigente" },
        select: { numero: true },
      });
      if (!comprobante) throw new ErrorDeUsuario("Esa cuenta no tiene una factura vigente.");
      await anularComprobantes(tx, {
        storeId,
        origen: { cuentaDeliveryId: cuenta.id },
        por: quien,
        en: new Date(),
        motivo: razon,
      });
      return { numeroFactura: comprobante.numero, numeroCuenta: cuenta.numero };
    }, OPCIONES_TX);
    numeroFactura = hecho.numeroFactura;
    numeroCuenta = hecho.numeroCuenta;
  } catch (e) {
    if (e instanceof ErrorDeUsuario) return { ok: false, error: e.message };
    console.error("[delivery] anularFacturaDelivery falló", e);
    return { ok: false, error: `No se pudo anular la factura. (Detalle: ${pistaDelError(e)})` };
  }

  await registrarBitacora(storeId, sesion, {
    modulo: "delivery",
    accion: "factura_anulada",
    descripcion: `Anuló la factura ${numeroFactura} de la cuenta ${formatearNumero(numeroCuenta)} de delivery, antes de cobrarla. Motivo: ${razon}.`,
    entidad: "CuentaDelivery",
    entidadId: String(cuentaId),
    detalle: { cuenta: numeroCuenta, factura: numeroFactura, motivo: razon },
  });
  refrescar();
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------------
//  El repartidor
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Le asigna (o, con "", le saca) el repartidor a la cuenta. Asignarlo YA lo manda a trabajar: el pedido le aparece al instante en su
 * enlace (que se actualiza solo), sin ningún "salió" ni "entregado" de por medio. Se puede cambiar mientras la cuenta no esté cerrada;
 * una vez cobrada queda en el historial de su enlace con la forma de pago con la que se cerró.
 */
export async function asignarRepartidorDelivery(cuentaId: string, repartidorId: string): Promise<Resultado> {
  const sesion = await exigirPermiso("delivery.gestionar");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const cuenta = await db.cuentaDelivery.findFirst({
    where: { id: String(cuentaId) },
    select: { id: true, numero: true, estado: true },
  });
  if (!cuenta) return { ok: false, error: "No encontré esa cuenta." };
  if (cuenta.estado !== "abierta" && cuenta.estado !== "por_cobrar") {
    return { ok: false, error: "Esa cuenta ya está cerrada: no se le puede cambiar el repartidor." };
  }

  // El repartidor se busca dentro de ESTE local y tiene que estar activo: un id de otro negocio no aparece.
  let repartidor: { id: string; nombre: string } | null = null;
  if (repartidorId) {
    repartidor = await db.repartidor.findFirst({ where: { id: String(repartidorId), activo: true }, select: { id: true, nombre: true } });
    if (!repartidor) return { ok: false, error: "Ese repartidor ya no está activo. Elegí otro." };
  }

  // Con repartidor la cuenta queda "en ruta" (la hora sirve para avisarle que es nueva); sin repartidor, vuelve a "por salir". El
  // estado va en la condición: si la cobraron o cancelaron en el mismo instante, no se cambia.
  const asignada = await db.cuentaDelivery.updateMany({
    where: { id: cuenta.id, estado: { in: [...ESTADOS_DELIVERY_ABIERTA] } },
    data: {
      repartidorId: repartidor?.id ?? null,
      entrega: repartidor ? "en_ruta" : "pendiente",
      salioEn: repartidor ? new Date() : null,
      entregadaEn: null,
    },
  });
  if (asignada.count !== 1) return { ok: false, error: "La cuenta ya no se puede cambiar. Actualizá la pantalla." };

  await registrarBitacora(storeId, sesion, {
    modulo: "delivery",
    accion: repartidor ? "repartidor_asignado" : "repartidor_quitado",
    descripcion: repartidor
      ? `Le asignó el repartidor ${repartidor.nombre} a la cuenta ${formatearNumero(cuenta.numero)} de delivery.`
      : `Le sacó el repartidor a la cuenta ${formatearNumero(cuenta.numero)} de delivery.`,
    entidad: "CuentaDelivery",
    entidadId: cuenta.id,
    detalle: { cuenta: cuenta.numero, repartidor: repartidor?.nombre ?? null },
  });
  refrescar();
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------------
//  Pagar la cuenta
// ---------------------------------------------------------------------------------------------------------------------

export type DatosCobroDelivery = {
  /** Cómo paga el cliente: una forma, o varias si divide el pago (ver validarPagosDeVenta). */
  pagos: { forma: string; monto: number }[];
  /** "ticket" | "factura": factura solo si la estación tiene un punto de expedición vigente. */
  comprobanteTipo: string;
  facturaTipoIdentificacion?: string;
  facturaNumeroIdentificacion?: string;
  facturaRazonSocial?: string;
  facturaEmail?: string;
  /** Solo si se paga "a_credito": en cuántos días vence lo que debe el cliente (0 a 365; por defecto 30). */
  creditoDias?: number;
  /**
   * El total que la persona tenía en pantalla al cobrar. No se usa para cobrar (el total sale de la cuenta): sirve para avisar si
   * la cuenta cambió mientras se cobraba en vez de cobrar un monto distinto del que se vio.
   */
  totalMostrado?: number;
};

export type ResultadoPagoDelivery =
  | { ok: true; ventaId: string; total: number }
  /** `sinTurno`: no hay turno de caja abierto; la pantalla manda directo a abrirlo (ver src/lib/turno-requerido.ts). */
  | { ok: false; error: string; sinTurno?: true };

/**
 * Cobra la cuenta y la cierra: genera una venta del Punto de Venta (entra en el turno de caja de ESTA estación, en el cierre y en
 * todos los reportes) con la misma regla de factura o ticket que el mostrador, según el punto de expedición de la estación. El
 * costo de envío entra como una línea más de la venta y de la factura (sin descuento). El stock NO se vuelve a descontar: ya bajó al
 * cargar cada pedido. Los precios son los que quedaron en la cuenta; lo único que llega del navegador es cómo se paga y los datos
 * de la factura.
 */
export async function pagarCuentaDelivery(cuentaId: string, datos: DatosCobroDelivery): Promise<ResultadoPagoDelivery> {
  await exigirPermiso("delivery.gestionar");
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
    return { ok: false, error: "No hay un turno de caja abierto en esta estación. Abrilo y volvé a cobrar.", sinTurno: true };
  }
  const puntoExpedicion = (
    await db.estacion.findUnique({ where: { id: estacion.id }, select: { puntoExpedicion: true } })
  )?.puntoExpedicion ?? null;
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { facturaObligatoria: true, ventasACredito: true },
  });

  // Si a esta cuenta ya se le emitió la factura ("factura rápida"), el cobro usa ESA factura: no sale otra ni se consume otro número,
  // y los datos del comprador y del timbrado son los de la factura emitida (lo que llegue del navegador sobre la factura se ignora).
  const facturaPrevia = await db.comprobante.findFirst({
    where: { cuentaDeliveryId: String(cuentaId), estado: "vigente" },
  });

  // ------------------------------------------------------------ factura o ticket (mismas reglas que el mostrador)
  const esFactura = !!facturaPrevia || datos?.comprobanteTipo === "factura";
  const esSinRegistroFiscal = facturaPrevia
    ? facturaPrevia.receptorTipoIdentificacion === SIN_REGISTRO_FISCAL.tipo
    : datos?.facturaTipoIdentificacion === SIN_REGISTRO_FISCAL.tipo;
  const facturaObligatoria = store?.facturaObligatoria ?? false;
  const puntoVigente = !!puntoExpedicion && puntoExpedicion.activo && puntoExpedicion.timbradoHasta > new Date();

  if (facturaObligatoria && !facturaPrevia) {
    if (!puntoVigente) {
      return {
        ok: false,
        error:
          "Este local exige facturar todas las ventas y esta estación no tiene un punto de expedición vigente asignado. Pedile al dueño que lo asigne en Puntos de expedición.",
      };
    }
    if (!esFactura) return { ok: false, error: "Este local exige facturar todas las ventas — no se puede cobrar como ticket." };
  }
  // Los datos del comprador ya revisados (texto limpio): lo que se guarda y se factura es esto, no lo que llegó crudo del navegador.
  let comprador: { tipoIdentificacion: string; numeroIdentificacion: string; razonSocial: string | null; email: string | null } | null =
    null;
  // Con la factura ya emitida no se vuelve a validar nada de esto: ya se hizo al emitirla.
  if (esFactura && !facturaPrevia) {
    if (!datos.facturaTipoIdentificacion) return { ok: false, error: "Elegí con o sin registro fiscal." };
    if (!esSinRegistroFiscal) {
      // La validación mínima: el RUC con su dígito, razón social de al menos 4 letras, correo válido.
      const revisado = validarDatosFiscales({
        modo: "con_registro",
        tipoIdentificacion: datos.facturaTipoIdentificacion,
        numeroIdentificacion: datos.facturaNumeroIdentificacion,
        razonSocial: datos.facturaRazonSocial,
        email: datos.facturaEmail,
      });
      if (!revisado.ok) return { ok: false, error: revisado.error };
      comprador = revisado.datos;
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
    // Timbrado electrónico: la factura se firma al cobrar, así que antes se comprueba que el certificado y el resto estén listos.
    if (esElectronico(puntoExpedicion.modalidad)) {
      const problema = await problemaParaEmitirElectronico(storeId);
      if (problema) return { ok: false, error: problema };
    }
  }

  // ------------------------------------------------------------------------- la cuenta y lo que vale
  const cuenta = await db.cuentaDelivery.findFirst({
    where: { id: String(cuentaId), estado: { in: [...ESTADOS_DELIVERY_ABIERTA] } },
    include: { items: { where: { estado: "activo" }, orderBy: [{ ronda: "asc" }, { linea: "asc" }] } },
  });
  if (!cuenta) return { ok: false, error: "Esa cuenta ya está cerrada." };
  // Una cuenta se cobra DESPUÉS de imprimirse (queda "por cobrar"): el cliente tiene que haber recibido su cuenta, y la impresión
  // deja constancia de lo que se cobra. Se exige acá, en el servidor: que el botón esté apagado no alcanza.
  if (cuenta.estado !== "por_cobrar") {
    return { ok: false, error: "Primero imprimí la cuenta: se cobra después de imprimirla." };
  }
  if (cuenta.items.length === 0) return { ok: false, error: "La cuenta no tiene productos para cobrar." };

  // Lo que se cobra y se factura: el mismo producto cargado en varios pedidos va en UNA línea con la cantidad sumada (la nota de
  // cocina no cuenta). El envío es una línea más, aparte de los productos.
  const filas = lineasDeCobro(
    cuenta.items.map((i) => ({
      productId: i.productId,
      nombreProducto: i.nombreProducto,
      cantidad: i.cantidad,
      precioUnitario: Number(i.precioUnitario),
      iva: i.iva,
      opcionesTexto: i.opcionesTexto,
      costoProducto: i.costoProducto == null ? null : Number(i.costoProducto),
      costoAgregados: i.costoAgregados == null ? null : Number(i.costoAgregados),
      precioAgregados: Number(i.precioAgregados),
      // La promoción de la línea: pasa a la venta, para el reporte de Promociones.
      promocionId: i.promocionId,
      cortesia: i.cortesia,
      precioAntesPromo: i.precioAntesPromo == null ? null : Number(i.precioAntesPromo),
    }))
  );
  const totales = totalesDeDelivery(filas, Number(cuenta.costoEnvio), descuentoDeCuenta(cuenta));
  if (totales.descuentoInvalido) {
    return { ok: false, error: `El descuento ya no corresponde a esta cuenta (${totales.descuentoInvalido}) Quitalo o cambialo.` };
  }
  const total = totales.total;
  // Un total en cero es válido cuando es una cortesía (descuento del 100 %): se vende y se factura en cero, y si hace falta se anula la factura.
  if (!Number.isFinite(total) || total < 0) return { ok: false, error: "El total de la cuenta no es válido." };
  const envio = lineaDeEnvio(totales.envio);
  const filasVenta = envio ? [...filas, envio] : filas;

  // La factura ya emitida tiene que decir lo mismo que se cobra: la cuenta está congelada desde que se emitió, así que siempre
  // coincide; si no, algo se tocó por fuera y no se cobra con una factura que no corresponde.
  if (facturaPrevia && Math.round(Number(facturaPrevia.total)) !== Math.round(total)) {
    return {
      ok: false,
      error: `La factura emitida (${facturaPrevia.numero}) es de ${formatearGuarani(Number(facturaPrevia.total))} y la cuenta ahora es de ${formatearGuarani(total)}. Anulá la factura y emití otra.`,
    };
  }

  // Si la cuenta cambió mientras se cobraba (se le cargó algo, o la caja le dio un descuento desde otra pantalla), el monto que la
  // persona vio ya no es el real: se avisa en vez de cobrar otra cosa.
  if (datos?.totalMostrado != null && Math.round(Number(datos.totalMostrado)) !== Math.round(total)) {
    return {
      ok: false,
      error: `La cuenta cambió mientras la cobrabas: ahora es de ${formatearGuarani(total)}. Cerrá este cuadro y volvé a abrir el cobro.`,
    };
  }

  // Venta a crédito (mismas reglas que el mostrador): solo si el local la activó. El cliente de la cuenta siempre tiene nombre y
  // teléfono, así que alcanza para cobrarle después. A crédito va sola: no se combina con otras formas de pago.
  const esCredito =
    Array.isArray(datos?.pagos) &&
    datos.pagos.length === 1 &&
    String(datos.pagos[0]?.forma ?? "").trim().toLowerCase() === FORMA_PAGO_A_CREDITO;
  let fechaVencimientoCredito: Date | null = null;
  if (esCredito) {
    // La factura rápida sale siempre al contado: una venta a crédito con esa factura diría una condición que no es la de la venta.
    if (facturaPrevia) {
      return {
        ok: false,
        error: "La factura de esta cuenta ya se emitió al contado: no se puede cobrar a crédito. Anulá la factura si querés cobrarla a crédito.",
      };
    }
    if (!store?.ventasACredito) return { ok: false, error: "Este local no vende a crédito. Se activa en Configuración." };
    // Una cuenta en cero (cortesía) no tiene nada que cobrar después: a crédito no corresponde.
    if (total <= 0) return { ok: false, error: "Una cuenta en cero (cortesía) no se carga a crédito. Elegí otra forma de pago." };
    const diasPedidos = Math.round(Number(datos.creditoDias ?? 30));
    const dias = Number.isFinite(diasPedidos) ? Math.min(Math.max(diasPedidos, 0), 365) : 30;
    // El vencimiento es un día (no una hora): se guarda a medianoche UTC, como las demás fechas de día.
    fechaVencimientoCredito = new Date(Date.parse(claveDiaAsuncion(new Date())) + dias * 24 * 60 * 60 * 1000);
  }
  const pagosValidados = validarPagosDeVenta(datos?.pagos, total);
  if (!pagosValidados.ok) return { ok: false, error: pagosValidados.error };

  // Para la factura, cada línea lleva su unidad de medida y si es un servicio.
  const idsDeProductos = [...new Set(filas.flatMap((f) => (f.productId ? [f.productId] : [])))];
  const datosProductos =
    esFactura && idsDeProductos.length
      ? await db.product.findMany({ where: { id: { in: idsDeProductos } }, select: { id: true, unidadMedida: true, esServicio: true } })
      : [];
  const unidadDelProducto = new Map(datosProductos.map((p) => [p.id, p.unidadMedida]));
  const esServicioElProducto = new Map(datosProductos.map((p) => [p.id, p.esServicio]));

  const numero = await siguienteNumeroVentaPos(storeId);
  const notaVenta = `Delivery · Cuenta ${formatearNumero(cuenta.numero)}`;
  // Lo que va en la factura sobre el comprador: "Sin Nombre" (Consumidor Final) o los datos ya revisados.
  const compradorFinal = comprador;
  const tipoIdFactura = esSinRegistroFiscal ? SIN_REGISTRO_FISCAL.tipo : (compradorFinal?.tipoIdentificacion ?? "");
  const numeroIdFactura = esSinRegistroFiscal ? SIN_REGISTRO_FISCAL.numero : (compradorFinal?.numeroIdentificacion ?? "");
  const razonSocialFactura = esSinRegistroFiscal ? null : (compradorFinal?.razonSocial ?? null);
  const emailFactura = esSinRegistroFiscal ? null : (compradorFinal?.email ?? null);

  let ventaId = "";
  try {
    ventaId = await prisma.$transaction(async (tx) => {
      // Primero se cierra la cuenta, con el estado en la condición: si otra caja la cobró (o se canceló) en el mismo instante, acá
      // no encuentra nada, se deshace todo y no queda una factura de más.
      const cerrada = await tx.cuentaDelivery.updateMany({
        // "por_cobrar" en la condición: si la reabrieron (o la cobraron) mientras se armaba el cobro, no se cobra.
        where: { id: cuenta.id, storeId, estado: "por_cobrar" },
        data: { estado: "pagada", cerradaEn: new Date(), cerradaPor: registradoPor },
      });
      if (cerrada.count !== 1) {
        throw new ErrorDeUsuario("Esa cuenta ya fue cobrada, cancelada o reabierta. Actualizá la pantalla.");
      }

      let datosFactura: Record<string, unknown> = { comprobanteTipo: "ticket" };
      let correlativoFactura: number | null = null;

      if (facturaPrevia) {
        // La factura ya salió ("factura rápida"): la venta se registra con ESA factura (mismo número, timbrado y montos), sin consumir
        // otro número ni crear otro comprobante.
        datosFactura = {
          comprobanteTipo: "factura",
          facturaTipoIdentificacion: facturaPrevia.receptorTipoIdentificacion,
          facturaRazonSocial: facturaPrevia.receptorRazonSocial,
          facturaRuc: facturaPrevia.receptorNumeroIdentificacion,
          facturaNumero: facturaPrevia.numero,
          facturaTimbrado: facturaPrevia.timbrado,
          facturaVencimiento: facturaPrevia.timbradoHasta,
          facturaGravado10: Number(facturaPrevia.gravado10),
          facturaGravado5: Number(facturaPrevia.gravado5),
          facturaExento: Number(facturaPrevia.exento),
          facturaIva10: Number(facturaPrevia.iva10),
          facturaIva5: Number(facturaPrevia.iva5),
          facturaRazonSocialEmisor: facturaPrevia.emisorRazonSocial,
          facturaRucEmisor: facturaPrevia.emisorRuc,
        };
      } else if (esFactura && puntoExpedicion) {
        if (compradorFinal?.razonSocial) {
          await upsertClienteFiscal(tx, storeId, {
            tipoIdentificacion: compradorFinal.tipoIdentificacion,
            numeroIdentificacion: compradorFinal.numeroIdentificacion,
            razonSocial: compradorFinal.razonSocial,
            email: compradorFinal.email ?? "",
          });
        }
        // Atómico: se incrementa PRIMERO y se usa el valor ya incrementado (dos cobros a la vez no toman el mismo número).
        const peActualizado = await tx.puntoExpedicion.update({
          where: { id: puntoExpedicion.id },
          data: { ultimoNumeroFactura: { increment: 1 } },
          select: { ultimoNumeroFactura: true },
        });
        correlativoFactura = peActualizado.ultimoNumeroFactura;
        const desglose = desglosarIva(filasVenta, totales.descuento);
        datosFactura = {
          comprobanteTipo: "factura",
          facturaTipoIdentificacion: tipoIdFactura,
          facturaRazonSocial: razonSocialFactura,
          facturaRuc: numeroIdFactura,
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
          // El cliente de la cuenta: cuenta para su ficha y su fidelización, y es a quien se le cobra si la venta es a crédito.
          clienteNombre: cuenta.clienteNombre,
          clienteTelefono: cuenta.clienteTelefono,
          fechaVencimientoCredito,
          tipoEntrega: "delivery",
          nota: notaVenta,
          ...datosFactura,
          items: {
            create: filasVenta.map((f) => ({
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
              promocionId: f.promocionId ?? null,
              cortesia: f.cortesia === true,
              precioAntesPromo: f.precioAntesPromo ?? null,
              esEnvio: f.nombreProducto === NOMBRE_LINEA_ENVIO && f.productId === null,
            })),
          },
        },
        select: { id: true },
      });

      if (facturaPrevia) {
        // El comprobante de la factura rápida pasa a colgar también de esta venta (sigue siendo el mismo, con el mismo número): así la
        // factura, el documento electrónico y la anulación al cancelar la venta funcionan igual que en cualquier otra venta.
        const ligado = await tx.comprobante.updateMany({
          where: { id: facturaPrevia.id, storeId, estado: "vigente", ventaPosId: null },
          data: { ventaPosId: venta.id },
        });
        if (ligado.count !== 1) {
          throw new ErrorDeUsuario("La factura de esta cuenta cambió mientras se cobraba (¿la anularon?). Actualizá la pantalla.");
        }
      } else if (esFactura && puntoExpedicion && correlativoFactura !== null) {
        await crearComprobante(tx, {
          storeId,
          origen: { ventaPosId: venta.id },
          punto: puntoExpedicion,
          correlativo: correlativoFactura,
          receptor: {
            tipoIdentificacion: tipoIdFactura,
            numeroIdentificacion: numeroIdFactura,
            razonSocial: razonSocialFactura,
            email: emailFactura,
          },
          presencia: "domicilio",
          condicion: esCredito ? "credito" : "contado",
          fechaVencimientoCredito,
          items: filasVenta.map((f) => ({
            productId: f.productId ?? null,
            descripcion: descripcionDeItem(f.nombreProducto, f.opcionesTexto ?? undefined),
            unidadMedida: f.productId ? (unidadDelProducto.get(f.productId) ?? null) : f.nombreProducto === NOMBRE_LINEA_ENVIO ? "unidad" : null,
            // Un combo mitad y mitad (sin producto único) es comida: mercadería. El envío no cuenta para decidir el tipo de
            // transacción (como en cualquier factura de delivery).
            esServicio: f.productId ? (esServicioElProducto.get(f.productId) ?? false) : f.nombreProducto === NOMBRE_LINEA_ENVIO ? null : false,
            cantidad: f.cantidad,
            precioUnitario: f.precioUnitario,
            iva: f.iva,
            // El descuento es sobre los productos: la línea de envío sale completa en la factura.
            sinDescuento: f.productId === null && f.nombreProducto === NOMBRE_LINEA_ENVIO,
          })),
          descuento: totales.descuento,
          emitidoPor: registradoPor,
        });
      }

      await tx.cuentaDelivery.update({ where: { id: cuenta.id }, data: { ventaPosId: venta.id } });
      return venta.id;
    }, OPCIONES_TX);
  } catch (e) {
    if (e instanceof ErrorDeUsuario || e instanceof ErrorFacturaElectronica) return { ok: false, error: e.message };
    console.error("[delivery] pagarCuentaDelivery falló", e);
    return {
      ok: false,
      error: `No se pudo confirmar el cobro. Antes de volver a intentar, fijate en el Historial de cuentas si la venta quedó registrada. (Detalle: ${pistaDelError(e)})`,
    };
  }

  await registrarBitacora(storeId, sesion, {
    modulo: "delivery",
    accion: "cuenta_pagada",
    descripcion: `Cobró la cuenta ${formatearNumero(cuenta.numero)} de delivery (${cuenta.clienteNombre}) por ${formatearGuarani(total)}${
      facturaPrevia ? ` con la factura ${facturaPrevia.numero} (emitida antes)` : esFactura ? " con factura" : " con ticket"
    }${esCredito ? ", a crédito" : ""}${
      totales.descuento > 0 ? `, con un descuento de ${formatearGuarani(totales.descuento)}` : ""
    }${totales.envio > 0 ? `, con ${formatearGuarani(totales.envio)} de envío` : ""}.`,
    entidad: "VentaPos",
    entidadId: ventaId,
    detalle: {
      cuenta: formatearNumero(cuenta.numero),
      cliente: cuenta.clienteNombre,
      subtotal: totales.subtotal,
      descuento: totales.descuento,
      envio: totales.envio,
      total,
      comprobante: esFactura ? "factura" : "ticket",
      a_credito: esCredito,
    },
  });

  revalidatePath("/admin/delivery");
  revalidatePath("/admin/pos");
  revalidatePath("/admin/pos/cuentas");
  return { ok: true, ventaId, total };
}
