import { barrasDeCodigo, barrasDelSimbolo, margenesEnModulos, modulosDelSimbolo } from "@/lib/codigo-barras";

/**
 * Las barras de un código (EAN-13, EAN-8 o UPC-A) como una imagen SVG de medidas REALES en milímetros: lo que se ve en pantalla es del
 * tamaño en que sale impreso. Todo se dibuja en «módulos» (cada barra más fina vale un módulo), así que el ancho de la barra más fina es
 * exactamente `moduloMm` y no se deforma al escalar.
 *
 * Con `altoNumerosMm` mayor que cero, debajo van los números del código (el primero afuera, a la izquierda, como en cualquier EAN) y las barras
 * de guarda (inicio, medio y final) bajan hasta la mitad de los números. Sin números (0), solo las barras.
 *
 * Devuelve null si el código no se puede imprimir (no es un EAN/UPC con su dígito verificador bien).
 */
export function BarrasSvg({
  codigo,
  moduloMm,
  altoBarrasMm,
  altoNumerosMm = 0,
  titulo,
}: {
  codigo: string;
  /** Lo que mide la barra más fina, en milímetros (ver `medirBarras`). */
  moduloMm: number;
  altoBarrasMm: number;
  /** El alto de los números de debajo, en milímetros; 0 = sin números. */
  altoNumerosMm?: number;
  titulo?: string;
}) {
  const barras = barrasDeCodigo(codigo);
  if (!barras || !(moduloMm > 0)) return null;

  const { izquierdo, derecho } = margenesEnModulos(barras.tipo);
  const anchoModulos = izquierdo + modulosDelSimbolo(barras.tipo) + derecho;
  const altoBarras = altoBarrasMm / moduloMm;
  const altoNumeros = altoNumerosMm / moduloMm;
  const altoTotal = altoBarras + altoNumeros;
  const conNumeros = altoNumeros > 0;
  const guardaExtra = conNumeros ? altoNumeros * 0.5 : 0;

  // Los números: el primero en el margen de la izquierda (solo en un EAN-13) y el resto, uno por cada 7 módulos, debajo de cada mitad.
  const numeros: { x: number; digito: string }[] = [];
  if (conNumeros) {
    const d = barras.digitos;
    if (barras.tipo === "ean13") {
      numeros.push({ x: izquierdo / 2, digito: d[0] });
      for (let i = 1; i <= 6; i++) numeros.push({ x: izquierdo + 3 + 7 * (i - 1) + 3.5, digito: d[i] });
      for (let i = 7; i <= 12; i++) numeros.push({ x: izquierdo + 50 + 7 * (i - 7) + 3.5, digito: d[i] });
    } else {
      for (let i = 0; i < 4; i++) numeros.push({ x: izquierdo + 3 + 7 * i + 3.5, digito: d[i] });
      for (let i = 4; i < 8; i++) numeros.push({ x: izquierdo + 36 + 7 * (i - 4) + 3.5, digito: d[i] });
    }
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${anchoModulos} ${altoTotal}`}
      width={`${anchoModulos * moduloMm}mm`}
      height={`${altoTotal * moduloMm}mm`}
      role="img"
      aria-label={titulo ?? `Código de barras ${barras.digitos}`}
      shapeRendering="crispEdges"
      style={{ display: "block", maxWidth: "none" }}
    >
      <rect x={0} y={0} width={anchoModulos} height={altoTotal} fill="#ffffff" />
      {barrasDelSimbolo(barras).map((b, i) => (
        <rect key={i} x={izquierdo + b.x} y={0} width={b.ancho} height={altoBarras + (b.guarda ? guardaExtra : 0)} fill="#000000" />
      ))}
      {numeros.map((n, i) => (
        <text
          key={i}
          x={n.x}
          y={altoBarras + altoNumeros * 0.82}
          textAnchor="middle"
          fontSize={altoNumeros * 0.95}
          fontFamily="Arial, Helvetica, sans-serif"
          fill="#000000"
          shapeRendering="auto"
        >
          {n.digito}
        </text>
      ))}
    </svg>
  );
}
