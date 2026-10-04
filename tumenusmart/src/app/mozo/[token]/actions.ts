"use server";

import { prisma } from "@/lib/prisma";
import { MINUTOS_BLOQUEO_PIN } from "@/lib/asistencia";
import { pedirIntentoDePin, resolverIntentoDePin } from "@/lib/limite-pin";
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
import {
  ESTADOS_CUENTA_ABIERTA,
  SEGUNDOS_LATIDO_IMPRESION,
  claveDeMesa,
  normalizarMesa,
  pinDeMozoAceptadoAlEntrar,
  totalDeLineas,
} from "@/lib/comedor";
import { ErrorDeUsuario, encolarCuenta, guardarRonda } from "@/lib/comedor-servidor";

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

  // Al entrar se aceptan hasta 6 números (hubo PIN de 6 creados antes de fijar el tope en 5); al crearlos, hasta 5.
  if (!pinDeMozoAceptadoAlEntrar(pin)) return { ok: false, error: "El PIN son entre 3 y 5 números." };

  // El intento se cuenta ANTES de mirar el PIN (ver src/lib/limite-pin.ts): así una ráfaga de pedidos simultáneos no puede
  // probar más PIN que el tope, y acertar con un PIN propio no borra los errores seguidos.
  const intento = await pedirIntentoDePin("mozos", local.id);
  if (!intento.ok) {
    return { ok: false, error: `Demasiados PIN incorrectos. Probá de nuevo en ${intento.minutos} min.` };
  }

  const mozo = await prisma.mozo.findFirst({
    where: { storeId: local.id, pinClave: claveDePinMozo(local.id, pin), activo: true },
    select: { id: true },
  });

  const resultado = await resolverIntentoDePin("mozos", local.id, !!mozo, intento.n);
  if (!mozo) {
    if (resultado.bloqueado) {
      return { ok: false, error: `PIN incorrecto. El enlace se bloquea ${MINUTOS_BLOQUEO_PIN} minutos.` };
    }
    const quedan = resultado.quedan;
    return {
      ok: false,
      error: `PIN incorrecto. ${quedan === 1 ? "Te queda 1 intento" : `Te quedan ${quedan} intentos`}.`,
    };
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
  /** true si la cuenta la abrió este mismo mozo. */
  mia: boolean;
  /** Cuándo se abrió, en ISO (el celular calcula "hace cuánto"). */
  abiertaEn: string;
  productos: number;
  rondas: number;
  /** "abierta", o "por_cobrar" si la caja ya imprimió la cuenta: el mozo no puede cargarle más hasta que la reabran. */
  estado: string;
  total: number;
  /** El sector del restaurante de esa mesa ("Salón", "Patio"), si el dueño la asignó a uno. */
  sector: string | null;
};

/** Un sector del restaurante con al menos una mesa activa (el mozo elige primero el sector). */
export type SectorDelSalon = { id: string; nombre: string };

/** Una mesa del salón que el dueño cargó en Ajustes, con su estado ahora. */
export type MesaDelSalon = {
  nombre: string;
  /** El sector al que pertenece, o null si no tiene (se muestra bajo "Otras mesas"). */
  sectorId: string | null;
  /** "libre" | "ocupada" | "por_cobrar" */
  estado: string;
  /** true si la cuenta abierta en esa mesa es de este mozo. */
  mia: boolean;
  /** Quién la atiende (si está ocupada). */
  mozo: string | null;
  /** La cuenta, solo si este mozo la puede ver (con la regla "solo ven sus cuentas" las de otros mozos no). */
  cuentaId: string | null;
};

/** Lo que el dueño configuró para los mozos (Ajustes → Configuración servicio comedor). */
export type ReglasDelSalon = {
  /** Si el dueño cargó las mesas del salón: el mozo ELIGE la mesa de una lista en vez de escribirla. */
  usaMesas: boolean;
  /** Si el mozo puede imprimir la cuenta de su mesa desde el celular. */
  puedeImprimirCuenta: boolean;
  /** Si el mozo ve y puede cargar las cuentas que abrió otro mozo. */
  veCuentasAjenas: boolean;
};

export type EstadoDelSalon =
  | {
      ok: true;
      cuentas: CuentaAbierta[];
      sectores: SectorDelSalon[];
      mesas: MesaDelSalon[];
      reglas: ReglasDelSalon;
      imprimiendo: boolean;
    }
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

