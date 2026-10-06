import type { CategoriaVenta, GrupoMitadVenta } from "@/lib/catalogo-venta";
import { pedidoAbierto } from "@/lib/pedido-abierto";

/**
 * Lo que la pantalla de Pedidos (lista a la izquierda y detalle a la derecha, como el Servicio comedor) necesita de cada pedido,
 * ya en tipos simples (texto, números, fechas en texto) para pasarlo del servidor al navegador. Sin Prisma ni React.
 */

/** Un pedido tal como sale de la base (los montos llegan como Decimal: se convierten acá). */
type PedidoFuente = {
  id: string;
  numero: number;
  createdAt: Date;
  estado: string;
  tipoEntrega: string;
  origen: string;
  clienteNombre: string;
  clienteTelefono: string;
  direccion: string | null;
  clienteLat: number | null;
  clienteLng: number | null;
  deliveryZone: { nombre: string } | null;
  repartidorId: string | null;
  repartidor: { nombre: string } | null;
  metodoPagoReferencia: string;
  formaPagoPos: string | null;
  cobradoEn: Date | null;
  turnoPosId: string | null;
  comprobanteTipo: string;
  facturaNumero: string | null;
  facturaAnulada: boolean;
  facturaTipoIdentificacion: string | null;
  facturaRuc: string | null;
  facturaRazonSocial: string | null;
  facturaEmail: string | null;
  notas: string | null;
  subtotal: unknown;
  costoEnvio: unknown;
  descuento: unknown;
  descuentoTipo: string | null;
  descuentoValor: unknown;
  descuentoMotivo: string | null;
  descuentoPor: string | null;
  total: unknown;
  items: {
    id: string;
    cantidad: number;
    nombreProducto: string;
    opcionesTexto: string | null;
    ingredientesQuitadosTexto: string | null;
    precioUnitario: unknown;
  }[];
};

export type ItemPedidoFila = {
  id: string;
  cantidad: number;
  nombre: string;
  opciones: string | null;
  quitados: string | null;
  precioUnitario: number;
};

export type PedidoFila = {
  id: string;
  /** Lo exige la lista de dos paneles (MaestroDetalle): todos los pedidos se listan. */
  activo: true;
  numero: number;
  /** ISO. */
  creadoEn: string;
  estado: string;
  tipoEntrega: string;
  origen: string;
  clienteNombre: string;
  clienteTelefono: string;
  direccion: string | null;
  clienteLat: number | null;
  clienteLng: number | null;
  zona: string | null;
  repartidorId: string | null;
  repartidor: string | null;
  metodoPagoReferencia: string;
  formaPagoPos: string | null;
  /** ISO. */
  cobradoEn: string | null;
  /** Cobrado: entró a la caja de un turno. */
  cobrado: boolean;
  comprobanteTipo: string;
  facturaNumero: string | null;
  facturaAnulada: boolean;
  facturaTipoIdentificacion: string | null;
  facturaRuc: string | null;
  facturaRazonSocial: string | null;
  facturaEmail: string | null;
  notas: string | null;
  /** La suma de los productos, sin descuento ni envío. */
  subtotal: number;
  costoEnvio: number;
  /** Guaraníes que se restan de los productos (0 = sin descuento). */
  descuento: number;
  descuentoTipo: "porcentaje" | "monto" | null;
  descuentoValor: number | null;
  descuentoMotivo: string | null;
  descuentoPor: string | null;
  /** Lo que se cobra: productos − descuento + envío. */
  total: number;
  /** Todavía se puede modificar: no se cobró, ni se canceló, ni se entregó. */
  abierto: boolean;
  items: ItemPedidoFila[];
};

