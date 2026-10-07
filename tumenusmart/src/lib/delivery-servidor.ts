import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal } from "@/lib/prisma-local";
import { armarPedido, type LineaPedida } from "@/lib/precio-pedido";
import { cargarCatalogoParaPedido } from "@/lib/catalogo-pedido";
import { consumosGuardablesPorLinea, registrarConsumoVenta } from "@/lib/movimientos-stock";
import {
  agruparPorArea,
  claveDeLinea,
  contenidoParaGuardar,
  descuentoDeCuenta,
  normalizarNota,
  sumarLineasIguales,
  textoComanda,
  textoCuenta,
  totalDeLineas,
} from "@/lib/comedor";
import { ESTADOS_DELIVERY_ABIERTA, nombreDeCuentaDelivery, totalesDeDelivery } from "@/lib/delivery";
import { textoSinEnlaces } from "@/lib/ubicacion-mapa";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { ErrorDeUsuario, horaDeAhora, pistaDelError, type LineaDeRonda } from "@/lib/comedor-servidor";

/**
 * Lo que necesita la caja para cargar productos en una cuenta de delivery: el precio se recalcula en el servidor, el stock baja y
 * cada área (Cocina, Barra…) recibe su comanda en la cola de impresión. Es lo mismo que hace el comedor con las cuentas de mesa
 * (src/lib/comedor-servidor.ts), con las tablas del delivery. Todo en una sola transacción: o se guarda completo o no se guarda nada.
 */

export type DatosRondaDelivery = {
  storeId: string;
  cuentaId: string;
  /** Lo genera la pantalla una vez por envío: si se reintenta, el servidor no lo duplica. */
  envioId: string;
  items: LineaDeRonda[];
  /** Lo que sale en la comanda como "Cliente: …" no cambia: esto es quién cargó, para la cola ("Caja - Ana"). */
  quien: string;
  /** El usuario de la caja que cargó los productos. */
  cargadoPor: string;
};

export type ResultadoRondaDelivery =
  | {
      ok: true;
      cuentaId: string;
      cuentaNumero: number;
      ronda: number;
      /** Lo que valen los productos de este envío (sin el envío de la entrega). */
      totalEnvio: number;
      /** A qué áreas salió una comanda ("Cocina", "Barra"). */
      areas: string[];
      /** true si este envío ya se había hecho (se reintentó): no se duplicó nada. */
      yaEnviado: boolean;
    }
  | { ok: false; error: string };

const FORMATO_ENVIO = /^[A-Za-z0-9_-]{8,64}$/;

/** Lo que se ve de lo que ya se envió con este `envioId` (si se reintenta), para devolverlo sin duplicar nada. */
async function envioYaHecho(storeId: string, envioId: string): Promise<Extract<ResultadoRondaDelivery, { ok: true }> | null> {
  const items = await prisma.itemCuentaDelivery.findMany({
    where: { storeId, envioId },
    select: { ronda: true, cantidad: true, precioUnitario: true, cuenta: { select: { id: true, numero: true } } },
  });
  if (items.length === 0) return null;
  return {
    ok: true,
    cuentaId: items[0].cuenta.id,
    cuentaNumero: items[0].cuenta.numero,
    ronda: items[0].ronda,
    totalEnvio: totalDeLineas(items.map((i) => ({ precioUnitario: Number(i.precioUnitario), cantidad: i.cantidad }))),
    areas: [],
    yaEnviado: true,
  };
}

