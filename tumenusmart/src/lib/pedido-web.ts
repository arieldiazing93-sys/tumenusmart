/**
 * Los pedidos que el cliente manda desde el menú digital, sin servidor ni base: la parte pura (qué estados hay, cómo se llaman
 * según el tipo de negocio y cómo se revisa lo que llega del navegador). Lo usan la pantalla pública, la del personal y el servidor.
 *
 * La idea (acordada con el dueño): el pedido llega YA validado y espera una sola decisión (aceptarlo o rechazarlo). Después sigue
 * por el Servicio delivery (cuenta, repartidor, cobro y factura). El cobro y la factura no son pasos del pedido.
 */

import { limpiarTexto, validarDatosFiscales } from "./datos-fiscales";
import { METODOS_PAGO_PEDIDO } from "./metodos-pago";
import { calcularDvRuc, separarRuc } from "./sifen-codigos";

// ---------------------------------------------------------------------------
//  Estados y nombres según el tipo de negocio
// ---------------------------------------------------------------------------

export type EstadoPedidoWeb = "nuevo" | "aceptado" | "listo" | "entregado" | "rechazado" | "cancelado";
export type TipoEntregaPedido = "delivery" | "retiro";
export type RubroPedido = "gastronomia" | "distribuidora" | "tienda";

export const RUBROS_PEDIDO: { valor: RubroPedido; etiqueta: string; detalle: string }[] = [
  { valor: "gastronomia", etiqueta: "Gastronomía", detalle: "Restaurante, comidas rápidas, heladería: el pedido se prepara en cocina." },
  { valor: "distribuidora", etiqueta: "Distribuidora", detalle: "Venta por mayor: el pedido se arma en el depósito y se despacha." },
  { valor: "tienda", etiqueta: "Tienda", detalle: "Comercio de productos: el pedido se prepara y el cliente lo retira o se le envía." },
];

export function normalizarRubro(valor: unknown): RubroPedido {
  return valor === "distribuidora" || valor === "tienda" ? valor : "gastronomia";
}

export function normalizarEstado(valor: unknown): EstadoPedidoWeb {
  const validos: EstadoPedidoWeb[] = ["nuevo", "aceptado", "listo", "entregado", "rechazado", "cancelado"];
  return validos.includes(valor as EstadoPedidoWeb) ? (valor as EstadoPedidoWeb) : "nuevo";
}

/** Los pedidos que todavía hay que atender (aparecen en la bandeja del personal). */
export const ESTADOS_PEDIDO_ABIERTOS: EstadoPedidoWeb[] = ["nuevo", "aceptado", "listo"];

/** A qué estados se puede pasar desde cada uno. La pantalla solo ofrece estos botones y el servidor vuelve a comprobarlo. */
export const TRANSICIONES: Record<EstadoPedidoWeb, EstadoPedidoWeb[]> = {
  nuevo: ["aceptado", "rechazado"],
  aceptado: ["listo", "cancelado"],
  listo: ["entregado", "cancelado"],
  entregado: [],
  rechazado: [],
  cancelado: [],
};

export function puedePasar(desde: EstadoPedidoWeb, hacia: EstadoPedidoWeb): boolean {
  return TRANSICIONES[desde].includes(hacia);
}

/** Los textos de los pasos que ve el PERSONAL, según el negocio y si se entrega o se retira. */
export type EtiquetasPersonal = {
  /** El estado "aceptado": cómo se llama lo que se está haciendo con el pedido. */
  preparando: string;
  /** El botón que lo marca como terminado. */
  accionListo: string;
  /** El estado "listo". */
  listo: string;
  /** El botón final (entregar y cobrar). */
  accionEntregado: string;
  /** El estado "entregado". */
  entregado: string;
  /** Quién lo prepara (para el aviso). */
  quienPrepara: string;
};

