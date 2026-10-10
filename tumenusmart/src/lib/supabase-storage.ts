import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const NOMBRE_BUCKET = "productos";
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

// Whitelist explícita, no "cualquier cosa que empiece con image/". Ese
// chequeo dejaba pasar SVG (image/svg+xml) — un SVG puede llevar
// <script> adentro, y Supabase Storage lo sirve con ese mismo content-type:
// quien abriera la foto "subida" en una pestaña nueva terminaba ejecutando
// el script del que la subió. Se valida la extensión Y el MIME contra la
// misma lista — las dos tienen que decir lo mismo, un .jpg con MIME de
// video (o viceversa) se rechaza igual que un .svg.
const TIPOS_PERMITIDOS: Record<string, string[]> = {
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
};

/** ¿Los primeros bytes del archivo son los de ese formato de imagen? */
function firmaDeImagenValida(bytes: Buffer, extension: string): boolean {
  if (extension === "jpg" || extension === "jpeg") {
    return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (extension === "png") {
    return bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (extension === "webp") {
    return bytes.length > 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  }
  return false;
}

function clienteAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Falta configurar SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY para poder subir imágenes."
    );
  }
  return createClient(url, key);
}

/**
 * Sube una imagen a Supabase Storage (bucket público "productos", opcionalmente
 * dentro de una subcarpeta) y devuelve su URL pública. Se usa desde Server
 * Actions del panel admin — tanto para fotos de producto como para el logo
 * del negocio.
 */
async function subirImagen(archivo: File, carpeta = ""): Promise<string> {
  if (!archivo || archivo.size === 0) {
    throw new Error("No se seleccionó ninguna imagen");
  }
  if (archivo.size > MAX_BYTES) {
    throw new Error("La imagen no puede pesar más de 5MB");
  }

  const extension = (archivo.name.split(".").pop() || "").toLowerCase();
  const mimesValidos = TIPOS_PERMITIDOS[extension];
  if (!mimesValidos || !mimesValidos.includes(archivo.type)) {
    throw new Error("La imagen tiene que ser JPG, PNG o WEBP");
  }

  const buffer = Buffer.from(await archivo.arrayBuffer());
  // El nombre y el tipo que declara el navegador los pone quien sube el archivo: lo único confiable es el contenido. Se
  // comprueba que de verdad empiece como un JPG, PNG o WEBP (no un HTML, un ejecutable o un SVG con otro nombre).
  if (!firmaDeImagenValida(buffer, extension)) {
    throw new Error("El archivo no es una imagen JPG, PNG o WEBP válida");
  }

  const supabase = clienteAdmin();
  // El nombre es la única "contraseña" de una foto en un bucket público (las de asistencia son caras de personas): al azar de
  // verdad (96 bits), no con Math.random, que se puede predecir.
  const nombreArchivo = `${carpeta}${Date.now()}-${randomBytes(12).toString("hex")}.${extension}`;

  const { error } = await supabase.storage
    .from(NOMBRE_BUCKET)
    .upload(nombreArchivo, buffer, { contentType: archivo.type, upsert: false });

  if (error) {
    throw new Error(`No se pudo subir la imagen: ${error.message}`);
  }

  const { data } = supabase.storage.from(NOMBRE_BUCKET).getPublicUrl(nombreArchivo);
  return data.publicUrl;
}

export async function subirImagenProducto(archivo: File): Promise<string> {
  return subirImagen(archivo);
}

export async function subirLogoNegocio(archivo: File): Promise<string> {
  return subirImagen(archivo, "logos/");
}

/** La foto de portada del menú digital público (la franja ancha de arriba de la carta). */
export async function subirPortadaNegocio(archivo: File): Promise<string> {
  return subirImagen(archivo, "portadas/");
}

export async function subirFotoPersonal(archivo: File): Promise<string> {
  return subirImagen(archivo, "personal/");
}

/** Foto de perfil, banner y galería de la página pública de reservas. */
export async function subirImagenPaginaReservas(archivo: File): Promise<string> {
  return subirImagen(archivo, "reservas/");
}

/** El último peinado/corte del cliente, en Reserva de turnos. */
export async function subirFotoCliente(archivo: File): Promise<string> {
  return subirImagen(archivo, "clientes/");
}

const CARPETA_ASISTENCIA = "asistencia/";

/** La selfie del alta de un colaborador y las fotos de cada marcación, en el Registro de asistencia. */
export async function subirFotoAsistencia(archivo: File): Promise<string> {
  return subirImagen(archivo, CARPETA_ASISTENCIA);
}

/**
 * La ruta dentro del bucket de una foto de asistencia, a partir de su dirección pública. Devuelve null si la
 * dirección no es de nuestro bucket o no está en la carpeta de asistencia: así el borrado nunca puede apuntar a una
 * foto de producto, a un logo ni a ninguna otra cosa.
 */
export function rutaDeFotoAsistencia(url: string): string | null {
  const marca = `/object/public/${NOMBRE_BUCKET}/`;
  const desde = url.indexOf(marca);
  if (desde === -1) return null;
  let ruta = url.slice(desde + marca.length).split("?")[0];
  try {
    ruta = decodeURIComponent(ruta);
  } catch {
    return null;
  }
  if (!ruta.startsWith(CARPETA_ASISTENCIA) || ruta.includes("..")) return null;
  return ruta;
}

/**
 * Borra fotos de asistencia del bucket. Si alguna de las rutas no es de la carpeta de asistencia no borra NINGUNA y
 * falla: es la última barrera para que un error de quien llama no se lleve fotos de productos. Borrar un archivo que
 * ya no existe no da error, así que se puede repetir sin problema.
 */
