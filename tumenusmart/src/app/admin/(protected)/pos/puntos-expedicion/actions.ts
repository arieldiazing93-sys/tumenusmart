"use server";

import { exigirPermiso } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { prisma } from "@/lib/prisma";
import { registrarBitacora } from "@/lib/bitacora";
import { DEPARTAMENTOS, faltantesEmisor, normalizarEmisor } from "@/lib/emisor-fiscal";
import { FIN_TIMBRADO_ELECTRONICO, normalizarModalidad, type ModalidadPunto } from "@/lib/modalidad-punto";
import { calcularDvRuc, separarRuc } from "@/lib/sifen-codigos";
import { ciudadesDelDistrito, distritosDelDepartamento, resolverUbicacion, type OpcionGeografica } from "@/lib/sifen/geografia";
import type { Prisma } from "@prisma/client";
import type { PrismaLocal } from "@/lib/prisma-local";

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
  modalidad: ModalidadPunto;
};

/**
 * Todos los puntos ACTIVOS de un local son del mismo tipo de timbrado (autoimpresor o electrónico). Devuelve el motivo si
 * `modalidad` choca con los otros puntos activos (sin contar `exceptoId`), o null si no hay conflicto.
 */
async function conflictoDeModalidad(db: PrismaLocal, modalidad: ModalidadPunto, exceptoId?: string): Promise<string | null> {
  const activos = await db.puntoExpedicion.findMany({
    where: { activo: true, ...(exceptoId ? { id: { not: exceptoId } } : {}) },
    select: { modalidad: true },
  });
  if (activos.some((p) => normalizarModalidad(p.modalidad) !== modalidad)) {
    return "Todos los puntos de expedición activos del local tienen que ser del mismo tipo de timbrado (autoimpresor o electrónico). Para cambiar de tipo, desactivá primero los puntos del otro tipo.";
  }
  return null;
}

/** `modalidadFija`: al editar, el tipo de timbrado de un punto no se cambia (se crea otro punto). */
function leerDatos(formData: FormData, modalidadFija?: ModalidadPunto): { datos: DatosPuntoExpedicion } | { error: string } {
  const modalidad = modalidadFija ?? normalizarModalidad(formData.get("modalidad"));
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
  // El timbrado electrónico no vence: se guarda una fecha lejana para que lo que compara contra el vencimiento siga igual.
  const timbradoHasta = modalidad === "electronico" ? FIN_TIMBRADO_ELECTRONICO : new Date(timbradoHastaTexto);
  if (isNaN(timbradoDesde.getTime()) || isNaN(timbradoHasta.getTime())) {
    return {
      error: modalidad === "electronico" ? "La fecha de inicio de vigencia del timbrado es obligatoria." : "Las fechas de vigencia del timbrado son obligatorias.",
    };
  }
  if (timbradoHasta <= timbradoDesde) {
    return { error: "El vencimiento tiene que ser posterior al inicio de vigencia." };
  }

  if (modalidad === "electronico") {
    // El timbrado electrónico es de 8 dígitos y el RUC del emisor tiene que ir con su dígito verificador: la DNIT rechaza
    // todo documento con alguno de los dos mal. En el ambiente de pruebas el timbrado es el RUC sin dígito.
    if (!/^\d{8}$/.test(numeroTimbrado)) return { error: "El timbrado electrónico tiene que tener 8 dígitos." };
    const ruc = separarRuc(rucEmisor);
    if (!/^[1-9]\d{2,7}$/.test(ruc.numero) || !ruc.dv) return { error: "El RUC del emisor tiene que llevar su dígito verificador, por ejemplo 80012345-0." };
    if (Number(ruc.dv) !== calcularDvRuc(ruc.numero)) {
      return { error: `El dígito verificador del RUC no es correcto: para ${ruc.numero} es ${calcularDvRuc(ruc.numero)}.` };
    }
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
      modalidad,
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
  const conflicto = await conflictoDeModalidad(prisma, leido.datos.modalidad);
  if (conflicto) return { ok: false, error: conflicto };

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

  const existente = await prisma.puntoExpedicion.findFirst({ where: { id }, select: { modalidad: true } });
  if (!existente) return { ok: false, error: "Ese punto de expedición ya no existe." };

  const leido = leerDatos(formData, normalizarModalidad(existente.modalidad));
  if ("error" in leido) return { ok: false, error: leido.error };

  await prisma.puntoExpedicion.update({ where: { id }, data: leido.datos });
  revalidatePath("/admin/pos/puntos-expedicion");
  return { ok: true };
}

/**
 * Sin borrar: una vez que un punto de expedición emitió facturas, borrarlo
 * dejaría esos comprobantes sin de dónde salió su timbrado — mismo criterio
 * que Productos/Estaciones. Se desactiva nomás. Reactivar uno de otro tipo que los
 * demás puntos activos no se permite (un local factura con un solo tipo de timbrado).
 */
export async function alternarActivoPuntoExpedicion(id: string, activo: boolean): Promise<ResultadoPuntoExpedicion> {
  await exigirPermiso("pos.gestionarEstaciones");
  const prisma = prismaDelLocal(await idLocalActual());

  if (activo) {
    const punto = await prisma.puntoExpedicion.findFirst({ where: { id }, select: { modalidad: true } });
    if (!punto) return { ok: false, error: "Ese punto de expedición ya no existe." };
    const conflicto = await conflictoDeModalidad(prisma, normalizarModalidad(punto.modalidad), id);
    if (conflicto) return { ok: false, error: conflicto };
  }

  await prisma.puntoExpedicion.update({ where: { id }, data: { activo } });
  revalidatePath("/admin/pos/puntos-expedicion");
  return { ok: true };
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
