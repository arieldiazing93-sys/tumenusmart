import { createClient } from "@supabase/supabase-js";

const NOMBRE_BUCKET = "productos";
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

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
  if (!archivo.type.startsWith("image/")) {
    throw new Error("El archivo tiene que ser una imagen");
  }
  if (archivo.size > MAX_BYTES) {
    throw new Error("La imagen no puede pesar más de 5MB");
  }

  const supabase = clienteAdmin();
  const extension = (archivo.name.split(".").pop() || "jpg").toLowerCase();
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
