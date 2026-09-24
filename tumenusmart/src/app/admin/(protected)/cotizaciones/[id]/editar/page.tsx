import { notFound } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { numeroDeCotizacion } from "@/lib/cotizacion";
import { Cabecera } from "@/components/ui";
import { Volver } from "@/components/Volver";
import { cargarCotizacion } from "../../cargar-cotizacion";
import { CotizacionForm, type CotizacionInicial } from "../../CotizacionForm";

export const dynamic = "force-dynamic";

/** Corregir un presupuesto ya guardado: el mismo formulario, abierto con lo que se cargó. */
export default async function EditarCotizacionPage({ params }: { params: Promise<{ id: string }> }) {
  await pantallaConPermiso("cotizaciones.gestionar");
  const { id } = await params;

  const cargada = await cargarCotizacion(id);
  if (!cargada) notFound();
  const { cotizacion } = cargada;

  // El descuento se abre como se pidió: en porcentaje si se pidió así, o en guaraníes.
  const descuento = Number(cotizacion.descuento);
  const porcentaje = cotizacion.descuentoPorcentaje != null ? Number(cotizacion.descuentoPorcentaje) : null;

  const inicial: CotizacionInicial = {
    id: cotizacion.id,
    clienteNombre: cotizacion.clienteNombre,
    clienteIdentificacion: cotizacion.clienteIdentificacion ?? "",
    clienteTelefono: cotizacion.clienteTelefono ?? "",
    clienteEmail: cotizacion.clienteEmail ?? "",
    validezDias: String(cotizacion.validezDias),
    notas: cotizacion.notas ?? "",
    tipoDescuento: porcentaje != null ? "porcentaje" : descuento > 0 ? "monto" : "ninguno",
    valorDescuento: porcentaje != null ? String(porcentaje) : descuento > 0 ? String(descuento) : "",
    lineas: cotizacion.items.map((i) => ({
      nombre: i.nombre,
      descripcion: i.descripcion ?? "",
      cantidad: String(Number(i.cantidad)),
      precio: String(Number(i.precioUnitario)),
      iva: i.iva,
      // Al reabrirla, el nombre y el IVA de todas las líneas se pueden corregir a mano.
      libre: true,
    })),
  };

  return (
    <div className="flex flex-col gap-4">
      <Volver href={`/admin/cotizaciones/${cotizacion.id}`} texto="Volver al presupuesto" className="self-start" />
      <Cabecera
        titulo={`Editar cotización N° ${numeroDeCotizacion(cotizacion.numero)}`}
        bajada="Corregí lo que haga falta. El número y la fecha del presupuesto se conservan."
      />
      <CotizacionForm inicial={inicial} />
    </div>
  );
}
