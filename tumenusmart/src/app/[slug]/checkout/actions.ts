"use server";

import { headers } from "next/headers";
import { normalizarPedidoPublico, type DatosPublicosPedido } from "@/lib/pedido-web";
import { crearPedidoWeb, huellaDeDispositivo, localParaPedidoWeb } from "@/lib/pedido-web-servidor";

/**
 * El envío del pedido desde el menú digital. Lo usa el cliente desde su celular, sin iniciar sesión: no hay usuario que consultar.
 * Se protege de otra forma:
 *
 *  - el local sale SIEMPRE de la dirección del menú (`slug`), nunca de algo que mande el navegador, y tiene que tener encendidos
 *    los pedidos por el sistema;
 *  - del navegador solo llega QUÉ eligió: los precios, la zona y el envío los calcula el servidor con la base;
 *  - todo lo que llega se revisa de nuevo (tipos, largos, cantidades, RUC);
 *  - un reintento del mismo envío no duplica nada, y hay un tope de pedidos por teléfono y por dispositivo en unos minutos.
 */

export type ResultadoEnviarPedidoWeb =
  | { ok: true; token: string; numero: number; total: number; aceptado: boolean }
  | { ok: false; error: string; campo?: string };

const NO_DISPONIBLE = "Este local no recibe pedidos por acá en este momento.";

export async function enviarPedidoWeb(slug: string, datos: DatosPublicosPedido): Promise<ResultadoEnviarPedidoWeb> {
  try {
    // La trampa para robots: un cliente de verdad nunca llena ese campo (está escondido). Se responde un error genérico.
    if (datos && typeof datos === "object" && datos.sitioWeb) return { ok: false, error: "No se pudo enviar el pedido." };

    const local = await localParaPedidoWeb(String(slug ?? ""));
    if (!local || !local.pedidosWebActivo) return { ok: false, error: NO_DISPONIBLE };

    const normalizado = normalizarPedidoPublico(datos);
    if (!normalizado.ok) return { ok: false, error: normalizado.error, campo: normalizado.campo };

    const cabeceras = await headers();
    const ip = (cabeceras.get("x-forwarded-for") ?? "").split(",")[0].trim() || cabeceras.get("x-real-ip");
    const r = await crearPedidoWeb(local, normalizado.datos, { ipHash: huellaDeDispositivo(ip) });
    if (!r.ok) return { ok: false, error: r.error, campo: r.campo };
    return { ok: true, token: r.token, numero: r.numero, total: r.total, aceptado: r.estado !== "nuevo" };
  } catch (e) {
    // Next oculta en producción el mensaje de una excepción de una acción: se devuelve un resultado y el detalle queda en el log.
    console.error("[pedido-web] enviarPedidoWeb falló", e);
    return { ok: false, error: "No pudimos enviar tu pedido. Probá de nuevo en unos segundos." };
  }
}
