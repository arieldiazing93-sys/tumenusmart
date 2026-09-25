/**
 * El personal de la Reserva de turnos: nombre, teléfono y la forma de guardarlos.
 *
 * Puro (sin Prisma) para usarlo igual desde el formulario del navegador y desde
 * las acciones del servidor: lo que el formulario muestra y lo que la acción
 * valida tiene que decir siempre lo mismo.
 */

/** Un miembro del personal como lo muestra la pantalla de Personal. */
export type MiembroFila = {
  id: string;
  nombre: string;
  apellido: string | null;
  /** Internacional, solo dígitos: 595984123456. */
  telefono: string | null;
  profesion: string | null;
  fotoUrl: string | null;
  activo: boolean;
  /** Cuántos servicios realiza. */
  servicios: number;
  /** Cuántos turnos tiene (de cualquier estado). */
  citas: number;
  /** Su comisión por trabajo, en porcentaje (0 a 100); null si no cobra comisión. */
  comisionPorcentaje: number | null;
};

/** "Juan" + "Britez" → "Juan Britez". El apellido puede faltar en datos viejos. */
export function nombreCompleto(persona: { nombre: string; apellido?: string | null }): string {
  return [persona.nombre, persona.apellido].map((t) => t?.trim()).filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
//  Teléfono
// ---------------------------------------------------------------------------

/** Los países del selector. Paraguay va primero: es donde opera el sistema. */
export const PAISES_TELEFONO = [
  { codigo: "595", sigla: "PY", nombre: "Paraguay" },
  { codigo: "54", sigla: "AR", nombre: "Argentina" },
  { codigo: "55", sigla: "BR", nombre: "Brasil" },
  { codigo: "598", sigla: "UY", nombre: "Uruguay" },
  { codigo: "56", sigla: "CL", nombre: "Chile" },
  { codigo: "591", sigla: "BO", nombre: "Bolivia" },
  { codigo: "34", sigla: "ES", nombre: "España" },
  { codigo: "1", sigla: "US", nombre: "Estados Unidos" },
] as const;

export const PAIS_POR_DEFECTO = "595";

/** Un número nacional (sin el código de país) tiene entre 7 y 12 dígitos. */
const LARGO_MINIMO = 7;
const LARGO_MAXIMO = 12;

export type ResultadoTelefono = { ok: true; telefono: string } | { ok: false; error: string };

/**
 * Lo que escribió la persona (con o sin 0 adelante, con espacios o guiones, a
 * veces ya con el código de país) más el país elegido, en el formato que se
 * guarda: código + número, solo dígitos.
 *
 * "0984 123-456" con Paraguay → 595984123456. "+595 984 123 456" → lo mismo.
 */
export function normalizarTelefonoPersonal(codigoPais: string, escrito: string): ResultadoTelefono {
  const codigo = PAISES_TELEFONO.find((p) => p.codigo === codigoPais)?.codigo ?? PAIS_POR_DEFECTO;
  const digitos = escrito.replace(/\D/g, "").replace(/^0+/, "");
  if (!digitos) return { ok: false, error: "El número de teléfono es obligatorio" };

  // Si ya trae el código de país (y sobra un número entero atrás), no se repite.
  const nacional =
    digitos.startsWith(codigo) && digitos.length - codigo.length >= LARGO_MINIMO
      ? digitos.slice(codigo.length)
      : digitos;

  if (nacional.length < LARGO_MINIMO || nacional.length > LARGO_MAXIMO) {
    return { ok: false, error: "El número de teléfono no parece válido. Revisalo." };
  }
  return { ok: true, telefono: `${codigo}${nacional}` };
}

/**
 * El teléfono de un CLIENTE en formato internacional (solo dígitos). Un número que ya trae
 * su país (el que dejó el cliente en la página de reservas, aunque sea de Argentina o
 * Brasil) se conserva tal cual; uno escrito a la paraguaya ("0984 123 456") se completa
 * con 595.
 */
export function normalizarTelefonoCliente(escrito: string): ResultadoTelefono {
  const digitos = escrito.replace(/\D/g, "");
  const yaTraePais = PAISES_TELEFONO.some((p) => {
    const resto = digitos.length - p.codigo.length;
    return digitos.startsWith(p.codigo) && resto >= LARGO_MINIMO && resto <= LARGO_MAXIMO;
  });
  if (!digitos.startsWith("0") && yaTraePais) return { ok: true, telefono: digitos };
  return normalizarTelefonoPersonal(PAIS_POR_DEFECTO, escrito);
}

/** Lo guardado (595984123456) separado en país y número, para volver a llenar el formulario. */
export function separarTelefono(guardado: string | null | undefined): { codigo: string; numero: string } {
  const digitos = (guardado ?? "").replace(/\D/g, "");
  // El código más largo primero: 595 antes que 5.
  const pais = [...PAISES_TELEFONO]
    .sort((a, b) => b.codigo.length - a.codigo.length)
    .find((p) => digitos.startsWith(p.codigo));
  if (!pais) return { codigo: PAIS_POR_DEFECTO, numero: digitos };
  return { codigo: pais.codigo, numero: digitos.slice(pais.codigo.length) };
}

/** 595984123456 → "+595 984 123 456", para leerlo en pantalla. */
export function formatearTelefonoPersonal(guardado: string | null | undefined): string {
  if (!guardado) return "";
  const { codigo, numero } = separarTelefono(guardado);
  return `+${codigo} ${numero.replace(/(\d{3})(?=\d)/g, "$1 ")}`;
}

// ---------------------------------------------------------------------------
//  Comisión por trabajo
// ---------------------------------------------------------------------------

/**
 * Lo que se escribió en "Comisión por trabajo (%)": vacío es "no cobra comisión" (null);
 * si no, un porcentaje entre 0 y 100 con hasta dos decimales ("40", "12,5").
 */
export function leerComision(escrito: string): { ok: true; valor: number | null } | { ok: false; error: string } {
  const limpio = escrito.trim().replace(",", ".");
  if (!limpio) return { ok: true, valor: null };
  const n = Number(limpio);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    return { ok: false, error: "La comisión tiene que ser un porcentaje entre 0 y 100" };
  }
  return { ok: true, valor: Math.round(n * 100) / 100 };
}

/** Cuánto le toca de un trabajo cobrado: el porcentaje del total, en guaraníes enteros. Sin porcentaje, 0. */
export function calcularComision(total: number, porcentaje: number | null): number {
  if (porcentaje == null || !Number.isFinite(porcentaje) || porcentaje <= 0) return 0;
  return Math.round((total * porcentaje) / 100);
}

/** Los períodos que se pueden mirar en el reporte de trabajos y comisión de una persona. */
export const PERIODOS_COMISION = [
  { valor: "hoy", etiqueta: "Hoy" },
  { valor: "7dias", etiqueta: "7 días" },
  { valor: "mes", etiqueta: "Este mes" },
  { valor: "mesAnterior", etiqueta: "Mes anterior" },
] as const;

export type PeriodoComision = (typeof PERIODOS_COMISION)[number]["valor"];

/** Un trabajo terminado (una cita cobrada) de una persona, con lo que le toca de comisión. */
export type TrabajoDelPersonal = {
  id: string;
  /** "YYYY-MM-DD" y "HH:MM" en hora de Asunción. */
  dia: string;
  hora: string;
  cliente: string;
  servicios: string | null;
  /** Lo que se cobró de esa cita (ya con el descuento). */
  total: number;
  /** El porcentaje con que se calculó; null si no tenía comisión. */
  porcentaje: number | null;
  comision: number;
};
