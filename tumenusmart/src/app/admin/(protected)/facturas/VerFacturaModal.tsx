"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Pastilla } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { CancelarFacturaBoton } from "./CancelarFacturaBoton";

/**
 * Vista previa de una factura de la lista, en modal — antes de decidir
 * anularla, el dueño ve primero de qué cuenta se trata (cliente, monto,
 * origen) en grande, en vez de jugarse el botón "Anular" directo desde la
 * fila. La acción de anular vive ADENTRO, reusando CancelarFacturaBoton tal
 * cual: arranca colapsado en un botón, y si la anulación sale bien,
 * router.refresh() actualiza el estado acá mismo (la fila de atrás queda al
 * día, y el botón de anular desaparece solo porque ya no aplica).
 */
export function VerFacturaModal({
  origen,
  id,
  facturaNumero,
  fecha,
  razonSocial,
  etiquetaIdentificacion,
  identificacion,
  total,
  origenLabel,
  href,
  cuentaAnulada,
  facturaAnulada,
  onCerrar,
}: {
  origen: "pedido" | "venta";
  id: string;
  facturaNumero: string;
  fecha: Date;
  razonSocial: string;
  etiquetaIdentificacion: string;
  identificacion: string;
  total: number;
  origenLabel: string;
  href: string;
  cuentaAnulada: boolean;
  facturaAnulada: boolean;
  onCerrar: () => void;
}) {
  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [onCerrar]);

  const anulada = cuentaAnulada || facturaAnulada;
  const ticketHref =
    origen === "pedido" ? `/admin/pedidos/${id}/ticket` : `/admin/pos/venta/${id}/ticket`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-tinta/45 sm:items-center sm:p-4"
      onClick={onCerrar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Factura ${facturaNumero}`}
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-white p-5 shadow-alta animate-[subirHoja_0.28s_cubic-bezier(0.22,0.7,0.3,1)] sm:max-w-sm sm:animate-[subir_0.22s_ease-out] sm:rounded-xl"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom, 0px))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto mb-3 block h-1 w-10 flex-none rounded-full bg-linea sm:hidden" />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.7rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
              Factura
            </p>
            <p className="cifra text-[1.1rem] font-semibold text-tinta">{facturaNumero}</p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-tinta-suave transition-colors hover:bg-papel-suave hover:text-tinta"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3 text-[0.85rem]">
          <div>
            {cuentaAnulada ? (
              <Pastilla color="peligro">Cuenta anulada</Pastilla>
            ) : facturaAnulada ? (
              <Pastilla color="aviso">Factura anulada</Pastilla>
            ) : (
              <Pastilla color="exito">Vigente</Pastilla>
            )}
          </div>

          <div>
            <p className="text-[0.7rem] uppercase tracking-rotulo text-tinta-suave">Fecha</p>
            <p className="text-tinta">
              {fecha.toLocaleString("es-PY", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
                timeZone: ZONA_NEGOCIO,
              })}
            </p>
          </div>

          <div>
            <p className="text-[0.7rem] uppercase tracking-rotulo text-tinta-suave">Cliente</p>
            <p className="text-tinta">{razonSocial}</p>
            <p className="text-tinta-suave">
              {etiquetaIdentificacion}: {identificacion}
            </p>
          </div>

          <div>
            <p className="text-[0.7rem] uppercase tracking-rotulo text-tinta-suave">Origen</p>
            <Link href={href} className="font-medium text-azul-oscuro hover:underline">
              {origenLabel}
            </Link>
          </div>

          <div>
            <p className="text-[0.7rem] uppercase tracking-rotulo text-tinta-suave">Monto</p>
            <p
              className={`cifra text-[1.15rem] font-semibold ${
                anulada ? "text-tinta-suave line-through" : "text-tinta"
              }`}
            >
              {formatearGuarani(total)}
            </p>
          </div>

          <a
            href={ticketHref}
            target="_blank"
            rel="noopener noreferrer"
            className="self-start text-[0.82rem] font-medium text-brand-texto underline"
          >
            Ver ticket completo / Imprimir
          </a>
        </div>

        {!anulada && (
          <div className="mt-4 border-t border-linea pt-4">
            <CancelarFacturaBoton origen={origen} id={id} facturaNumero={facturaNumero} />
          </div>
        )}
      </div>
    </div>
  );
}
