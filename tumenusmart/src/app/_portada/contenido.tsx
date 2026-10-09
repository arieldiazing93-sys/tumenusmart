import type { ComponentType } from "react";
import {
  IconoAsistencia,
  IconoCaja,
  IconoClientes,
  IconoComedor,
  IconoDocumento,
  IconoEscudo,
  IconoIdea,
  IconoPromo,
  IconoReporte,
  IconoStock,
  IconoTienda,
  IconoTijera,
  IconoTurnos,
} from "./Iconos";

/**
 * Todo el texto de la portada, separado del diseño.
 *
 * Cada frase de acá es una promesa pública: si algo del sistema cambia, se
 * corrige en este archivo y la portada queda al día sin tocar el dibujo.
 * Las preguntas frecuentes se usan dos veces: en pantalla y en los datos
 * estructurados que lee Google.
 */

export type Funcion = { titulo: string; texto: string };

type Icono = ComponentType<{ className?: string; tam?: number }>;

/** Las cuatro herramientas que se ven al empezar la página, antes de entrar al detalle. */
export const MODULOS: {
  id: string;
  titulo: string;
  texto: string;
  icono: Icono;
  /** Clases completas (Tailwind solo genera las que encuentra escritas): fondo y color del cuadrito del ícono. */
  tono: string;
}[] = [
  {
    id: "pos",
    titulo: "Punto de venta",
    texto: "Cobrá, facturá y cerrá la caja sin sumar nada a mano.",
    icono: IconoCaja,
    tono: "bg-brand-light text-brand",
  },
  {
    id: "stock",
    titulo: "Control de stock",
    texto: "Insumos, recetas y compras. El stock baja solo al vender.",
    icono: IconoStock,
    tono: "bg-exito-luz text-exito",
  },
  {
    id: "asistencia",
    titulo: "Asistencia del personal",
    texto: "Marcación con PIN y cara desde un celular fijo.",
    icono: IconoAsistencia,
    tono: "bg-azul-luz text-azul",
  },
  {
    id: "turnos",
    titulo: "Reserva de turnos",
    texto: "Agenda por profesional y una página de reservas con tu marca.",
    icono: IconoTurnos,
    tono: "bg-violeta-luz text-violeta",
  },
];

export const FUNCIONES_POS: Funcion[] = [
  {
    titulo: "Factura con timbrado o ticket",
    texto: "Con IVA 5 % y 10 % y la numeración de cada punto de expedición.",
  },
  {
    titulo: "Pago dividido",
    texto: "Una parte en efectivo y otra con tarjeta o transferencia, en la misma venta.",
  },
  {
    titulo: "Descuentos y promociones",
    texto: "Porcentajes, 2x1 y 3x2 por día y hora. Los descuentos grandes piden contraseña.",
  },
  {
    titulo: "Comanda automática",
    texto: "La cocina y la barra reciben su parte en su impresora, sin que nadie toque un botón.",
  },
  {
    titulo: "Turnos de caja",
    texto: "Retiros, ingresos y cierre con el reporte detallado de cada turno.",
  },
  {
    titulo: "Ventas a crédito",
    texto: "Clientes con su historial y cuentas por cobrar al día.",
  },
];

export const FUNCIONES_STOCK: Funcion[] = [
  {
    titulo: "Recetas y costo por producto",
    texto: "El costo sale de los insumos y ves el margen real de cada plato.",
  },
  {
    titulo: "Descuento automático al vender",
    texto: "Mostrador, mesa o delivery: cada venta descuenta lo que se usó.",
  },
  {
    titulo: "Compras y proveedores",
    texto: "Registrá cada compra y llevá las cuentas por pagar.",
  },
  {
    titulo: "Varios almacenes",
    texto: "Movimientos manuales y registro de inventario para contar lo que hay.",
  },
  {
    titulo: "Salidas por venta",
    texto: "Revisá qué se descontó con cada venta cuando algo no cierra.",
  },
  {
    titulo: "Gastos del local",
    texto: "Anotalos junto a las ventas y mirá el resultado completo.",
  },
];

