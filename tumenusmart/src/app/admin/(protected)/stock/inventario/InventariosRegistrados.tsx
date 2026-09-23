"use client";

import { MaestroDetalle } from "@/components/MaestroDetalle";
import { Pastilla } from "@/components/ui";
import { DetalleInventarioPanel } from "./DetalleInventarioPanel";

export type InventarioFila = {
  id: string;
  /** Siempre true: es lo que pide la lista de dos paneles para saber qué filas atenuar. */
  activo: boolean;
  /** "23/09/2026 14:32". */
  fecha: string;
  almacen: string;
  categorias: string;
  contados: number;
  conDiferencia: number;
};

/**
 * El historial de inventarios guardados: a la izquierda la lista, con doble
 * clic en uno se abre a la derecha lo que se registró en él. Es solo para
 * consultar — un inventario guardado no se edita.
 */
export function InventariosRegistrados({ inventarios }: { inventarios: InventarioFila[] }) {
  return (
    <MaestroDetalle
      items={inventarios}
      columnas={[
        {
          titulo: "Fecha",
          celda: (i) => (
            <>
              <span className="font-medium">{i.fecha}</span>
              {i.categorias && (
                <span className="block max-w-[11rem] truncate text-xs text-tinta-suave" title={i.categorias}>
                  {i.categorias}
                </span>
              )}
            </>
          ),
        },
        { titulo: "Almacén", celda: (i) => i.almacen },
        {
          titulo: "Con dif.",
          derecha: true,
          celda: (i) => (
            <Pastilla color={i.conDiferencia === 0 ? "exito" : "aviso"}>
              {i.conDiferencia === 0 ? "Ninguna" : i.conDiferencia}
            </Pastilla>
          ),
        },
      ]}
      textoVacio="Todavía no registraste ningún inventario. Hacé el primero con el botón + Nuevo inventario."
      textoPlaceholder="Hacé doble clic en un inventario de la lista para ver lo que se registró: el stock del sistema, lo que contaste y la diferencia."
      renderPanel={(inventario) => <DetalleInventarioPanel id={inventario.id} />}
    />
  );
}
