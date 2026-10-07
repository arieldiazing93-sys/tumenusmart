import { notFound } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { lineasDeFacturaDeCuenta } from "@/lib/factura-de-cuenta";
import { ImprimirAuto } from "@/components/ImprimirAuto";

export const dynamic = "force-dynamic";

// El papel de la impresora es de 75mm, con 4mm de margen de cada lado: 67mm imprimibles (igual que el ticket de las ventas).
const ESTILOS_IMPRESION = `
  @page { size: 75mm auto; margin: 4mm; }
  @media print {
    html, body { width: 67mm; background: #fff; }
  }
`;

/**
 * La factura de una cuenta de delivery emitida con la "factura rápida" (antes de cobrar), para verla o imprimirla a mano desde el
 * navegador cuando no salió sola en la impresora. Es el mismo texto que sale por la impresora, en el mismo ancho. `[id]` es el id de la
 * CUENTA de delivery.
 */
export default async function FacturaDeCuentaDeliveryPage({ params }: { params: Promise<{ id: string }> }) {
  await pantallaConPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);
  const { id } = await params;

  const lineas = await lineasDeFacturaDeCuenta(db, storeId, id);
  if (!lineas) notFound();

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ESTILOS_IMPRESION }} />
      <div className="mx-auto max-w-[75mm] font-mono text-[9px] leading-tight text-black">
        {/* Sin imprimir sola: puede abrirse solo para mirarla. El botón imprime. */}
        <ImprimirAuto automatico={false} />
        <pre className="whitespace-pre font-mono">{lineas.join("\n")}</pre>
      </div>
    </>
  );
}
