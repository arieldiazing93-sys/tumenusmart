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