export const FUNCIONES_ASISTENCIA: Funcion[] = [
  {
    titulo: "Celular fijo con PIN",
    texto: "Un enlace propio del local en un celular de la entrada. No se instala nada.",
  },
  {
    titulo: "Detección de cara automática",
    texto: "Reconoce al colaborador y registra la marcación al instante.",
  },
  {
    titulo: "Foto de cada marcación",
    texto: "Para revisar cualquier duda. Se borran solas a los 30 días; la hora queda.",
  },
  {
    titulo: "Excel y PDF",
    texto: "Marcaciones por colaborador y por fecha, listas para descargar.",
  },
];

export const FUNCIONES_TURNOS: Funcion[] = [
  {
    titulo: "Calendario Día, Semana y Mes",
    texto: "Cada turno mide lo que dura y se lee de un vistazo.",
  },
  {
    titulo: "Horario por profesional",
    texto: "Solo se ofrecen horas libres: sin pisar otro turno ni el día de descanso.",
  },
  {
    titulo: "Aviso por WhatsApp",
    texto: "Te llega apenas un cliente reserva desde tu página.",
  },
  {
    titulo: "Cobro y comisión",
    texto: "Factura, forma de pago y la comisión de cada profesional, calculadas solas.",
  },
  {
    titulo: "Mi trabajo",
    texto: "Cada profesional ve su agenda y sus números desde su propio enlace.",
  },
];

export const FUNCIONES_RESTAURANTE: Funcion[] = [
  {
    titulo: "Carta digital propia",
    texto: "Con tu logo, tus fotos y tus colores. Cambiás un precio y se actualiza al instante.",
  },
  {
    titulo: "Pedidos por WhatsApp",
    texto: "Llegan redactados al teléfono del local, con zona de envío, costo y medio de pago.",
  },
  {
    titulo: "Reservas de mesa",
    texto: "Con turnos, horarios y cupo por franja.",
  },
  {
    titulo: "Servicio de comedor",
    texto: "El mozo abre la cuenta con su PIN desde el celular. La caja cobra y divide la cuenta.",
  },
  {
    titulo: "Delivery con repartidores",
    texto: "Cada repartidor tiene su enlace y ve únicamente lo que le asignaron.",
  },
];

/** "Y además": lo que acompaña a las cuatro herramientas. */
export const ADEMAS: { titulo: string; texto: string; icono: Icono }[] = [
  {
    titulo: "Reportes y estadísticas",
    texto: "Ventas, rentabilidad, cancelaciones, mozos y cierres de turno. Se descargan en Excel y PDF.",
    icono: IconoReporte,
  },
  {
    titulo: "Promociones y descuentos",
    texto: "2x1, 3x2 y porcentajes con días y horas. Las cortesías se dan solo con permiso.",
    icono: IconoPromo,
  },
  {
    titulo: "Clientes y crédito",
    texto: "Ficha de cada cliente, ventas a crédito y cuentas por cobrar.",
    icono: IconoClientes,
  },
  {
    titulo: "Seguridad y permisos",
    texto: "Perfiles de acceso, contraseña para las acciones sensibles y una bitácora de todo lo que se hace.",
    icono: IconoEscudo,
  },
  {
    titulo: "Una idea cada lunes",
    texto: "El sistema revisa tus propias ventas y te deja una sola idea concreta para vender más.",
    icono: IconoIdea,
  },
  {
    titulo: "Facturas y cotizaciones",
    texto: "Presupuestos para tus clientes y todas tus facturas guardadas en un solo lugar.",
    icono: IconoDocumento,
  },
];

/** "Todo conectado": el recorrido de una venta por el sistema. */
export const FLUJO: { titulo: string; texto: string }[] = [
  { titulo: "Vendés", texto: "En el mostrador, en la mesa, por delivery o al cobrar un turno." },
  { titulo: "El stock baja solo", texto: "Cada insumo se descuenta del almacén correcto." },
  { titulo: "La caja se cuadra", texto: "El arqueo del turno ya está hecho cuando cerrás." },
  { titulo: "Se factura", texto: "Con timbrado, con IVA y con la numeración que corresponde." },
  { titulo: "Ves el resultado", texto: "Ventas, costos y margen en los reportes, al día." },
];

