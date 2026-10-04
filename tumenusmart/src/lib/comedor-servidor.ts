import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal } from "@/lib/prisma-local";
import { armarPedido, type LineaPedida } from "@/lib/precio-pedido";
import { cargarCatalogoParaPedido } from "@/lib/catalogo-pedido";
import { registrarConsumoVenta } from "@/lib/movimientos-stock";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import {
  ESTADOS_CUENTA_ABIERTA,
  agruparPorArea,
  claveDeMesa,
  contenidoParaGuardar,
  descuentoDeCuenta,
  normalizarNota,
  textoComanda,
  textoCuenta,
  totalDeLineas,
  totalesDeCuenta,
} from "@/lib/comedor";
import { formatearGuarani } from "@/lib/format";

/**
 * Lo que comparten el mozo (desde su celular) y la caja (desde el panel) al cargar productos en una cuenta de mesa: el
 * precio se recalcula en el servidor, el stock baja, y cada área (Cocina, Barra…) recibe su comanda en la cola de
 * impresión. Todo en una sola transacción: o se guarda completo o no se guarda nada.
 */

/** Una línea que se carga: lo mismo que el menú digital (qué y cuántos) más una nota para la cocina. */
export type LineaDeRonda = LineaPedida & { nota?: string };

export type DatosRonda = {
  storeId: string;
  /** El número o nombre de la mesa, ya normalizado. Solo se usa si la cuenta se abre ahora. */
  mesa: string;
  comensales: number | null;
  /** Lo genera quien carga una vez por envío: si se reintenta, el servidor no lo duplica. */
  envioId: string;
  items: LineaDeRonda[];
  /** El mozo a cargo de la cuenta si es nueva, y el que figura como quien envió los productos. */
  mozoId: string;
  /** Lo que sale en la comanda como "Mozo: …". */
  quien: string;
  /** El usuario de la caja que cargó los productos desde el panel; null cuando los envió el mozo. */
  cargadoPor: string | null;
  /**
   * Si un fallo inesperado muestra además el motivo técnico. Solo para quien tiene sesión del panel (la caja): al mozo, que
   * entra por un enlace público, no se le muestra nada interno (el detalle igual queda en el log del servidor).
   */
  detalleTecnico: boolean;
  /**
   * Si está, solo se puede cargar en una cuenta que abrió ese mozo (la regla "los mozos solo ven sus cuentas"): una mesa
   * ocupada por otro mozo se rechaza. Sin esto, cualquiera con acceso puede sumar a cualquier cuenta abierta.
   */
  soloCuentasDelMozoId?: string;
  /**
   * Si está, las mesas que el dueño cargó en Ajustes (sus claves, ver claveDeMesa): solo se puede ABRIR una mesa de esa
   * lista (seguir cargando en una cuenta que ya existe siempre se puede). Sin esto, la mesa se escribe libremente.
   */
  mesasPermitidas?: string[];
  /** Con esto se suma a esa cuenta (carga desde la caja); sin esto se abre o se continúa la cuenta de la mesa. */
  cuentaId?: string;
  /**
   * true cuando quien carga está ABRIENDO la mesa (la tocó libre, o escribió su número): si ya tiene una cuenta abierta se
   * rechaza, en vez de sumarle los productos en silencio y dar la impresión de que se abrió otra mesa. Para seguir cargando
   * en una cuenta que ya existe se usa "Agregar pedido", que no lo pide.
   */
  soloAbrirNueva?: boolean;
};

export type ResultadoRonda =
  | {
      ok: true;
      cuentaId: string;
      cuentaNumero: number;
      mesa: string;
      ronda: number;
      /** Lo que vale este envío. */
      totalEnvio: number;
      /** A qué áreas salió una comanda ("Cocina", "Barra"). */
      areas: string[];
      /** true si este envío ya se había hecho (se reintentó): no se duplicó nada. */
      yaEnviado: boolean;
    }
  | { ok: false; error: string };

const FORMATO_ENVIO = /^[A-Za-z0-9_-]{8,64}$/;

/** Lo que se lanza dentro de la transacción cuando la cuenta no se puede seguir cargando. */
const CUENTA_NO_ENCONTRADA = "CUENTA_NO_ENCONTRADA";
const CUENTA_POR_COBRAR = "CUENTA_POR_COBRAR";
const CUENTA_AJENA = "CUENTA_AJENA";
const MESA_NO_EXISTE = "MESA_NO_EXISTE";
const MESA_YA_ABIERTA = "MESA_YA_ABIERTA";

