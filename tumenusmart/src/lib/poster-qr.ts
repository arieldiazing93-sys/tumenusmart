import { generarMatrizQR } from "./qr";

export const ANCHO_POSTER = 1200;
export const ALTO_POSTER = 1600;

/** Dibuja la matriz del QR en un canvas, centrada en el rectángulo dado. */
function dibujarMatriz(
  ctx: CanvasRenderingContext2D,
  matriz: boolean[][],
  x: number,
  y: number,
  lado: number
): void {
  const modulos = matriz.length;
  // Se redondea el tamaño del módulo para que todos queden del mismo ancho
  // en píxeles: si no, el QR sale con filas de distinto grosor y algunos
  // lectores se marean.
  const tamModulo = Math.floor(lado / modulos);
  const ladoReal = tamModulo * modulos;
  const offsetX = Math.round(x + (lado - ladoReal) / 2);
  const offsetY = Math.round(y + (lado - ladoReal) / 2);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(offsetX, offsetY, ladoReal, ladoReal);

  ctx.fillStyle = "#000000";
  for (let f = 0; f < modulos; f++) {
    for (let c = 0; c < modulos; c++) {
      if (matriz[f][c]) {
        ctx.fillRect(offsetX + c * tamModulo, offsetY + f * tamModulo, tamModulo, tamModulo);
      }
    }
  }
}

/** Ajusta el tamaño de fuente hasta que el texto entre en el ancho dado. */
function ajustarTexto(
  ctx: CanvasRenderingContext2D,
  texto: string,
  anchoMaximo: number,
  tamanoInicial: number,
  peso: string
): number {
  let tamano = tamanoInicial;
  do {
    ctx.font = `${peso} ${tamano}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    if (ctx.measureText(texto).width <= anchoMaximo) break;
    tamano -= 4;
  } while (tamano > 20);
  return tamano;
}

/**
 * Arma el póster imprimible: nombre del negocio, QR grande y la instrucción
 * para el cliente. Devuelve el canvas ya dibujado.
 */
export function dibujarPoster(
  canvas: HTMLCanvasElement,
  opciones: { nombreNegocio: string; url: string; marcaColor?: string }
): void {
  const { nombreNegocio, url, marcaColor = "#e05d2f" } = opciones;

  canvas.width = ANCHO_POSTER;
  canvas.height = ALTO_POSTER;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo preparar el lienzo del póster");

  // Fondo
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, ANCHO_POSTER, ALTO_POSTER);

  // Franja superior de color
  ctx.fillStyle = marcaColor;
  ctx.fillRect(0, 0, ANCHO_POSTER, 24);

  ctx.textAlign = "center";

  // Nombre del negocio
  const tamNombre = ajustarTexto(ctx, nombreNegocio, ANCHO_POSTER - 160, 86, "bold");
  ctx.fillStyle = "#171717";
  ctx.font = `bold ${tamNombre}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillText(nombreNegocio, ANCHO_POSTER / 2, 190);

  // Bajada
  ctx.fillStyle = marcaColor;
  ctx.font = `600 44px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillText("NUESTRA CARTA DIGITAL", ANCHO_POSTER / 2, 262);

  // Marco y QR
  const ladoMarco = 780;
  const xMarco = (ANCHO_POSTER - ladoMarco) / 2;
  const yMarco = 340;

  ctx.fillStyle = "#f5f5f5";
  ctx.fillRect(xMarco - 16, yMarco - 16, ladoMarco + 32, ladoMarco + 32);

  const matriz = generarMatrizQR(url);
  // Zona blanca de silencio alrededor del QR: sin ella muchos lectores no
  // lo encuentran, sobre todo si el cartel está pegado en una pared oscura.
  const margenSilencio = 48;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(xMarco, yMarco, ladoMarco, ladoMarco);
  dibujarMatriz(
    ctx,
    matriz,
    xMarco + margenSilencio,
    yMarco + margenSilencio,
    ladoMarco - margenSilencio * 2
  );

  // Instrucción
  ctx.fillStyle = "#171717";
  ctx.font = `bold 54px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillText("Apuntá la cámara de tu celular", ANCHO_POSTER / 2, yMarco + ladoMarco + 110);

  ctx.fillStyle = "#525252";
  ctx.font = `40px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillText("y hacé tu pedido desde la mesa", ANCHO_POSTER / 2, yMarco + ladoMarco + 172);

  // URL al pie, por si alguien prefiere escribirla
  const tamUrl = ajustarTexto(ctx, url, ANCHO_POSTER - 160, 34, "500");
  ctx.fillStyle = "#a3a3a3";
  ctx.font = `500 ${tamUrl}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillText(url, ANCHO_POSTER / 2, ALTO_POSTER - 70);

  // Franja inferior
  ctx.fillStyle = marcaColor;
  ctx.fillRect(0, ALTO_POSTER - 24, ANCHO_POSTER, 24);
}

/** Convierte la matriz del QR en un SVG, para mostrarlo en pantalla. */
export function matrizASvg(matriz: boolean[][], lado = 256): string {
  const modulos = matriz.length;
  const margen = 2; // en módulos
  const total = modulos + margen * 2;

  let camino = "";
  for (let f = 0; f < modulos; f++) {
    for (let c = 0; c < modulos; c++) {
      if (matriz[f][c]) camino += `M${c + margen} ${f + margen}h1v1h-1z`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#fff"/><path d="${camino}" fill="#000"/></svg>`;
}