export function etiquetasPersonal(rubro: RubroPedido, tipo: TipoEntregaPedido): EtiquetasPersonal {
  const retiro = tipo === "retiro";
  if (rubro === "distribuidora") {
    return {
      preparando: "Armando el pedido",
      accionListo: retiro ? "Listo para retirar" : "Listo para despachar",
      listo: retiro ? "Listo para retirar" : "Listo para despachar",
      accionEntregado: retiro ? "Retirado y cobrado" : "Despachado y cobrado",
      entregado: retiro ? "Retirado" : "Despachado",
      quienPrepara: "Depósito",
    };
  }
  if (rubro === "tienda") {
    return {
      preparando: "Preparando",
      accionListo: retiro ? "Listo para retirar" : "Listo para enviar",
      listo: retiro ? "Listo para retirar" : "Listo para enviar",
      accionEntregado: retiro ? "Retirado y cobrado" : "Entregado y cobrado",
      entregado: retiro ? "Retirado" : "Entregado",
      quienPrepara: "Mostrador",
    };
  }
  return {
    preparando: "En preparación",
    accionListo: "Listo",
    listo: retiro ? "Listo para retirar" : "Listo para entregar",
    accionEntregado: retiro ? "Retirado y cobrado" : "Entregado y cobrado",
    entregado: retiro ? "Retirado" : "Entregado",
    quienPrepara: "Cocina",
  };
}

/** Lo que lee el CLIENTE en su pantalla de seguimiento en cada estado. */
export function textoParaCliente(rubro: RubroPedido, tipo: TipoEntregaPedido, estado: EstadoPedidoWeb): { titulo: string; detalle: string } {
  const retiro = tipo === "retiro";
  switch (estado) {
    case "nuevo":
      return { titulo: "Recibimos tu pedido", detalle: "El local lo está revisando. En unos minutos lo confirma." };
    case "aceptado":
      return {
        titulo: rubro === "distribuidora" ? "Estamos armando tu pedido" : rubro === "tienda" ? "Estamos preparando tu pedido" : "Lo estamos preparando",
        detalle: retiro ? "Cuando esté listo, pasás a retirarlo." : "Cuando esté listo, sale hacia tu dirección.",
      };
    case "listo":
      return retiro
        ? { titulo: "Tu pedido está listo", detalle: "Ya podés pasar a retirarlo." }
        : { titulo: rubro === "distribuidora" ? "Listo para despachar" : "Tu pedido está listo", detalle: "En breve sale hacia tu dirección." };
    case "entregado":
      return { titulo: retiro ? "Pedido retirado" : "Pedido entregado", detalle: "¡Gracias por tu compra!" };
    case "rechazado":
      return { titulo: "No pudimos tomar tu pedido", detalle: "El local no pudo atenderlo. Mirá el motivo abajo o comunicate con el local." };
    case "cancelado":
      return { titulo: "Pedido cancelado", detalle: "Este pedido fue cancelado. Comunicate con el local si tenés dudas." };
  }
}

/** Los pasos del seguimiento (para dibujar la barra del cliente) y en cuál va. -1 = no está en la línea (rechazado o cancelado). */
export function pasosDeSeguimiento(rubro: RubroPedido, tipo: TipoEntregaPedido, estado: EstadoPedidoWeb): { pasos: string[]; actual: number } {
  const e = etiquetasPersonal(rubro, tipo);
  const pasos = ["Recibido", e.preparando, e.listo, e.entregado];
  const indice: Record<EstadoPedidoWeb, number> = { nuevo: 0, aceptado: 1, listo: 2, entregado: 3, rechazado: -1, cancelado: -1 };
  return { pasos, actual: indice[estado] };
}

// ---------------------------------------------------------------------------
//  Lo que llega del navegador
// ---------------------------------------------------------------------------

/** Una línea del carrito, tal como la manda el menú: SOLO qué eligió (nunca precios ni nombres). */
export type ItemPublicoPedido = {
  productId?: string;
  mitadYMitad?: { productIdA: string; productIdB: string };
  opcionIds?: string[];
  ingredientesQuitados?: string[];
  cantidad: number;
};