/** Lo que el detalle necesita saber de esta computadora y del local (no cambia de un pedido a otro). */
export type ContextoPedidos = {
  nombreLocal: string;
  repartidores: { id: string; nombre: string }[];
  /** Impresora QZ Tray para el ticket/factura en esta estación — null = sin configurar. */
  nombreImpresoraTicket: string | null;
  /** Mapa Área de Impresión → impresora QZ Tray, en esta estación. */
  impresorasPorArea: Record<string, string>;
  /** La carta, para cargarle productos a un pedido abierto. */
  categorias: CategoriaVenta[];
  gruposMitad: GrupoMitadVenta[];
  /** Las formas de pago que el local tiene habilitadas (para cobrar). */
  metodosPago: { value: string; label: string }[];
  /** Si el local factura TODA venta (timbrado Autoimpresor). */
  facturaObligatoria: boolean;
  /** Si esta computadora tiene un punto de expedición vigente. Sin eso no se ofrece factura (igual que el POS). */
  puedeFacturar: boolean;
  /** Por qué esta computadora no puede facturar (ya redactado), o null si puede. */
  motivoSinFactura: string | null;
  /** Días hasta que venza el timbrado de esta computadora, o null si no tiene punto de expedición. */
  diasParaVencerTimbrado: number | null;
  /** Puede cargarle productos a un pedido (permiso pedidos.crear). */
  puedeAgregar: boolean;
  /** Puede cancelar productos, dar descuentos y cobrar (permiso pedidos.cambiarEstado). */
  puedeGestionar: boolean;
  /**
   * Si desde esta computadora se puede cobrar ahora: hace falta una caja vinculada y su turno abierto. Sin turno (`sinTurno`) el
   * botón "Cobrar pedido" lleva directo a abrirlo; con otro motivo, queda apagado y se explica.
   */
  cobro: { ok: true } | { ok: false; sinTurno: boolean; motivo: string };
};

export function aFilaDePedido(p: PedidoFuente): PedidoFila {
  return {
    id: p.id,
    activo: true,
    numero: p.numero,
    creadoEn: p.createdAt.toISOString(),
    estado: p.estado,
    tipoEntrega: p.tipoEntrega,
    origen: p.origen,
    clienteNombre: p.clienteNombre,
    clienteTelefono: p.clienteTelefono,
    direccion: p.direccion,
    clienteLat: p.clienteLat,
    clienteLng: p.clienteLng,
    zona: p.deliveryZone?.nombre ?? null,
    repartidorId: p.repartidorId,
    repartidor: p.repartidor?.nombre ?? null,
    metodoPagoReferencia: p.metodoPagoReferencia,
    formaPagoPos: p.formaPagoPos,
    cobradoEn: p.cobradoEn ? p.cobradoEn.toISOString() : null,
    cobrado: !!p.turnoPosId,
    comprobanteTipo: p.comprobanteTipo,
    facturaNumero: p.facturaNumero,
    facturaAnulada: p.facturaAnulada,
    facturaTipoIdentificacion: p.facturaTipoIdentificacion,
    facturaRuc: p.facturaRuc,
    facturaRazonSocial: p.facturaRazonSocial,
    facturaEmail: p.facturaEmail,
    notas: p.notas,
    subtotal: Number(p.subtotal ?? 0),
    costoEnvio: Number(p.costoEnvio ?? 0),
    descuento: Number(p.descuento ?? 0),
    descuentoTipo: p.descuentoTipo === "porcentaje" || p.descuentoTipo === "monto" ? p.descuentoTipo : null,
    descuentoValor: p.descuentoValor == null ? null : Number(p.descuentoValor),
    descuentoMotivo: p.descuentoMotivo,
    descuentoPor: p.descuentoPor,
    total: Number(p.total ?? 0),
    abierto: pedidoAbierto({ estado: p.estado, turnoPosId: p.turnoPosId }),
    items: p.items.map((i) => ({
      id: i.id,
      cantidad: i.cantidad,
      nombre: i.nombreProducto,
      opciones: i.opcionesTexto,
      quitados: i.ingredientesQuitadosTexto,
      precioUnitario: Number(i.precioUnitario ?? 0),
    })),
  };
}