export const PARA_QUIEN: {
  titulo: string;
  texto: string;
  icono: Icono;
  usa: string[];
}[] = [
  {
    titulo: "Restaurantes, bares y comidas rápidas",
    texto: "Del pedido en la mesa al delivery, con la cocina enterándose sola.",
    icono: IconoComedor,
    usa: ["Punto de venta", "Comedor con mozos", "Carta y pedidos", "Delivery", "Stock con recetas"],
  },
  {
    titulo: "Barberías, peluquerías y salones",
    texto: "Una agenda que no se pisa y comisiones que se calculan solas.",
    icono: IconoTijera,
    usa: ["Reserva de turnos", "Comisión por profesional", "Cobro en caja", "Asistencia"],
  },
  {
    titulo: "Heladerías, bodegas, talleres, veterinarias y comercios",
    texto: "Vender, facturar y saber cuánto queda en el depósito.",
    icono: IconoTienda,
    usa: ["Punto de venta", "Stock y compras", "Clientes y crédito", "Factura con timbrado"],
  },
];

export const PASOS: Funcion[] = [
  {
    titulo: "Hablamos y te damos de alta",
    texto: "Nos pasás el nombre del negocio, tu WhatsApp y el rubro. Te entregamos tu usuario.",
  },
  {
    titulo: "Cargás lo tuyo",
    texto: "Productos y precios, insumos, personal y servicios. Arrancás con una carta de ejemplo para ir más rápido.",
  },
  {
    titulo: "Empezás a vender",
    texto: "Cobrás en el punto de venta, compartís tu QR y tu página de reservas, y el personal marca desde el celular fijo.",
  },
];

export const PREGUNTAS: { pregunta: string; respuesta: string }[] = [
  {
    pregunta: "¿Tengo que instalar algo?",
    respuesta:
      "No. Todo funciona desde el navegador de tu PC, tablet o celular. Solo para imprimir tickets y comandas automáticamente, la PC de caja usa un pequeño programa de impresión (QZ Tray) que te ayudamos a configurar.",
  },
  {
    pregunta: "¿Sirve para mi tipo de negocio?",
    respuesta:
      "Está pensado para restaurantes y comidas rápidas, y para barberías, peluquerías y salones. También sirve para heladerías, bodegas, talleres y veterinarias. Escribinos y te contamos cómo se adaptaría al tuyo.",
  },
  {
    pregunta: "¿Cuánto cuesta?",
    respuesta:
      "Una cuota fija mensual: no cobramos comisión por venta, así que el importe es el mismo vendas lo que vendas. Escribinos por WhatsApp con tu rubro y te pasamos el precio.",
  },
  {
    pregunta: "¿Emite factura legal?",
    respuesta:
      "Sí. Emite factura con timbrado, con IVA 5 % y 10 %, y cada estación usa la numeración de su punto de expedición. También podés cobrar con ticket cuando no hace falta factura.",
  },
  {
    pregunta: "¿Y la factura electrónica (SIFEN)?",
    respuesta:
      "Estamos preparando la conexión con SIFEN a través de un proveedor autorizado. Hoy el sistema emite facturas con timbrado; escribinos y te contamos en qué etapa está.",
  },
  {
    pregunta: "¿Pueden usarlo varias personas a la vez?",
    respuesta:
      "Sí. La caja, los mozos, los repartidores y el personal entran desde sus propios dispositivos, cada uno con lo que le corresponde ver, y todos trabajan sobre los mismos datos.",
  },
  {
    pregunta: "¿Cuánto tarda en empezar a funcionar?",
    respuesta:
      "Te damos de alta el mismo día con tu rubro y una carta de ejemplo. Después la ajustás con tus productos, precios y fotos a tu ritmo.",
  },
  {
    pregunta: "¿Puedo ver cómo funciona antes de decidir?",
    respuesta:
      "Sí. Desde esta página podés abrir una carta y una página de reservas reales, y si querés ver el panel por dentro te hacemos una demo por WhatsApp.",
  },
];

