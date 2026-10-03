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

  const supabase = clienteAdmin();
  const nombreArchivo = `${carpeta}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;

  const buffer = Buffer.from(await archivo.arrayBuffer());
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
