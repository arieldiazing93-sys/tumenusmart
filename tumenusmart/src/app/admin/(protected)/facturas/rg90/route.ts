import { NextRequest, NextResponse } from "next/server";
import { sesionActual } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { idLocalActual } from "@/lib/local-actual";
import { armarRegistroRg90, type SiNo } from "@/lib/registro-rg90";

export const dynamic = "force-dynamic";

const MES = /^(\d{4})-(0[1-9]|1[0-2])$/;

function siNo(valor: string | null, porDefecto: SiNo): SiNo {
  return valor === "S" || valor === "N" ? valor : porDefecto;
}

/**
 * Baja el registro de comprobantes de VENTAS de un mes en el formato de
 * importación de la DNIT (Resolución General N° 90/2021, Sistema Marangatú):
 * un .zip con el archivo .csv o .txt adentro, con el nombre que pide la DNIT.
 * Ver src/lib/registro-rg90.ts para el detalle del formato.
 *
 * Si no se puede armar un archivo completo, no baja nada: vuelve a Facturas con
 * un aviso de qué pasó. Un archivo de impuestos al que le faltan comprobantes
 * sin avisar es peor que no tenerlo.
 */
export async function GET(request: NextRequest) {
  // Ruta de API: no pasa por el layout del panel, así que valida la sesión y
  // el permiso por su cuenta.
  const sesion = await sesionActual();
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!puede(sesion.rol, "pos.verHistorico")) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const volver = (aviso: string, extra: Record<string, string> = {}) =>
    NextResponse.redirect(new URL(`/admin/facturas?${new URLSearchParams({ rg90: aviso, ...extra })}`, request.url));

  const mes = MES.exec(searchParams.get("mes") ?? "");
  if (!mes) return volver("mes_invalido");

  const imputaIva = siNo(searchParams.get("iva"), "S");
  const imputaIre = siNo(searchParams.get("ire"), "N");
  const imputaIrpRsp = siNo(searchParams.get("irp"), "N");
  // Un comprobante tiene que imputarse al menos a una obligación.
  if (imputaIva === "N" && imputaIre === "N" && imputaIrpRsp === "N") return volver("sin_imputacion", { mes: mes[0] });

  const primerArchivo = Math.min(9999, Math.max(1, parseInt(searchParams.get("archivo") ?? "1", 10) || 1));

  const storeId = await idLocalActual();
  const resultado = await armarRegistroRg90(storeId, {
    anio: Number(mes[1]),
    mes: Number(mes[2]),
    imputaIva,
    imputaIre,
    imputaIrpRsp,
    formato: searchParams.get("formato") === "txt" ? "txt" : "csv",
    primerArchivo,
  });

  if (!resultado.ok) {
    if (resultado.motivo === "incompletas") {
      const lista = resultado.detalle.slice(0, 10).join(", ");
      const resto = resultado.detalle.length > 10 ? ` y ${resultado.detalle.length - 10} más` : "";
      return volver("incompletas", { mes: mes[0], detalle: `${lista}${resto}` });
    }
    return volver(resultado.motivo, { mes: mes[0] });
  }

  // Una copia con su propio buffer, del tamaño exacto, para la respuesta.
  const copia = new Uint8Array(resultado.zip);
  return new NextResponse(copia.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${resultado.nombreZip}"`,
    },
  });
}
