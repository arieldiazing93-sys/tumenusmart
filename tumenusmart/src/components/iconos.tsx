/**
 * Los iconos del menú.
 *
 * Son SVG escritos a mano y no una librería, por dos motivos: una librería de
 * iconos pesa más que todo el panel junto, y con el menú plegado el icono es
 * lo ÚNICO que queda visible — necesito controlar exactamente cómo se ve cada
 * uno a 18 píxeles.
 *
 * Todos comparten la misma caja, el mismo grosor de trazo y ningún relleno,
 * así ninguno pesa más que los otros en la fila.
 */

type Props = { className?: string };

function Svg({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`h-[18px] w-[18px] flex-none ${className}`}
    >
      {children}
    </svg>
  );
}

/**
 * Pedidos: la comanda.
 *
 * Primero fue una bolsa de delivery. Renderizada a 18 píxeles —el tamaño real
 * del menú— se leía como un tacho de basura, y es la sección que más se usa:
 * el icono que se puede confundir con "borrar" es el peor lugar para ahorrar
 * esfuerzo. La comanda con su borde dentado no se parece a nada más, y encima
 * es el papel que el cocinero tiene en la mano.
 */
export const IconoPedidos = (p: Props) => (
  <Svg {...p}>
    <path d="M6 3h12v18l-2.4-1.6L13.2 21 12 19.9 10.8 21l-2.4-1.6L6 21V3Z" />
    <path d="M9.2 8.5h5.6M9.2 12.5h5.6" />
  </Svg>
);

/** Reservas: el calendario. */
export const IconoReservas = (p: Props) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Svg>
);

/** Productos: la etiqueta con su precio. */
export const IconoProductos = (p: Props) => (
  <Svg {...p}>
    <path d="M3 12V4h8l9 9-8 8-9-9Z" />
    <circle cx="7.5" cy="7.5" r="1.3" />
  </Svg>
);

/** Categorías: capas apiladas. */
export const IconoCategorias = (p: Props) => (
  <Svg {...p}>
    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
    <path d="m3 13 9 5 9-5" />
  </Svg>
);

/** Estadísticas: las barras. */
export const IconoEstadisticas = (p: Props) => (
  <Svg {...p}>
    <path d="M3 21h18" />
    <path d="M7 21V11M12 21V4M17 21v-6" />
  </Svg>
);

/** Ideas: la lamparita. */
export const IconoIdeas = (p: Props) => (
  <Svg {...p}>
    <path d="M9.5 18h5M10 21h4" />
    <path d="M12 3a6 6 0 0 0-3.5 10.9c.4.3.6.7.6 1.1h5.8c0-.4.2-.8.6-1.1A6 6 0 0 0 12 3Z" />
  </Svg>
);

/**
 * Analytics: la línea en ascenso con su flecha.
 *
 * Estadísticas ya usa barras verticales — esta tiene que distinguirse de esa
 * incluso a 18 píxeles, así que en vez de barras es una tendencia con punta
 * de flecha, la forma clásica de "esto está subiendo".
 */
export const IconoAnalytics = (p: Props) => (
  <Svg {...p}>
    <path d="M3 17l6-6 4 4 8-9" />
    <path d="M15 6h6v6" />
  </Svg>
);

/** Ayuda: el signo de pregunta. */
export const IconoAyuda = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.3 9.3a2.7 2.7 0 1 1 3.9 2.4c-.7.4-1.2.9-1.2 1.8v.3" />
    <path d="M12 17v.01" />
  </Svg>
);

/** Rentabilidad: el símbolo de porcentaje, para lo que cuenta margen y no solo venta. */
export const IconoRentabilidad = (p: Props) => (
  <Svg {...p}>
    <path d="M18 6 6 18" />
    <circle cx="7.5" cy="7.5" r="2" />
    <circle cx="16.5" cy="16.5" r="2" />
  </Svg>
);

/** Envíos: anillos de radio alrededor de un punto — la misma idea que las
 * zonas de envío en el mapa, no la moto (esa es Repartidores). */
export const IconoEnvios = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
  </Svg>
);

/** Configuración: las perillas. */
export const IconoConfiguracion = (p: Props) => (
  <Svg {...p}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </Svg>
);

/** Repartidores: la moto. */
export const IconoRepartidores = (p: Props) => (
  <Svg {...p}>
    <circle cx="5.5" cy="17.5" r="3" />
    <circle cx="18.5" cy="17.5" r="3" />
    <path d="M8.5 17.5h7l-3-8H10M12 6h3l1.5 4" />
  </Svg>
);

/** Mi cuenta: la persona. */
export const IconoCuenta = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </Svg>
);

/** Cartera: el maletín de los clientes. */
export const IconoCartera = (p: Props) => (
  <Svg {...p}>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18" />
  </Svg>
);

/** Usuarios: dos personas. */
export const IconoUsuarios = (p: Props) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M2.5 19.5a6.5 6.5 0 0 1 13 0" />
    <path d="M16 5.4a3.2 3.2 0 0 1 0 5.2M17.5 14.2a6.5 6.5 0 0 1 4 5.3" />
  </Svg>
);

/** Asesores comerciales: la credencial con foto — distinta de "Usuarios"
 * (dos personas), porque acá es UNA persona identificada, no una cuenta. */
export const IconoAsesores = (p: Props) => (
  <Svg {...p}>
    <rect x="6" y="4" width="12" height="16" rx="2.5" />
    <circle cx="12" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="12" cy="11.5" r="2.3" />
    <path d="M8.3 17.5a3.9 3.9 0 0 1 7.4 0" />
  </Svg>
);

