/**
 * La página pública de reservas de un negocio de turnos (salón, barbería…).
 *
 * Es aparte de la configuración base del negocio: tiene su propio nombre,
 * dirección web, contacto, redes sociales, galería, apariencia y campos del
 * formulario. Se ve en /turnos/<dirección>.
 *
 * Puro (sin Prisma): lo usan el editor del navegador, la acción que guarda y la
 * página pública, para que lo que uno muestra y el otro valida digan lo mismo.
 */

import { normalizarSlug } from "./alcance-local";
import { PAIS_POR_DEFECTO, normalizarTelefonoPersonal, separarTelefono } from "./agenda-personal";
import { COLOR_POR_DEFECTO, normalizarColor } from "./servicios-agenda";

// ---------------------------------------------------------------------------
//  Tipos
// ---------------------------------------------------------------------------

export type EntradaCalendario = "al_reservar" | "al_enviar_whatsapp";
export type TemaPagina = "claro" | "oscuro" | "sistema";
export type RedSocial = "instagram" | "tiktok" | "facebook";

export type ItemGaleria = { url: string; descripcion: string };

/**
 * Un campo del formulario de reserva. "fijo" es el nombre: siempre está y siempre
 * es obligatorio. "base" son los de siempre (apellido, teléfono…): se prenden y
 * se apagan. "personalizado" los agrega el dueño y se pueden borrar.
 */
export type CampoFormulario = {
  clave: string;
  etiqueta: string;
  activo: boolean;
  obligatorio: boolean;
  tipo: "fijo" | "base" | "personalizado";
};

/** Todo lo editable de la página, como lo maneja el editor (todo texto, tal como se escribe). */
export type DatosPagina = {
  habilitada: boolean;
  slug: string;
  nombre: string;
  industria: string;
  descripcion: string;
  email: string;
  telefonoPais: string;
  /** Sin el código de país, como lo escribe la persona. */
  telefono: string;
  fotoUrl: string;
  bannerUrl: string;
  instagram: string;
  tiktok: string;
  facebook: string;
  whatsappPais: string;
  whatsapp: string;
  avisoWhatsapp: boolean;
  entradaCalendario: EntradaCalendario;
  galeria: ItemGaleria[];
  colorPrimario: string;
  tema: TemaPagina;
  campos: CampoFormulario[];
};

// ---------------------------------------------------------------------------
//  Opciones
// ---------------------------------------------------------------------------

export const ENTRADAS_CALENDARIO: { valor: EntradaCalendario; etiqueta: string; ayuda: string }[] = [
  {
    valor: "al_reservar",
    etiqueta: "Apenas el cliente reserva",
    ayuda: "El turno aparece en el calendario como Pendiente en cuanto el cliente lo pide.",
  },
  {
    valor: "al_enviar_whatsapp",
    etiqueta: "Cuando el cliente envía el WhatsApp",
    ayuda: "El turno aparece en el calendario recién cuando el cliente manda el aviso por WhatsApp. Sirve para no llenarse de pedidos que nadie confirma.",
  },
];

export const TEMAS_PAGINA: { valor: TemaPagina; etiqueta: string; ayuda: string }[] = [
  { valor: "claro", etiqueta: "Claro", ayuda: "Fondo blanco" },
  { valor: "oscuro", etiqueta: "Oscuro", ayuda: "Fondo negro" },
  { valor: "sistema", etiqueta: "Automático", ayuda: "Sigue el celular del cliente" },
];

/** Los colores que se ofrecen de una. Cualquier otro se elige con el selector. */
export const COLORES_PAGINA = [
  "#3B82F6", "#0284C7", "#1E3A8A", "#14B8A6", "#166534", "#22C55E",
  "#84CC16", "#FACC15", "#F59E0B", "#F97316", "#C2410C", "#EF4444",
  "#991B1B", "#BE123C", "#F472B6", "#DB2777", "#A855F7", "#6D28D9",
] as const;

export const MAX_GALERIA = 5;
export const MAX_CAMPOS_PERSONALIZADOS = 5;
const LARGO_DESCRIPCION_FOTO = 120;

// ---------------------------------------------------------------------------
//  Campos del formulario
// ---------------------------------------------------------------------------

