/**
 * Lo que el cliente completa al reservar desde la página pública: sus datos, las
 * reglas de validación y el mensaje de WhatsApp con el resumen de la cita.
 *
 * Puro (sin Prisma): lo usan el formulario del navegador (para avisar al toque) y
 * la acción del servidor (que vuelve a validar todo, porque nada de lo que llega
 * del navegador se da por bueno).
 */

import { normalizarTelefonoPersonal } from "./agenda-personal";
import { formatearGuarani } from "./format";
import type { CampoFormulario } from "./pagina-reservas";
import { textoDuracion, type TipoPrecio } from "./servicios-agenda";

/** Cuántos servicios se pueden juntar en una misma cita. */
export const MAX_SERVICIOS_POR_CITA = 8;
/** Largo máximo de la nota, como en la pantalla del cliente. */
export const LARGO_NOTA = 150;

// ---------------------------------------------------------------------------
//  Lo que la página le muestra al cliente
// ---------------------------------------------------------------------------

export type ServicioPublico = {
  id: string;
  nombre: string;
  duracionMin: number;
  bufferMin: number;
  precio: number;
  tipoPrecio: TipoPrecio;
  /** Quiénes lo realizan (solo personal activo). */
  personalIds: string[];
};

export type CategoriaPublica = { id: string; nombre: string; servicios: ServicioPublico[] };

export type PersonalPublico = {
  id: string;
  nombre: string;
  profesion: string | null;
  fotoUrl: string | null;
};

/** Un profesional elegible y su próxima disponibilidad. */
export type ProximaDisponibilidad = {
  personalId: string;
  /** "YYYY-MM-DD" del primer día con horas libres, o null si no hay en los próximos días. */
  fecha: string | null;
  /** Las primeras horas libres de ese día ("09:00", "09:15"…). */
  horas: string[];
};

// ---------------------------------------------------------------------------
//  Los datos del cliente
// ---------------------------------------------------------------------------

export type DatosCliente = {
  nombre: string;
  apellido: string;
  telefonoPais: string;
  /** Sin el código de país, como lo escribe la persona. */
  telefono: string;
  email: string;
  direccion: string;
  nota: string;
  /** Respuestas a los campos propios, por la clave de cada campo. */
  extras: Record<string, string>;
};

export const DATOS_CLIENTE_VACIOS: DatosCliente = {
  nombre: "",
  apellido: "",
  telefonoPais: "595",
  telefono: "",
  email: "",
  direccion: "",
  nota: "",
  extras: {},
};

export type ClienteLimpio = {
  nombre: string;
  apellido: string | null;
  /** Internacional, solo dígitos. */
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  nota: string | null;
  extras: { clave: string; etiqueta: string; valor: string }[];
};

function recortar(valor: unknown, max: number): string {
  return typeof valor === "string" ? valor.trim().slice(0, max) : "";
}

/**
 * Revisa los datos del cliente contra los campos que el negocio pidió: solo cuentan
 * los campos prendidos, y los marcados como obligatorios tienen que venir. Lo que
 * el negocio no pidió se descarta aunque llegue.
 */
