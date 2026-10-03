"use server";

import { prisma } from "@/lib/prisma";
import { MAXIMO_INTENTOS_PIN, MINUTOS_BLOQUEO_PIN, pinValido } from "@/lib/asistencia";
import {
  abrirSesionMozo,
  cerrarSesionMozo,
  claveDePinMozo,
  localPorTokenMozos,
  mozoDeSesion,
  nombreDeMozo,
  type LocalMozos,
  type MozoEnSesion,
} from "@/lib/sesion-mozo";
import type { LineaPedida } from "@/lib/precio-pedido";
import { registrarBitacora } from "@/lib/bitacora";
import { formatearGuarani } from "@/lib/format";
import { ESTADOS_CUENTA_ABIERTA, SEGUNDOS_LATIDO_IMPRESION, normalizarMesa, totalDeLineas } from "@/lib/comedor";
import { guardarRonda } from "@/lib/comedor-servidor";

/**
 * Las acciones del enlace público del mozo (/mozo/[token]), sin usuario del panel.
 *
 * La llave de la dirección lleva al local y el PIN identifica al mozo (ver src/lib/sesion-mozo.ts). Cada acción vuelve a
 * resolver el local desde la llave y exige la sesión del mozo: aunque alguien arme un dato a mano, el local siempre sale
 * de ahí y nunca de lo que mande el navegador. El precio lo recalcula el servidor (el celular solo dice qué y cuántos).
 *
 * Todas devuelven un resultado en vez de lanzar: Next.js oculta en producción el mensaje de cualquier excepción de una
 * acción del servidor, y el mozo tiene que saber POR QUÉ no se pudo.
 */

type Contexto = { local: LocalMozos; mozo: MozoEnSesion };
type FalloContexto = { ok: false; error: string; sesionVencida?: boolean };

const SESION_VENCIDA = "Tu sesión se cerró. Entrá de nuevo con tu PIN.";

/** El local de la llave y el mozo de la sesión, o el motivo por el que no se puede seguir. */
async function contextoDelMozo(token: string): Promise<({ ok: true } & Contexto) | FalloContexto> {
  const local = await localPorTokenMozos(token);
  if (!local) return { ok: false, error: "Este enlace ya no está activo." };
  const mozo = await mozoDeSesion(local);
  if (!mozo) return { ok: false, error: SESION_VENCIDA, sesionVencida: true };
  return { ok: true, local, mozo };
}

// ---------------------------------------------------------------------------
//  Entrar con el PIN
// ---------------------------------------------------------------------------

export type ResultadoEntrada = { ok: true } | { ok: false; error: string };

/**
 * El mozo pone su PIN. Si es de un mozo activo del local, queda con la sesión abierta en este navegador. Los PIN
 * incorrectos seguidos se cuentan por local (el PIN es lo que identifica, así que no se puede bloquear "a ese mozo"):
 * al llegar al tope el enlace se bloquea unos minutos. Mismo diseño que el celular fijo de asistencia.
 */
export async function entrarConPin(token: string, pin: string): Promise<ResultadoEntrada> {
  const local = await localPorTokenMozos(token);
  if (!local) return { ok: false, error: "Este enlace ya no está activo." };

  const ahora = new Date();
  if (local.bloqueoMozosHasta && local.bloqueoMozosHasta > ahora) {
    const minutos = Math.max(1, Math.ceil((local.bloqueoMozosHasta.getTime() - ahora.getTime()) / 60000));
    return { ok: false, error: `Demasiados PIN incorrectos. Probá de nuevo en ${minutos} min.` };
  }
  if (!pinValido(pin)) return { ok: false, error: "El PIN tiene entre 4 y 6 números." };

  const mozo = await prisma.mozo.findFirst({
    where: { storeId: local.id, pinClave: claveDePinMozo(local.id, pin), activo: true },
    select: { id: true },
  });

  if (!mozo) {
    // El incremento es atómico: dos intentos a la vez no se pisan el conteo.
    const { intentosPinMozos } = await prisma.store.update({
      where: { id: local.id },
      data: { intentosPinMozos: { increment: 1 } },
      select: { intentosPinMozos: true },
    });
    if (intentosPinMozos >= MAXIMO_INTENTOS_PIN) {
      await prisma.store.update({
        where: { id: local.id },
        data: {
          intentosPinMozos: 0,
          bloqueoMozosHasta: new Date(ahora.getTime() + MINUTOS_BLOQUEO_PIN * 60000),
        },
      });
      return { ok: false, error: `PIN incorrecto. El enlace se bloquea ${MINUTOS_BLOQUEO_PIN} minutos.` };
    }
    const quedan = MAXIMO_INTENTOS_PIN - intentosPinMozos;
    return {
      ok: false,
      error: `PIN incorrecto. ${quedan === 1 ? "Te queda 1 intento" : `Te quedan ${quedan} intentos`}.`,
    };
  }

  if (local.intentosPinMozos > 0 || local.bloqueoMozosHasta) {
    await prisma.store.update({
      where: { id: local.id },
      data: { intentosPinMozos: 0, bloqueoMozosHasta: null },
    });
  }

  await abrirSesionMozo(local.id, mozo.id);
  return { ok: true };
}

