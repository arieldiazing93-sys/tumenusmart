"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { prisma } from "@/lib/prisma";
import { registrarBitacora } from "@/lib/bitacora";
import { DEPARTAMENTOS, faltantesEmisor, normalizarEmisor } from "@/lib/emisor-fiscal";
import { ciudadesDelDistrito, distritosDelDepartamento, resolverUbicacion, type OpcionGeografica } from "@/lib/sifen/geografia";
import type { Prisma } from "@prisma/client";

export type ResultadoPuntoExpedicion = { ok: true } | { ok: false; error: string };

const TRES_DIGITOS = /^\d{3}$/;

type DatosPuntoExpedicion = {
  nombre: string;
  establecimiento: string;
  puntoExpedicion: string;
  numeroTimbrado: string;
  timbradoDesde: Date;
  timbradoHasta: Date;
  razonSocialEmisor: string;
  rucEmisor: string;
};

function leerDatos(formData: FormData): { datos: DatosPuntoExpedicion } | { error: string } {
  const nombre = String(formData.get("nombre") ?? "").trim();
  const establecimiento = String(formData.get("establecimiento") ?? "").trim();
  const puntoExpedicion = String(formData.get("puntoExpedicion") ?? "").trim();
  const numeroTimbrado = String(formData.get("numeroTimbrado") ?? "").trim();
  const timbradoDesdeTexto = String(formData.get("timbradoDesde") ?? "");
  const timbradoHastaTexto = String(formData.get("timbradoHasta") ?? "");
  const razonSocialEmisor = String(formData.get("razonSocialEmisor") ?? "").trim();
  const rucEmisor = String(formData.get("rucEmisor") ?? "").trim();

  if (!nombre) return { error: "El nombre es obligatorio." };
  if (!TRES_DIGITOS.test(establecimiento)) {
    return { error: "El establecimiento tiene que ser de 3 dígitos, ej: 001." };
  }
  if (!TRES_DIGITOS.test(puntoExpedicion)) {
    return { error: "El punto de expedición tiene que ser de 3 dígitos, ej: 001." };
  }
  if (!numeroTimbrado) return { error: "El número de timbrado es obligatorio." };
  if (!razonSocialEmisor) return { error: "La razón social del emisor es obligatoria." };
  if (!rucEmisor) return { error: "El RUC del emisor es obligatorio." };

  const timbradoDesde = new Date(timbradoDesdeTexto);
  const timbradoHasta = new Date(timbradoHastaTexto);
  if (isNaN(timbradoDesde.getTime()) || isNaN(timbradoHasta.getTime())) {
    return { error: "Las fechas de vigencia del timbrado son obligatorias." };
  }
  if (timbradoHasta <= timbradoDesde) {
    return { error: "El vencimiento tiene que ser posterior al inicio de vigencia." };
  }

  return {
    datos: {
      nombre,
      establecimiento,
      puntoExpedicion,
      numeroTimbrado,
      timbradoDesde,
      timbradoHasta,
      razonSocialEmisor,
      rucEmisor,
    },
  };
}

/**
 * Devuelve un resultado en vez de lanzar los errores de validación: Next.js
 * oculta en producción el mensaje de cualquier `throw` que salga de una
 * Server Action, así que el motivo real solo llega si viaja en el retorno.
 */
export async function crearPuntoExpedicion(formData: FormData): Promise<ResultadoPuntoExpedicion> {
  await exigirPermiso("pos.gestionarEstaciones");
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const leido = leerDatos(formData);
  if ("error" in leido) return { ok: false, error: leido.error };

  await prisma.puntoExpedicion.create({ data: { ...leido.datos, storeId: idLocal } });
  revalidatePath("/admin/pos/puntos-expedicion");
  return { ok: true };
}

export async function actualizarPuntoExpedicion(
  id: string,
  formData: FormData
): Promise<ResultadoPuntoExpedicion> {
  await exigirPermiso("pos.gestionarEstaciones");
  const prisma = prismaDelLocal(await idLocalActual());

  const leido = leerDatos(formData);
  if ("error" in leido) return { ok: false, error: leido.error };

  await prisma.puntoExpedicion.update({ where: { id }, data: leido.datos });
  revalidatePath("/admin/pos/puntos-expedicion");
  return { ok: true };
}

/**
 * Sin borrar: una vez que un punto de expedición emitió facturas, borrarlo
 * dejaría esos comprobantes sin de dónde salió su timbrado — mismo criterio
 * que Productos/Estaciones. Se desactiva nomás.
 */
export async function alternarActivoPuntoExpedicion(id: string, activo: boolean) {
  await exigirPermiso("pos.gestionarEstaciones");
  const prisma = prismaDelLocal(await idLocalActual());

  await prisma.puntoExpedicion.update({ where: { id }, data: { activo } });
  revalidatePath("/admin/pos/puntos-expedicion");
}

/**
 * Política a nivel de LOCAL, no de un punto de expedición puntual — ver
 * Store.facturaObligatoria. Se guarda al instante, mismo patrón que
 * alternarPausaPedidos (src/app/admin/(protected)/configuracion/actions.ts).
 */