/** Guarda una ronda de productos en una cuenta de delivery, descuenta el stock y encola las comandas. */
export async function guardarRondaDelivery(datos: DatosRondaDelivery): Promise<ResultadoRondaDelivery> {
  const { storeId, envioId, cuentaId } = datos;
  if (!FORMATO_ENVIO.test(envioId)) return { ok: false, error: "No se pudo identificar el envío. Probá de nuevo." };

  // Un reintento (se tocó dos veces, se cortó el internet): se devuelve lo que ya se hizo.
  const previo = await envioYaHecho(storeId, envioId);
  if (previo) return previo;

  if (!Array.isArray(datos.items) || datos.items.length === 0) return { ok: false, error: "No cargaste ningún producto." };
  if (datos.items.some((i) => !i || typeof i !== "object")) {
    return { ok: false, error: "Hay un producto mal cargado. Volvé a armarlo." };
  }

  const db = prismaDelLocal(storeId);

  // La cuenta tiene que estar abierta: se comprueba antes de calcular nada (y otra vez dentro de la transacción).
  const cuentaPrevia = await db.cuentaDelivery.findFirst({
    where: { id: cuentaId, estado: { in: [...ESTADOS_DELIVERY_ABIERTA] } },
    select: { estado: true },
  });
  if (!cuentaPrevia) return { ok: false, error: "Esa cuenta ya no está abierta." };
  if (cuentaPrevia.estado !== "abierta") {
    return { ok: false, error: "La cuenta ya fue impresa y está por cobrarse. Reabrila para seguir cargando." };
  }

  // ---------------------------------------------------------------- el precio
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
  const hora = horaDeAhora();

  // ------------------------------------------------------------ guardar todo junto
  // Es una función flecha y no una declaración a propósito: TypeScript solo conserva dentro de una función flecha lo que ya se
  // comprobó más arriba (que el armado salió bien).
  const guardar = async () =>
    prisma.$transaction(
      async (tx) => {
        const cuenta = await tx.cuentaDelivery.findFirst({
          where: { id: cuentaId, storeId, estado: { in: [...ESTADOS_DELIVERY_ABIERTA] } },
        });
        if (!cuenta) throw new ErrorDeUsuario("Esa cuenta ya no está abierta.");
        if (cuenta.estado !== "abierta") {
          throw new ErrorDeUsuario("La cuenta ya fue impresa y está por cobrarse. Reabrila para seguir cargando.");
        }

        const { _max } = await tx.itemCuentaDelivery.aggregate({ where: { cuentaId: cuenta.id }, _max: { ronda: true } });
        const ronda = (_max.ronda ?? 0) + 1;

        // Lo que va a descontar cada línea, calculado igual que el descuento real (con su redondeo): se guarda en el producto.
        const consumosPorLinea = await consumosGuardablesPorLinea(tx, storeId, armado.lineas);
        await tx.itemCuentaDelivery.createMany({
          data: armado.lineas.map((l, i) => ({
            storeId,
            cuentaId: cuenta.id,
            ronda,
            envioId,
            linea: i,
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
            consumo: consumosPorLinea[i],
          })),
        });

        await registrarConsumoVenta(tx, storeId, armado.lineas, { cuentaDeliveryId: cuenta.id }, datos.quien);

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
        const nombre = nombreDeCuentaDelivery(cuenta.numero);
        const trabajos = [...agruparPorArea(lineasConArea).entries()].map(([areaId, lineas]) => {
          const area = nombreDeArea.get(areaId) ?? "Comanda";
          return {
            storeId,
            tipo: "comanda",
            titulo: `${nombre} · ${area} · pedido ${ronda}`,
            areaImpresionId: areaId,
            // La base no acepta el byte 0x00 que llevan los comandos de la impresora: se guarda con una marca.
            contenido: contenidoParaGuardar(
              textoComanda({
                mesa: "",
                mozo: "",
                titulo: nombre,
                persona: `Cliente: ${cuenta.clienteNombre}`,
                ronda,
                area,
                hora,
                lineas,
              })
            ),
            cuentaDeliveryId: cuenta.id,
          };
        });
        if (trabajos.length > 0) await tx.trabajoImpresion.createMany({ data: trabajos });

        return { cuenta, ronda, areasImpresas: trabajos.map((t) => t.titulo.split(" · ")[1]) };
      },
      // Más tiempo que los 5 s de fábrica: desde Vercel hasta la base cada consulta tarda, y una receta con varios insumos hace
      // varias seguidas dentro de la misma transacción.
      { timeout: 15_000, maxWait: 10_000 }
    );

  let resultado: Awaited<ReturnType<typeof guardar>>;
  try {
    resultado = await guardar();
  } catch (e) {
    if (e instanceof ErrorDeUsuario) return { ok: false, error: e.message };
    // El mismo envío llegó dos veces al mismo tiempo: ya quedó guardado por el primero.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const hecho = await envioYaHecho(storeId, envioId);
      if (hecho) return hecho;
    }
    console.error("[delivery] guardarRondaDelivery falló", e);
    return {
      ok: false,
      error: `No se pudo cargar el pedido. Tocá el botón de nuevo: no se duplica. (Detalle: ${pistaDelError(e)})`,
    };
  }

  return {
    ok: true,
    cuentaId: resultado.cuenta.id,
    cuentaNumero: resultado.cuenta.numero,
    ronda: resultado.ronda,
    totalEnvio: totalDeLineas(armado.lineas),
    areas: [...new Set(resultado.areasImpresas)],
    yaEnviado: false,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
//  Imprimir la cuenta
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Deja la cuenta de delivery en la cola de impresión (la imprime la estación que tiene asignada el área del ticket) y la pasa a
 * "por cobrar": desde ahí no se le carga nada hasta que la caja la reabra. Va dentro de la transacción de quien llama. Si algo no
 * corresponde (la cuenta ya se cerró, no tiene productos, tiene un descuento que ya no cabe) lanza un `ErrorDeUsuario` con la
 * explicación. Devuelve cómo se llama el trabajo, para la bitácora.
 */
export async function encolarCuentaDelivery(
  tx: Prisma.TransactionClient,
  datos: {
    storeId: string;
    cuentaId: string;
    /** El Área de Impresión del ticket, ya comprobado que tiene una impresora en la estación que la va a imprimir. */
    areaTicketId: string;
    /** Quién la imprime: queda en la cuenta. */
    quien: string;
    local: string;
  }
): Promise<string> {
  const { storeId } = datos;
  const cuenta = await tx.cuentaDelivery.findFirst({
    where: { id: datos.cuentaId, storeId, estado: { in: [...ESTADOS_DELIVERY_ABIERTA] } },
    include: { items: { where: { estado: "activo" }, orderBy: [{ ronda: "asc" }, { linea: "asc" }] } },
  });
  if (!cuenta) throw new ErrorDeUsuario("Esa cuenta ya está cerrada.");
  if (cuenta.items.length === 0) throw new ErrorDeUsuario("La cuenta no tiene productos para imprimir.");

  const lineas = cuenta.items.map((i) => ({ precioUnitario: Number(i.precioUnitario), cantidad: i.cantidad }));
  const totales = totalesDeDelivery(lineas, Number(cuenta.costoEnvio), descuentoDeCuenta(cuenta));
  if (totales.descuentoInvalido) {
    throw new ErrorDeUsuario(`El descuento ya no corresponde a esta cuenta (${totales.descuentoInvalido}) Cambialo o quitalo.`);
  }

  const ahora = new Date();
  const reimpresion = cuenta.estado === "por_cobrar";
  const nombre = nombreDeCuentaDelivery(cuenta.numero);
  const titulo = `${nombre} · Cuenta${reimpresion ? " (otra copia)" : ""}`;
  const direccion = textoSinEnlaces(cuenta.direccion);
  await tx.trabajoImpresion.create({
    data: {
      storeId,
      tipo: "ticket",
      titulo,
      areaImpresionId: datos.areaTicketId,
      contenido: contenidoParaGuardar(
        textoCuenta({
          local: datos.local,
          mesa: "",
          numero: cuenta.numero,
          mozo: "",
          titulo: `Delivery   Cuenta ${formatearNumero(cuenta.numero)}`,
          persona: `Cliente: ${cuenta.clienteNombre}  Tel: ${cuenta.clienteTelefono}`,
          detalle: direccion ? `Direccion: ${direccion}` : cuenta.direccion ? "Ubicacion: enlace del mapa" : undefined,
          hora: horaDeAhora(),
          // El mismo producto cargado en varios pedidos sale en una sola línea (lo mismo que se cobra y se factura).
          lineas: sumarLineasIguales(
            cuenta.items.map((i) => ({
              cantidad: i.cantidad,
              nombre: i.nombreProducto,
              opciones: i.opcionesTexto,
              precioUnitario: Number(i.precioUnitario),
            })),
            (l) => claveDeLinea({ nombre: l.nombre, opciones: l.opciones, precioUnitario: l.precioUnitario }, false)
          ),
          totales: {
            subtotal: totales.subtotal,
            descuento: totales.descuento,
            porcentaje: totales.porcentaje,
            total: totales.total,
            descuentoInvalido: null,
          },
          envio: totales.envio,
        })
      ),
      cuentaDeliveryId: cuenta.id,
    },
  });
  // El estado va en la condición: si la pagaron o cancelaron en el mismo instante, no se pisa.
  const marcada = await tx.cuentaDelivery.updateMany({
    where: { id: cuenta.id, storeId, estado: { in: [...ESTADOS_DELIVERY_ABIERTA] } },
    data: { estado: "por_cobrar", impresaEn: ahora, impresaPor: datos.quien },
  });
  if (marcada.count !== 1) throw new ErrorDeUsuario("Esa cuenta ya está cerrada.");
  return `${titulo} · ${formatearGuarani(totales.total)}`;
}
