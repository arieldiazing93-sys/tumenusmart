"use client";

import { usePathname } from "next/navigation";
import { BotonEnlace } from "@/components/ui";
import { useMotorImpresion } from "@/lib/motor-impresion";

/**
 * Mantiene andando la impresión automática de comandas en cualquier sección del panel (el layout lo monta solo en la
 * computadora de la caja, la que está vinculada a una estación con impresoras), y avisa con una franja arriba SOLO cuando
 * algo impide imprimir: así el operador, que está en el Punto de venta y no mirando la cola, se entera a tiempo.
 */
export function MotorImpresion() {
  const { qz, fallo } = useMotorImpresion();
  const ruta = usePathname();

  // La pantalla "Impresión automática" ya muestra el detalle: no se repite el aviso encima.
  if (ruta?.startsWith("/admin/impresion")) return null;

  const problema =
    qz === "error"
      ? "No se conecta con QZ Tray en esta computadora: abrilo para que salgan las comandas."
      : fallo;
  if (!problema) return null;

  return (
    <div className="border-b border-amarillo/60 bg-amarillo-luz print:hidden">
      <div className="mx-auto flex max-w-[92rem] flex-wrap items-center justify-between gap-2 px-4 py-2">
        <p className="text-[0.84rem] text-amarillo-oscuro">
          <strong className="font-semibold">Las comandas del comedor no se están imprimiendo.</strong> {problema}
        </p>
        <BotonEnlace href="/admin/impresion" tono="navegar" tam="sm">
          Ver impresión
        </BotonEnlace>
      </div>
    </div>
  );
}
