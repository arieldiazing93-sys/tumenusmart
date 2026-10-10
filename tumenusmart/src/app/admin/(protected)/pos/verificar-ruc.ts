"use server";

import { exigirPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { verificarRucEnLaDnit } from "@/lib/sifen/consulta-ruc";
import { verificacion, type VerificacionRuc } from "@/lib/sifen/ruc";

/**
 * Verifica un RUC contra la DNIT (existe, razón social y estado) para el cajero que está cargando el cliente de una factura.
 * Es una ayuda: nunca lanza ni corta la venta; si la DNIT no contesta devuelve «no disponible» y queda el control del dígito
 * verificador. Mismo permiso que buscar al cliente (`buscarClientePorIdentificacion`).
 *
 * `forzar`: consultar de nuevo aunque haya una respuesta de hace pocos minutos (el botón «Verificar» de la pantalla).
 */
export async function verificarRucDnit(numero: string, forzar?: boolean): Promise<VerificacionRuc> {
  await exigirPermiso("pos.vender");
  const storeId = await idLocalActual();
  if (typeof numero !== "string" || numero.length > 40) {
    return verificacion({ resultado: "no_consultable", nivel: "info", mensaje: "Escribí el RUC con su dígito verificador, por ejemplo 80012345-0." });
  }
  return verificarRucEnLaDnit(storeId, numero, { forzar: forzar === true });
}
