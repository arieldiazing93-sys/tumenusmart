/**
 * La conexión con los servicios web de la DNIT: HTTPS (TLS 1.2 o más) con autenticación mutua —el sistema se presenta con el
 * certificado digital del contribuyente— y mensajes SOAP 1.2. Manual Técnico v150, secciones 7.7 y 7.9.
 *
 * Solo para el servidor. Es una pieza chica y separada a propósito: las pruebas la reemplazan por una DNIT simulada, y la lógica
 * de qué hacer con cada respuesta está en `envio.ts`.
 */

import type { IncomingMessage } from "node:http";
import https from "node:https";
import { urlsDelServicio, type AmbienteWs, type Servicio } from "./ws";

export type Peticion = {
  servicio: Servicio;
  ambiente: AmbienteWs;
  /** El mensaje SOAP completo (con su <Envelope>). */
  cuerpo: string;
  /** El certificado del contribuyente (y su cadena) y su clave privada, en PEM. */
  certificadoPem: string;
  clavePem: string;
};

export type Contestacion = { status: number; cuerpo: string; url: string };

/** Quien lleva un mensaje a la DNIT y trae lo que contesta. Lanza si no hay comunicación (sin conexión, tiempo agotado, certificado rechazado en el saludo TLS…). */
export type Transporte = (peticion: Peticion) => Promise<Contestacion>;

/** Cuánto se espera la respuesta de un servicio antes de darlo por caído. */
const TIEMPO_LIMITE_MS = 30_000;
/** Lo más grande que se acepta de respuesta: un protocolo de DNIT pesa pocos KB. */
const MAX_BYTES_RESPUESTA = 5 * 1024 * 1024;

function publicar(url: string, p: Peticion): Promise<Contestacion> {
  return new Promise((resolver, rechazar) => {
    const cuerpo = Buffer.from(p.cuerpo, "utf8");
    const pedido = https.request(
      url,
      {
        method: "POST",
        cert: p.certificadoPem,
        key: p.clavePem,
        minVersion: "TLSv1.2",
        headers: {
          "Content-Type": "application/soap+xml; charset=utf-8",
          "Content-Length": cuerpo.length,
          Accept: "application/soap+xml, application/xml, text/xml",
        },
      },
      (respuesta: IncomingMessage) => {
        const trozos: Buffer[] = [];
        let total = 0;
        respuesta.on("data", (t: Buffer) => {
          total += t.length;
          if (total > MAX_BYTES_RESPUESTA) {
            pedido.destroy(new Error("La respuesta de la DNIT es demasiado grande"));
            return;
          }
          trozos.push(t);
        });
        respuesta.on("end", () => resolver({ status: respuesta.statusCode ?? 0, cuerpo: Buffer.concat(trozos).toString("utf8"), url }));
        respuesta.on("error", rechazar);
      }
    );
    pedido.setTimeout(TIEMPO_LIMITE_MS, () => pedido.destroy(new Error(`La DNIT no respondió en ${TIEMPO_LIMITE_MS / 1000} segundos`)));
    pedido.on("error", rechazar);
    pedido.end(cuerpo);
  });
}

/**
 * Envía el mensaje al servicio. Prueba las direcciones del servicio en orden (ver `urlsDelServicio`): si una contesta "no
 * existe" (404/405) sigue con la próxima; cualquier otra respuesta, buena o mala, se devuelve tal cual para que `envio.ts` decida.
 */
export const transporteHttps: Transporte = async (p) => {
  let ultima: Contestacion | null = null;
  for (const url of urlsDelServicio(p.servicio, p.ambiente)) {
    const c = await publicar(url, p);
    ultima = c;
    if (c.status !== 404 && c.status !== 405) return c;
  }
  if (!ultima) throw new Error("No hay dirección para este servicio");
  return ultima;
};
