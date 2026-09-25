"use server";

import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { registrarBitacora } from "@/lib/bitacora";
import { esEstadoCita, diaLargo, estadoDeCita, horaDeMinutos, partesLocales } from "@/lib/agenda";
import {
  PRECIO_MAXIMO_SERVICIO,
  duracionDeServicios,
  resumirDescuento,
  type DatosCita,
  type DatosCobro,
} from "@/lib/agenda-cita";
import { normalizarTelefonoPersonal, PAIS_POR_DEFECTO, PAISES_TELEFONO, type ResultadoTelefono } from "@/lib/agenda-personal";
import { claveSumarDias } from "@/lib/calendario";
import { MINUTOS_BLOQUEO_SIN_CONFIRMAR } from "@/lib/disponibilidad";
import { estacionActual } from "@/lib/estacion-actual";
import { formatearGuarani } from "@/lib/format";
import { esHoraValida } from "@/lib/horario-trabajo";
import { idLocalActual } from "@/lib/local-actual";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal, type PrismaLocal } from "@/lib/prisma-local";
import { MAX_SERVICIOS_POR_CITA, codigoDeCita } from "@/lib/reserva-cliente";
import { instanteAsuncionDesdeTexto } from "@/lib/timezone";
import { SIN_REGISTRO_FISCAL } from "@/lib/tipo-cliente";
import { FORMAS_PAGO_POS, etiquetaFormaPagoPos, type FormaPagoPos } from "@/lib/turno-pos";
import { cancelarVenta, registrarVenta } from "../pos/actions";
import { turnoAbierto } from "../pos/turno-actual";

/** `conflicto`: el horario se pisa con otra cita; la pantalla puede ofrecer "Guardar igual". */
export type ResultadoCita = { ok: true; citaId: string } | { ok: false; error: string; conflicto?: boolean };
export type ResultadoCobroCita = { ok: true; ventaId: string; total: number } | { ok: false; error: string };
export type ResultadoSimple = { ok: true } | { ok: false; error: string };

const LARGO_MAXIMO_NOMBRE = 80;
const LARGO_MAXIMO_NOTA = 300;

function refrescarAgenda() {
  revalidatePath("/admin/agenda");
  revalidatePath("/admin/agenda/citas");
}

// ---------------------------------------------------------------------------
//  Lo que llega del panel, ya verificado
// ---------------------------------------------------------------------------

type Preparados = {
  personalId: string;
  inicio: Date;
  fin: Date;
  bufferMin: number;
  clienteNombre: string;
  clienteTelefono: string | null;
  clienteEmail: string | null;
  nota: string | null;
  lineas: { servicioId: string | null; nombre: string; duracionMin: number; precio: number }[];
  serviciosTexto: string;
  fecha: string;
  hora: string;
  descuentoMonto: number;
  descuentoPorcentaje: number | null;
  total: number;
};

type CitaExistente = {
  bufferMin: number;
  servicios: { id: string; servicioId: string | null; nombre: string; duracionMin: number }[];
};

/**
 * El teléfono del cliente en formato internacional (solo dígitos). Un número que ya trae su
 * país (el que dejó el cliente en la página de reservas, aunque sea de Argentina o Brasil)
 * se conserva tal cual; uno escrito a la paraguaya ("0984 123 456") se completa con 595.
 */
function telefonoDelCliente(escrito: string): ResultadoTelefono {
  const digitos = escrito.replace(/\D/g, "");
  const yaTraePais = PAISES_TELEFONO.some((p) => {
    const resto = digitos.length - p.codigo.length;
    return digitos.startsWith(p.codigo) && resto >= 7 && resto <= 12;
  });
  if (!digitos.startsWith("0") && yaTraePais) return { ok: true, telefono: digitos };
  return normalizarTelefonoPersonal(PAIS_POR_DEFECTO, escrito);
}

/**
 * Lee y valida lo que mandó el panel. Nada se guarda tal cual: el profesional y los
 * servicios que vienen del navegador se buscan por el cliente del local (los de otro
 * negocio simplemente no aparecen), y el precio, el descuento y la duración se
 * recalculan acá.
 */
