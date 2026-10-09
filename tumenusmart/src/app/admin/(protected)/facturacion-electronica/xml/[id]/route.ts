import { negarSiNoPuede } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { obtenerDocumentoFirmado } from "@/lib/sifen/servidor";

export const dynamic = "force-dynamic";

/** Descarga el XML firmado de un documento electrónico (solo de su propio local y solo con permiso). */
export async function GET(_pedido: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const negado = await negarSiNoPuede("facturacion.configurar");
  if (negado) return negado;
  const { id } = await params;
  const storeId = await idLocalActual();
  const documento = await obtenerDocumentoFirmado(storeId, id);
  if (!documento) return new Response("No encontrado", { status: 404 });

  return new Response(documento.xmlFirmado, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${documento.cdc}.xml"`,
      "Cache-Control": "private, no-store",
    },
  });
}
