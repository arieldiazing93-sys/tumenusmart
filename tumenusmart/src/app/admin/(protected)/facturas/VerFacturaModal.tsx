"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Pastilla, clasesBoton } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { CancelarFacturaBoton } from "./CancelarFacturaBoton";
import { obtenerDetalleFactura, type DetalleFactura } from "./actions";

/**
 * Vista previa de una factura de la lista, en modal — antes de decidir
 * anularla, el dueño ve primero de qué cuenta se trata: cliente, monto,
 * origen, Y el contenido real (productos, desglose de IVA, emisor), todo
 * ACÁ ADENTRO — no un link que manda a abrir el ticket completo aparte
 * (esa pantalla además viene envuelta en todo el panel de administración,
 * pensada para imprimir un papel de 75mm, no para meterla en una ventanita).
 * El detalle se trae con obtenerDetalleFactura recién al abrir, porque la
 * lista no lo necesita para cada fila — solo cuando se lo pide.
 *
 * La acción de anular vive ADENTRO también, reusando CancelarFacturaBoton
 * tal cual: arranca colapsado en un botón, y si la anulación sale bien,
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
  reemplazadaPor,
  motivoAnulacion,
  anuladaPor,
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
  /** Solo si esta fila es un N° viejo ya remitido a uno nuevo. */
  reemplazadaPor: string | null;
  motivoAnulacion: string | null;
  anuladaPor: string | null;
  onCerrar: () => void;
}) {
  const [detalle, setDetalle] = useState<DetalleFactura | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(true);

  useEffect(() => {
    function alTeclado(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [onCerrar]);

  useEffect(() => {
    let vigente = true;
    obtenerDetalleFactura(origen, id).then((d) => {
      if (vigente) {
        setDetalle(d);
        setCargandoDetalle(false);
      }
    });
    return () => {
      vigente = false;
    };
  }, [origen, id]);

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
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-white p-5 shadow-alta animate-[subirHoja_0.28s_cubic-bezier(0.22,0.7,0.3,1)] sm:max-w-2xl sm:animate-[subir_0.22s_ease-out] sm:rounded-xl"
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

        <div className="mt-4 flex flex-col gap-4 sm:grid sm:grid-cols-2 sm:items-start sm:gap-x-6">
        <div className="flex flex-col gap-3 text-[0.85rem]">
          <div>
            {reemplazadaPor ? (
              <Pastilla color="neutro">Reemplazada</Pastilla>
            ) : cuentaAnulada ? (
              <Pastilla color="peligro">Cuenta anulada</Pastilla>
            ) : facturaAnulada ? (
              <Pastilla color="aviso">Factura anulada</Pastilla>
            ) : (
              <Pastilla color="exito">Vigente</Pastilla>
            )}
          </div>

          {reemplazadaPor && (
            <div className="rounded-lg border border-linea bg-papel-suave p-2.5">
              <p className="text-tinta">
                Este número fue anulado y reemplazado por la factura N° {reemplazadaPor}.
              </p>
              {motivoAnulacion && (
                <p className="mt-1 text-tinta-suave">Motivo: {motivoAnulacion}</p>
              )}
              {anuladaPor && (
                <p className="mt-1 text-[0.78rem] text-tinta-suave">
                  Anulado por {anuladaPor} el{" "}
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
              )}
            </div>
          )}

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
            <p className="mb-1 text-[0.7rem] uppercase tracking-rotulo text-tinta-suave">Origen</p>
            <Link href={href} className={clasesBoton("navegar", "sm")}>
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
        </div>

        <div className="border-t border-linea pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
          <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
            Contenido de la factura
          </p>

          {cargandoDetalle ? (
            <p className="text-[0.82rem] text-tinta-suave">Cargando…</p>
          ) : !detalle ? (
            <p className="text-[0.82rem] text-tinta-suave">No se pudo cargar el detalle.</p>
          ) : (
            <div className="flex flex-col gap-3 text-[0.85rem]">
              {detalle.facturaRazonSocialEmisor && (
                <div>
                  <p className="text-tinta">{detalle.facturaRazonSocialEmisor}</p>
                  <p className="text-[0.78rem] text-tinta-suave">
                    RUC: {detalle.facturaRucEmisor}
                    {detalle.facturaTimbrado && ` · Timbrado: ${detalle.facturaTimbrado}`}
                  </p>
                  {detalle.facturaVencimiento && (
                    <p className="text-[0.78rem] text-tinta-suave">
                      Vence:{" "}
                      {detalle.facturaVencimiento.toLocaleDateString("es-PY", { timeZone: ZONA_NEGOCIO })}
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                {detalle.items.map((it, i) => (
                  <div key={i} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-tinta">
                        {it.cantidad}x {it.nombreProducto}
                      </p>
                      {it.opcionesTexto && (
                        <p className="text-[0.78rem] text-tinta-suave">{it.opcionesTexto}</p>
                      )}
                    </div>
                    <span className="cifra flex-none font-medium text-tinta">
                      {formatearGuarani(it.cantidad * it.precioUnitario)}
                    </span>
                  </div>
                ))}
              </div>

              {(detalle.facturaGravado10 > 0 ||
                detalle.facturaGravado5 > 0 ||
                detalle.facturaExento > 0) && (
                <div className="flex flex-col gap-1 border-t border-linea-fina pt-2.5">
                  {detalle.facturaGravado10 > 0 && (
                    <div className="flex justify-between text-tinta-media">
                      <span>Gravadas 10%</span>
                      <span className="cifra">{formatearGuarani(detalle.facturaGravado10)}</span>
                    </div>
                  )}
                  {detalle.facturaGravado5 > 0 && (
                    <div className="flex justify-between text-tinta-media">
                      <span>Gravadas 5%</span>
                      <span className="cifra">{formatearGuarani(detalle.facturaGravado5)}</span>
                    </div>
                  )}
                  {detalle.facturaExento > 0 && (
                    <div className="flex justify-between text-tinta-media">
                      <span>Exentas</span>
                      <span className="cifra">{formatearGuarani(detalle.facturaExento)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-medium text-tinta">
                    <span>Total IVA</span>
                    <span className="cifra">
                      {formatearGuarani(detalle.facturaIva10 + detalle.facturaIva5)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          <a
            href={ticketHref}
            target="_blank"
            rel="noopener noreferrer"
            className={`mt-3 inline-block ${clasesBoton("navegar", "sm")}`}
          >
            Abrir para imprimir
          </a>
        </div>
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
