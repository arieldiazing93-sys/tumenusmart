import { generarMatrizQR } from "@/lib/qr";
import type { ModeloKude } from "@/lib/sifen/kude";

/**
 * El KuDE de una factura electrónica, listo para imprimir: en cinta de 75 mm (la del ticket, para la caja) o en hoja A4.
 * Todo el contenido sale del modelo (que se arma leyendo el documento firmado): acá solo se dibuja.
 *
 * El QR se dibuja acá mismo (sin servicios de afuera) y más grande que el mínimo de la DNIT (25 mm): tiene unos 400
 * bytes y en una impresora térmica de 203 ppp un módulo tiene que ocupar varios puntos para que el celular lo lea.
 */

export type FormatoKude = "cinta" | "carta";

export const ESTILOS_KUDE: Record<FormatoKude, string> = {
  cinta: `
    @page { size: 75mm auto; margin: 4mm; }
    @media print { html, body { width: 67mm; background: #fff; } }
  `,
  carta: `
    @page { size: A4; margin: 12mm; @bottom-right { content: "Página " counter(page) " de " counter(pages); font-size: 9px; } }
    @media print { html, body { background: #fff; } }
  `,
};

/** El QR como SVG, con la zona de silencio de 4 módulos que pide el estándar (la DNIT pide al menos 3 mm). */
function qrSvg(url: string, lado: string): string {
  const matriz = generarMatrizQR(url);
  const n = matriz.length;
  const margen = 4;
  const total = n + margen * 2;
  let camino = "";
  for (let f = 0; f < n; f++) {
    for (let c = 0; c < n; c++) if (matriz[f][c]) camino += `M${c + margen} ${f + margen}h1v1h-1z`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#fff"/><path d="${camino}" fill="#000"/></svg>`;
}

function Qr({ url, lado }: { url: string; lado: string }) {
  let svg = "";
  try {
    svg = qrSvg(url, lado);
  } catch {
    return <p className="text-[10px] text-red-700">No se pudo dibujar el código QR.</p>;
  }
  // El SVG lo armamos nosotros a partir de la matriz (solo números y rutas), nunca de texto de un usuario.
  return <div style={{ width: lado, height: lado }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

function Marca({ modelo }: { modelo: ModeloKude }) {
  if (!modelo.esPrueba) return null;
  return (
    <p className="my-1 border border-black px-1 py-0.5 text-center text-[10px] font-bold uppercase leading-tight">
      Documento de ambiente de pruebas · sin valor comercial ni fiscal
    </p>
  );
}

// ---------------------------------------------------------------------------
//  Cinta de 75 mm
// ---------------------------------------------------------------------------

function Linea({ ancho = "w-full" }: { ancho?: string }) {
  return <div className={`${ancho} my-1 border-t border-dashed border-black`} />;
}

function Fila({ etiqueta, valor, fuerte = false }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${fuerte ? "font-bold" : ""}`}>
      <span>{etiqueta}</span>
      <span className="text-right tabular-nums">{valor}</span>
    </div>
  );
}

function Cinta({ modelo }: { modelo: ModeloKude }) {
  const m = modelo;
  return (
    <div className="mx-auto w-[67mm] bg-white text-[10px] leading-snug text-black print:w-full">
      <p className="text-center text-[11px] font-bold">{m.titulo}</p>
      <Marca modelo={m} />
      <div className="text-center">
        <p className="text-[12px] font-bold">{m.emisor.razonSocial}</p>
        {m.emisor.nombreFantasia && <p>{m.emisor.nombreFantasia}</p>}
        {m.emisor.actividad && <p>{m.emisor.actividad}</p>}
        <p>RUC: {m.emisor.ruc}</p>
        <p>
          {m.emisor.direccion}
          {m.emisor.ciudad ? ` · ${m.emisor.ciudad}` : ""}
        </p>
        {m.emisor.telefono && <p>Tel.: {m.emisor.telefono}</p>}
        <p>Timbrado N° {m.timbrado}</p>
        <p>Inicio de vigencia: {m.inicioVigencia}</p>
        <p className="mt-1 font-bold">
          {m.tipoDocumento} N° {m.numero}
        </p>
      </div>
      <Linea />
      <p>Fecha y hora de emisión: {m.fechaEmision}</p>
      <p>
        Condición de venta: {m.condicion}
        {m.plazo ? ` (${m.plazo})` : ""} · Moneda: {m.moneda}
      </p>
      <p>
        {m.receptor.tipoDocumento}: {m.receptor.documento}
      </p>
      <p>Nombre / razón social: {m.receptor.nombre}</p>
      {m.receptor.direccion && <p>Dirección: {m.receptor.direccion}</p>}
      {m.receptor.email && <p>Correo: {m.receptor.email}</p>}
      {m.tipoOperacion && <p>Tipo de operación: {m.tipoOperacion}</p>}
      <Linea />
      <div className="flex justify-between font-bold">
        <span>Cant. · Descripción</span>
        <span>Valor de venta</span>
      </div>
      {m.items.map((it, i) => {
        const valor = it.iva10 !== "0" ? `${it.iva10} (10%)` : it.iva5 !== "0" ? `${it.iva5} (5%)` : `${it.exentas} (Ex.)`;
        return (
          <div key={i} className="py-0.5">
            <p>
              {it.cantidad} {it.unidad} · {it.descripcion}
              <span className="text-[9px]"> [{it.codigo}]</span>
            </p>
            <div className="flex justify-between">
              <span>
                x {it.precioUnitario}
                {it.descuento !== "0" ? ` − desc. ${it.descuento}` : ""}
              </span>
              <span className="tabular-nums">{valor}</span>
            </div>
          </div>
        );
      })}
      <Linea />
      <Fila etiqueta="Subtotal exentas" valor={m.totales.subExentas} />
      <Fila etiqueta="Subtotal 5%" valor={m.totales.sub5} />
      <Fila etiqueta="Subtotal 10%" valor={m.totales.sub10} />
      {m.totales.descuento !== "0" && <Fila etiqueta="Descuento total" valor={m.totales.descuento} />}
      <Fila etiqueta="TOTAL A PAGAR" valor={m.totales.totalOperacion} fuerte />
      <Fila etiqueta="Total en guaraníes" valor={m.totales.totalGuaranies} />
      <Linea />
      <Fila etiqueta="Liquidación IVA (5%)" valor={m.totales.liquidacion5} />
      <Fila etiqueta="Liquidación IVA (10%)" valor={m.totales.liquidacion10} />
      <Fila etiqueta="Total IVA" valor={m.totales.totalIva} fuerte />
      {m.pagos.length > 0 && (
        <>
          <Linea />
          {m.pagos.map((p, i) => (
            <Fila key={i} etiqueta={p.forma} valor={p.monto} />
          ))}
        </>
      )}
      <Linea />
      <div className="flex flex-col items-center text-center">
        <Qr url={m.urlQr} lado="38mm" />
        <p className="mt-1">Consulte la validez de este documento electrónico con el número de CDC impreso abajo en:</p>
        <p className="font-bold">{m.urlConsulta}</p>
        <p className="mt-1 break-words font-mono text-[11px] font-bold tracking-wide">{m.cdcAgrupado}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Hoja A4
// ---------------------------------------------------------------------------

function Carta({ modelo }: { modelo: ModeloKude }) {
  const m = modelo;
  const celda = "border border-black px-1.5 py-1";
  return (
    <div className="mx-auto w-[186mm] max-w-full bg-white text-[11px] leading-snug text-black print:w-full">
      <p className="mb-1 text-center text-[13px] font-bold">{m.titulo}</p>
      <Marca modelo={m} />

      {/* El QR va en la primera página (13.3): junto al encabezado. */}
      <div className="grid grid-cols-[1fr_auto] gap-3 border border-black p-2">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[14px] font-bold uppercase">{m.emisor.razonSocial}</p>
            {m.emisor.nombreFantasia && <p>{m.emisor.nombreFantasia}</p>}
            {m.emisor.actividad && <p>{m.emisor.actividad}</p>}
            <p>
              {m.emisor.direccion}
              {m.emisor.ciudad ? ` · ${m.emisor.ciudad}` : ""}
            </p>
            {m.emisor.telefono && <p>Teléfono: {m.emisor.telefono}</p>}
            {m.emisor.email && <p>Correo: {m.emisor.email}</p>}
          </div>
          <div className="text-right">
            <p className="font-bold">RUC: {m.emisor.ruc}</p>
            <p>Timbrado N° {m.timbrado}</p>
            <p>Inicio de vigencia: {m.inicioVigencia}</p>
            <p className="mt-1 text-[13px] font-bold">
              {m.tipoDocumento} N° {m.numero}
            </p>
          </div>
        </div>
        <Qr url={m.urlQr} lado="36mm" />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-4 border border-black p-2">
        <p>Fecha y hora de emisión: {m.fechaEmision}</p>
        <p>
          Condición de venta: {m.condicion}
          {m.plazo ? ` (${m.plazo})` : ""}
        </p>
        <p>
          {m.receptor.tipoDocumento}: {m.receptor.documento}
        </p>
        <p>Moneda: {m.moneda}</p>
        <p className="col-span-2">Nombre o razón social: {m.receptor.nombre}</p>
        {m.receptor.direccion && <p>Dirección: {m.receptor.direccion}</p>}
        {m.receptor.telefono && <p>Teléfono: {m.receptor.telefono}</p>}
        {m.receptor.email && <p>Correo electrónico: {m.receptor.email}</p>}
        {m.tipoOperacion && <p className="col-span-2">Tipo de operación: {m.tipoOperacion}</p>}
      </div>

      <table className="mt-2 w-full border-collapse text-[10.5px]">
        <thead>
          <tr className="bg-neutral-200 print:bg-neutral-200">
            <th className={`${celda} text-left`}>Código</th>
            <th className={`${celda} text-left`}>Descripción</th>
            <th className={`${celda} text-left`}>Unidad</th>
            <th className={`${celda} text-right`}>Cantidad</th>
            <th className={`${celda} text-right`}>Precio unitario</th>
            <th className={`${celda} text-right`}>Descuento</th>
            <th className={`${celda} text-right`}>Exentas</th>
            <th className={`${celda} text-right`}>5%</th>
            <th className={`${celda} text-right`}>10%</th>
          </tr>
        </thead>
        <tbody>
          {m.items.map((it, i) => (
            <tr key={i} className="break-inside-avoid">
              <td className={celda}>{it.codigo}</td>
              <td className={celda}>{it.descripcion}</td>
              <td className={celda}>{it.unidad}</td>
              <td className={`${celda} text-right tabular-nums`}>{it.cantidad}</td>
              <td className={`${celda} text-right tabular-nums`}>{it.precioUnitario}</td>
              <td className={`${celda} text-right tabular-nums`}>{it.descuento}</td>
              <td className={`${celda} text-right tabular-nums`}>{it.exentas}</td>
              <td className={`${celda} text-right tabular-nums`}>{it.iva5}</td>
              <td className={`${celda} text-right tabular-nums`}>{it.iva10}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="break-inside-avoid">
          <tr className="font-semibold">
            <td colSpan={6} className={`${celda} text-right`}>
              Subtotal
            </td>
            <td className={`${celda} text-right tabular-nums`}>{m.totales.subExentas}</td>
            <td className={`${celda} text-right tabular-nums`}>{m.totales.sub5}</td>
            <td className={`${celda} text-right tabular-nums`}>{m.totales.sub10}</td>
          </tr>
          <tr className="font-bold">
            <td colSpan={8} className={`${celda} text-right`}>
              TOTAL A PAGAR
            </td>
            <td className={`${celda} text-right tabular-nums`}>{m.totales.totalOperacion}</td>
          </tr>
          <tr>
            <td colSpan={8} className={`${celda} text-right`}>
              Total en guaraníes
            </td>
            <td className={`${celda} text-right tabular-nums`}>{m.totales.totalGuaranies}</td>
          </tr>
          <tr>
            <td colSpan={9} className={celda}>
              Liquidación del IVA: (5%) {m.totales.liquidacion5} · (10%) {m.totales.liquidacion10} · Total IVA:{" "}
              <strong>{m.totales.totalIva}</strong>
              {m.totales.descuento !== "0" ? ` · Descuento total: ${m.totales.descuento}` : ""}
            </td>
          </tr>
        </tfoot>
      </table>

      {m.pagos.length > 0 && (
        <p className="mt-1">
          Forma de pago: {m.pagos.map((p) => `${p.forma} ${p.monto}`).join(" · ")}
        </p>
      )}

      <div className="mt-3 border-t border-black pt-2 text-center">
        <p>Consulte la validez de este documento electrónico con el número de CDC impreso abajo en:</p>
        <p className="font-bold">{m.urlConsulta}</p>
        <p className="mt-1 font-mono text-[13px] font-bold tracking-wider">{m.cdcAgrupado}</p>
      </div>
    </div>
  );
}

export function Kude({ modelo, formato }: { modelo: ModeloKude; formato: FormatoKude }) {
  return formato === "cinta" ? <Cinta modelo={modelo} /> : <Carta modelo={modelo} />;
}
