import { notFound } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { BotonEnlace } from "@/components/ui";
import { ImprimirAuto } from "@/components/ImprimirAuto";
import { construirKude, type ModeloKude } from "@/lib/sifen/kude";
import { obtenerDocumentoFirmado } from "@/lib/sifen/servidor";
import { ESTILOS_KUDE, Kude, type FormatoKude } from "../Kude";

export const dynamic = "force-dynamic";

/**
 * El comprobante impreso (KuDE) de un documento electrónico firmado, en cinta de 75 mm o en hoja A4. Se arma leyendo el
 * XML firmado que se guardó: lo que se ve es lo que se firmó.
 */
export default async function KudePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ formato?: string }>;
}) {
  await pantallaConPermiso("facturacion.configurar");
  const { id } = await params;
  const { formato: formatoPedido } = await searchParams;
  const formato: FormatoKude = formatoPedido === "carta" ? "carta" : "cinta";

  const documento = await obtenerDocumentoFirmado(await idLocalActual(), id);
  if (!documento) return notFound();

  let modelo: ModeloKude | null = null;
  try {
    modelo = construirKude(documento.xmlFirmado);
  } catch {
    modelo = null;
  }
  if (!modelo) return notFound();

  return (
    <div className="py-4">
      <style>{ESTILOS_KUDE[formato]}</style>
      <div className="mb-3 flex flex-wrap items-center justify-center gap-2 print:hidden">
        <BotonEnlace href={`/admin/facturacion-electronica/kude/${id}?formato=cinta`} tono={formato === "cinta" ? "navegar" : "suave"} tam="sm">
          Ticket 75 mm
        </BotonEnlace>
        <BotonEnlace href={`/admin/facturacion-electronica/kude/${id}?formato=carta`} tono={formato === "carta" ? "navegar" : "suave"} tam="sm">
          Hoja A4
        </BotonEnlace>
        <BotonEnlace href="/admin/facturacion-electronica" tono="navegar" tam="sm">
          Volver
        </BotonEnlace>
      </div>
      <ImprimirAuto automatico={false} />
      <Kude modelo={modelo} formato={formato} />
    </div>
  );
}