export type DatosPublicosPedido = {
  /** Lo genera el celular una vez por envío. */
  envioId: string;
  nombre: string;
  telefono: string;
  tipoEntrega: string;
  /** La referencia que escribió el cliente (opcional). */
  direccion?: string;
  clienteLat?: number | null;
  clienteLng?: number | null;
  metodoPago: string;
  comprobanteTipo: string;
  facturaRazonSocial?: string;
  facturaRuc?: string;
  facturaEmail?: string;
  notas?: string;
  items: ItemPublicoPedido[];
  /** El total que el cliente vio: sirve para avisarle si algo cambió mientras armaba el pedido. */
  totalMostrado?: number;
  /** Trampa para robots: un cliente de verdad nunca lo llena. */
  sitioWeb?: string;
};

export const LARGOS_PEDIDO = { nombre: 80, telefono: 20, direccion: 200, notas: 300, ingrediente: 60, id: 40 };
export const MAX_LINEAS_PEDIDO = 40;
export const MAX_CANTIDAD_POR_LINEA_PEDIDO = 50;
const FORMATO_ENVIO = /^[A-Za-z0-9_-]{8,64}$/;
const FORMATO_ID = /^[A-Za-z0-9_-]{1,40}$/;

export type PedidoNormalizado = {
  envioId: string;
  nombre: string;
  telefono: string;
  tipoEntrega: TipoEntregaPedido;
  direccion: string | null;
  clienteLat: number | null;
  clienteLng: number | null;
  metodoPago: string;
  comprobanteTipo: "ticket" | "factura";
  factura: { tipoIdentificacion: string; numeroIdentificacion: string; razonSocial: string; email: string | null } | null;
  notas: string | null;
  items: ItemPublicoPedido[];
  totalMostrado: number | null;
};

export type ResultadoNormalizar =
  | { ok: true; datos: PedidoNormalizado }
  | { ok: false; error: string; campo?: "nombre" | "telefono" | "ubicacion" | "factura" | "pago" | "entrega" | "carrito" };

/** Saca caracteres de control y de formato (ni un salto de línea ni un invisible en un nombre que va a una comanda). */
export function textoSeguro(valor: unknown, maximo: number): string {
  let sinControl = "";
  for (const ch of String(valor ?? "")) {
    const c = ch.codePointAt(0) ?? 0;
    const invisible = c < 0x20 || c === 0x7f || (c >= 0x200b && c <= 0x200f) || (c >= 0x2028 && c <= 0x202f) || c === 0x2060 || c === 0xfeff;
    sinControl += invisible ? " " : ch;
  }
  return limpiarTexto(sinControl).slice(0, maximo);
}

/** Un teléfono: solo dígitos (y un + al principio si lo trae), de 6 a 20. Devuelve null si no parece un teléfono. */
export function normalizarTelefono(valor: unknown): string | null {
  const crudo = String(valor ?? "").trim();
  const mas = crudo.startsWith("+") ? "+" : "";
  const digitos = crudo.replace(/\D/g, "");
  if (digitos.length < 6 || digitos.length > LARGOS_PEDIDO.telefono) return null;
  return mas + digitos;
}

/**
 * Revisa y deja limpio lo que mandó el navegador. No se confía en nada: tipos, largos, formas, cantidades. Lo que NO hace es mirar la
 * base (productos, horario, zonas): eso lo hace el servidor con lo que ya está normalizado.
 */