async function prepararDatos(
  db: PrismaLocal,
  datos: DatosCita,
  existente: CitaExistente | null
): Promise<{ ok: true; p: Preparados } | { ok: false; error: string }> {
  if (!datos || typeof datos !== "object") {
    return { ok: false, error: "Lo que llegó no es válido. Recargá la página." };
  }

  const clienteNombre = String(datos.clienteNombre ?? "").trim();
  if (!clienteNombre) return { ok: false, error: "Escribí el nombre del cliente" };
  if (clienteNombre.length > LARGO_MAXIMO_NOMBRE) {
    return { ok: false, error: `El nombre puede tener hasta ${LARGO_MAXIMO_NOMBRE} letras` };
  }

  let clienteTelefono: string | null = null;
  const telefonoEscrito = String(datos.clienteTelefono ?? "").trim();
  if (telefonoEscrito) {
    const t = telefonoDelCliente(telefonoEscrito);
    if (!t.ok) return { ok: false, error: t.error };
    clienteTelefono = t.telefono;
  }

  const email = String(datos.clienteEmail ?? "").trim();
  if (email && (!email.includes("@") || email.length > 120)) {
    return { ok: false, error: "El correo del cliente no es válido" };
  }

  const nota = String(datos.nota ?? "").trim();
  if (nota.length > LARGO_MAXIMO_NOTA) {
    return { ok: false, error: `La nota puede tener hasta ${LARGO_MAXIMO_NOTA} letras` };
  }

  const personal =
    typeof datos.personalId === "string" && datos.personalId
      ? await db.miembroPersonal.findFirst({ where: { id: datos.personalId }, select: { id: true } })
      : null;
  if (!personal) return { ok: false, error: "Elegí quién atiende" };

  const fecha = typeof datos.fecha === "string" ? datos.fecha : "";
  const hora = typeof datos.hora === "string" ? datos.hora : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || claveSumarDias(fecha, 0) !== fecha || !esHoraValida(hora)) {
    return { ok: false, error: "El día o la hora no son válidos" };
  }
  const inicio = instanteAsuncionDesdeTexto(`${fecha}T${hora}`);
  if (!inicio) return { ok: false, error: "El día o la hora no son válidos" };

  // Los servicios: cada uno del catálogo de este local, o uno que ya tenía la cita.
  const pedidos = Array.isArray(datos.servicios) ? datos.servicios : [];
  if (pedidos.length === 0) return { ok: false, error: "Elegí al menos un servicio" };
  if (pedidos.length > MAX_SERVICIOS_POR_CITA) {
    return { ok: false, error: `Podés poner hasta ${MAX_SERVICIOS_POR_CITA} servicios por cita` };
  }
  const idsCatalogo = pedidos.map((s) => s?.servicioId).filter((x): x is string => typeof x === "string");
  if (new Set(idsCatalogo).size !== idsCatalogo.length) {
    return { ok: false, error: "Hay un servicio repetido en la cita" };
  }
  const catalogo =
    idsCatalogo.length > 0
      ? await db.servicioAgenda.findMany({
          where: { id: { in: idsCatalogo } },
          select: { id: true, duracionMin: true, bufferMin: true, product: { select: { nombre: true } } },
        })
      : [];
  const porId = new Map(catalogo.map((s) => [s.id, s] as const));

  const lineas: Preparados["lineas"] = [];
  let buffer = 0;
  let conServicioPerdido = false;
  for (const pedido of pedidos) {
    const precio = Number(pedido?.precio);
    if (!Number.isFinite(precio) || precio < 0 || precio > PRECIO_MAXIMO_SERVICIO) {
      return { ok: false, error: "El precio de un servicio no es válido" };
    }
    const previa = pedido.citaServicioId
      ? existente?.servicios.find((x) => x.id === pedido.citaServicioId)
      : undefined;

    if (typeof pedido.servicioId === "string") {
      const s = porId.get(pedido.servicioId);
      if (!s) return { ok: false, error: "Alguno de los servicios ya no existe. Quitalo y elegí otro." };
      // Un servicio que la cita ya tenía conserva su nombre y su duración de cuando se reservó.
      const igual = previa && previa.servicioId === s.id ? previa : undefined;
      lineas.push({
        servicioId: s.id,
        nombre: igual?.nombre ?? s.product.nombre,
        duracionMin: igual?.duracionMin ?? s.duracionMin,
        precio: Math.round(precio),
      });
      buffer = Math.max(buffer, s.bufferMin);
    } else {
      // Un servicio que ya se borró del catálogo: solo se puede conservar tal como estaba.
      if (!previa) return { ok: false, error: "Alguno de los servicios ya no existe. Quitalo y elegí otro." };
      lineas.push({ servicioId: null, nombre: previa.nombre, duracionMin: previa.duracionMin, precio: Math.round(precio) });
      conServicioPerdido = true;
    }
  }
  const bufferMin = conServicioPerdido ? Math.max(buffer, existente?.bufferMin ?? 0) : buffer;

  const subtotal = lineas.reduce((suma, l) => suma + l.precio, 0);
  const resumen = resumirDescuento(subtotal, datos.descuento ?? null);
  if (!resumen.ok) return { ok: false, error: resumen.error };

  const duracion = duracionDeServicios(lineas);
  return {
    ok: true,
    p: {
      personalId: personal.id,
      inicio,
      fin: new Date(inicio.getTime() + duracion * 60_000),
      bufferMin,
      clienteNombre,
      clienteTelefono,
      clienteEmail: email || null,
      nota: nota || null,
      lineas,
      serviciosTexto: lineas
        .map((l) => l.nombre)
        .join(" + ")
        .slice(0, 300),
      fecha,
      hora,
      descuentoMonto: resumen.monto,
      descuentoPorcentaje: resumen.porcentaje,
      total: resumen.total,
    },
  };
}

