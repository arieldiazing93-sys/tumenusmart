"use server";

import { localPorSlug, estaSuspendido } from "@/lib/local-por-slug";
import { prisma } from "@/lib/prisma";
import { siguienteNumeroPedido } from "@/lib/prisma-local";
import { SIN_REGISTRO_FISCAL } from "@/lib/tipo-cliente";
import { distanciaKm, encontrarZonaPorDistancia } from "@/lib/geo";
import { obtenerEstadoTienda, motivoSinPedidos } from "@/lib/estado-tienda";
import {
  armarPedido,
  totalSinCambios,
  type LineaPedida,
  type ProductoBase,
} from "@/lib/precio-pedido";
import { registrarConsumoVenta } from "@/lib/movimientos-stock";
import { costoDelProducto } from "@/lib/costo-receta";
import { aplanarReceta } from "@/lib/insumo-elaborado";
import { cargarElaborados } from "@/lib/cargar-elaborados";
import { limpiarPedidosSinEnviarDelLocal } from "@/lib/pedidos-sin-enviar";

export type DatosCheckout = {
  /** de qué local es el pedido, tomado de la URL que visitó el cliente */
  slug: string;
  clienteNombre: string;
  clienteTelefono: string;
  tipoEntrega: "delivery" | "retiro";
  clienteLat?: number;
  clienteLng?: number;
  direccion?: string;
  metodoPagoReferencia: string;
  /**
   * Si el cliente quiere ticket o factura. Para factura el formulario le pide razón social y RUC, pero esos datos NO viajan al
   * servidor ni se guardan: van solo en el mensaje de WhatsApp, y la caja los carga a mano (tras consultarlos en la DNIT) con
   * "Emitir factura". Así un dato mal escrito por apuro nunca llega a una factura.
   */
  comprobanteTipo: "ticket" | "factura";
  notas?: string;
  /**
   * Qué eligió el cliente: identificadores y cantidades, nada más. Los
   * precios, los nombres y los textos de la comanda los pone el servidor
   * leyendo la carta — ver `src/lib/precio-pedido.ts`.
   */
  items: LineaPedida[];
  /**
   * El total que el cliente tenía en pantalla al apretar enviar. NO se guarda
   * ni se usa para cobrar: solo sirve para darse cuenta de que el local
   * cambió un precio mientras él completaba sus datos, y avisarle en vez de
   * cobrarle otra cosa.
   */
  totalMostrado?: number;
};

export type ResultadoPedido = { ok: true; orderId: string } | { ok: false; error: string };

/** Largos máximos de los textos libres, para que no entre una novela en la comanda. */
const LARGO = { nombre: 80, telefono: 30, direccion: 200, notas: 500 };

function recortar(valor: string | undefined, max: number): string | undefined {
  const limpio = valor?.trim();
  return limpio ? limpio.slice(0, max) : undefined;
}

/**
 * Devuelve un resultado en vez de lanzar los errores de validación: Next.js
 * oculta en producción el mensaje de cualquier `throw` que salga de una
 * Server Action (lo cambia por un genérico "Server Components render...",
 * por seguridad), así que el motivo real de un pedido rechazado solo llega
 * si viaja en el valor de retorno, no en una excepción.
 */