/** Cierra la sesión del mozo en este navegador (para que otro mozo use el mismo celular). */
export async function salirDelSalon(token: string): Promise<{ ok: true }> {
  void token;
  await cerrarSesionMozo();
  return { ok: true };
}

// ---------------------------------------------------------------------------
//  Ver el salón y una cuenta
// ---------------------------------------------------------------------------

export type CuentaAbierta = {
  id: string;
  numero: number;
  mesa: string;
  mozo: string;
  /** Cuándo se abrió, en ISO (el celular calcula "hace cuánto"). */
  abiertaEn: string;
  productos: number;
  rondas: number;
  /** "abierta", o "por_cobrar" si la caja ya imprimió la cuenta: el mozo no puede cargarle más hasta que la reabran. */
  estado: string;
  total: number;
};

export type EstadoDelSalon =
  | { ok: true; cuentas: CuentaAbierta[]; imprimiendo: boolean }
  | FalloContexto;

/** ¿Hay alguna estación que haya preguntado por comandas hace poco? Si no, lo que se envíe queda en espera. */
async function hayEstacionImprimiendo(storeId: string): Promise<boolean> {
  const desde = new Date(Date.now() - SEGUNDOS_LATIDO_IMPRESION * 1000);
  const estacion = await prisma.estacion.findFirst({
    where: { storeId, impresionVistaEn: { gte: desde } },
    select: { id: true },
  });
  return !!estacion;
}

/** Las cuentas abiertas del local (las mesas ocupadas) y si hay una estación imprimiendo. */
export async function estadoDelSalon(token: string): Promise<EstadoDelSalon> {
  const ctx = await contextoDelMozo(token);
  if (!ctx.ok) return ctx;

  const [cuentas, imprimiendo] = await Promise.all([
    prisma.cuentaMesa.findMany({
      where: { storeId: ctx.local.id, estado: { in: [...ESTADOS_CUENTA_ABIERTA] } },
      orderBy: { abiertaEn: "asc" },
      select: {
        id: true,
        numero: true,
        mesa: true,
        abiertaEn: true,
        estado: true,
        mozo: { select: { nombre: true, apellido: true } },
        items: { where: { estado: "activo" }, select: { cantidad: true, precioUnitario: true, ronda: true } },
      },
    }),
    hayEstacionImprimiendo(ctx.local.id),
  ]);

  return {
    ok: true,
    imprimiendo,
    cuentas: cuentas.map((c) => ({
      id: c.id,
      numero: c.numero,
      mesa: c.mesa,
      mozo: nombreDeMozo(c.mozo),
      estado: c.estado,
      abiertaEn: c.abiertaEn.toISOString(),
      productos: c.items.reduce((s, i) => s + i.cantidad, 0),
      rondas: new Set(c.items.map((i) => i.ronda)).size,
      total: totalDeLineas(c.items.map((i) => ({ precioUnitario: Number(i.precioUnitario), cantidad: i.cantidad }))),
    })),
  };
}

export type ItemDeCuenta = {
  id: string;
  cantidad: number;
  nombre: string;
  detalle: string | null;
  nota: string | null;
  precioUnitario: number;
  anulado: boolean;
};

export type RondaDeCuenta = { ronda: number; enviadoEn: string; mozo: string; items: ItemDeCuenta[] };

export type DetalleDeCuenta =
  | { ok: true; id: string; numero: number; mesa: string; mozo: string; estado: string; total: number; rondas: RondaDeCuenta[] }
  | FalloContexto;

/** Lo que lleva una cuenta abierta, por rondas (solo para mirar: el mozo no anula ni cobra desde acá). */
export async function detalleDeCuenta(token: string, cuentaId: string): Promise<DetalleDeCuenta> {
  const ctx = await contextoDelMozo(token);
  if (!ctx.ok) return ctx;

  const cuenta = await prisma.cuentaMesa.findFirst({
    where: { id: String(cuentaId), storeId: ctx.local.id, estado: { in: [...ESTADOS_CUENTA_ABIERTA] } },
    select: {
      id: true,
      numero: true,
      estado: true,
      mesa: true,
      mozo: { select: { nombre: true, apellido: true } },
      items: {
        orderBy: [{ ronda: "asc" }, { linea: "asc" }],
        select: {
          id: true,
          ronda: true,
          enviadoEn: true,
          cantidad: true,
          nombreProducto: true,
          opcionesTexto: true,
          ingredientesQuitadosTexto: true,
          nota: true,
          precioUnitario: true,
          estado: true,
          mozo: { select: { nombre: true, apellido: true } },
        },
      },
    },
  });
  if (!cuenta) return { ok: false, error: "Esa cuenta ya no está abierta." };

  const rondas = new Map<number, RondaDeCuenta>();
  for (const i of cuenta.items) {
    const ronda =
      rondas.get(i.ronda) ??
      ({ ronda: i.ronda, enviadoEn: i.enviadoEn.toISOString(), mozo: nombreDeMozo(i.mozo), items: [] } as RondaDeCuenta);
    ronda.items.push({
      id: i.id,
      cantidad: i.cantidad,
      nombre: i.nombreProducto,
      detalle: [i.opcionesTexto, i.ingredientesQuitadosTexto].filter(Boolean).join(" · ") || null,
      nota: i.nota,
      precioUnitario: Number(i.precioUnitario),
      anulado: i.estado === "anulado",
    });
    rondas.set(i.ronda, ronda);
  }

  const activos = cuenta.items.filter((i) => i.estado === "activo");
  return {
    ok: true,
    id: cuenta.id,
    numero: cuenta.numero,
    mesa: cuenta.mesa,
    mozo: nombreDeMozo(cuenta.mozo),
    estado: cuenta.estado,
    total: totalDeLineas(activos.map((i) => ({ precioUnitario: Number(i.precioUnitario), cantidad: i.cantidad }))),
    rondas: [...rondas.values()],
  };
}

