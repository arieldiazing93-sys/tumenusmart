import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual, localActual } from "@/lib/local-actual";
import type { DatosDocumentoCotizacion } from "./DocumentoCotizacion";

/**
 * Un presupuesto del local actual con lo necesario para mostrarlo como
 * documento (vista previa y PDF), o null si no existe. Lo comparten la vista
 * previa, la página de impresión y la de edición.
 */
export async function cargarCotizacion(id: string) {
  const storeId = await idLocalActual();
  const cotizacion = await prismaDelLocal(storeId).cotizacion.findUnique({
    where: { id },
    include: { items: { orderBy: { orden: "asc" } } },
  });
  if (!cotizacion) return null;

  const local = await localActual();
  const documento: DatosDocumentoCotizacion = {
    local: {
      nombre: local.nombre,
      logoUrl: local.logoUrl,
      direccion: local.direccion,
      whatsappNumero: local.whatsappNumero,
    },
    numero: cotizacion.numero,
    fecha: cotizacion.fecha,
    validezDias: cotizacion.validezDias,
    clienteNombre: cotizacion.clienteNombre,
    clienteIdentificacion: cotizacion.clienteIdentificacion,
    clienteTelefono: cotizacion.clienteTelefono,
    clienteEmail: cotizacion.clienteEmail,
    notas: cotizacion.notas,
    descuento: Number(cotizacion.descuento),
    descuentoPorcentaje: cotizacion.descuentoPorcentaje != null ? Number(cotizacion.descuentoPorcentaje) : null,
    total: Number(cotizacion.total),
    items: cotizacion.items.map((i) => ({
      nombre: i.nombre,
      descripcion: i.descripcion,
      cantidad: Number(i.cantidad),
      precioUnitario: Number(i.precioUnitario),
      iva: i.iva,
    })),
  };

  return { cotizacion, documento };
}