export function normalizarPedidoPublico(d: DatosPublicosPedido): ResultadoNormalizar {
  if (!d || typeof d !== "object") return { ok: false, error: "No se pudo leer el pedido. Probá de nuevo." };

  const envioId = String(d.envioId ?? "");
  if (!FORMATO_ENVIO.test(envioId)) return { ok: false, error: "No se pudo identificar el envío. Recargá la página y probá de nuevo." };

  const nombre = textoSeguro(d.nombre, LARGOS_PEDIDO.nombre);
  if (nombre.length < 2) return { ok: false, error: "Escribí tu nombre.", campo: "nombre" };
  const telefono = normalizarTelefono(d.telefono);
  if (!telefono) return { ok: false, error: "Escribí un teléfono válido para que el local pueda confirmarte el pedido.", campo: "telefono" };

  if (d.tipoEntrega !== "delivery" && d.tipoEntrega !== "retiro") return { ok: false, error: "Elegí si es delivery o retiro.", campo: "entrega" };
  const tipoEntrega = d.tipoEntrega as TipoEntregaPedido;

  let clienteLat: number | null = null;
  let clienteLng: number | null = null;
  if (tipoEntrega === "delivery") {
    const lat = Number(d.clienteLat);
    const lng = Number(d.clienteLng);
    if (d.clienteLat == null || d.clienteLng == null || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return { ok: false, error: "Marcá tu ubicación en el mapa para poder entregarte el pedido.", campo: "ubicacion" };
    }
    clienteLat = lat;
    clienteLng = lng;
  }
  const direccion = tipoEntrega === "delivery" ? textoSeguro(d.direccion, LARGOS_PEDIDO.direccion) || null : null;

  if (!METODOS_PAGO_PEDIDO.some((m) => m.value === d.metodoPago)) return { ok: false, error: "Elegí cómo vas a pagar.", campo: "pago" };

  let factura: PedidoNormalizado["factura"] = null;
  const comprobanteTipo: "ticket" | "factura" = d.comprobanteTipo === "factura" ? "factura" : "ticket";
  if (comprobanteTipo === "factura") {
    const ruc = textoSeguro(d.facturaRuc, 30);
    const revisado = validarDatosFiscales({
      modo: "con_registro",
      tipoIdentificacion: "ruc",
      numeroIdentificacion: ruc,
      razonSocial: d.facturaRazonSocial,
      email: d.facturaEmail,
    });
    if (!revisado.ok) return { ok: false, error: revisado.error, campo: "factura" };
    // El dígito verificador: un RUC mal tipeado no se manda (la DNIT rechazaría la factura). Cuenta de módulo 11.
    const { numero, dv } = separarRuc(revisado.datos.numeroIdentificacion);
    if (Number(dv) !== calcularDvRuc(numero)) {
      return { ok: false, error: `El RUC no parece correcto: para ${numero} el dígito verificador es ${calcularDvRuc(numero)}. Revisalo.`, campo: "factura" };
    }
    factura = {
      tipoIdentificacion: revisado.datos.tipoIdentificacion,
      numeroIdentificacion: revisado.datos.numeroIdentificacion,
      razonSocial: revisado.datos.razonSocial ?? "",
      email: revisado.datos.email,
    };
  }

  const notas = textoSeguro(d.notas, LARGOS_PEDIDO.notas) || null;

  if (!Array.isArray(d.items) || d.items.length === 0) return { ok: false, error: "Tu carrito está vacío.", campo: "carrito" };
  if (d.items.length > MAX_LINEAS_PEDIDO) return { ok: false, error: "El pedido tiene demasiados productos. Dividilo en dos.", campo: "carrito" };
  const items: ItemPublicoPedido[] = [];
  for (const i of d.items) {
    if (!i || typeof i !== "object") return { ok: false, error: "Hay un producto mal cargado. Volvé a armar el pedido.", campo: "carrito" };
    const cantidad = Number(i.cantidad);
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAX_CANTIDAD_POR_LINEA_PEDIDO) {
      return { ok: false, error: `La cantidad de cada producto tiene que ser entre 1 y ${MAX_CANTIDAD_POR_LINEA_PEDIDO}.`, campo: "carrito" };
    }
    const linea: ItemPublicoPedido = { cantidad };
    if (i.mitadYMitad) {
      const a = String(i.mitadYMitad.productIdA ?? "");
      const b = String(i.mitadYMitad.productIdB ?? "");
      if (!FORMATO_ID.test(a) || !FORMATO_ID.test(b)) return { ok: false, error: "Hay un producto mal cargado. Volvé a armar el pedido.", campo: "carrito" };
      linea.mitadYMitad = { productIdA: a, productIdB: b };
    } else {
      const id = String(i.productId ?? "");
      if (!FORMATO_ID.test(id)) return { ok: false, error: "Hay un producto mal cargado. Volvé a armar el pedido.", campo: "carrito" };
      linea.productId = id;
    }
    if (i.opcionIds !== undefined) {
      if (!Array.isArray(i.opcionIds) || i.opcionIds.length > 30 || i.opcionIds.some((o) => !FORMATO_ID.test(String(o)))) {
        return { ok: false, error: "Hay un agregado mal cargado. Volvé a armar el pedido.", campo: "carrito" };
      }
      linea.opcionIds = i.opcionIds.map(String);
    }
    if (i.ingredientesQuitados !== undefined) {
      if (!Array.isArray(i.ingredientesQuitados) || i.ingredientesQuitados.length > 30) {
        return { ok: false, error: "Hay un ingrediente mal cargado. Volvé a armar el pedido.", campo: "carrito" };
      }
      linea.ingredientesQuitados = i.ingredientesQuitados.map((x) => textoSeguro(x, LARGOS_PEDIDO.ingrediente)).filter(Boolean);
    }
    items.push(linea);
  }

  const mostrado = Number(d.totalMostrado);
  return {
    ok: true,
    datos: {
      envioId,
      nombre,
      telefono,
      tipoEntrega,
      direccion,
      clienteLat,
      clienteLng,
      metodoPago: d.metodoPago,
      comprobanteTipo,
      factura,
      notas,
      items,
      totalMostrado: d.totalMostrado != null && Number.isFinite(mostrado) ? mostrado : null,
    },
  };
}