/** Lo que se le explica a quien carga cuando una regla de la cuenta no se cumple (null si el error es otro). */
function mensajeDeReglaCuenta(e: unknown): string | null {
  if (!(e instanceof Error)) return null;
  if (e.message === CUENTA_NO_ENCONTRADA) return "Esa cuenta ya no está abierta.";
  if (e.message === CUENTA_POR_COBRAR) {
    return "La cuenta de esa mesa ya fue impresa y está por cobrarse. Pedile a la caja que la reabra para seguir cargando.";
  }
  if (e.message === CUENTA_AJENA) return "Esa mesa la atiende otro mozo: no podés cargarle productos.";
  if (e.message === MESA_NO_EXISTE) return "Esa mesa no está en la lista del salón. Elegí una mesa de la lista.";
  if (e.message === MESA_YA_ABIERTA) {
    return "Esa mesa ya tiene una cuenta abierta: no se abre otra. Agregale el pedido a esa cuenta (“Agregar pedido”).";
  }
  return null;
}

function codigoPrisma(e: unknown): { codigo: string; meta: string } | null {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    return { codigo: e.code, meta: JSON.stringify(e.meta ?? {}) };
  }
  return null;
}

/**
 * Una pista corta de por qué falló algo inesperado (el código de Prisma y la última línea del mensaje, que es la que dice
 * el motivo), para mostrarla en pantalla y dejarla en el log del servidor. Nunca lleva datos de la base: solo el nombre
 * del error.
 */
export function pistaDelError(e: unknown): string {
  const codigo = e instanceof Prisma.PrismaClientKnownRequestError ? `${e.code}: ` : "";
  const mensaje = e instanceof Error ? e.message : String(e);
  const ultima = mensaje.split("\n").map((x) => x.trim()).filter(Boolean).pop() ?? "";
  return `${codigo}${e instanceof Error ? e.name : "Error"} — ${ultima}`.slice(0, 220);
}

/** Lo que ya se envió con este `envioId` (si se reintenta), para devolverlo sin duplicar nada. */
export async function envioYaHecho(storeId: string, envioId: string): Promise<Extract<ResultadoRonda, { ok: true }> | null> {
  const items = await prisma.itemCuentaMesa.findMany({
    where: { storeId, envioId },
    select: {
      ronda: true,
      cantidad: true,
      precioUnitario: true,
      cuenta: { select: { id: true, numero: true, mesa: true } },
    },
  });
  if (items.length === 0) return null;
  return {
    ok: true,
    cuentaId: items[0].cuenta.id,
    cuentaNumero: items[0].cuenta.numero,
    mesa: items[0].cuenta.mesa,
    ronda: items[0].ronda,
    totalEnvio: totalDeLineas(items.map((i) => ({ precioUnitario: Number(i.precioUnitario), cantidad: i.cantidad }))),
    areas: [],
    yaEnviado: true,
  };
}

