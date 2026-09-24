/**
 * Los datos del contribuyente que la factura ELECTRÓNICA (SIFEN) exige del
 * emisor: tipo de contribuyente, dirección, ciudad, teléfono, correo y
 * actividades económicas (grupo gEmis del Documento Electrónico, esquema
 * oficial DE_v150.xsd de la DNIT).
 *
 * La factura autoimpresor no usa nada de esto: son datos opcionales que solo se
 * piden a los locales que van a emitir electrónico. Sin Prisma: lo importan la
 * pantalla, la Server Action y el armado del documento.
 */

export type TipoContribuyente = "persona_fisica" | "persona_juridica";

/** iTipCont. */
export const TIPOS_CONTRIBUYENTE: { valor: TipoContribuyente; etiqueta: string; codigoSifen: 1 | 2 }[] = [
  { valor: "persona_fisica", etiqueta: "Persona física", codigoSifen: 1 },
  { valor: "persona_juridica", etiqueta: "Persona jurídica", codigoSifen: 2 },
];

/**
 * Los departamentos, con su código y su descripción para SIFEN. Salen de las
 * listas oficiales de `Departamentos_v141.xsd` (https://ekuatia.set.gov.py/sifen/xsd/Departamentos_v141.xsd):
 * el código es la posición en esa lista y la descripción, el texto tal cual.
 *
 * En la base se guarda solo la `clave`; el código se calcula al armar el
 * documento — así, si el proveedor pidiera corregir alguno, es cambiar una
 * línea acá y no hay datos que migrar.
 */
export const DEPARTAMENTOS: { clave: string; etiqueta: string; codigoSifen: number; descripcionSifen: string }[] = [
  { clave: "capital", etiqueta: "Capital", codigoSifen: 1, descripcionSifen: "CAPITAL" },
  { clave: "concepcion", etiqueta: "Concepción", codigoSifen: 2, descripcionSifen: "CONCEPCION" },
  { clave: "san_pedro", etiqueta: "San Pedro", codigoSifen: 3, descripcionSifen: "SAN PEDRO" },
  { clave: "cordillera", etiqueta: "Cordillera", codigoSifen: 4, descripcionSifen: "CORDILLERA" },
  { clave: "guaira", etiqueta: "Guairá", codigoSifen: 5, descripcionSifen: "GUAIRA" },
  { clave: "caaguazu", etiqueta: "Caaguazú", codigoSifen: 6, descripcionSifen: "CAAGUAZU" },
  { clave: "caazapa", etiqueta: "Caazapá", codigoSifen: 7, descripcionSifen: "CAAZAPA" },
  { clave: "itapua", etiqueta: "Itapúa", codigoSifen: 8, descripcionSifen: "ITAPUA" },
  { clave: "misiones", etiqueta: "Misiones", codigoSifen: 9, descripcionSifen: "MISIONES" },
  { clave: "paraguari", etiqueta: "Paraguarí", codigoSifen: 10, descripcionSifen: "PARAGUARI" },
  { clave: "alto_parana", etiqueta: "Alto Paraná", codigoSifen: 11, descripcionSifen: "ALTO PARANA" },
  { clave: "central", etiqueta: "Central", codigoSifen: 12, descripcionSifen: "CENTRAL" },
  { clave: "neembucu", etiqueta: "Ñeembucú", codigoSifen: 13, descripcionSifen: "NEEMBUCU" },
  { clave: "amambay", etiqueta: "Amambay", codigoSifen: 14, descripcionSifen: "AMAMBAY" },
  { clave: "presidente_hayes", etiqueta: "Presidente Hayes", codigoSifen: 15, descripcionSifen: "PTE. HAYES" },
  { clave: "boqueron", etiqueta: "Boquerón", codigoSifen: 16, descripcionSifen: "BOQUERON" },
  { clave: "alto_paraguay", etiqueta: "Alto Paraguay", codigoSifen: 17, descripcionSifen: "ALTO PARAGUAY" },
  { clave: "canindeyu", etiqueta: "Canindeyú", codigoSifen: 18, descripcionSifen: "CANINDEYU" },
  { clave: "chaco", etiqueta: "Chaco", codigoSifen: 19, descripcionSifen: "CHACO" },
  { clave: "nueva_asuncion", etiqueta: "Nueva Asunción", codigoSifen: 20, descripcionSifen: "NUEVA ASUNCION" },
];

export type ActividadEconomica = { codigo: string; descripcion: string };