export async function alternarFacturaObligatoria(obligatoria: boolean): Promise<void> {
  const sesion = await exigirPermiso("pos.gestionarEstaciones");
  const storeId = await idLocalActual();
  await prisma.store.update({
    where: { id: storeId },
    data: { facturaObligatoria: obligatoria },
  });
  await registrarBitacora(storeId, sesion, {
    modulo: "configuracion",
    accion: obligatoria ? "factura_obligatoria_activada" : "factura_obligatoria_desactivada",
    descripcion: obligatoria
      ? 'Activó "Facturar todas las ventas": el punto de venta ya no permite vender solo con ticket.'
      : 'Desactivó "Facturar todas las ventas".',
    entidad: "Store",
    entidadId: storeId,
  });
  revalidatePath("/admin/pos/puntos-expedicion");
  revalidatePath("/admin/pos");
}

export type ResultadoEmisorFiscal = { ok: true } | { ok: false; error: string };

/**
 * Guarda los datos del contribuyente que pide la factura ELECTRÓNICA (SIFEN):
 * dirección, ciudad, teléfono, correo, actividades económicas… Son todos
 * opcionales — la factura autoimpresor no los usa —, así que se puede guardar
 * a medias y completar después. Ver src/lib/emisor-fiscal.ts.
 *
 * Los datos van como objeto (no como FormData) porque incluyen la lista de
 * actividades. Devuelve un resultado en vez de lanzar los errores de
 * validación: Next.js oculta en producción el mensaje de cualquier `throw`.
 */
export async function guardarEmisorFiscal(entrada: Record<string, unknown>): Promise<ResultadoEmisorFiscal> {
  const sesion = await exigirPermiso("pos.gestionarEstaciones");
  const storeId = await idLocalActual();

  const validado = normalizarEmisor(entrada);
  if (!validado.ok) return { ok: false, error: validado.error };
  const d = validado.datos;

  // El distrito y la ciudad salen de la tabla oficial de la DNIT a partir del código de la ciudad: la DNIT compara
  // los nombres con esa tabla y que departamento, distrito y ciudad estén relacionados. Lo escrito a mano no se usa.
  if (d.ciudadCodigo !== null) {
    const departamento = DEPARTAMENTOS.find((x) => x.clave === d.departamento);
    const r = resolverUbicacion({
      departamentoCodigo: departamento?.codigoSifen ?? null,
      distritoCodigo: d.distritoCodigo,
      ciudadCodigo: d.ciudadCodigo,
    });
    if (!r.ok) return { ok: false, error: r.error };
    d.departamento = DEPARTAMENTOS.find((x) => x.codigoSifen === r.ubicacion.departamentoCodigo)?.clave ?? d.departamento;
    d.distritoCodigo = r.ubicacion.distritoCodigo;
    d.distrito = r.ubicacion.distritoNombre;
    d.ciudad = r.ubicacion.ciudadNombre;
  }

  const datos = {
    tipoContribuyente: d.tipoContribuyente,
    tipoRegimen: d.tipoRegimen,
    nombreFantasia: d.nombreFantasia,
    denominacionSucursal: d.denominacionSucursal,
    telefono: d.telefono,
    email: d.email,
    direccion: d.direccion,
    numeroCasa: d.numeroCasa,
    complemento: d.complemento,
    departamento: d.departamento,
    distritoCodigo: d.distritoCodigo,
    distrito: d.distrito,
    ciudadCodigo: d.ciudadCodigo,
    ciudad: d.ciudad,
    actividades: d.actividades as Prisma.InputJsonValue,
  };

  // Cliente global con el local explícito: EmisorFiscal es uno por local.
  await prisma.emisorFiscal.upsert({
    where: { storeId },
    create: { storeId, ...datos },
    update: datos,
  });

  await registrarBitacora(storeId, sesion, {
    modulo: "configuracion",
    accion: "datos_emisor_actualizados",
    descripcion: "Actualizó los datos del emisor para factura electrónica.",
    entidad: "EmisorFiscal",
    entidadId: storeId,
    detalle: { faltan: faltantesEmisor(d).length },
  });

  revalidatePath("/admin/pos/puntos-expedicion");
  return { ok: true };
}

/**
 * Los distritos de un departamento, de la tabla oficial de la DNIT, para el formulario de datos del emisor. Se piden
 * por acción (y no se mandan todos juntos) porque la tabla completa pesa unos 220 KB.
 */
export async function listarDistritos(departamentoClave: string): Promise<OpcionGeografica[]> {
  await exigirPermiso("pos.gestionarEstaciones");
  const departamento = DEPARTAMENTOS.find((d) => d.clave === departamentoClave);
  return departamento ? distritosDelDepartamento(departamento.codigoSifen) : [];
}

/** Las ciudades y localidades de un distrito (sin las de nombre demasiado largo para el documento). */
export async function listarCiudades(distritoCodigo: number): Promise<OpcionGeografica[]> {
  await exigirPermiso("pos.gestionarEstaciones");
  return Number.isInteger(distritoCodigo) ? ciudadesDelDistrito(distritoCodigo) : [];
}
