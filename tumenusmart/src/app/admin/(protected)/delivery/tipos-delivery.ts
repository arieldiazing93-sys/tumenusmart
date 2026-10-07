/**
 * Lo que la pantalla de Servicio delivery (lista a la izquierda y detalle a la derecha, como el comedor) necesita de cada cuenta,
 * ya en tipos simples (texto, números, fechas en texto) para pasarlo del servidor al navegador. Sin Prisma ni React.
 */

import type { ImpuestosDeCuenta } from "@/lib/comedor";
import type { TotalesDeDelivery } from "@/lib/delivery";
import type { CategoriaVenta, GrupoMitadVenta } from "@/lib/catalogo-venta";

export type ItemDeliveryFila = {
  id: string;
  ronda: number;
  enviadoEn: string;
  cantidad: number;
  nombre: string;
  opciones: string | null;
  quitados: string | null;
  nota: string | null;
  precioUnitario: number;
  anulado: boolean;
  motivoAnulacion: string | null;
  anuladoPor: string | null;
  /** El usuario de la caja que lo cargó. */
  cargadoPor: string | null;
};

export type CuentaDeliveryFila = {
  id: string;
  /** Lo exige la lista de dos paneles (MaestroDetalle): todas las cuentas se listan. */
  activo: true;
  numero: number;
  /** "abierta" | "por_cobrar" (una cuenta cobrada o cancelada sale de la lista: queda en el Historial de cuentas) */
  estado: string;
  abiertaEn: string;
  clienteNombre: string;
  clienteTelefono: string;
  /** Los datos de factura que dio el cliente al pedir, si los dio (todo texto: lo que se escribe en el formulario). */
  ficha: { tipo: string; numero: string; razon: string; email: string } | null;
  direccion: string | null;
  clienteLat: number | null;
  clienteLng: number | null;
  zonaId: string | null;
  zonaNombre: string;
  costoEnvio: number;
  notas: string | null;
  /** El repartidor asignado: asignarlo ya lo manda a trabajar (el pedido le aparece al instante en su enlace). */
  repartidorId: string | null;
  repartidor: string | null;
  /** Cuándo se le asignó el repartidor (ISO). */
  asignadaEn: string | null;
  impresaEn: string | null;
  descuento: { tipo: "porcentaje" | "monto"; valor: number; motivo: string; por: string } | null;
  totales: TotalesDeDelivery;
  /** El IVA que lleva (ya sobre lo que se cobra, con el envío y el descuento): sale de las mismas líneas que la factura. */
  impuestos: ImpuestosDeCuenta;
  items: ItemDeliveryFila[];
};

/** Lo que hace falta saber de esta computadora y de esta persona para operar las cuentas de delivery. */
export type ContextoDelivery = {
  puedeGestionar: boolean;
  puedeCobrar: boolean;
  categorias: CategoriaVenta[];
  gruposMitad: GrupoMitadVenta[];
  /** Las zonas de envío activas (con su costo) para abrir una cuenta. */
  zonas: { id: string; nombre: string; costoEnvio: number }[];
  /** Los repartidores activos. */
  repartidores: { id: string; nombre: string }[];
  /** Si esta computadora puede imprimir la cuenta (estación con impresora para el ticket) o por qué no. */
  imprimirCuenta: { ok: true } | { ok: false; motivo: string };
  /** Si se puede cobrar desde acá (estación con turno abierto) y con qué comprobantes, o por qué no. */
  cobro:
    | {
        ok: true;
        puedeFacturar: boolean;
        diasParaVencerTimbrado: number | null;
        facturaObligatoria: boolean;
        nombreImpresoraTicket: string | null;
        /** Si el local vende a crédito (Configuración): el cobro ofrece "A crédito". */
        permiteCredito: boolean;
      }
    /** `sinTurno`: lo único que falta es abrir el turno de caja: "Pagar cuenta" lleva directo a abrirlo (src/lib/turno-requerido.ts). */
    | { ok: false; motivo: string; sinTurno?: boolean };
};
