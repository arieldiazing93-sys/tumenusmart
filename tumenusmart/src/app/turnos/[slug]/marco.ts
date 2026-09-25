import type { CSSProperties } from "react";
import { derivarPaletaMarca } from "@/lib/color-marca";
import { normalizarColor } from "@/lib/servicios-agenda";

/**
 * Las variables de color de la página pública de un negocio, a partir del color
 * que eligió. Se ponen en el contenedor de la página (junto con `data-tema`), no
 * en todo el sitio: es el mismo mecanismo del menú digital, y así el panel de
 * administración nunca las ve.
 */
export function variablesDePagina(colorPrimario: string): CSSProperties {
  const paleta = derivarPaletaMarca(normalizarColor(colorPrimario));
  return {
    "--brand": paleta.brand,
    "--brand-dark": paleta.brandDark,
    "--brand-light": paleta.brandLight,
    "--brand-tinte": paleta.brandTinte,
    "--brand-texto": paleta.brandTexto,
  } as CSSProperties;
}