export function validarDatosCliente(
  campos: CampoFormulario[],
  d: DatosCliente
): { ok: true; cliente: ClienteLimpio } | { ok: false; error: string } {
  const activo = (clave: string) => campos.find((c) => c.clave === clave && c.activo);
  const obligatorio = (clave: string) => activo(clave)?.obligatorio === true;
  const etiqueta = (clave: string) => campos.find((c) => c.clave === clave)?.etiqueta ?? clave;
  const faltante = (clave: string) => ({ ok: false as const, error: `Completá: ${etiqueta(clave)}` });

  const nombre = recortar(d.nombre, 60);
  if (!nombre) return faltante("nombre");

  const apellido = activo("apellido") ? recortar(d.apellido, 60) : "";
  if (obligatorio("apellido") && !apellido) return faltante("apellido");

  let telefono: string | null = null;
  if (activo("telefono")) {
    const escrito = recortar(d.telefono, 30);
    if (!escrito) {
      if (obligatorio("telefono")) return faltante("telefono");
    } else {
      const t = normalizarTelefonoPersonal(recortar(d.telefonoPais, 5), escrito);
      if (!t.ok) return { ok: false, error: `${etiqueta("telefono")}: ${t.error}` };
      telefono = t.telefono;
    }
  }

  let email: string | null = null;
  if (activo("email")) {
    const escrito = recortar(d.email, 120);
    if (!escrito) {
      if (obligatorio("email")) return faltante("email");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(escrito)) {
      return { ok: false, error: "El correo electrónico no parece válido" };
    } else {
      email = escrito;
    }
  }

  const direccion = activo("direccion") ? recortar(d.direccion, 120) : "";
  if (obligatorio("direccion") && !direccion) return faltante("direccion");

  const nota = activo("nota") ? recortar(d.nota, LARGO_NOTA) : "";
  if (obligatorio("nota") && !nota) return faltante("nota");

  const extras: ClienteLimpio["extras"] = [];
  for (const campo of campos) {
    if (campo.tipo !== "personalizado" || !campo.activo) continue;
    const valor = recortar(d.extras?.[campo.clave], 100);
    if (campo.obligatorio && !valor) return faltante(campo.clave);
    if (valor) extras.push({ clave: campo.clave, etiqueta: campo.etiqueta, valor });
  }

  return {
    ok: true,
    cliente: {
      nombre,
      apellido: apellido || null,
      telefono,
      email,
      direccion: direccion || null,
      nota: nota || null,
      extras,
    },
  };
}

// ---------------------------------------------------------------------------
//  El mensaje de WhatsApp
// ---------------------------------------------------------------------------

/** Un código corto para reconocer la cita en la conversación: los últimos 6 caracteres del id. */
export function codigoDeCita(id: string): string {
  return id.slice(-6).toUpperCase();
}

/** El mensaje que el cliente le manda al negocio con el resumen de su cita. */
export function mensajeWhatsappCita(x: {
  negocio: string;
  cliente: ClienteLimpio;
  servicios: { nombre: string; duracionMin: number }[];
  profesional: string;
  /** Ya escrita: "Viernes 25 sep". */
  fechaTexto: string;
  horaInicio: string;
  horaFin: string;
  total: number;
  codigo: string;
}): string {
  const lineas = [
    `Hola ${x.negocio}, quiero confirmar mi cita:`,
    "",
    `Cliente: ${[x.cliente.nombre, x.cliente.apellido].filter(Boolean).join(" ")}`,
    ...(x.cliente.telefono ? [`Teléfono: +${x.cliente.telefono}`] : []),
    `Servicios: ${x.servicios.map((s) => `${s.nombre} (${textoDuracion(s.duracionMin)})`).join(", ")}`,
    `Con: ${x.profesional}`,
    `Día: ${x.fechaTexto}`,
    `Hora: ${x.horaInicio} a ${x.horaFin}`,
    `Total: ${formatearGuarani(x.total)}`,
    ...x.cliente.extras.map((e) => `${e.etiqueta}: ${e.valor}`),
    ...(x.cliente.nota ? [`Nota: ${x.cliente.nota}`] : []),
    "",
    `Cita ${x.codigo}`,
  ];
  return lineas.join("\n");
}

/** Lo que devuelve la acción al crear la cita. */
export type CitaCreada = {
  citaId: string;
  codigo: string;
  fechaTexto: string;
  horaInicio: string;
  horaFin: string;
  profesional: string;
  total: number;
  /** Para abrir WhatsApp con el resumen; null si el negocio no pide aviso por WhatsApp. */
  enlaceWhatsapp: string | null;
  /** true si la cita recién aparece en el calendario del negocio cuando el cliente manda el aviso. */
  esperaEnvio: boolean;
};