// ---------------------------------------------------------------------------
//  Lo que se muestra de cada línea y los avisos de stock
// ---------------------------------------------------------------------------

export type LineaVisible = { nombre: string; cantidad: number; precioUnitario: number; detalle: string | null };

/** Lo que se guarda para mostrar: nombre, cantidad, precio de ese momento y el detalle (agregados, sin…). */
export function lineasVisibles(
  lineas: { nombreProducto: string; cantidad: number; precioUnitario: number; opcionesTexto?: string; ingredientesQuitadosTexto?: string }[]
): LineaVisible[] {
  return lineas.map((l) => ({
    nombre: l.nombreProducto,
    cantidad: l.cantidad,
    precioUnitario: l.precioUnitario,
    detalle: [l.opcionesTexto, l.ingredientesQuitadosTexto].filter(Boolean).join(" · ") || null,
  }));
}

/**
 * Lo que el pedido va a consumir de cada insumo, contra lo que hay. Si alguno no alcanza, un aviso para quien atiende. No frena nada:
 * el sistema nunca bloquea una venta por falta de stock (el negativo es el aviso para revisar), pero quien acepta tiene que enterarse
 * ANTES de prometerlo al cliente.
 */
export function avisosDeStock(
  consumos: { insumoId: string; cantidad: number }[],
  existencias: Map<string, { nombre: string; unidad: string; stock: number; controlado: boolean }>
): string[] {
  const necesario = new Map<string, number>();
  for (const c of consumos) necesario.set(c.insumoId, (necesario.get(c.insumoId) ?? 0) + c.cantidad);
  const avisos: string[] = [];
  for (const [id, cantidad] of necesario) {
    const e = existencias.get(id);
    // Un insumo del que nunca se registró un movimiento (no se lleva su stock) no avisa nada: no hay con qué comparar.
    if (!e || !e.controlado) continue;
    if (e.stock < cantidad - 1e-9) {
      const falta = Math.round((cantidad - e.stock) * 1000) / 1000;
      avisos.push(`Stock justo de ${e.nombre}: hay ${Math.round(e.stock * 1000) / 1000} ${e.unidad} y el pedido usa ${Math.round(cantidad * 1000) / 1000} (faltan ${falta}).`);
    }
  }
  return avisos;
}
