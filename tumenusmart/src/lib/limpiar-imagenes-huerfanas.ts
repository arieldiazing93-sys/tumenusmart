import { prisma } from "@/lib/prisma";
import { urlsDeGaleria } from "@/lib/imagenes";
import { borrarImagenes, esRutaDeImagenDescartable, listarImagenesDelBucket, rutaEnUsoDeUrl } from "@/lib/supabase-storage";

const MS_POR_DIA = 24 * 60 * 60 * 1000;
/** Cuánto tiempo se espera antes de considerar «suelta» una imagen: da margen a quien subió una foto y todavía no guardó el formulario. */
export const DIAS_DE_GRACIA_IMAGENES = 7;
/** Tope por corrida: si hubiera un error de criterio, el daño queda acotado y se ve en el registro antes de que siga. */
const MAXIMO_POR_CORRIDA = 500;
const POR_TANDA = 100;

export type ResultadoLimpiezaImagenes = {
  /** Archivos que hay en el almacenamiento (raíz y carpetas conocidas). */
  enAlmacenamiento: number;
  /** Direcciones de imágenes que usa alguna fila de la base. */
  enUso: number;
  /** Sin usar y con más de DIAS_DE_GRACIA_IMAGENES días: las que se borran (o se borrarían, en simulación). */
  sueltas: number;
  borradas: number;
  simulacion: boolean;
  /** Si por seguridad no se tocó nada, el motivo. */
  abortada: string | null;
  /** true si quedaron sueltas sin borrar (tope por corrida o se acabó el tiempo): siguen mañana. */
  quedanPendientes: boolean;
  /** Los primeros nombres de archivo, para ver en el registro qué se hizo. */
  ejemplos: string[];
};

/** Todas las rutas del almacenamiento que alguna fila usa, en el momento de la consulta. */
async function rutasEnUso(): Promise<{ claves: Set<string>; cantidad: number }> {
  const [tiendas, productos, clientes, personal, colaboradores, marcaciones, paginas] = await Promise.all([
    prisma.store.findMany({ where: { OR: [{ logoUrl: { not: null } }, { portadaUrl: { not: null } }] }, select: { logoUrl: true, portadaUrl: true } }),
    prisma.product.findMany({ where: { imagenUrl: { not: null } }, select: { imagenUrl: true } }),
    prisma.customer.findMany({ where: { fotoUrl: { not: null } }, select: { fotoUrl: true } }),
    prisma.miembroPersonal.findMany({ where: { fotoUrl: { not: null } }, select: { fotoUrl: true } }),
    prisma.colaborador.findMany({ where: { fotoUrl: { not: null } }, select: { fotoUrl: true } }),
    prisma.marcacionAsistencia.findMany({ where: { fotoUrl: { not: null } }, select: { fotoUrl: true } }),
    prisma.paginaReservas.findMany({ select: { fotoUrl: true, bannerUrl: true, galeria: true } }),
  ]);

  const urls: Array<string | null> = [];
  for (const t of tiendas) urls.push(t.logoUrl, t.portadaUrl);
  for (const p of productos) urls.push(p.imagenUrl);
  for (const c of clientes) urls.push(c.fotoUrl);
  for (const p of personal) urls.push(p.fotoUrl);
  for (const c of colaboradores) urls.push(c.fotoUrl);
  for (const m of marcaciones) urls.push(m.fotoUrl);
  for (const p of paginas) urls.push(p.fotoUrl, p.bannerUrl, ...urlsDeGaleria(p.galeria));

  // Se guarda la ruta completa Y el nombre suelto (que es único: lleva 96 bits al azar). Ser generoso acá es lo seguro: si una
  // dirección quedó con otra forma (otro servidor, otra carpeta), la imagen se conserva en vez de borrarse por error.
  const claves = new Set<string>();
  const completas = new Set<string>();
  for (const url of urls) {
    if (!url) continue;
    const ruta = rutaEnUsoDeUrl(url);
    if (!ruta) continue;
    completas.add(ruta);
    claves.add(ruta);
    claves.add(ruta.split("/").pop() ?? ruta);
  }
  return { claves, cantidad: completas.size };
}

/**
 * Borra del almacenamiento las imágenes que ninguna fila de la base usa y que tienen más de DIAS_DE_GRACIA_IMAGENES días.
 *
 * Es la red de seguridad de `descartarImagenes`: recoge lo que se subió y nunca se guardó (se eligió una foto, se cambió de idea),
 * lo que dejaron las versiones anteriores y lo que un borrado inmediato no alcanzó a limpiar.
 *
 * Reglas para no llevarse lo que sí se usa:
 *  - solo mira rutas con la forma de lo que sube este sistema (raíz o sus carpetas); cualquier otra cosa del bucket no se toca;
 *  - una imagen subida hace menos de 7 días no se toca;
 *  - si la base no devuelve NINGUNA imagen en uso pero el almacenamiento tiene archivos, algo anda mal: no borra nada;
 *  - no borra más de MAXIMO_POR_CORRIDA por vez.
 *
 * Es una tarea del sistema que recorre todos los locales a propósito, por eso usa el cliente global.
 */
export async function limpiarImagenesHuerfanas(
  ahora: Date,
  presupuestoMs: number,
  opciones: { simular?: boolean; diasDeGracia?: number; maximo?: number } = {}
): Promise<ResultadoLimpiezaImagenes> {
  const inicio = Date.now();
  const simulacion = opciones.simular === true;
  const dias = opciones.diasDeGracia ?? DIAS_DE_GRACIA_IMAGENES;
  const maximo = opciones.maximo ?? MAXIMO_POR_CORRIDA;
  const vacio = (extra: Partial<ResultadoLimpiezaImagenes>): ResultadoLimpiezaImagenes => ({
    enAlmacenamiento: 0, enUso: 0, sueltas: 0, borradas: 0, simulacion, abortada: null, quedanPendientes: false, ejemplos: [], ...extra,
  });

  const [uso, objetos] = await Promise.all([rutasEnUso(), listarImagenesDelBucket()]);
  const enUso = uso.claves;
  const base = { enAlmacenamiento: objetos.length, enUso: uso.cantidad };

  if (uso.cantidad === 0 && objetos.length > 0) {
    return vacio({ ...base, abortada: "La base no devolvió ninguna imagen en uso: por seguridad no se borra nada." });
  }

  const limite = ahora.getTime() - dias * MS_POR_DIA;
  const sueltas = objetos.filter(
    (o) =>
      esRutaDeImagenDescartable(o.ruta) &&
      o.creadoEn !== null &&
      o.creadoEn.getTime() < limite &&
      !enUso.has(o.ruta) &&
      !enUso.has(o.ruta.split("/").pop() ?? o.ruta)
  );
  const aBorrar = sueltas.slice(0, maximo);
  const ejemplos = aBorrar.slice(0, 5).map((o) => o.ruta);

  if (simulacion) {
    return vacio({ ...base, sueltas: sueltas.length, ejemplos, quedanPendientes: sueltas.length > aBorrar.length });
  }

  let borradas = 0;
  for (let i = 0; i < aBorrar.length; i += POR_TANDA) {
    if (Date.now() - inicio >= presupuestoMs) break;
    const lote = aBorrar.slice(i, i + POR_TANDA).map((o) => o.ruta);
    await borrarImagenes(lote);
    borradas += lote.length;
  }

  return vacio({ ...base, sueltas: sueltas.length, borradas, ejemplos, quedanPendientes: borradas < sueltas.length });
}
