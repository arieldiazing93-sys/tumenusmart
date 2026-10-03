"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal } from "@/lib/prisma-local";
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
import { armarPedido, type LineaPedida } from "@/lib/precio-pedido";
import { cargarCatalogoParaPedido } from "@/lib/catalogo-pedido";
import { registrarConsumoVenta } from "@/lib/movimientos-stock";
import { registrarBitacora } from "@/lib/bitacora";
import { formatearGuarani } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import {
  SEGUNDOS_LATIDO_IMPRESION,
  agruparPorArea,
  claveDeMesa,
  normalizarMesa,
  normalizarNota,
  textoComanda,
  totalDeLineas,
} from "@/lib/comedor";

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
      where: { storeId: ctx.local.id, estado: "abierta" },
      orderBy: { abiertaEn: "asc" },
      select: {
        id: true,
        numero: true,
        mesa: true,
        abiertaEn: true,
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
  | { ok: true; id: string; numero: number; mesa: string; mozo: string; total: number; rondas: RondaDeCuenta[] }
  | FalloContexto;

/** Lo que lleva una cuenta abierta, por rondas (solo para mirar: el mozo no anula ni cobra desde acá). */
export async function detalleDeCuenta(token: string, cuentaId: string): Promise<DetalleDeCuenta> {
  const ctx = await contextoDelMozo(token);
  if (!ctx.ok) return ctx;

  const cuenta = await prisma.cuentaMesa.findFirst({
    where: { id: String(cuentaId), storeId: ctx.local.id, estado: "abierta" },
    select: {
      id: true,
      numero: true,
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

const FORMATO_ENVIO = /^[A-Za-z0-9_-]{8,64}$/;

function codigoPrisma(e: unknown): { codigo: string; meta: string } | null {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    return { codigo: e.code, meta: JSON.stringify(e.meta ?? {}) };
  }
  return null;
}

/** Lo que ya se envió con este `envioId` (si se reintenta), para devolverlo sin duplicar nada. */
async function envioYaHecho(storeId: string, envioId: string): Promise<Extract<ResultadoEnvio, { ok: true }> | null> {
  const items = await prisma.itemCuentaMesa.findMany({
    where: { storeId, envioId },
    select: {
      ronda: true,
      cantidad: true,
      precioUnitario: true,
      cuenta: { select: { numero: true, mesa: true } },
    },
  });
  if (items.length === 0) return null;
  return {
    ok: true,
    cuentaNumero: items[0].cuenta.numero,
    mesa: items[0].cuenta.mesa,
    ronda: items[0].ronda,
    totalEnvio: totalDeLineas(items.map((i) => ({ precioUnitario: Number(i.precioUnitario), cantidad: i.cantidad }))),
    areas: [],
    imprimiendo: await hayEstacionImprimiendo(storeId),
    yaEnviado: true,
  };
}

/**
 * El mozo envía lo que cargó en una mesa. En una sola transacción: abre la cuenta de esa mesa si no estaba abierta (o la
 * continúa), guarda los productos como una ronda nueva con su precio recalculado, descuenta el stock de las recetas y deja
 * en la cola de impresión una comanda por cada área (Cocina, Barra…) — las imprime la estación de caja.
 */
export async function enviarPedido(token: string, datos: DatosEnvio): Promise<ResultadoEnvio> {
  const ctx = await contextoDelMozo(token);
  if (!ctx.ok) return ctx;
  const { local, mozo } = ctx;
  const storeId = local.id;

  const envioId = String(datos?.envioId ?? "");
  if (!FORMATO_ENVIO.test(envioId)) return { ok: false, error: "No se pudo identificar el envío. Probá de nuevo." };

  // Un reintento (se tocó dos veces, se cortó el internet): se devuelve lo que ya se hizo.
  const previo = await envioYaHecho(storeId, envioId);
  if (previo) return previo;

  const mesa = normalizarMesa(datos.mesa);
  if (!mesa) return { ok: false, error: "Escribí el número o nombre de la mesa (hasta 20 letras)." };
  const clave = claveDeMesa(mesa);
  const comensales =
    Number.isInteger(datos.comensales) && datos.comensales! >= 1 && datos.comensales! <= 99 ? datos.comensales! : null;

  if (!Array.isArray(datos.items) || datos.items.length === 0) {
    return { ok: false, error: "No cargaste ningún producto." };
  }
  if (datos.items.some((i) => !i || typeof i !== "object")) {
    return { ok: false, error: "Hay un producto mal cargado. Volvé a armarlo." };
  }

  // ---------------------------------------------------------------- el precio
  const db = prismaDelLocal(storeId);
  const pedidas: LineaPedida[] = datos.items.map((i) => ({
    productId: i.productId,
    mitadYMitad: i.mitadYMitad,
    opcionIds: i.opcionIds,
    ingredientesQuitados: i.ingredientesQuitados,
    cantidad: i.cantidad,
  }));
  const catalogo = await cargarCatalogoParaPedido(db, storeId, pedidas);
  const armado = armarPedido(catalogo, pedidas);
  if (!armado.ok) return { ok: false, error: armado.motivo };
  if (armado.subtotal <= 0) return { ok: false, error: "El total tiene que ser mayor a cero." };

  // ------------------------------------------------------- a qué área sale cada producto
  // Un combo mitad y mitad no es un único producto: sale en el área de cada una de sus mitades.
  const idsDeProductos = new Set<string>();
  for (const p of pedidas) {
    if (p.productId) idsDeProductos.add(p.productId);
    if (p.mitadYMitad) {
      idsDeProductos.add(p.mitadYMitad.productIdA);
      idsDeProductos.add(p.mitadYMitad.productIdB);
    }
  }
  const productos = await db.product.findMany({
    where: { id: { in: [...idsDeProductos] } },
    select: { id: true, areaImpresionId: true },
  });
  const areaDeProducto = new Map(productos.map((p) => [p.id, p.areaImpresionId]));
  const areasDeLinea: string[][] = pedidas.map((p) => {
    const ids = p.mitadYMitad ? [p.mitadYMitad.productIdA, p.mitadYMitad.productIdB] : p.productId ? [p.productId] : [];
    return [...new Set(ids.map((id) => areaDeProducto.get(id)).filter((a): a is string => !!a))];
  });

  const idsDeAreas = [...new Set(areasDeLinea.flat())];
  const areas = idsDeAreas.length
    ? await db.areaImpresion.findMany({ where: { id: { in: idsDeAreas } }, select: { id: true, nombre: true } })
    : [];
  const nombreDeArea = new Map(areas.map((a) => [a.id, a.nombre]));

  const notas = datos.items.map((i) => normalizarNota(i.nota));
  const quien = nombreDeMozo(mozo);
  const hora = new Date().toLocaleString("es-PY", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ZONA_NEGOCIO,
  });

  // ------------------------------------------------------------ guardar todo junto
  async function guardar() {
    return prisma.$transaction(async (tx) => {
      let abierta = await tx.cuentaMesa.findFirst({ where: { storeId, mesaAbierta: clave } });
      if (!abierta) {
        const { contadorCuentasMesa } = await tx.store.update({
          where: { id: storeId },
          data: { contadorCuentasMesa: { increment: 1 } },
          select: { contadorCuentasMesa: true },
        });
        abierta = await tx.cuentaMesa.create({
          data: { storeId, numero: contadorCuentasMesa, mesa, mesaAbierta: clave, mozoId: mozo.id, comensales },
        });
      }
      // Una constante (no la variable de arriba) para que las funciones de más abajo sepan que la cuenta existe.
      const cuenta = abierta;

      const { _max } = await tx.itemCuentaMesa.aggregate({ where: { cuentaId: cuenta.id }, _max: { ronda: true } });
      const ronda = (_max.ronda ?? 0) + 1;

      await tx.itemCuentaMesa.createMany({
        data: armado.lineas.map((l, i) => ({
          storeId,
          cuentaId: cuenta.id,
          ronda,
          envioId,
          linea: i,
          mozoId: mozo.id,
          productId: l.productId ?? null,
          nombreProducto: l.nombreProducto,
          cantidad: l.cantidad,
          precioUnitario: l.precioUnitario,
          iva: l.iva,
          opcionesTexto: l.opcionesTexto ?? null,
          ingredientesQuitadosTexto: l.ingredientesQuitadosTexto ?? null,
          nota: notas[i],
          costoProducto: l.costoProducto,
          costoAgregados: l.costoAgregados,
          precioAgregados: l.precioAgregados,
          areaImpresionId: areasDeLinea[i][0] ?? null,
          // Lo que descontó de cada insumo (por la cantidad), para poder devolverlo si el producto se anula.
          consumo: l.consumo.map((c) => ({
            insumoId: c.insumoId,
            almacenId: c.almacenId,
            cantidad: c.cantidad * l.cantidad,
          })),
        })),
      });

      await registrarConsumoVenta(tx, storeId, armado.lineas, { cuentaMesaId: cuenta.id }, quien);

      // Una comanda por área, con solo lo que sale en esa área.
      const lineasConArea = armado.lineas.flatMap((l, i) =>
        areasDeLinea[i].map((areaId) => ({
          areaImpresionId: areaId as string | null,
          cantidad: l.cantidad,
          nombre: l.nombreProducto,
          opciones: l.opcionesTexto ?? null,
          quitados: l.ingredientesQuitadosTexto ?? null,
          nota: notas[i],
        }))
      );
      const porArea = agruparPorArea(lineasConArea);
      const trabajos = [...porArea.entries()].map(([areaId, lineas]) => {
        const area = nombreDeArea.get(areaId) ?? "Comanda";
        return {
          storeId,
          tipo: "comanda",
          titulo: `Mesa ${mesa} · ${area} · pedido ${ronda}`,
          areaImpresionId: areaId,
          contenido: textoComanda({ mesa, mozo: quien, ronda, area, hora, lineas }),
          cuentaMesaId: cuenta.id,
        };
      });
      if (trabajos.length > 0) await tx.trabajoImpresion.createMany({ data: trabajos });

      return { cuenta, ronda, areasImpresas: trabajos.map((t) => t.titulo.split(" · ")[1]) };
    });
  }

  let resultado: Awaited<ReturnType<typeof guardar>>;
  try {
    resultado = await guardar();
  } catch (e) {
    const p = codigoPrisma(e);
    // Dos celulares abrieron la misma mesa a la vez: el segundo vuelve a intentar y se suma a la cuenta ya abierta.
    if (p?.codigo === "P2002" && p.meta.includes("mesaAbierta")) {
      try {
        resultado = await guardar();
      } catch {
        return { ok: false, error: "No se pudo abrir la mesa. Probá de nuevo." };
      }
    } else if (p?.codigo === "P2002" && p.meta.includes("envioId")) {
      // El mismo envío llegó dos veces al mismo tiempo: ya quedó guardado por el primero.
      const hecho = await envioYaHecho(storeId, envioId);
      if (hecho) return hecho;
      return { ok: false, error: "No se pudo enviar. Probá de nuevo." };
    } else {
      return { ok: false, error: "No se pudo enviar el pedido. Revisá la conexión y tocá Enviar de nuevo: no se duplica." };
    }
  }

  const totalEnvio = totalDeLineas(armado.lineas);
  // Se llama DESPUÉS de guardar: un fallo de la bitácora nunca frena un pedido.
  await registrarBitacora(
    storeId,
    { nombre: quien, email: "mozo (enlace público)", rol: "mozo" },
    {
      modulo: "comedor",
      accion: "pedido_enviado",
      descripcion: `${quien} envió el pedido ${resultado.ronda} de la mesa ${mesa} (${formatearGuarani(totalEnvio)}).`,
      entidad: "CuentaMesa",
      entidadId: resultado.cuenta.id,
      detalle: { cuenta: resultado.cuenta.numero, mesa, ronda: resultado.ronda, productos: armado.lineas.length, total: totalEnvio },
    }
  );

  return {
    ok: true,
    cuentaNumero: resultado.cuenta.numero,
    mesa,
    ronda: resultado.ronda,
    totalEnvio,
    areas: [...new Set(resultado.areasImpresas)],
    imprimiendo: await hayEstacionImprimiendo(storeId),
    yaEnviado: false,
  };
}