/** Guarda una ronda de productos en una cuenta (la abre si hace falta), descuenta el stock y encola las comandas. */
export async function guardarRonda(datos: DatosRonda): Promise<ResultadoRonda> {
  const { storeId, envioId } = datos;
  if (!FORMATO_ENVIO.test(envioId)) return { ok: false, error: "No se pudo identificar el envío. Probá de nuevo." };

  // Un reintento (se tocó dos veces, se cortó el internet): se devuelve lo que ya se hizo.
  const previo = await envioYaHecho(storeId, envioId);
  if (previo) return previo;

  if (!Array.isArray(datos.items) || datos.items.length === 0) {
    return { ok: false, error: "No cargaste ningún producto." };
  }
  if (datos.items.some((i) => !i || typeof i !== "object")) {
    return { ok: false, error: "Hay un producto mal cargado. Volvé a armarlo." };
  }

  const clave = claveDeMesa(datos.mesa);

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
  const hora = new Date().toLocaleString("es-PY", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ZONA_NEGOCIO,
  });

  // ------------------------------------------------------------ guardar todo junto
  // Es una función flecha y no una declaración (`async function guardar`) a propósito: TypeScript solo conserva dentro de
  // una función flecha lo que ya se comprobó más arriba (que el armado salió bien).
  const guardar = async () =>
    prisma.$transaction(
      async (tx) => {
        let abierta = datos.cuentaId
          ? await tx.cuentaMesa.findFirst({
              where: { id: datos.cuentaId, storeId, estado: { in: [...ESTADOS_CUENTA_ABIERTA] } },
            })
          : await tx.cuentaMesa.findFirst({ where: { storeId, mesaAbierta: clave } });
        if (datos.cuentaId && !abierta) throw new Error(CUENTA_NO_ENCONTRADA);
        if (abierta && datos.soloCuentasDelMozoId && abierta.mozoId !== datos.soloCuentasDelMozoId) {
          throw new Error(CUENTA_AJENA);
        }
        if (!abierta && datos.mesasPermitidas && !datos.mesasPermitidas.includes(clave)) throw new Error(MESA_NO_EXISTE);
        // Con la cuenta impresa nadie puede cargar más: la caja tiene que reabrirla primero.
        if (abierta && abierta.estado !== "abierta") throw new Error(CUENTA_POR_COBRAR);
        // Abrir una mesa que ya tiene su cuenta no abre otra: se rechaza (después de las reglas de arriba, que explican más).
        if (abierta && datos.soloAbrirNueva && !datos.cuentaId) throw new Error(MESA_YA_ABIERTA);
        if (!abierta) {
          const { contadorCuentasMesa } = await tx.store.update({
            where: { id: storeId },
            data: { contadorCuentasMesa: { increment: 1 } },
            select: { contadorCuentasMesa: true },
          });
          abierta = await tx.cuentaMesa.create({
            data: {
              storeId,
              numero: contadorCuentasMesa,
              mesa: datos.mesa,
              mesaAbierta: clave,
              mozoId: datos.mozoId,
              comensales: datos.comensales,
            },
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
            mozoId: datos.mozoId,
            cargadoPor: datos.cargadoPor,
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

        await registrarConsumoVenta(tx, storeId, armado.lineas, { cuentaMesaId: cuenta.id }, datos.quien);

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
            titulo: `Mesa ${cuenta.mesa} · ${area} · pedido ${ronda}`,
            areaImpresionId: areaId,
            // La base no acepta el byte 0x00 que llevan los comandos de la impresora: se guarda con una marca.
            contenido: contenidoParaGuardar(
              textoComanda({ mesa: cuenta.mesa, mozo: datos.quien, ronda, area, hora, lineas })
            ),
            cuentaMesaId: cuenta.id,
          };
        });
        if (trabajos.length > 0) await tx.trabajoImpresion.createMany({ data: trabajos });

        return { cuenta, ronda, areasImpresas: trabajos.map((t) => t.titulo.split(" · ")[1]) };
      },
      // Más tiempo que los 5 s de fábrica: desde Vercel hasta la base cada consulta tarda, y una receta con varios insumos
      // hace varias seguidas dentro de la misma transacción.
      { timeout: 15_000, maxWait: 10_000 }
    );

  let resultado: Awaited<ReturnType<typeof guardar>> | null = null;
  try {
    resultado = await guardar();
  } catch (e) {
    const conocido = mensajeDeReglaCuenta(e);
    if (conocido) return { ok: false, error: conocido };
    const p = codigoPrisma(e);
    // Dos celulares abrieron la misma mesa a la vez: el segundo vuelve a intentar y se suma a la cuenta ya abierta.
    if (p?.codigo === "P2002" && p.meta.includes("mesaAbierta") && !datos.cuentaId) {
      // Puede ser el MISMO envío llegando dos veces a la vez (un reintento): si el primero ya quedó guardado, se devuelve eso.
      const hecho = await envioYaHecho(storeId, envioId);
      if (hecho) return hecho;
      try {
        resultado = await guardar();
      } catch (e2) {
        const conocido2 = mensajeDeReglaCuenta(e2);
        if (conocido2) return { ok: false, error: conocido2 };
        return { ok: false, error: "No se pudo abrir la mesa. Probá de nuevo." };
      }
    } else if (p?.codigo === "P2002" && p.meta.includes("envioId")) {
      // El mismo envío llegó dos veces al mismo tiempo: ya quedó guardado por el primero.
      const hecho = await envioYaHecho(storeId, envioId);
      if (hecho) return hecho;
      return { ok: false, error: "No se pudo enviar. Probá de nuevo." };
    } else {
      // Antes este error se tragaba sin dejar rastro y no había forma de saber qué había pasado.
      console.error("[comedor] guardarRonda falló", e);
      return {
        ok: false,
        error:
          "No se pudo enviar el pedido. Tocá Enviar de nuevo: no se duplica. Si sigue igual, avisale al encargado." +
          (datos.detalleTecnico ? ` (Detalle: ${pistaDelError(e)})` : ""),
      };
    }
  }
  if (!resultado) return { ok: false, error: "No se pudo enviar el pedido. Probá de nuevo." };

  return {
    ok: true,
    cuentaId: resultado.cuenta.id,
    cuentaNumero: resultado.cuenta.numero,
    mesa: resultado.cuenta.mesa,
    ronda: resultado.ronda,
    totalEnvio: totalDeLineas(armado.lineas),
    areas: [...new Set(resultado.areasImpresas)],
    yaEnviado: false,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
//  Imprimir la cuenta (la caja desde el panel, o el mozo desde su celular si el dueño lo activó)
// ---------------------------------------------------------------------------------------------------------------------

/** Un fallo que se le explica a la persona tal cual (no es un error inesperado). Se lanza dentro de una transacción. */
export class ErrorDeUsuario extends Error {}

/** "03/10 12:45", en la hora del negocio. */
export function horaDeAhora(): string {
  return new Date().toLocaleString("es-PY", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ZONA_NEGOCIO,
  });
}