export async function crearPedido(datos: DatosCheckout): Promise<ResultadoPedido> {
  // El local se resuelve en el servidor a partir del nombre en la URL: el
  // navegador dice a qué menú entró, pero nunca manda un identificador de
  // local que podamos usar a ciegas.
  const local = await localPorSlug(datos.slug);
  const storeId = local.id;

  // Los pedidos que otros clientes armaron y nunca mandaron por WhatsApp (y ya vencieron) se descartan antes: el stock que
  // tenían descontado vuelve y el pedido de este cliente no choca con ellos. Nunca lanza.
  await limpiarPedidosSinEnviarDelLocal(storeId, new Date());

  if (estaSuspendido(local)) {
    return { ok: false, error: "Este menú no está tomando pedidos en este momento." };
  }

  // El local pudo destildar esta opción en Configuración después de que el
  // cliente abrió la pantalla (o esto se llama directo, saltándose el
  // formulario) — se vuelve a chequear acá contra lo que el local tiene
  // habilitado hoy, no solo lo que el checkout le mostró al armar la página.
  const metodosHabilitados: Record<string, boolean> = {
    efectivo: local.aceptaEfectivo,
    transferencia: local.aceptaTransferencia,
    tarjeta_debito: local.aceptaTarjetaDebito,
    tarjeta_credito: local.aceptaTarjetaCredito,
  };
  // Solo los cuatro métodos que ofrece el checkout público: "otro" no se ofrece, y cualquier texto raro (esto se puede llamar
  // sin pasar por el formulario) se rechaza en vez de guardarse tal cual. `hasOwnProperty` y no `in`: con `in`, un valor
  // como "constructor" figuraría como método válido por herencia del objeto.
  const metodoPago = typeof datos.metodoPagoReferencia === "string" ? datos.metodoPagoReferencia : "";
  if (!Object.prototype.hasOwnProperty.call(metodosHabilitados, metodoPago)) {
    return { ok: false, error: "Elegí cómo vas a pagar. Recargá la página si no ves las opciones." };
  }
  if (!metodosHabilitados[metodoPago]) {
    return {
      ok: false,
      error: "Ese método de pago ya no está disponible en este local. Recargá la página.",
    };
  }
  if (datos.comprobanteTipo !== "ticket" && datos.comprobanteTipo !== "factura") {
    return { ok: false, error: "Elegí si querés ticket o factura." };
  }

  // Los pedidos de la carta son solo de delivery o de retiro: comer en el local se atiende por el Servicio comedor. Un
  // pedido "de mesa" (de una pantalla vieja, o armado a mano) se rechaza igual que una entrega apagada.
  const entregasHabilitadas: Record<string, boolean> = {
    delivery: local.aceptaDelivery,
    retiro: local.aceptaRetiro,
  };
  if (
    typeof datos.tipoEntrega !== "string" ||
    !Object.prototype.hasOwnProperty.call(entregasHabilitadas, datos.tipoEntrega) ||
    !entregasHabilitadas[datos.tipoEntrega]
  ) {
    return {
      ok: false,
      error: "Esa forma de entrega ya no está disponible en este local. Recargá la página.",
    };
  }

  // Se vuelve a chequear acá, no solo en el formulario: si el local cerró o
  // pausó mientras el cliente completaba sus datos, el pedido no entra.
  const estadoTienda = await obtenerEstadoTienda(storeId);
  if (!estadoTienda.aceptaPedidos) {
    return {
      ok: false,
      error: motivoSinPedidos(estadoTienda) ?? "En este momento no se pueden tomar pedidos.",
    };
  }

  const clienteNombre = recortar(datos.clienteNombre, LARGO.nombre);
  const clienteTelefono = recortar(datos.clienteTelefono, LARGO.telefono);
  if (!clienteNombre || !clienteTelefono) {
    return { ok: false, error: "Faltan datos de contacto" };
  }
  if (!Array.isArray(datos.items) || datos.items.length === 0) {
    return { ok: false, error: "El carrito está vacío" };
  }
  // El pin del mapa es obligatorio para delivery; la referencia escrita, no.
  //
  // Es al revés de como estaba. El pin es un dato exacto que el repartidor
  // abre y sigue; la referencia es texto que puede estar mal, incompleto o
  // decir "la casa de al lado del almacén". Además el costo de envío por
  // zonas se calcula con las coordenadas: sin pin no hay forma de cobrarlo.
  //
  // El formulario ya lo exige del lado del navegador. Esta comprobación es la
  // que vale: una acción del servidor se puede llamar sin pasar por él.
  // Las coordenadas tienen que ser números de verdad y caer en el planeta: llegan del navegador y se usan para calcular el
  // envío y armar el enlace al mapa del repartidor. Unas inválidas en un retiro simplemente se ignoran.
  const coordenadasValidas =
    typeof datos.clienteLat === "number" &&
    typeof datos.clienteLng === "number" &&
    Number.isFinite(datos.clienteLat) &&
    Number.isFinite(datos.clienteLng) &&
    Math.abs(datos.clienteLat) <= 90 &&
    Math.abs(datos.clienteLng) <= 180;
  const clienteLat = coordenadasValidas ? datos.clienteLat : undefined;
  const clienteLng = coordenadasValidas ? datos.clienteLng : undefined;
  if (datos.tipoEntrega === "delivery" && (clienteLat == null || clienteLng == null)) {
    return { ok: false, error: "Marcá tu ubicación en el mapa para poder entregarte el pedido" };
  }

  // ---------------------------------------------------------------- el precio
  //
  // Acá está el punto del asunto: se lee la carta REAL del local y con eso se
  // arman las líneas. Lo que mandó el navegador se usa solamente para saber
  // qué productos y cuántos; el precio sale de la base, siempre.
  const idsPedidos = new Set<string>();
  for (const item of datos.items) {
    if (item?.productId) idsPedidos.add(item.productId);
    if (item?.mitadYMitad) {
      idsPedidos.add(item.mitadYMitad.productIdA);
      idsPedidos.add(item.mitadYMitad.productIdB);
    }
  }
  if (idsPedidos.size === 0) {
    return { ok: false, error: "El carrito está vacío" };
  }

  // Los productos se buscan por local Y por categoría activa: uno de otro
  // negocio, o de una categoría que el local dio de baja, no aparece y el
  // pedido se rechaza solo. No se filtra por `disponible` a propósito, para
  // poder decirle al cliente QUÉ producto se quedó sin stock.
  const productos = await prisma.product.findMany({
    where: { storeId, id: { in: [...idsPedidos] }, category: { activa: true } },
    orderBy: { orden: "asc" },
    include: {
      opciones: { orderBy: { orden: "asc" } },
      // Insumos que consume este producto — ver Control de stock. Un
      // producto sin receta armada simplemente trae [].
      receta: {
        select: {
          insumoId: true,
          cantidad: true,
          // Con el costo de cada insumo: de ahí sale el costo del producto (ver costo-receta.ts).
          insumo: { select: { costoUnitario: true } },
        },
      },
      gruposAgregados: {
        select: {
          group: {
            select: {
              modificadores: {
                where: { product: { disponible: true } },
                select: {
                  product: {
                    select: {
                      id: true,
                      nombre: true,
                      precio: true,
                      costo: true,
                      almacenId: true,
                      // Un modificador ES un Product (ver OptionGroupProduct):
                      // trae su propia receta, igual que cualquier producto —
                      // con el costo de cada insumo, porque el costo del
                      // agregado sale de ahí (ver costo-receta.ts).
                      receta: {
                        select: {
                          insumoId: true,
                          cantidad: true,
                          insumo: { select: { costoUnitario: true } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // Las preparaciones (salsa, masa…) que lleve alguna receta se abren acá en
  // los insumos con que se hacen: el stock y el costo salen de esos insumos.
  const elaborados = await cargarElaborados(storeId);
  const catalogo: ProductoBase[] = productos.map((p) => {
    const receta = aplanarReceta(p.receta, elaborados);
    return {
      id: p.id,
      nombre: p.nombre,
      precio: p.precio,
      disponible: p.disponible,
      ingredientes: p.ingredientes,
      mitadYMitadGrupo: p.mitadYMitadGrupo,
      mitadYMitadModo: p.mitadYMitadModo,
      iva: p.iva,
      receta,
      // Lo que cuesta preparar una unidad, según su receta: se guarda en la línea vendida.
      costo: costoDelProducto(p.costo, receta),
      almacenId: p.almacenId,
      // Los agregados propios (ProductOption) más los de cualquier grupo
      // reutilizable adjuntado (ver src/app/admin/(protected)/grupos-agregados/)
      // — combinados acá para que armarPedido siga viendo un solo `opciones`
      // como siempre, sin saber de dónde salió cada ítem. Cada modificador de
      // un grupo ES un Product real (ver OptionGroupProduct): se usa su
      // propio precio/costo/receta, no datos duplicados. Siempre cuenta como
      // "agregado" (los grupos no tienen variantes). Un ProductOption propio
      // no es un Product, así que no tiene receta propia (ver Control de
      // stock) — [] a propósito.
      opciones: [
        ...p.opciones.map((o) => ({
          id: o.id,
          nombre: o.nombre,
          tipo: o.tipo,
          precioExtra: o.precioExtra,
          costo: o.costo,
          receta: [],
          almacenId: null,
        })),
        ...p.gruposAgregados.flatMap((g) =>
          g.group.modificadores.map((m) => {
            const recetaAgregado = aplanarReceta(m.product.receta, elaborados);
            return {
              id: m.product.id,
              nombre: m.product.nombre,
              tipo: "agregado",
              precioExtra: m.product.precio,
              costo: costoDelProducto(m.product.costo, recetaAgregado),
              receta: recetaAgregado,
              almacenId: m.product.almacenId,
            };
          })
        ),
      ],
    };
  });

  const armado = armarPedido(catalogo, datos.items);
  if (!armado.ok) return { ok: false, error: armado.motivo };

  // El costo de envío SIEMPRE se recalcula acá (nunca se confía en lo que
  // mande el navegador), comparando la ubicación del cliente contra las
  // zonas reales guardadas en la base de datos.
  let costoEnvio = 0;
  let zonaId: string | undefined;

  if (datos.tipoEntrega === "delivery" && clienteLat != null && clienteLng != null) {
    if (local.envioModo === "zonas" && local.lat != null && local.lng != null) {
      const zonas = await prisma.deliveryZone.findMany({
        where: { storeId, activo: true },
      });
      const distancia = distanciaKm(local.lat, local.lng, clienteLat, clienteLng);
      const zona = encontrarZonaPorDistancia(
        zonas.map((z) => ({
          id: z.id,
          nombre: z.nombre,
          radioKm: Number(z.radioKm),
          costoEnvio: Number(z.costoEnvio),
        })),
        distancia
      );
      if (zona) {
        costoEnvio = zona.costoEnvio;
        zonaId = zona.id;
      }
      // Si no matchea ninguna zona, queda costoEnvio = 0 y zonaId sin
      // definir — el pedido pasa como "a coordinar" en vez de bloquearse.
    }
    // Si el negocio usa envioModo "coordinar" (o no tiene ubicación propia
    // configurada), costoEnvio queda en 0 y se coordina directo por WhatsApp.
  }

  const subtotal = armado.subtotal;
  const total = subtotal + costoEnvio;

  // Si el local movió un precio mientras el cliente llenaba sus datos, el
  // pedido no entra con el número viejo NI con el nuevo por sorpresa: se
  // corta y se le muestra la carta actualizada. El precio bueno es siempre el
  // de la base; esto es para que no le llegue un WhatsApp con otro total del
  // que vio en pantalla.
  if (datos.totalMostrado !== undefined && !totalSinCambios(total, datos.totalMostrado)) {
    return {
      ok: false,
      error:
        "Los precios de este local se actualizaron mientras armabas el pedido. Revisá tu carrito antes de enviarlo.",
    };
  }

  const customer = await prisma.customer.upsert({
    // El mismo número puede ser cliente de varios locales: cada negocio
    // tiene su propia ficha de esa persona.
    where: { storeId_telefono: { storeId, telefono: clienteTelefono } },
    update: { nombre: clienteNombre },
    create: { storeId, nombre: clienteNombre, telefono: clienteTelefono },
  });

  // El número se pide justo antes de crear el pedido, no antes: así, si algo
  // falla en las validaciones de más arriba, no se gasta un número al pedo.
  const numero = await siguienteNumeroPedido(storeId);

  // Si el local exige facturar TODA venta (timbrado Autoimpresor, RG
  // 90/2021) y el cliente eligió "Ticket" (no quiso dar sus datos
  // fiscales), se factura igual, a Consumidor Final ("Sin Nombre") —
  // conversión transparente del servidor: el checkout público no cambia su
  // UI ni su experiencia (ver también el mensaje de WhatsApp en
  // src/app/[slug]/pedido/[id]/page.tsx, que tiene que seguir pareciendo un
  // ticket para que esta transparencia sea real).
  const facturaComoTicket = datos.comprobanteTipo === "ticket" && local.facturaObligatoria;
  // Si el cliente pidió factura NO se emite sola ni se guardan sus datos: el pedido nace como ticket con la marca
  // `facturaPedida`, y la caja carga los datos a mano y la emite (ver emitirFacturaPedido). Hasta entonces no se despacha.
  const pideFactura = datos.comprobanteTipo === "factura";
  const comprobanteTipoFinal = facturaComoTicket ? "factura" : "ticket";

  // En una transacción a partir de acá: si el pedido se crea, el descuento
  // de stock de su receta tiene que quedar creado de yapa, nunca a medias.
  const order = await prisma.$transaction(async (tx) => {
    const nuevoPedido = await tx.order.create({
      data: {
        storeId,
        numero,
        customerId: customer.id,
        clienteNombre,
        clienteTelefono,
        tipoEntrega: datos.tipoEntrega,
        deliveryZoneId: zonaId,
        direccion: datos.tipoEntrega === "delivery" ? recortar(datos.direccion, LARGO.direccion) : undefined,
        clienteLat,
        clienteLng,
        metodoPagoReferencia: metodoPago,
        comprobanteTipo: comprobanteTipoFinal,
        facturaPedida: pideFactura,
        // Solo la conversión a "Sin Nombre" (el local factura todo y el cliente eligió ticket) lleva datos fiscales: no hay
        // nada que tipear. Los datos de un cliente que pidió factura no se guardan (ver arriba).
        facturaTipoIdentificacion: facturaComoTicket ? SIN_REGISTRO_FISCAL.tipo : undefined,
        facturaRazonSocial: facturaComoTicket ? null : undefined,
        facturaRuc: facturaComoTicket ? SIN_REGISTRO_FISCAL.numero : undefined,
        notas: recortar(datos.notas, LARGO.notas),
        subtotal,
        costoEnvio,
        total,
        items: {
          create: armado.lineas.map((l) => ({
            storeId,
            productId: l.productId,
            nombreProducto: l.nombreProducto,
            cantidad: l.cantidad,
            precioUnitario: l.precioUnitario,
            iva: l.iva,
            opcionesTexto: l.opcionesTexto,
            ingredientesQuitadosTexto: l.ingredientesQuitadosTexto,
            costoAgregados: l.costoAgregados,
            costoProducto: l.costoProducto,
            precioAgregados: l.precioAgregados,
          })),
        },
      },
    });

    await registrarConsumoVenta(tx, storeId, armado.lineas, { orderId: nuevoPedido.id });

    return nuevoPedido;
  });

  return { ok: true, orderId: order.id };
}