// ---------------------------------------------------------------------------
//  Enviar el pedido de una mesa
// ---------------------------------------------------------------------------

/** Una línea que carga el mozo: lo mismo que el menú digital (qué y cuántos) más una nota para la cocina. */
export type LineaDelMozo = LineaPedida & { nota?: string };

export type DatosEnvio = {
  /** Lo genera el celular una vez por envío: si se reintenta, el servidor no lo duplica. */
  envioId: string;
  /** El número o nombre de la mesa. Si ya tiene una cuenta abierta, el pedido se suma a esa cuenta. */
  mesa: string;
  comensales?: number;
  items: LineaDelMozo[];
};

export type ResultadoEnvio =
  | {
      ok: true;
      cuentaNumero: number;
      mesa: string;
      ronda: number;
      /** Lo que vale este envío. */
      totalEnvio: number;
      /** A qué áreas salió una comanda ("Cocina", "Barra"). */
      areas: string[];
      /** Si hay una estación imprimiendo ahora; si no, las comandas quedan en espera. */
      imprimiendo: boolean;
      /** true si este envío ya se había hecho (se reintentó): no se duplicó nada. */
      yaEnviado: boolean;
    }
  | FalloContexto;

/**
 * El mozo envía lo que cargó en una mesa. En una sola transacción: abre la cuenta de esa mesa si no estaba abierta (o la
 * continúa), guarda los productos como una ronda nueva con su precio recalculado, descuenta el stock de las recetas y deja
 * en la cola de impresión una comanda por cada área (Cocina, Barra…) — las imprime la estación de caja. Lo comparte con la
 * caja (que también puede cargar productos desde el panel): ver `guardarRonda` en src/lib/comedor-servidor.ts.
 */
export async function enviarPedido(token: string, datos: DatosEnvio): Promise<ResultadoEnvio> {
  const ctx = await contextoDelMozo(token);
  if (!ctx.ok) return ctx;
  const { local, mozo } = ctx;
  const storeId = local.id;

  const mesa = normalizarMesa(datos?.mesa);
  if (!mesa) return { ok: false, error: "Escribí el número o nombre de la mesa (hasta 20 letras)." };
  const comensales =
    Number.isInteger(datos.comensales) && datos.comensales! >= 1 && datos.comensales! <= 99 ? datos.comensales! : null;

  const quien = nombreDeMozo(mozo);
  const r = await guardarRonda({
    storeId,
    mesa,
    comensales,
    envioId: String(datos.envioId ?? ""),
    items: Array.isArray(datos.items) ? datos.items : [],
    mozoId: mozo.id,
    quien,
    cargadoPor: null,
    detalleTecnico: false,
  });
  if (!r.ok) return r;

  // Se llama DESPUÉS de guardar: un fallo de la bitácora nunca frena un pedido.
  if (!r.yaEnviado) {
    await registrarBitacora(
      storeId,
      { nombre: quien, email: "mozo (enlace público)", rol: "mozo" },
      {
        modulo: "comedor",
        accion: "pedido_enviado",
        descripcion: `${quien} envió el pedido ${r.ronda} de la mesa ${r.mesa} (${formatearGuarani(r.totalEnvio)}).`,
        entidad: "CuentaMesa",
        entidadId: r.cuentaId,
        detalle: { cuenta: r.cuentaNumero, mesa: r.mesa, ronda: r.ronda, total: r.totalEnvio },
      }
    );
  }

  return {
    ok: true,
    cuentaNumero: r.cuentaNumero,
    mesa: r.mesa,
    ronda: r.ronda,
    totalEnvio: r.totalEnvio,
    areas: r.areas,
    imprimiendo: await hayEstacionImprimiendo(storeId),
    yaEnviado: r.yaEnviado,
  };
}