export async function borrarFotosAsistencia(rutas: string[]): Promise<void> {
  if (rutas.length === 0) return;
  if (rutas.some((r) => !r.startsWith(CARPETA_ASISTENCIA) || r.includes(".."))) {
    throw new Error("Se intentó borrar un archivo que no es una foto de asistencia");
  }
  const { error } = await clienteAdmin().storage.from(NOMBRE_BUCKET).remove(rutas);
  if (error) {
    throw new Error(`No se pudieron borrar las fotos: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
//  Descartar imágenes que dejaron de usarse
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Las carpetas del bucket de las que se puede borrar una imagen. Las fotos de productos van en la RAÍZ del bucket (sin
 * carpeta); todo lo demás tiene la suya. Cualquier otra ruta se rechaza: es la barrera para que un dato raro que llegue del
 * navegador no pueda llevarse otra cosa.
 */
const CARPETAS_DESCARTABLES = ["logos/", "portadas/", "personal/", "reservas/", "clientes/", CARPETA_ASISTENCIA];

const NOMBRE_DE_IMAGEN = /^[A-Za-z0-9._-]{1,200}\.(jpg|jpeg|png|webp)$/i;

/** ¿Es una ruta que este sistema pudo haber creado (raíz o una de sus carpetas, con un nombre de imagen)? */
export function esRutaDeImagenDescartable(ruta: string): boolean {
  if (!ruta || ruta.includes("..") || ruta.startsWith("/")) return false;
  const partes = ruta.split("/");
  if (partes.length === 1) return NOMBRE_DE_IMAGEN.test(partes[0]);
  if (partes.length === 2) return CARPETAS_DESCARTABLES.includes(`${partes[0]}/`) && NOMBRE_DE_IMAGEN.test(partes[1]);
  return false;
}

/**
 * La ruta dentro del bucket de una imagen de ESTE sistema, a partir de su dirección pública. Devuelve null si la dirección no
 * es de nuestro almacenamiento (otro servidor, otro bucket) o no tiene la forma de lo que sube este sistema: una foto que un
 * formulario trajo de afuera nunca se intenta borrar.
 */
export function rutaDeImagenPropia(url: string, origenPropio: string | undefined = process.env.SUPABASE_URL): string | null {
  if (!url || !origenPropio) return null;
  let direccion: URL;
  let origen: string;
  try {
    direccion = new URL(url);
    origen = new URL(origenPropio).origin;
  } catch {
    return null;
  }
  if (direccion.protocol !== "https:" || direccion.origin !== origen) return null;
  const marca = `/object/public/${NOMBRE_BUCKET}/`;
  const desde = direccion.pathname.indexOf(marca);
  if (desde === -1) return null;
  let ruta = direccion.pathname.slice(desde + marca.length);
  try {
    ruta = decodeURIComponent(ruta);
  } catch {
    return null;
  }
  return esRutaDeImagenDescartable(ruta) ? ruta : null;
}

/**
 * La ruta de una dirección guardada en la base, SIN mirar de qué servidor es: sirve para armar la lista de lo que está en uso
 * (ser generoso acá es lo seguro: de más, una imagen se conserva). No sirve para borrar.
 */
export function rutaEnUsoDeUrl(url: string): string | null {
  const marca = `/object/public/${NOMBRE_BUCKET}/`;
  const desde = url.indexOf(marca);
  if (desde === -1) return null;
  const cruda = url.slice(desde + marca.length).split("?")[0].split("#")[0];
  try {
    return decodeURIComponent(cruda) || null;
  } catch {
    return cruda || null;
  }
}

/** Borra imágenes del bucket. Si alguna ruta no es descartable no borra NINGUNA y falla. Borrar lo que ya no existe no da error. */
export async function borrarImagenes(rutas: string[]): Promise<void> {
  if (rutas.length === 0) return;
  if (rutas.some((r) => !esRutaDeImagenDescartable(r))) {
    throw new Error("Se intentó borrar un archivo que no es una imagen de este sistema");
  }
  const { error } = await clienteAdmin().storage.from(NOMBRE_BUCKET).remove(rutas);
  if (error) throw new Error(`No se pudieron borrar las imágenes: ${error.message}`);
}

export type ObjetoDelBucket = { ruta: string; creadoEn: Date | null };

/** Todas las imágenes del bucket (la raíz y las carpetas conocidas) con su fecha de subida. Solo lectura. */
export async function listarImagenesDelBucket(): Promise<ObjetoDelBucket[]> {
  const almacen = clienteAdmin().storage.from(NOMBRE_BUCKET);
  const encontrados: ObjetoDelBucket[] = [];
  for (const carpeta of ["", ...CARPETAS_DESCARTABLES]) {
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await almacen.list(carpeta.replace(/\/$/, ""), { limit: 1000, offset: desde });
      if (error) throw new Error(`No se pudo listar el almacenamiento: ${error.message}`);
      if (!data || data.length === 0) break;
      for (const o of data) {
        // Las carpetas aparecen como entradas sin id: no son archivos.
        if (!o.id) continue;
        const ruta = `${carpeta}${o.name}`;
        const fecha = o.created_at ? new Date(o.created_at) : null;
        encontrados.push({ ruta, creadoEn: fecha && !Number.isNaN(fecha.getTime()) ? fecha : null });
      }
      if (data.length < 1000) break;
    }
  }
  return encontrados;
}