/**
 * Las cuentas abiertas que este mozo puede ver (todas, o solo las suyas según la regla del dueño), las mesas del salón con
 * su estado, las reglas, y si hay una estación imprimiendo.
 */
export async function estadoDelSalon(token: string): Promise<EstadoDelSalon> {
  const ctx = await contextoDelMozo(token);
  if (!ctx.ok) return ctx;
  const { local, mozo } = ctx;
  const veAjenas = local.mozosVenCuentasAjenas;

  const [todas, mesasCargadas, sectoresCargados, imprimiendo] = await Promise.all([
    prisma.cuentaMesa.findMany({
      where: { storeId: local.id, estado: { in: [...ESTADOS_CUENTA_ABIERTA] } },
      orderBy: { abiertaEn: "asc" },
      select: {
        id: true,
        numero: true,
        mesa: true,
        mozoId: true,
        abiertaEn: true,
        estado: true,
        mozo: { select: { nombre: true, apellido: true } },
        items: { where: { estado: "activo" }, select: { cantidad: true, precioUnitario: true, ronda: true } },
      },
    }),
    prisma.mesaComedor.findMany({
      where: { storeId: local.id },
      orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
      select: { nombre: true, clave: true, activa: true, sectorId: true },
    }),
    prisma.sectorComedor.findMany({
      where: { storeId: local.id },
      orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
      select: { id: true, nombre: true },
    }),
    hayEstacionImprimiendo(local.id),
  ]);

  // Con la regla "solo ven sus cuentas" cada mozo ve únicamente las que abrió él.
  const visibles = veAjenas ? todas : todas.filter((c) => c.mozoId === mozo.id);

  // El sector de cada mesa (por su clave) y el nombre de cada sector, para etiquetar las cuentas abiertas.
  const sectorDeClave = new Map(mesasCargadas.map((m) => [m.clave, m.sectorId]));
  const nombreDeSector = new Map(sectoresCargados.map((s) => [s.id, s.nombre]));
  // Solo los sectores que tienen alguna mesa activa para elegir.
  const sectoresConMesas = new Set(mesasCargadas.filter((m) => m.activa).map((m) => m.sectorId));
  const sectores: SectorDelSalon[] = sectoresCargados.filter((s) => sectoresConMesas.has(s.id));

  const mesas: MesaDelSalon[] = mesasCargadas
    .filter((m) => m.activa)
    .map((m) => {
      const c = todas.find((x) => claveDeMesa(x.mesa) === m.clave);
      if (!c) return { nombre: m.nombre, sectorId: m.sectorId, estado: "libre", mia: false, mozo: null, cuentaId: null };
      const mia = c.mozoId === mozo.id;
      return {
        nombre: m.nombre,
        sectorId: m.sectorId,
        estado: c.estado === "por_cobrar" ? "por_cobrar" : "ocupada",
        mia,
        mozo: nombreDeMozo(c.mozo),
        cuentaId: veAjenas || mia ? c.id : null,
      };
    });

  return {
    ok: true,
    imprimiendo,
    sectores,
    mesas,
    reglas: {
      usaMesas: mesasCargadas.length > 0,
      puedeImprimirCuenta: local.mozoImprimeCuenta,
      veCuentasAjenas: veAjenas,
    },
    cuentas: visibles.map((c) => ({
      id: c.id,
      numero: c.numero,
      mesa: c.mesa,
      mozo: nombreDeMozo(c.mozo),
      mia: c.mozoId === mozo.id,
      estado: c.estado,
      sector: nombreDeSector.get(sectorDeClave.get(claveDeMesa(c.mesa)) ?? "") ?? null,
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
      mozoId: true,
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
  // Con la regla "solo ven sus cuentas", la de otro mozo no se muestra (aunque alguien arme el pedido a mano).
  if (!ctx.local.mozosVenCuentasAjenas && cuenta.mozoId !== ctx.mozo.id) {
    return { ok: false, error: "Esa cuenta es de otro mozo." };
  }

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
  /**
   * true cuando el mozo está ABRIENDO la mesa (la tocó libre o escribió su número): si ya tiene cuenta abierta el servidor lo
   * rechaza en vez de sumarle los productos. Con false (o sin esto) es "Agregar pedido" a una cuenta que ya existe.
   */
  abrirNueva?: boolean;
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
  // Al ABRIR una mesa nueva hay que decir cuántas personas son (al menos 1). Se exige acá, en el servidor, no solo en el celular.
  if (datos.abrirNueva === true && comensales === null) {
    return { ok: false, error: "Indicá cuántas personas son (al menos 1)." };
  }

  // Si el dueño cargó las mesas del salón, solo se puede abrir una de esa lista (seguir cargando en una cuenta que ya
  // existe, siempre). Las reglas se comprueban acá en el servidor, no en el celular.
  const mesasCargadas = await prisma.mesaComedor.findMany({ where: { storeId }, select: { clave: true, activa: true } });

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
    soloCuentasDelMozoId: local.mozosVenCuentasAjenas ? undefined : mozo.id,
    mesasPermitidas: mesasCargadas.length > 0 ? mesasCargadas.filter((m) => m.activa).map((m) => m.clave) : undefined,
    soloAbrirNueva: datos.abrirNueva === true,
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

// ---------------------------------------------------------------------------
//  Imprimir la cuenta (solo si el dueño lo activó)
// ---------------------------------------------------------------------------

export type ResultadoImpresionDelMozo = { ok: true } | FalloContexto;

/**
 * El mozo imprime la cuenta de SU mesa desde el celular, si el dueño activó esa regla (Ajustes → Configuración servicio
 * comedor → Reglas). Sale en la impresora del ticket de una estación de caja que esté imprimiendo ahora, y la cuenta pasa a
 * "por cobrar": ya no se le puede cargar nada hasta que la caja la reabra. Una sola vez: otra copia se la pide a la caja.
 */
export async function imprimirCuentaDelMozo(token: string, cuentaId: string): Promise<ResultadoImpresionDelMozo> {
  const ctx = await contextoDelMozo(token);
  if (!ctx.ok) return ctx;
  const { local, mozo } = ctx;
  const storeId = local.id;

  if (!local.mozoImprimeCuenta) {
    return { ok: false, error: "Imprimir la cuenta desde el celular no está activado. Pedísela a la caja." };
  }

  // Una estación de caja que esté imprimiendo ahora y tenga impresora asignada al ticket: ahí sale la cuenta.
  const desde = new Date(Date.now() - SEGUNDOS_LATIDO_IMPRESION * 1000);
  const estaciones = await prisma.estacion.findMany({
    where: { storeId, activa: true, impresionVistaEn: { gte: desde }, areaTicketId: { not: null } },
    select: { areaTicketId: true, impresoras: { select: { areaImpresionId: true } } },
  });
  const estacion = estaciones.find((e) => e.areaTicketId && e.impresoras.some((i) => i.areaImpresionId === e.areaTicketId));
  const areaTicketId = estacion?.areaTicketId ?? null;
  if (!areaTicketId) {
    return { ok: false, error: "No hay ninguna caja con impresora de ticket conectada ahora. Pedile la cuenta a la caja." };
  }

  const quien = `${nombreDeMozo(mozo)} (mozo)`;
  let titulo = "";
  try {
    titulo = await prisma.$transaction(
      (tx) =>
        encolarCuenta(tx, {
          storeId,
          cuentaId: String(cuentaId),
          areaTicketId,
          quien,
          local: local.nombre,
          // Con la regla "solo ven sus cuentas", únicamente las suyas.
          soloMozoId: local.mozosVenCuentasAjenas ? undefined : mozo.id,
          soloSiAbierta: true,
          queHacerConElDescuento: "Avisale a la caja para que lo cambie o lo quite.",
        }),
      { timeout: 15_000, maxWait: 10_000 }
    );
  } catch (e) {
    if (e instanceof ErrorDeUsuario) return { ok: false, error: e.message };
    console.error("[mozo] imprimirCuentaDelMozo falló", e);
    return { ok: false, error: "No se pudo imprimir la cuenta. Probá de nuevo o pedísela a la caja." };
  }

  await registrarBitacora(
    storeId,
    { nombre: nombreDeMozo(mozo), email: "mozo (enlace público)", rol: "mozo" },
    {
      modulo: "comedor",
      accion: "cuenta_impresa_por_mozo",
      descripcion: `${nombreDeMozo(mozo)} imprimió la cuenta desde su celular: ${titulo}.`,
      entidad: "CuentaMesa",
      entidadId: String(cuentaId),
      detalle: { cuenta: titulo },
    }
  );
  return { ok: true };
}