/** Los datos del emisor tal como se guardan (todos opcionales). */
export type DatosEmisor = {
  tipoContribuyente: TipoContribuyente | null;
  tipoRegimen: number | null;
  nombreFantasia: string | null;
  denominacionSucursal: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  numeroCasa: string | null;
  complemento: string | null;
  departamento: string | null;
  distritoCodigo: number | null;
  distrito: string | null;
  ciudadCodigo: number | null;
  ciudad: string | null;
  actividades: ActividadEconomica[];
};

/** Como mucho tantas actividades económicas en un documento (gActEco). */
export const MAX_ACTIVIDADES = 9;

export const EMISOR_VACIO: DatosEmisor = {
  tipoContribuyente: null,
  tipoRegimen: null,
  nombreFantasia: null,
  denominacionSucursal: null,
  telefono: null,
  email: null,
  direccion: null,
  numeroCasa: null,
  complemento: null,
  departamento: null,
  distritoCodigo: null,
  distrito: null,
  ciudadCodigo: null,
  ciudad: null,
  actividades: [],
};

/** Lee lo que se guardó en la columna JSON de actividades, sin confiar en su forma. */
export function leerActividades(json: unknown): ActividadEconomica[] {
  if (!Array.isArray(json)) return [];
  const actividades: ActividadEconomica[] = [];
  for (const crudo of json) {
    const a = (crudo ?? {}) as { codigo?: unknown; descripcion?: unknown };
    const codigo = String(a.codigo ?? "").trim();
    const descripcion = String(a.descripcion ?? "").trim();
    if (codigo && descripcion) actividades.push({ codigo, descripcion });
  }
  return actividades;
}

/** La fila de EmisorFiscal (o su copia dentro de un Comprobante) como DatosEmisor, sin confiar en su forma. */
export function emisorDesdeFila(fila: Record<string, unknown> | null | undefined): DatosEmisor {
  if (!fila) return { ...EMISOR_VACIO, actividades: [] };
  const tipo = String(fila.tipoContribuyente ?? "");
  const cadena = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v : null);
  const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    tipoContribuyente: TIPOS_CONTRIBUYENTE.some((t) => t.valor === tipo) ? (tipo as TipoContribuyente) : null,
    tipoRegimen: numero(fila.tipoRegimen),
    nombreFantasia: cadena(fila.nombreFantasia),
    denominacionSucursal: cadena(fila.denominacionSucursal),
    telefono: cadena(fila.telefono),
    email: cadena(fila.email),
    direccion: cadena(fila.direccion),
    numeroCasa: cadena(fila.numeroCasa),
    complemento: cadena(fila.complemento),
    departamento: cadena(fila.departamento),
    distritoCodigo: numero(fila.distritoCodigo),
    distrito: cadena(fila.distrito),
    ciudadCodigo: numero(fila.ciudadCodigo),
    ciudad: cadena(fila.ciudad),
    actividades: leerActividades(fila.actividades),
  };
}

function texto(valor: unknown): string | null {
  const t = String(valor ?? "").trim();
  return t === "" ? null : t;
}

function entero(valor: unknown): number | null {
  const t = String(valor ?? "").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
}

/**
 * Valida y limpia lo que mandó el formulario contra los límites del esquema
 * de SIFEN (largos y formatos de cada campo del grupo gEmis). Todo es
 * opcional: un campo vacío queda en null.
 */
