import { formatearGuarani } from "@/lib/format";
import { calcularCotizacion, numeroDeCotizacion, validaHasta } from "@/lib/cotizacion";
import { textoPorcentaje } from "@/lib/descuento-venta";
import { ZONA_NEGOCIO } from "@/lib/timezone";

export type DatosDocumentoCotizacion = {
  local: {
    nombre: string;
    logoUrl: string | null;
    direccion: string | null;
    whatsappNumero: string;
  };
  numero: number;
  fecha: Date;
  validezDias: number;
  clienteNombre: string;
  clienteIdentificacion: string | null;
  clienteTelefono: string | null;
  clienteEmail: string | null;
  notas: string | null;
  descuento: number;
  descuentoPorcentaje: number | null;
  total: number;
  items: { nombre: string; descripcion: string | null; cantidad: number; precioUnitario: number; iva: string }[];
};

function dia(fecha: Date): string {
  return fecha.toLocaleDateString("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ZONA_NEGOCIO,
  });
}

/** "2", "1,5" — una cantidad sin ceros de más. */
function textoCantidad(n: number): string {
  return String(n).replace(".", ",");
}

/**
 * El presupuesto tal como lo ve el cliente: es el documento que se imprime o
 * se guarda como PDF. Lo usan la vista previa (dentro del panel) y la página de
 * impresión, así lo que se ve es exactamente lo que sale.
 */
export function DocumentoCotizacion({ d }: { d: DatosDocumentoCotizacion }) {
  // El descuento ya está calculado en guaraníes: se vuelve a pasar como monto
  // para reproducir el mismo desglose de IVA que se calculó al guardar.
  const calculo = calcularCotizacion(
    d.items.map((i) => ({ cantidad: i.cantidad, precioUnitario: i.precioUnitario, iva: i.iva })),
    d.descuento > 0 ? { tipo: "monto", valor: d.descuento } : null
  );
  const importes = calculo.ok ? calculo.importes : d.items.map((i) => Math.round(i.cantidad * i.precioUnitario));
  const subtotal = calculo.ok ? calculo.subtotal : d.total + d.descuento;
  const hasta = validaHasta(d.fecha, d.validezDias);

  return (
    <article className="mx-auto w-full max-w-3xl rounded-xl border border-linea bg-white p-6 text-tinta print:max-w-none print:rounded-none print:border-0 print:p-0 sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-linea pb-5">
        <div className="flex items-center gap-3">
          {d.local.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={d.local.logoUrl} alt={d.local.nombre} className="h-14 w-14 flex-none rounded-full object-cover" />
          )}
          <div>
            <h1 className="text-xl font-bold leading-tight">{d.local.nombre}</h1>
            {d.local.direccion && <p className="text-xs text-tinta-media">{d.local.direccion}</p>}
            <p className="text-xs text-tinta-media">WhatsApp: +{d.local.whatsappNumero}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[0.7rem] font-semibold uppercase tracking-rotulo text-tinta-suave">Presupuesto</p>
          <p className="cifra text-2xl font-bold">N° {numeroDeCotizacion(d.numero)}</p>
          <p className="text-xs text-tinta-media">Fecha: {dia(d.fecha)}</p>
          <p className="text-xs font-semibold text-tinta">Válido hasta: {dia(hasta)}</p>
        </div>
      </header>

      <section className="mt-5">
        <p className="text-[0.7rem] font-semibold uppercase tracking-rotulo text-tinta-suave">Para</p>
        <p className="text-base font-semibold">{d.clienteNombre}</p>
        <div className="text-sm text-tinta-media">
          {d.clienteIdentificacion && <p>RUC / CI: {d.clienteIdentificacion}</p>}
          {d.clienteTelefono && <p>Teléfono: {d.clienteTelefono}</p>}
          {d.clienteEmail && <p>Correo: {d.clienteEmail}</p>}
        </div>
      </section>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-tinta/60 text-left text-xs uppercase tracking-wide text-tinta-media">
            <th className="py-2 pr-2">Descripción</th>
            <th className="px-2 py-2 text-right">Cant.</th>
            <th className="px-2 py-2 text-right">Precio unit.</th>
            <th className="py-2 pl-2 text-right">Importe</th>
          </tr>
        </thead>
        <tbody>
          {d.items.map((item, i) => (
            <tr key={i} className="break-inside-avoid border-b border-linea align-top">
              <td className="py-2 pr-2">
                <p className="font-medium">{item.nombre}</p>
                {item.descripcion && <p className="text-xs text-tinta-media">{item.descripcion}</p>}
              </td>
              <td className="cifra px-2 py-2 text-right">{textoCantidad(item.cantidad)}</td>
              <td className="cifra px-2 py-2 text-right">{formatearGuarani(item.precioUnitario)}</td>
              <td className="cifra py-2 pl-2 text-right font-medium">{formatearGuarani(importes[i])}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 ml-auto flex w-full max-w-xs flex-col gap-1.5 text-sm">
        {d.descuento > 0 && (
          <>
            <div className="cifra flex justify-between gap-4">
              <span className="text-tinta-media">Subtotal</span>
              <span>{formatearGuarani(subtotal)}</span>
            </div>
            <div className="cifra flex justify-between gap-4">
              <span className="text-tinta-media">
                Descuento{d.descuentoPorcentaje != null ? ` (${textoPorcentaje(d.descuentoPorcentaje)}%)` : ""}
              </span>
              <span>− {formatearGuarani(d.descuento)}</span>
            </div>
          </>
        )}
        <div className="cifra flex justify-between gap-4 border-t border-tinta/60 pt-2 text-lg font-bold">
          <span>TOTAL</span>
          <span>{formatearGuarani(d.total)}</span>
        </div>
        {calculo.ok && (calculo.iva10 > 0 || calculo.iva5 > 0 || calculo.exento > 0) && (
          <div className="cifra flex flex-col gap-0.5 text-xs text-tinta-media">
            {calculo.iva10 > 0 && (
              <div className="flex justify-between gap-4">
                <span>IVA 10% incluido</span>
                <span>{formatearGuarani(calculo.iva10)}</span>
              </div>
            )}
            {calculo.iva5 > 0 && (
              <div className="flex justify-between gap-4">
                <span>IVA 5% incluido</span>
                <span>{formatearGuarani(calculo.iva5)}</span>
              </div>
            )}
            {calculo.exento > 0 && (
              <div className="flex justify-between gap-4">
                <span>Exento de IVA</span>
                <span>{formatearGuarani(calculo.exento)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {d.notas && (
        <section className="mt-6 break-inside-avoid">
          <p className="text-[0.7rem] font-semibold uppercase tracking-rotulo text-tinta-suave">Notas y condiciones</p>
          <p className="mt-1 whitespace-pre-line text-sm text-tinta-media">{d.notas}</p>
        </section>
      )}

      <footer className="mt-8 border-t border-linea pt-3 text-xs text-tinta-suave">
        <p>
          Precios expresados en guaraníes (Gs.), IVA incluido. Presupuesto válido por {d.validezDias}{" "}
          {d.validezDias === 1 ? "día" : "días"} desde su fecha.
        </p>
        <p>Este documento es un presupuesto y no tiene validez como factura.</p>
      </footer>
    </article>
  );
}
