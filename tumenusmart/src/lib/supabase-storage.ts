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