/**
 * Deja la cuenta de una mesa en la cola de impresión (la imprime la estación que tiene asignada esa área) y la pasa a
 * "por cobrar": desde ahí nadie puede cargarle más productos hasta que la caja la reabra. Va dentro de la transacción de
 * quien llama. Si algo no corresponde (la cuenta ya se cerró, no tiene productos, tiene un descuento que ya no cabe, es de
 * otro mozo) lanza un `ErrorDeUsuario` con la explicación. Devuelve cómo se llama el trabajo, para la bitácora.
 */
export async function encolarCuenta(
  tx: Prisma.TransactionClient,
  datos: {
    storeId: string;
    cuentaId: string;
    /** El Área de Impresión del ticket, ya comprobado que tiene una impresora en la estación que la va a imprimir. */
    areaTicketId: string;
    /** Quién la imprime ("Ana", "Mozo Pedro (mozo)"): queda en la cuenta. */
    quien: string;
    local: string;
    /** Si está, solo puede imprimir una cuenta de ese mozo. */
    soloMozoId?: string;
    /** El mozo imprime una vez: si la cuenta ya se imprimió, otra copia se la pide a la caja. */
    soloSiAbierta?: boolean;
    /** Qué hacer si el descuento ya no corresponde: "Cambialo o quitalo." (la caja) o "Avisale a la caja…" (el mozo). */
    queHacerConElDescuento: string;
  }
): Promise<string> {
  const { storeId } = datos;
  const cuenta = await tx.cuentaMesa.findFirst({
    where: { id: datos.cuentaId, storeId, estado: { in: [...ESTADOS_CUENTA_ABIERTA] } },
    include: {
      mozo: { select: { nombre: true, apellido: true } },
      items: { where: { estado: "activo" }, orderBy: [{ ronda: "asc" }, { linea: "asc" }] },
    },
  });
  if (!cuenta) throw new ErrorDeUsuario("Esa cuenta ya está cerrada.");
  if (datos.soloMozoId && cuenta.mozoId !== datos.soloMozoId) throw new ErrorDeUsuario("Esa cuenta es de otro mozo.");
  if (datos.soloSiAbierta && cuenta.estado !== "abierta") {
    throw new ErrorDeUsuario("Esa cuenta ya se imprimió. Si necesitás otra copia, pedísela a la caja.");
  }
  if (cuenta.items.length === 0) throw new ErrorDeUsuario("La cuenta no tiene productos para imprimir.");

  const lineas = cuenta.items.map((i) => ({ precioUnitario: Number(i.precioUnitario), cantidad: i.cantidad }));
  const totales = totalesDeCuenta(lineas, descuentoDeCuenta(cuenta));
  if (totales.descuentoInvalido) {
    throw new ErrorDeUsuario(
      `El descuento ya no corresponde a esta cuenta (${totales.descuentoInvalido}) ${datos.queHacerConElDescuento}`
    );
  }

  const ahora = new Date();
  const nombreMozo = [cuenta.mozo.nombre, cuenta.mozo.apellido].filter(Boolean).join(" ");
  const reimpresion = cuenta.estado === "por_cobrar";
  const titulo = `Mesa ${cuenta.mesa} · Cuenta${reimpresion ? " (otra copia)" : ""}`;
  await tx.trabajoImpresion.create({
    data: {
      storeId,
      tipo: "ticket",
      titulo,
      areaImpresionId: datos.areaTicketId,
      contenido: contenidoParaGuardar(
        textoCuenta({
          local: datos.local,
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
    data: { estado: "por_cobrar", impresaEn: ahora, impresaPor: datos.quien },
  });
  if (marcada.count !== 1) throw new ErrorDeUsuario("Esa cuenta ya está cerrada.");
  return `${titulo} · ${formatearGuarani(totales.total)}`;
}