/**
 * ¿Ya hay otra cita de ese profesional que se pise con este horario? Cuentan las que
 * no están canceladas ni sin asistencia, y las pedidas por la web que todavía no se
 * ven (reservan el horario un rato). El búfer de cada cita cuenta como tiempo ocupado.
 */
async function citaQueSePisa(
  db: PrismaLocal,
  personalId: string,
  inicio: Date,
  finConBufer: Date,
  excluirId: string | null
): Promise<{ clienteNombre: string; hora: string } | null> {
  const limiteSinConfirmar = new Date(Date.now() - MINUTOS_BLOQUEO_SIN_CONFIRMAR * 60_000);
  const candidatas = await db.cita.findMany({
    where: {
      personalId,
      ...(excluirId ? { id: { not: excluirId } } : {}),
      estado: { notIn: ["cancelada", "no_asistio"] },
      OR: [{ visible: true }, { createdAt: { gt: limiteSinConfirmar } }],
      inicio: { lt: finConBufer },
      // Cota amplia (el búfer es de una hora como mucho); abajo se afina con el búfer de cada una.
      fin: { gt: new Date(inicio.getTime() - 2 * 60 * 60_000) },
    },
    select: { clienteNombre: true, inicio: true, fin: true, bufferMin: true },
  });
  const choque = candidatas.find((c) => new Date(c.fin.getTime() + c.bufferMin * 60_000) > inicio);
  if (!choque) return null;
  return { clienteNombre: choque.clienteNombre, hora: horaDeMinutos(partesLocales(choque.inicio).minutos) };
}

function mensajeDeChoque(c: { clienteNombre: string; hora: string }): string {
  return `Ese profesional ya tiene una cita a las ${c.hora} (${c.clienteNombre}) que se pisa con este horario.`;
}

/**
 * Guarda lo del panel en la cita. Solo toca una cita que todavía no se cobró: si entre
 * medio se cobró, no cambia nada y devuelve false.
 */
async function aplicarCambios(storeId: string, citaId: string, p: Preparados, estado: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const cambiada = await tx.cita.updateMany({
      where: { id: citaId, storeId, ventaPosId: null },
      data: {
        personalId: p.personalId,
        clienteNombre: p.clienteNombre,
        clienteTelefono: p.clienteTelefono,
        clienteEmail: p.clienteEmail,
        nota: p.nota,
        inicio: p.inicio,
        fin: p.fin,
        estado,
        precio: p.total,
        descuento: p.descuentoMonto,
        descuentoPorcentaje: p.descuentoPorcentaje,
        serviciosTexto: p.serviciosTexto,
        bufferMin: p.bufferMin,
      },
    });
    if (cambiada.count !== 1) return false;
    await tx.citaServicio.deleteMany({ where: { citaId, storeId } });
    await tx.citaServicio.createMany({
      data: p.lineas.map((l) => ({
        storeId,
        citaId,
        servicioId: l.servicioId,
        nombre: l.nombre,
        duracionMin: l.duracionMin,
        precio: l.precio,
      })),
    });
    return true;
  });
}

