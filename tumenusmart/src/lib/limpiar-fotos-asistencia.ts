import { prisma } from "@/lib/prisma";
import { DIAS_CONSERVAR_FOTOS_MARCACION } from "@/lib/asistencia";
import { borrarFotosAsistencia, rutaDeFotoAsistencia } from "@/lib/supabase-storage";

const POR_TANDA = 100;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

export type ResultadoLimpieza = {
  fotosBorradas: number;
  /** Fotos cuya dirección no era de la carpeta de asistencia: no se tocan, solo se cuentan. */
  sinRuta: number;
  /** true si se acabó el tiempo antes de terminar: lo que falte sigue en la próxima corrida. */
  quedanPendientes: boolean;
};

/**
 * Borra la FOTO de las marcaciones que ya pasaron de DIAS_CONSERVAR_FOTOS_MARCACION días, de todos los locales.
 *
 * La marcación NO se borra: queda con su hora y su tipo, solo pierde la foto (`fotoUrl` pasa a null y la pantalla
 * muestra "Sin foto"). La selfie del alta del colaborador no se toca: sale de otra tabla y acá solo se lee la de
 * marcaciones.
 *
 * Es una tarea del sistema que recorre todos los locales a propósito, por eso usa el cliente global y no
 * `prismaDelLocal`. No devuelve ningún dato de ningún local: solo cuántas fotos borró.
 *
 * Se hace por tandas, primero el archivo y después la referencia. Si algo falla en el medio, la referencia sigue ahí
 * y la próxima corrida repite el borrado (que no da error si el archivo ya no existe). Si se acaba el tiempo con
 * trabajo pendiente, el resto queda para mañana.
 */
export async function limpiarFotosDeMarcaciones(ahora: Date, presupuestoMs: number): Promise<ResultadoLimpieza> {
  const limite = new Date(ahora.getTime() - DIAS_CONSERVAR_FOTOS_MARCACION * MS_POR_DIA);
  const inicio = Date.now();
  let fotosBorradas = 0;
  let sinRuta = 0;
  // Se avanza por id para no volver a ver las fotos que no se pudieron interpretar.
  let despuesDe: string | undefined;

  while (Date.now() - inicio < presupuestoMs) {
    const lote = await prisma.marcacionAsistencia.findMany({
      where: {
        fotoUrl: { not: null },
        fecha: { lt: limite },
        ...(despuesDe ? { id: { gt: despuesDe } } : {}),
      },
      select: { id: true, fotoUrl: true },
      orderBy: { id: "asc" },
      take: POR_TANDA,
    });

    if (lote.length === 0) return { fotosBorradas, sinRuta, quedanPendientes: false };
    despuesDe = lote[lote.length - 1].id;

    const ids: string[] = [];
    const rutas: string[] = [];
    for (const marcacion of lote) {
      const ruta = marcacion.fotoUrl ? rutaDeFotoAsistencia(marcacion.fotoUrl) : null;
      if (ruta) {
        ids.push(marcacion.id);
        rutas.push(ruta);
      } else {
        sinRuta += 1;
      }
    }
    if (ids.length === 0) continue;

    await borrarFotosAsistencia(rutas);
    await prisma.marcacionAsistencia.updateMany({ where: { id: { in: ids } }, data: { fotoUrl: null } });
    fotosBorradas += ids.length;
  }

  return { fotosBorradas, sinRuta, quedanPendientes: true };
}
