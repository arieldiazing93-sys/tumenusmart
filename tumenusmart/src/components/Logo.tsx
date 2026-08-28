/**
 * La marca de TuMenuSmart.
 *
 * Es un componente y no un archivo de imagen por dos motivos. Uno: dibujada
 * en el mismo HTML no cuesta una petición más ni parpadea al cargar. Dos:
 * hereda el color del texto que la rodea, así que la misma marca sirve en
 * naranja, en blanco sobre la banda oscura, y en negro en el ticket térmico
 * —que imprime en un solo color— sin tener tres archivos distintos.
 *
 * La forma es una comanda con el rabito de un globo de mensaje: las dos cosas
 * que hace el producto, la carta y el pedido que llega por WhatsApp.
 */

/** El dibujo, en un cuadro de 48×48 con márgenes iguales de los cuatro lados. */
function Dibujo({ color, hueco }: { color: string; hueco: string }) {
  return (
    <>
      <path
        d="M12.5 6H35.5A5.5 5.5 0 0 1 41 11.5V40L35.33 36.80 L29.67 40.00 L24.00 36.80 L18.33 40.00 L12.67 36.80 L7.00 40.00L2.50 45.50L7.00 35.50V11.5A5.5 5.5 0 0 1 12.5 6Z"
        fill={color}
      />
      <rect x="12" y="14.4" width="24" height="3.7" rx="1.85" fill={hueco} />
      <rect x="12" y="21.2" width="24" height="3.7" rx="1.85" fill={hueco} />
      <rect x="12" y="28" width="12.5" height="3.7" rx="1.85" fill={hueco} />
    </>
  );
}

/**
 * Solo la marca, sin el nombre.
 *
 * Por defecto toma el color del texto que la rodea. El hueco de las líneas se
 * pinta del color del fondo donde va: no puede ser transparente, porque sobre
 * la banda oscura las líneas desaparecerían.
 */
export function Logo({
  tam = 28,
  color = "currentColor",
  hueco = "#FFFFFF",
  className = "",
}: {
  tam?: number;
  color?: string;
  hueco?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={tam}
      height={tam}
      role="img"
      aria-label="TuMenuSmart"
      className={`flex-none ${className}`}
    >
      <Dibujo color={color} hueco={hueco} />
    </svg>
  );
}

/**
 * La marca con el nombre al lado.
 *
 * "Smart" va en naranja y el resto en tinta: parte el nombre en sus dos
 * mitades sin necesidad de dos tipografías ni de un separador.
 */
export function LogoConNombre({
  tam = 26,
  className = "",
}: {
  tam?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Logo tam={tam} color="#D2501F" />
      <span
        className="font-semibold tracking-titular text-tinta"
        style={{ fontSize: `${tam * 0.62}px` }}
      >
        TuMenu<span className="text-brand">Smart</span>
      </span>
    </span>
  );
}