// ---------------------------------------------------------------------------
//  Acciones
// ---------------------------------------------------------------------------

/** Guarda los cambios de una cita sin cobrarla (estado, cliente, horario, servicios, descuento). */
export async function guardarCita(citaId: string, datos: DatosCita): Promise<ResultadoCita> {
  const sesion = await exigirPermiso("agenda.ver");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const cita = await db.cita.findFirst({
    where: { id: citaId },
    select: {
      id: true,
      estado: true,
      ventaPosId: true,
      bufferMin: true,
      servicios: { select: { id: true, servicioId: true, nombre: true, duracionMin: true } },
    },
  });
  if (!cita) return { ok: false, error: "Esa cita ya no existe." };
  if (cita.ventaPosId) return { ok: false, error: "Esta cita ya está cobrada: no se puede modificar." };

  if (!esEstadoCita(datos?.estado)) return { ok: false, error: "El estado no es válido" };
  // Finalizar es cobrar: eso pasa por cobrarCita, para que lo cobrado entre en la caja.
  if (datos.estado === "finalizada" && cita.estado !== "finalizada") {
    return { ok: false, error: "Para finalizar una cita hay que cobrarla: elegí cómo paga y tocá Cobrar." };
  }

  const preparados = await prepararDatos(db, datos, cita);
  if (!preparados.ok) return preparados;
  const p = preparados.p;

  // Una cita cancelada o sin asistencia no ocupa horario, así que no puede pisar a otra.
  if (!datos.forzar && datos.estado !== "cancelada" && datos.estado !== "no_asistio") {
    const choque = await citaQueSePisa(
      db,
      p.personalId,
      p.inicio,
      new Date(p.fin.getTime() + p.bufferMin * 60_000),
      cita.id
    );
    if (choque) return { ok: false, error: mensajeDeChoque(choque), conflicto: true };
  }

  const guardada = await aplicarCambios(storeId, cita.id, p, datos.estado);
  if (!guardada) return { ok: false, error: "Esta cita ya se cobró: no se puede modificar." };

  const cambioEstado = cita.estado !== datos.estado;
  await registrarBitacora(storeId, sesion, {
    modulo: "agenda",
    accion: cambioEstado ? "cita_estado_cambiado" : "cita_modificada",
    descripcion: cambioEstado
      ? `Pasó la cita de ${p.clienteNombre} de ${estadoDeCita(cita.estado).etiqueta} a ${estadoDeCita(datos.estado).etiqueta}.`
      : `Modificó la cita de ${p.clienteNombre} (${diaLargo(p.fecha)} a las ${p.hora}).`,
    entidad: "Cita",
    entidadId: cita.id,
    detalle: { antes: cita.estado, despues: datos.estado, total: p.total },
  });

  refrescarAgenda();
  return { ok: true, citaId: cita.id };
}

/** Crea una cita desde el panel (un turno que se anota a mano, o "Reservar de nuevo"). */
export async function crearCita(datos: DatosCita): Promise<ResultadoCita> {
  const sesion = await exigirPermiso("agenda.ver");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  // Una cita nueva no puede nacer cobrada ni cancelada.
  const estado = datos?.estado === "pendiente" ? "pendiente" : "proxima";

  const preparados = await prepararDatos(db, datos, null);
  if (!preparados.ok) return preparados;
  const p = preparados.p;

  if (!datos.forzar) {
    const choque = await citaQueSePisa(
      db,
      p.personalId,
      p.inicio,
      new Date(p.fin.getTime() + p.bufferMin * 60_000),
      null
    );
    if (choque) return { ok: false, error: mensajeDeChoque(choque), conflicto: true };
  }

  const creada = await prisma.cita.create({
    data: {
      storeId,
      personalId: p.personalId,
      clienteNombre: p.clienteNombre,
      clienteTelefono: p.clienteTelefono,
      clienteEmail: p.clienteEmail,
      nota: p.nota,
      inicio: p.inicio,
      fin: p.fin,
      estado,
      precio: p.total,
      descuento: p.descuentoMonto,
      descuentoPorcentaje: p.descuentoPorcentaje,
      serviciosTexto: p.serviciosTexto,
      bufferMin: p.bufferMin,
      origen: "panel",
      visible: true,
      servicios: {
        create: p.lineas.map((l) => ({
          storeId,
          servicioId: l.servicioId,
          nombre: l.nombre,
          duracionMin: l.duracionMin,
          precio: l.precio,
        })),
      },
    },
    select: { id: true },
  });

  await registrarBitacora(storeId, sesion, {
    modulo: "agenda",
    accion: "cita_creada",
    descripcion: `Agendó una cita para ${p.clienteNombre} (${diaLargo(p.fecha)} a las ${p.hora}).`,
    entidad: "Cita",
    entidadId: creada.id,
    detalle: { total: p.total },
  });

  refrescarAgenda();
  return { ok: true, citaId: creada.id };
}

