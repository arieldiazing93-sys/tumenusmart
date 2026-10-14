import { pantallaConPermiso } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { BotonEnlace, Cabecera, Tarjeta } from "@/components/ui";
import { REPORTES_CONTABLES } from "@/lib/libro-iva";

export const dynamic = "force-dynamic";

/**
 * Contabilidad: la entrada a los reportes que necesita el contador del negocio — el Libro IVA de ventas, el Libro IVA de compras, el
 * resumen del IVA del mes y el archivo RG 90 para Marangatú. Cada uno vive en su propia pantalla (ver [reporte]/page.tsx).
 */
export default async function ContabilidadPage() {
  const sesion = await pantallaConPermiso("pos.verHistorico");
  const conCompras = puede(sesion.rol, "stock.ver");

  return (
    <div className="flex flex-col gap-4">
      <Cabecera
        titulo="Contabilidad"
        bajada="Los libros de IVA, el resumen del mes y el registro de comprobantes para la DNIT, armados con lo que ya cargaste en el sistema."
      />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {REPORTES_CONTABLES.filter((r) => r.valor === "libro-ventas" || conCompras).map((r) => (
          <Tarjeta key={r.valor} className="flex flex-col gap-3 !border-2 !border-azul/50">
            <div>
              <h2 className="text-[1rem] font-semibold tracking-titular text-tinta">{r.titulo}</h2>
              <p className="mt-1 text-[0.85rem] leading-snug text-tinta-media">{r.bajada}</p>
            </div>
            <div>
              <BotonEnlace href={`/admin/contabilidad/${r.valor}`} tono="navegar" tam="md">
                Abrir
              </BotonEnlace>
            </div>
          </Tarjeta>
        ))}
      </div>
    </div>
  );
}
