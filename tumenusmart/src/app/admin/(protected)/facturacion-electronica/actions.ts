"use server";

import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { registrarBitacora } from "@/lib/bitacora";
import { firmarFactura, guardarCertificado, guardarConfiguracion, quitarCertificado, type ResultadoFirmar } from "@/lib/sifen/servidor";

export type ResultadoSimple = { ok: true; avisos?: string[] } | { ok: false; error: string };

/** El .p12 de un contribuyente pesa unos pocos KB; algo mucho más grande no es un certificado. */
const MAX_BYTES_CERTIFICADO = 200 * 1024;

/**
 * Sube el certificado digital (.p12 / .pfx) con su contraseña. La contraseña se usa una vez para abrir el archivo y se
 * descarta; la clave privada queda cifrada en la bóveda. Solo el dueño.
 */
export async function subirCertificado(formData: FormData): Promise<ResultadoSimple> {
  const sesion = await exigirPermiso("facturacion.configurar");
  const storeId = await idLocalActual();

  const archivo = formData.get("archivo");
  const clave = String(formData.get("clave") ?? "");
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, error: "Elegí el archivo del certificado (.p12 o .pfx)." };
  if (archivo.size > MAX_BYTES_CERTIFICADO) return { ok: false, error: "El archivo es demasiado grande para ser un certificado." };
  if (clave === "") return { ok: false, error: "Escribí la contraseña del certificado." };

  const bytes = new Uint8Array(await archivo.arrayBuffer());
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  const resultado = await guardarCertificado(storeId, btoa(binario), clave, { email: sesion.email, nombre: sesion.nombre });
  if (!resultado.ok) return resultado;

  await registrarBitacora(storeId, sesion, {
    modulo: "facturacion_electronica",
    accion: "certificado_cargado",
    descripcion: `Cargó el certificado digital para facturar${resultado.ruc ? ` (RUC ${resultado.ruc})` : ""}, vigente hasta el ${resultado.validoHasta.toLocaleDateString("es-PY")}.`,
    entidad: "CertificadoFirma",
    detalle: { huellaSha256: resultado.huellaSha256, ruc: resultado.ruc, avisos: resultado.avisos },
  });
  revalidatePath("/admin/facturacion-electronica");
  return { ok: true, avisos: resultado.avisos };
}

/** Saca el certificado activo (y borra su clave privada de la bóveda). */
export async function sacarCertificado(): Promise<ResultadoSimple> {
  const sesion = await exigirPermiso("facturacion.configurar");
  const storeId = await idLocalActual();
  const cantidad = await quitarCertificado(storeId);
  if (cantidad === 0) return { ok: false, error: "No hay un certificado cargado." };
  await registrarBitacora(storeId, sesion, {
    modulo: "facturacion_electronica",
    accion: "certificado_quitado",
    descripcion: "Quitó el certificado digital para facturar (su clave privada se borró de la bóveda).",
    entidad: "CertificadoFirma",
  });
  revalidatePath("/admin/facturacion-electronica");
  return { ok: true };
}

/** Guarda el ambiente (pruebas o producción) y el código de seguridad del contribuyente (CSC). */
export async function guardarConfiguracionElectronica(formData: FormData): Promise<ResultadoSimple> {
  const sesion = await exigirPermiso("facturacion.configurar");
  const storeId = await idLocalActual();
  const ambiente = String(formData.get("ambiente") ?? "");
  const resultado = await guardarConfiguracion(storeId, {
    ambiente,
    idCsc: String(formData.get("idCsc") ?? ""),
    csc: String(formData.get("csc") ?? ""),
  });
  if (!resultado.ok) return resultado;
  const cambioCsc = String(formData.get("csc") ?? "").trim() !== "";
  await registrarBitacora(storeId, sesion, {
    modulo: "facturacion_electronica",
    accion: "configuracion_guardada",
    descripcion: `Configuró la facturación electrónica: ambiente de ${ambiente === "produccion" ? "producción" : "pruebas"}${cambioCsc ? " y cargó un código de seguridad (CSC) nuevo" : ""}.`,
    entidad: "ConfigFacturacionElectronica",
    detalle: { ambiente, idCsc: String(formData.get("idCsc") ?? "").trim() || null, cscNuevo: cambioCsc },
  });
  revalidatePath("/admin/facturacion-electronica");
  return { ok: true };
}

/**
 * Firma el documento electrónico de una factura (con el certificado de la bóveda) y lo guarda. Usa la clave privada del
 * negocio, así que pide el mismo permiso que configurarla.
 */
export async function firmarFacturaElectronica(origen: "pedido" | "venta", id: string): Promise<ResultadoFirmar> {
  const sesion = await exigirPermiso("facturacion.configurar");
  if ((origen !== "pedido" && origen !== "venta") || typeof id !== "string" || id === "") return { ok: false, error: "Factura inválida." };
  const storeId = await idLocalActual();
  const resultado = await firmarFactura(storeId, origen, id, { email: sesion.email, nombre: sesion.nombre });
  if (resultado.ok) {
    await registrarBitacora(storeId, sesion, {
      modulo: "facturacion_electronica",
      accion: "documento_firmado",
      descripcion: `Firmó el documento electrónico ${resultado.vistaPrevia ? "(vista previa de una factura autoimpresor) " : ""}CDC ${resultado.cdc}.`,
      entidad: "DocumentoElectronico",
      entidadId: resultado.documentoId,
      detalle: { cdc: resultado.cdc, ambiente: resultado.ambiente, vistaPrevia: resultado.vistaPrevia },
    });
    revalidatePath("/admin/facturacion-electronica");
  }
  return resultado;
}