/** Borra una cita que todavía no se cobró. Una cobrada no se borra: se anula su cobro primero. */
export async function eliminarCita(citaId: string): Promise<ResultadoSimple> {
  const sesion = await exigirPermiso("agenda.ver");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const cita = await db.cita.findFirst({
    where: { id: citaId },
    select: { id: true, clienteNombre: true, inicio: true, ventaPosId: true },
  });
  if (!cita) return { ok: false, error: "Esa cita ya no existe." };
  if (cita.ventaPosId) {
    return { ok: false, error: "Esta cita ya está cobrada. Anulá el cobro antes de eliminarla." };
  }

  const borradas = await prisma.cita.deleteMany({ where: { id: cita.id, storeId, ventaPosId: null } });
  if (borradas.count !== 1) return { ok: false, error: "No se pudo eliminar la cita. Actualizá la pantalla." };

  const { dia, minutos } = partesLocales(cita.inicio);
  await registrarBitacora(storeId, sesion, {
    modulo: "agenda",
    accion: "cita_eliminada",
    descripcion: `Eliminó la cita de ${cita.clienteNombre} (${diaLargo(dia)} a las ${horaDeMinutos(minutos)}).`,
    entidad: "Cita",
    entidadId: cita.id,
  });

  refrescarAgenda();
  return { ok: true };
}

/**
 * Cobra la cita: el detalle del turno funciona como punto de venta.
 *
 * Primero guarda lo que se cambió en el panel (servicios, precios, descuento), y
 * después registra la venta en el turno de caja abierto de ESTA computadora con el
 * mismo motor que el punto de venta (IVA, factura, stock, cierre de caja). La cita
 * queda Finalizada y enlazada a esa venta en la misma transacción, y desde ese
 * momento aparece en Citas.
 */