/** Los campos de siempre, en orden, con cómo arrancan. */
export const CAMPOS_BASE: CampoFormulario[] = [
  { clave: "nombre", etiqueta: "Nombre", activo: true, obligatorio: true, tipo: "fijo" },
  { clave: "apellido", etiqueta: "Apellido", activo: true, obligatorio: false, tipo: "base" },
  { clave: "telefono", etiqueta: "Teléfono", activo: true, obligatorio: true, tipo: "base" },
  { clave: "email", etiqueta: "Correo electrónico", activo: true, obligatorio: false, tipo: "base" },
  { clave: "direccion", etiqueta: "Dirección", activo: false, obligatorio: false, tipo: "base" },
  { clave: "nota", etiqueta: "Nota", activo: true, obligatorio: false, tipo: "base" },
];

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return !!valor && typeof valor === "object" && !Array.isArray(valor);
}

/**
 * Los campos como quedaron guardados, completados: los de siempre van primero y en
 * su orden (con lo que se guardó de cada uno) y después los personalizados. Lo
 * guardado puede venir vacío, viejo o mal formado: se lee con cuidado.
 */
export function completarCampos(guardado: unknown): CampoFormulario[] {
  const lista = Array.isArray(guardado) ? guardado.filter(esObjeto) : [];

  const base = CAMPOS_BASE.map((campo) => {
    const g = lista.find((x) => x.clave === campo.clave);
    if (!g || campo.tipo === "fijo") return { ...campo };
    const activo = typeof g.activo === "boolean" ? g.activo : campo.activo;
    const obligatorio = activo && (typeof g.obligatorio === "boolean" ? g.obligatorio : campo.obligatorio);
    return { ...campo, activo, obligatorio };
  });

  const personalizados: CampoFormulario[] = [];
  for (const g of lista) {
    if (personalizados.length >= MAX_CAMPOS_PERSONALIZADOS) break;
    if (typeof g.clave !== "string" || !/^extra_[a-z0-9]{1,10}$/.test(g.clave)) continue;
    if (typeof g.etiqueta !== "string" || !g.etiqueta.trim()) continue;
    if (personalizados.some((p) => p.clave === g.clave)) continue;
    personalizados.push({
      clave: g.clave,
      etiqueta: g.etiqueta.trim().slice(0, 40),
      activo: true,
      obligatorio: g.obligatorio === true,
      tipo: "personalizado",
    });
  }
  return [...base, ...personalizados];
}

/** Una clave nueva para un campo personalizado, que no choque con las que ya hay. */
export function claveCampoNuevo(existentes: CampoFormulario[]): string {
  for (let i = 0; i < 1000; i++) {
    const clave = `extra_${Math.random().toString(36).slice(2, 8)}`;
    if (!existentes.some((c) => c.clave === clave)) return clave;
  }
  return `extra_${Date.now().toString(36)}`;
}

// ---------------------------------------------------------------------------
//  Galería
// ---------------------------------------------------------------------------

