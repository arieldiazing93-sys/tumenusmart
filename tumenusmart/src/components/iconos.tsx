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

/** Foto pendiente: el marco vacío que reemplaza el bloque liso sin imagen. */
export const IconoFoto = (p: Props) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="8.5" cy="10" r="1.6" />
    <path d="m4 16 4.5-4.5L12 15l3-3 5 5" />
  </Svg>
);

export const ICONOS = {
  pedidos: IconoPedidos,
  reservas: IconoReservas,
  productos: IconoProductos,
  categorias: IconoCategorias,
  estadisticas: IconoEstadisticas,
  ideas: IconoIdeas,
  configuracion: IconoConfiguracion,
  repartidores: IconoRepartidores,
  cierre: IconoCierre,
  cuenta: IconoCuenta,
  cartera: IconoCartera,
  usuarios: IconoUsuarios,
  errores: IconoErrores,
} as const;

export type NombreIcono = keyof typeof ICONOS;
