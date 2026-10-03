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
  normalizarNota,
  textoComanda,
  totalDeLineas,
} from "@/lib/comedor";

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
  /** Con esto se suma a esa cuenta (carga desde la caja); sin esto se abre o se continúa la cuenta de la mesa. */
  cuentaId?: string;
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
        // Con la cuenta impresa nadie puede cargar más: la caja tiene que reabrirla primero.
        if (abierta && abierta.estado !== "abierta") throw new Error(CUENTA_POR_COBRAR);
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
    if (e instanceof Error && e.message === CUENTA_NO_ENCONTRADA) {
      return { ok: false, error: "Esa cuenta ya no está abierta." };
    }
    if (e instanceof Error && e.message === CUENTA_POR_COBRAR) {
      return {
        ok: false,
        error: "La cuenta de esa mesa ya fue impresa y está por cobrarse. Pedile a la caja que la reabra para seguir cargando.",
      };
    }
    const p = codigoPrisma(e);
    // Dos celulares abrieron la misma mesa a la vez: el segundo vuelve a intentar y se suma a la cuenta ya abierta.
    if (p?.codigo === "P2002" && p.meta.includes("mesaAbierta") && !datos.cuentaId) {
      try {
        resultado = await guardar();
      } catch (e2) {
        if (e2 instanceof Error && e2.message === CUENTA_POR_COBRAR) {
          return {
            ok: false,
            error: "La cuenta de esa mesa ya fue impresa y está por cobrarse. Pedile a la caja que la reabra para seguir cargando.",
          };
        }
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
