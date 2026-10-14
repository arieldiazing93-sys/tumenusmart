import { headers } from "next/headers";

/**
 * La dirección pública de la carta (para el botón «Ver mi carta»: enlace y QR), tomada del dominio con el que se entró al panel.
 * Solo para el servidor (lee las cabeceras del pedido). Devuelve "" si no se puede saber.
 */
export async function urlPublicaCarta(slug: string): Promise<string> {
  const cabeceras = await headers();
  const host = cabeceras.get("x-forwarded-host") ?? cabeceras.get("host") ?? "";
  if (!host) return "";
  const protocolo = host.startsWith("localhost") ? "http" : "https";
  return `${protocolo}://${host}/${slug}`;
}