export function normalizarEmisor(entrada: Record<string, unknown>): { ok: true; datos: DatosEmisor } | { ok: false; error: string } {
  const tipoContribuyente = texto(entrada.tipoContribuyente);
  if (tipoContribuyente && !TIPOS_CONTRIBUYENTE.some((t) => t.valor === tipoContribuyente)) {
    return { ok: false, error: "El tipo de contribuyente no es válido." };
  }

  const tipoRegimen = entero(entrada.tipoRegimen);
  if (tipoRegimen !== null && (Number.isNaN(tipoRegimen) || tipoRegimen < 1 || tipoRegimen > 8)) {
    return { ok: false, error: "El tipo de régimen tiene que ser un número del 1 al 8." };
  }

  const telefono = texto(entrada.telefono);
  if (telefono && (telefono.length < 6 || telefono.length > 15)) {
    return { ok: false, error: "El teléfono tiene que tener entre 6 y 15 caracteres." };
  }
  const email = texto(entrada.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "El correo del emisor no parece válido." };
  }

  const direccion = texto(entrada.direccion);
  if (direccion && direccion.length > 255) return { ok: false, error: "La dirección es demasiado larga (máximo 255 caracteres)." };
  const complemento = texto(entrada.complemento);
  if (complemento && complemento.length > 255) return { ok: false, error: "El complemento es demasiado largo." };
  const nombreFantasia = texto(entrada.nombreFantasia);
  if (nombreFantasia && nombreFantasia.length > 255) return { ok: false, error: "El nombre de fantasía es demasiado largo." };
  const denominacionSucursal = texto(entrada.denominacionSucursal);
  if (denominacionSucursal && denominacionSucursal.length > 30) {
    return { ok: false, error: "El nombre de la sucursal admite hasta 30 caracteres." };
  }

  const numeroCasa = texto(entrada.numeroCasa);
  if (numeroCasa && !/^\d{1,10}$/.test(numeroCasa)) {
    return { ok: false, error: "El número de casa tiene que ser un número (0 si no tiene)." };
  }

  const departamento = texto(entrada.departamento);
  if (departamento && !DEPARTAMENTOS.some((d) => d.clave === departamento)) {
    return { ok: false, error: "Ese departamento no existe en la lista." };
  }

  const distritoCodigo = entero(entrada.distritoCodigo);
  const ciudadCodigo = entero(entrada.ciudadCodigo);
  if (Number.isNaN(distritoCodigo) || Number.isNaN(ciudadCodigo)) {
    return { ok: false, error: "Los códigos de distrito y de ciudad tienen que ser números." };
  }
  if (ciudadCodigo !== null && ciudadCodigo > 99999) {
    return { ok: false, error: "El código de ciudad admite hasta 5 dígitos." };
  }
  const distrito = texto(entrada.distrito);
  const ciudad = texto(entrada.ciudad);
  if ((ciudad && ciudad.length > 30) || (distrito && distrito.length > 30)) {
    return { ok: false, error: "El distrito y la ciudad admiten hasta 30 caracteres." };
  }

  const actividadesCrudas = Array.isArray(entrada.actividades) ? entrada.actividades : [];
  const actividades: ActividadEconomica[] = [];
  for (const crudo of actividadesCrudas) {
    const a = (crudo ?? {}) as { codigo?: unknown; descripcion?: unknown };
    const codigo = String(a.codigo ?? "").trim().toUpperCase();
    const descripcion = String(a.descripcion ?? "").trim();
    if (!codigo && !descripcion) continue;
    if (!/^[0-9A-Z]{1,8}$/.test(codigo)) {
      return { ok: false, error: `El código de actividad "${codigo || "(vacío)"}" no es válido (hasta 8 letras o números).` };
    }
    if (!descripcion || descripcion.length > 300) {
      return { ok: false, error: `Poné la descripción de la actividad ${codigo} (hasta 300 caracteres).` };
    }
    actividades.push({ codigo, descripcion });
  }
  if (actividades.length > MAX_ACTIVIDADES) {
    return { ok: false, error: `Como mucho ${MAX_ACTIVIDADES} actividades económicas.` };
  }

  return {
    ok: true,
    datos: {
      tipoContribuyente: (tipoContribuyente as TipoContribuyente | null) ?? null,
      tipoRegimen,
      nombreFantasia,
      denominacionSucursal,
      telefono,
      email,
      direccion,
      numeroCasa,
      complemento,
      departamento,
      distritoCodigo,
      distrito,
      ciudadCodigo,
      ciudad,
      actividades,
    },
  };
}

/**
 * Lo que todavía falta cargar para poder emitir una factura electrónica: los
 * campos que el esquema de SIFEN marca como obligatorios en el emisor. Vacío =
 * completo. Para la factura autoimpresor no hace falta nada de esto.
 */
export function faltantesEmisor(datos: DatosEmisor | null): string[] {
  const d = datos ?? EMISOR_VACIO;
  const falta: string[] = [];
  if (!d.tipoContribuyente) falta.push("Tipo de contribuyente (persona física o jurídica)");
  if (!d.direccion) falta.push("Dirección del establecimiento");
  if (!d.numeroCasa) falta.push("Número de casa (0 si no tiene)");
  if (!d.departamento) falta.push("Departamento");
  if (!d.ciudadCodigo || !d.ciudad) falta.push("Ciudad (código y nombre, de la Tabla 2.1 de la DNIT)");
  if (!d.telefono) falta.push("Teléfono");
  if (!d.email) falta.push("Correo electrónico");
  if (d.actividades.length === 0) falta.push("Al menos una actividad económica");
  return falta;
}