/** Errores: el triángulo de atención. */
export const IconoErrores = (p: Props) => (
  <Svg {...p}>
    <path d="M12 3.5 21 19H3l9-15.5Z" />
    <path d="M12 10v4M12 16.5v.01" />
  </Svg>
);

/** La flecha que pliega y despliega el menú. */
export const IconoPlegar = ({ className = "" }: Props) => (
  <Svg className={className}>
    <path d="M15 6l-6 6 6 6" />
  </Svg>
);

/** Cada sección del menú pide su icono por nombre. */

/**
 * Cierre de caja: un billete con la cara al medio.
 *
 * Es la forma que menos se parece a las que ya están: el recibo de Pedidos es
 * vertical con el borde dentado, y este es un rectángulo ancho y horizontal.
 * A 18 píxeles no se confunden.
 */
export const IconoCierre = (p: Props) => (
  <Svg {...p}>
    <rect x="2.5" y="6.5" width="19" height="11" rx="2" />
    <circle cx="12" cy="12" r="2.4" />
    <path d="M6 12h.01M18 12h.01" />
  </Svg>
);

/** Punto de venta: el ticket de una cuenta cobrada en el mostrador. */
export const IconoPos = (p: Props) => (
  <Svg {...p}>
    <path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4V3Z" />
    <path d="M9 8h6M9 12h6" />
  </Svg>
);

/** Foto pendiente: el marco vacío que reemplaza el bloque liso sin imagen. */
export const IconoFoto = (p: Props) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="8.5" cy="10" r="1.6" />
    <path d="m4 16 4.5-4.5L12 15l3-3 5 5" />
  </Svg>
);

/** Ojo abierto: "mostrar contraseña" — el campo está oculto ahora mismo. */
export const IconoOjo = (p: Props) => (
  <Svg {...p}>
    <path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="2.8" />
  </Svg>
);

/** Ojo tachado: "ocultar contraseña" — el campo se está mostrando en texto plano. */
export const IconoOjoCerrado = (p: Props) => (
  <Svg {...p}>
    <path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="2.8" />
    <path d="M4 4l16 16" />
  </Svg>
);

/**
 * El isotipo de WhatsApp, para los botones que llevan ahí (enviar el pedido,
 * escribirle a un cliente). Es sólido y no de trazo como el resto de este
 * archivo — es una marca reconocible, no un ícono de línea, y calcarlo en
 * trazo lo vuelve irreconocible.
 */
export const IconoWhatsapp = ({ className = "", tam = 18 }: Props & { tam?: number }) => (
  <svg
    viewBox="0 0 32 32"
    fill="currentColor"
    width={tam}
    height={tam}
    aria-hidden="true"
    // El tamaño va por width/height, no por una clase de Tailwind: dos
    // clases de alto en el mismo string (la de acá y una que se pase desde
    // afuera) compiten por la misma propiedad CSS y cuál gana no está
    // garantizado. width/height del SVG no tiene esa ambigüedad.
    className={`flex-none ${className}`}
  >
    <path d="M16.004 3C9.375 3 3.999 8.373 3.999 15c0 2.386.706 4.61 1.923 6.475L4 29l7.706-1.902A11.94 11.94 0 0 0 16.004 27C22.63 27 28 21.627 28 15S22.63 3 16.004 3Zm0 21.818c-1.98 0-3.827-.58-5.383-1.578l-.386-.24-4.573 1.128 1.155-4.457-.253-.397a9.77 9.77 0 0 1-1.53-5.274c0-5.421 4.41-9.83 9.97-9.83 5.56 0 9.97 4.409 9.97 9.83 0 5.421-4.41 9.818-9.97 9.818Zm5.47-7.35c-.3-.15-1.77-.873-2.045-.972-.274-.1-.474-.15-.673.15-.2.3-.773.972-.948 1.172-.174.2-.35.225-.648.075-.3-.15-1.266-.467-2.412-1.489-.892-.796-1.494-1.779-1.669-2.079-.174-.3-.019-.462.131-.611.135-.134.3-.35.449-.525.15-.174.2-.3.3-.5.1-.2.05-.375-.025-.525-.075-.15-.673-1.622-.922-2.222-.243-.583-.49-.504-.673-.513l-.573-.01c-.2 0-.524.075-.798.375-.274.3-1.048 1.024-1.048 2.497 0 1.473 1.073 2.897 1.223 3.097.15.2 2.112 3.225 5.116 4.523.715.309 1.273.494 1.708.632.717.228 1.37.196 1.886.119.575-.086 1.77-.723 2.02-1.422.25-.699.25-1.298.174-1.423-.075-.124-.274-.199-.573-.349Z" />
  </svg>
);

export const ICONOS = {
  pedidos: IconoPedidos,
  reservas: IconoReservas,
  productos: IconoProductos,
  categorias: IconoCategorias,
  estadisticas: IconoEstadisticas,
  ideas: IconoIdeas,
  analytics: IconoAnalytics,
  rentabilidad: IconoRentabilidad,
  envios: IconoEnvios,
  ayuda: IconoAyuda,
  configuracion: IconoConfiguracion,
  repartidores: IconoRepartidores,
  cierre: IconoCierre,
  pos: IconoPos,
  cuenta: IconoCuenta,
  cartera: IconoCartera,
  usuarios: IconoUsuarios,
  errores: IconoErrores,
  asesores: IconoAsesores,
} as const;

export type NombreIcono = keyof typeof ICONOS;