export async function cobrarCita(citaId: string, datos: DatosCita, cobro: DatosCobro): Promise<ResultadoCobroCita> {
  const sesion = await exigirPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const cita = await db.cita.findFirst({
    where: { id: citaId },
    select: {
      id: true,
      estado: true,
      ventaPosId: true,
      bufferMin: true,
      servicios: { select: { id: true, servicioId: true, nombre: true, duracionMin: true } },
    },
  });
  if (!cita) return { ok: false, error: "Esa cita ya no existe." };
  if (cita.ventaPosId) return { ok: false, error: "Esta cita ya está cobrada." };

  const forma: FormaPagoPos | null =
    FORMAS_PAGO_POS.find((f) => f.valor === cobro?.forma)?.valor ?? null;
  if (!forma) return { ok: false, error: "Elegí cómo paga el cliente." };

  const preparados = await prepararDatos(db, datos, cita);
  if (!preparados.ok) return preparados;
  const p = preparados.p;
  if (p.total <= 0) return { ok: false, error: "El total tiene que ser mayor a cero para cobrar." };

  // La caja: esta computadora tiene que estar vinculada a una estación con el turno abierto.
  const estacion = await estacionActual(db);
  if (!estacion) {
    return {
      ok: false,
      error: "Esta computadora no está vinculada a una caja. Vinculala en Estaciones (punto de venta) para poder cobrar.",
    };
  }
  const turno = await turnoAbierto(db, estacion.id);
  if (!turno) {
    return { ok: false, error: "No hay un turno de caja abierto en esta computadora. Abrilo y volvé a cobrar." };
  }

  // Para venderse, cada servicio tiene que seguir en el catálogo (es un producto del punto de venta).
  const perdido = p.lineas.find((l) => l.servicioId === null);
  if (perdido) {
    return { ok: false, error: `El servicio "${perdido.nombre}" ya no existe. Quitalo de la cita para poder cobrar.` };
  }
  const productos = await db.servicioAgenda.findMany({
    where: { id: { in: p.lineas.map((l) => l.servicioId as string) } },
    select: { id: true, productId: true },
  });
  const productoDe = new Map(productos.map((s) => [s.id, s.productId] as const));

  // Se guarda lo que se ve en el panel antes de cobrar, para que lo cobrado sea exactamente eso.
  // Una cita cancelada o sin asistencia que se cobra queda reactivada.
  const estadoAntes = cita.estado === "pendiente" || cita.estado === "proxima" ? cita.estado : "proxima";
  const guardada = await aplicarCambios(storeId, cita.id, p, estadoAntes);
  if (!guardada) return { ok: false, error: "Esta cita ya se cobró." };

  const esFactura = cobro.comprobanteTipo === "factura";
  const sinRegistro = esFactura && cobro.registroFiscal === "sin";
  const conRegistro = esFactura && !sinRegistro;

  const venta = await registrarVenta(turno.id, {
    pagos: [{ forma, monto: p.total }],
    tipoEntrega: "local",
    clienteNombre: p.clienteNombre,
    clienteTelefono: p.clienteTelefono ?? "",
    nota: `Cita ${codigoDeCita(cita.id)}`,
    comprobanteTipo: esFactura ? "factura" : "ticket",
    facturaTipoIdentificacion: esFactura
      ? sinRegistro
        ? SIN_REGISTRO_FISCAL.tipo
        : String(cobro.tipoIdentificacion ?? "")
      : undefined,
    facturaNumeroIdentificacion: conRegistro ? String(cobro.numeroIdentificacion ?? "").trim() : undefined,
    facturaRazonSocial: conRegistro ? String(cobro.razonSocial ?? "").trim() : undefined,
    facturaEmail: conRegistro ? String(cobro.email ?? "").trim() || undefined : undefined,
    descuento:
      p.descuentoMonto > 0
        ? datos.descuento?.tipo === "porcentaje" && p.descuentoPorcentaje != null
          ? { tipo: "porcentaje", valor: p.descuentoPorcentaje }
          : { tipo: "monto", valor: p.descuentoMonto }
        : undefined,
    items: p.lineas.map((l) => ({
      productId: productoDe.get(l.servicioId as string) as string,
      cantidad: 1,
      precioServicio: l.precio,
    })),
    citaId: cita.id,
  });
  if (!venta.ok) return venta;

  await registrarBitacora(storeId, sesion, {
    modulo: "agenda",
    accion: "cita_cobrada",
    descripcion: `Cobró la cita de ${p.clienteNombre} (${formatearGuarani(venta.total)}, ${etiquetaFormaPagoPos(forma)}).`,
    entidad: "Cita",
    entidadId: cita.id,
    detalle: { venta: venta.ventaId, total: venta.total, forma, comprobante: esFactura ? "factura" : "ticket" },
  });

  refrescarAgenda();
  return { ok: true, ventaId: venta.ventaId, total: venta.total };
}

/**
 * Anula el cobro de una cita (se cargó mal, el cliente se arrepintió): cancela la venta
 * del punto de venta —con sus reglas: solo mientras el turno de caja sigue abierto— y la
 * cita vuelve a quedar sin cobrar.
 */
export async function anularCobroCita(citaId: string, motivo: string): Promise<ResultadoSimple> {
  const sesion = await exigirPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const cita = await db.cita.findFirst({
    where: { id: citaId },
    select: { id: true, ventaPosId: true, clienteNombre: true },
  });
  if (!cita?.ventaPosId) return { ok: false, error: "Esta cita no tiene un cobro para anular." };

  const limpio = String(motivo ?? "").trim();
  if (limpio.length < 3) return { ok: false, error: "Escribí por qué se anula el cobro." };

  // cancelarVenta devuelve la cita a "sin cobrar" en la misma transacción.
  const anulada = await cancelarVenta(cita.ventaPosId, limpio);
  if (!anulada.ok) return anulada;

  await registrarBitacora(storeId, sesion, {
    modulo: "agenda",
    accion: "cita_cobro_anulado",
    descripcion: `Anuló el cobro de la cita de ${cita.clienteNombre}. Motivo: ${limpio}.`,
    entidad: "Cita",
    entidadId: cita.id,
    detalle: { venta: cita.ventaPosId, motivo: limpio },
  });

  refrescarAgenda();
  return { ok: true };
}