/** La galería guardada, sin nada raro: solo direcciones https, con su descripción, hasta 5. */
export function completarGaleria(guardado: unknown): ItemGaleria[] {
  if (!Array.isArray(guardado)) return [];
  const items: ItemGaleria[] = [];
  for (const g of guardado) {
    if (items.length >= MAX_GALERIA) break;
    if (!esObjeto(g) || typeof g.url !== "string" || !/^https:\/\//i.test(g.url)) continue;
    items.push({
      url: g.url,
      descripcion: typeof g.descripcion === "string" ? g.descripcion.slice(0, LARGO_DESCRIPCION_FOTO) : "",
    });
  }
  return items;
}

// ---------------------------------------------------------------------------
//  Redes sociales
// ---------------------------------------------------------------------------

const ARMAR_ENLACE: Record<RedSocial, (usuario: string) => string> = {
  instagram: (u) => `https://instagram.com/${u}`,
  tiktok: (u) => `https://www.tiktok.com/@${u}`,
  facebook: (u) => `https://facebook.com/${u}`,
};

/**
 * Lo que escribió la persona en el campo de una red: el enlace completo
 * ("https://instagram.com/sr.barberia"), o solo su usuario ("@sr.barberia").
 * Devuelve el enlace listo para guardar, o null si lo dejó vacío. Solo se
 * aceptan enlaces http(s): nada de "javascript:" ni parecidos.
 */
export function normalizarEnlaceSocial(
  red: RedSocial,
  valor: string
): { ok: true; enlace: string | null } | { ok: false; error: string } {
  const texto = valor.trim();
  if (!texto) return { ok: true, enlace: null };
  if (texto.length > 200) return { ok: false, error: "El enlace es demasiado largo" };

  // "instagram.com/usuario" sin https:// también vale.
  const comoEnlace = /^https?:\/\//i.test(texto)
    ? texto
    : /^[\w-]+(\.[\w-]+)+\/.+/.test(texto)
      ? `https://${texto}`
      : null;
  if (comoEnlace) {
    try {
      const url = new URL(comoEnlace);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("protocolo");
      return { ok: true, enlace: comoEnlace };
    } catch {
      return { ok: false, error: "Ese enlace no es válido. Revisalo." };
    }
  }

  const usuario = texto.replace(/^@/, "");
  if (!/^[A-Za-z0-9._-]{1,60}$/.test(usuario)) {
    return { ok: false, error: "Escribí el enlace completo o solo el usuario (sin espacios)." };
  }
  return { ok: true, enlace: ARMAR_ENLACE[red](usuario) };
}

// ---------------------------------------------------------------------------
//  Datos iniciales
// ---------------------------------------------------------------------------

/** Lo que trae la base (o nada, la primera vez), en la forma que necesita el editor. */
export type FilaPagina = {
  slug: string;
  habilitada: boolean;
  nombre: string;
  industria: string | null;
  descripcion: string | null;
  email: string | null;
  telefono: string | null;
  fotoUrl: string | null;
  bannerUrl: string | null;
  instagram: string | null;
  tiktok: string | null;
  facebook: string | null;
  whatsapp: string | null;
  avisoWhatsapp: boolean;
  entradaCalendario: string;
  galeria: unknown;
  colorPrimario: string;
  tema: string;
  campos: unknown;
};

export function normalizarTema(valor: unknown): TemaPagina {
  return valor === "oscuro" || valor === "sistema" ? valor : "claro";
}

export function normalizarEntradaCalendario(valor: unknown): EntradaCalendario {
  return valor === "al_enviar_whatsapp" ? "al_enviar_whatsapp" : "al_reservar";
}

/**
 * Lo que arranca el editor. La primera vez, cuando todavía no hay nada guardado,
 * propone el nombre del negocio y una dirección armada a partir de él; recién
 * cuenta cuando se aprieta Guardar.
 */
export function datosIniciales(fila: FilaPagina | null, nombreNegocio: string): DatosPagina {
  if (!fila) {
    return {
      habilitada: false,
      slug: normalizarSlug(nombreNegocio),
      nombre: nombreNegocio,
      industria: "",
      descripcion: "",
      email: "",
      telefonoPais: PAIS_POR_DEFECTO,
      telefono: "",
      fotoUrl: "",
      bannerUrl: "",
      instagram: "",
      tiktok: "",
      facebook: "",
      whatsappPais: PAIS_POR_DEFECTO,
      whatsapp: "",
      avisoWhatsapp: true,
      entradaCalendario: "al_reservar",
      galeria: [],
      colorPrimario: COLOR_POR_DEFECTO,
      tema: "claro",
      campos: completarCampos([]),
    };
  }
  const tel = separarTelefono(fila.telefono);
  const wa = separarTelefono(fila.whatsapp);
  return {
    habilitada: fila.habilitada,
    slug: fila.slug,
    nombre: fila.nombre,
    industria: fila.industria ?? "",
    descripcion: fila.descripcion ?? "",
    email: fila.email ?? "",
    telefonoPais: tel.codigo,
    telefono: tel.numero,
    fotoUrl: fila.fotoUrl ?? "",
    bannerUrl: fila.bannerUrl ?? "",
    instagram: fila.instagram ?? "",
    tiktok: fila.tiktok ?? "",
    facebook: fila.facebook ?? "",
    whatsappPais: wa.codigo,
    whatsapp: wa.numero,
    avisoWhatsapp: fila.avisoWhatsapp,
    entradaCalendario: normalizarEntradaCalendario(fila.entradaCalendario),
    galeria: completarGaleria(fila.galeria),
    colorPrimario: normalizarColor(fila.colorPrimario),
    tema: normalizarTema(fila.tema),
    campos: completarCampos(fila.campos),
  };
}

// ---------------------------------------------------------------------------
//  Lo que se guarda
// ---------------------------------------------------------------------------

/** Lo que llega listo para escribir en la base. */
export type DatosParaGuardar = {
  slug: string;
  habilitada: boolean;
  nombre: string;
  industria: string | null;
  descripcion: string | null;
  email: string | null;
  telefono: string | null;
  fotoUrl: string | null;
  bannerUrl: string | null;
  instagram: string | null;
  tiktok: string | null;
  facebook: string | null;
  whatsapp: string | null;
  avisoWhatsapp: boolean;
  entradaCalendario: EntradaCalendario;
  galeria: ItemGaleria[];
  colorPrimario: string;
  tema: TemaPagina;
  campos: CampoFormulario[];
};

function texto(valor: unknown, max: number): string {
  return typeof valor === "string" ? valor.trim().slice(0, max) : "";
}

function imagen(valor: unknown): { ok: true; url: string | null } | { ok: false } {
  const t = typeof valor === "string" ? valor.trim() : "";
  if (!t) return { ok: true, url: null };
  return /^https:\/\//i.test(t) && t.length <= 500 ? { ok: true, url: t } : { ok: false };
}

/**
 * Revisa lo que mandó el navegador y lo deja listo para guardar. Nada se guarda
 * tal cual: se arman valores nuevos con solo lo que corresponde, y lo que no
 * cumple se rechaza con un mensaje que la persona entienda.
 */
export function sanearDatosPagina(
  entrada: unknown
): { ok: true; datos: DatosParaGuardar } | { ok: false; error: string } {
  if (!esObjeto(entrada)) return { ok: false, error: "Lo que llegó no es válido. Recargá la página." };
  const e = entrada;

  const nombre = texto(e.nombre, 60);
  if (!nombre) return { ok: false, error: "El nombre del negocio es obligatorio" };

  const slug = normalizarSlug(texto(e.slug, 80));
  if (slug.length < 3) {
    return { ok: false, error: "La dirección de la página tiene que tener al menos 3 letras o números" };
  }

  const email = texto(e.email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "El correo electrónico no parece válido" };
  }

  // Teléfono de contacto: opcional. WhatsApp: donde llegan las reservas.
  let telefono: string | null = null;
  if (texto(e.telefono, 30)) {
    const t = normalizarTelefonoPersonal(texto(e.telefonoPais, 5), texto(e.telefono, 30));
    if (!t.ok) return { ok: false, error: `Teléfono: ${t.error}` };
    telefono = t.telefono;
  }
  let whatsapp: string | null = null;
  if (texto(e.whatsapp, 30)) {
    const w = normalizarTelefonoPersonal(texto(e.whatsappPais, 5), texto(e.whatsapp, 30));
    if (!w.ok) return { ok: false, error: `WhatsApp: ${w.error}` };
    whatsapp = w.telefono;
  }

  const habilitada = e.habilitada === true;
  if (habilitada && !whatsapp) {
    return {
      ok: false,
      error: "Para habilitar la reserva en línea cargá el número de WhatsApp donde recibís las reservas.",
    };
  }

  const foto = imagen(e.fotoUrl);
  const banner = imagen(e.bannerUrl);
  if (!foto.ok || !banner.ok) return { ok: false, error: "Una de las imágenes no es válida. Subila de nuevo." };

  const redes: Record<RedSocial, string | null> = { instagram: null, tiktok: null, facebook: null };
  const nombresDeRed: Record<RedSocial, string> = { instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook" };
  for (const red of ["instagram", "tiktok", "facebook"] as const) {
    const r = normalizarEnlaceSocial(red, texto(e[red], 200));
    if (!r.ok) return { ok: false, error: `${nombresDeRed[red]}: ${r.error}` };
    redes[red] = r.enlace;
  }

  if (Array.isArray(e.galeria) && e.galeria.length > MAX_GALERIA) {
    return { ok: false, error: `La galería puede tener hasta ${MAX_GALERIA} fotos` };
  }
  const galeria = completarGaleria(e.galeria);

  return {
    ok: true,
    datos: {
      slug,
      habilitada,
      nombre,
      industria: texto(e.industria, 60) || null,
      descripcion: texto(e.descripcion, 500) || null,
      email: email || null,
      telefono,
      fotoUrl: foto.url,
      bannerUrl: banner.url,
      instagram: redes.instagram,
      tiktok: redes.tiktok,
      facebook: redes.facebook,
      whatsapp,
      avisoWhatsapp: e.avisoWhatsapp !== false,
      entradaCalendario: normalizarEntradaCalendario(e.entradaCalendario),
      galeria,
      colorPrimario: normalizarColor(e.colorPrimario),
      tema: normalizarTema(e.tema),
      campos: completarCampos(e.campos),
    },
  };
}
