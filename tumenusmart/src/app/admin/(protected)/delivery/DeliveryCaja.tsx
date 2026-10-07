"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MaestroDetalle } from "@/components/MaestroDetalle";
import { Boton, Pastilla } from "@/components/ui";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { textoEstadoCuenta } from "@/lib/comedor";
import { textoSinEnlaces } from "@/lib/ubicacion-mapa";
import { Hace } from "../comedor/tiempo";
import { AbrirCuentaDeliveryPanel } from "./AbrirCuentaDeliveryPanel";
import { DetalleCuentaDelivery } from "./DetalleCuentaDelivery";
import { FacturaRapidaDeliveryPanel } from "./FacturaRapidaDeliveryPanel";
import { PagarCuentaDeliveryPanel } from "./PagarCuentaDeliveryPanel";
import type { ContextoDelivery, CuentaDeliveryFila } from "./tipos-delivery";

/**
 * Las cuentas de delivery en una columna, fila por fila; con doble clic en una se abre a la derecha todo lo que compone su cuenta y
 * los botones para operarla (ver DetalleCuentaDelivery). El panel de cobro vive acá y no dentro del detalle: al cobrarse, la cuenta
 * desaparece de la lista, y el cobro tiene que poder mostrar su comprobante igual.
 */
export function DeliveryCaja({ cuentas, contexto }: { cuentas: CuentaDeliveryFila[]; contexto: ContextoDelivery }) {
  const router = useRouter();
  // Una copia de la cuenta que se está cobrando: sigue ahí aunque la lista se actualice y la cuenta ya no esté.
  const [cobrando, setCobrando] = useState<CuentaDeliveryFila | null>(null);
  // Lo mismo para la "factura rápida": el panel sigue ahí aunque la lista se actualice al emitirse la factura.
  const [facturando, setFacturando] = useState<CuentaDeliveryFila | null>(null);
  // La caja está abriendo una cuenta (carga los datos del cliente y su dirección, y después los productos) y lo que se avisa al terminar.
  const [abriendo, setAbriendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  return (
    <>
      {contexto.puedeGestionar && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[0.8rem] text-tinta-media">
            ¿Entró un pedido por WhatsApp o por teléfono? Abrí la cuenta desde acá: puede haber varias abiertas a la vez.
          </p>
          <Boton
            tono="nuevo"
            tam="md"
            onClick={() => {
              setAviso(null);
              setAbriendo(true);
            }}
          >
            Abrir cuenta
          </Boton>
        </div>
      )}
      {aviso && <p className="rounded-lg bg-exito-luz px-3 py-2 text-[0.84rem] font-medium text-exito">{aviso}</p>}

      <MaestroDetalle
        items={cuentas}
        cerrarSiDesaparece
        textoVacio="No hay cuentas de delivery abiertas. Cuando abras una con “Abrir cuenta”, aparece acá."
        textoPlaceholder="Hacé doble clic en una cuenta para ver todo lo que la compone y operarla: cargar productos, dar un descuento, imprimirla, mandarla con el repartidor o cobrarla."
        columnas={[
          {
            titulo: "Cuenta",
            celda: (c) => (
              <div className="flex flex-col gap-0.5">
                <span className="text-[0.95rem] font-semibold text-tinta">
                  {formatearNumero(c.numero)} · {c.clienteNombre}
                </span>
                <span className="text-[0.74rem] text-tinta-suave">
                  {c.zonaNombre} · <Hace iso={c.abiertaEn} />
                </span>
                {c.direccion && textoSinEnlaces(c.direccion) && (
                  <span className="max-w-[16rem] truncate text-[0.74rem] text-tinta-suave">{textoSinEnlaces(c.direccion)}</span>
                )}
                <span className="mt-0.5 flex flex-wrap items-center gap-1">
                  {/* Asignar al repartidor ya lo manda a trabajar: no hay "salió" ni "entregado" que marcar. */}
                  {c.repartidor ? (
                    <Pastilla color="azul" punto>
                      🛵 {c.repartidor}
                    </Pastilla>
                  ) : (
                    <Pastilla color="neutro">Sin repartidor</Pastilla>
                  )}
                  {c.estado === "por_cobrar" && <Pastilla color="amarillo">{textoEstadoCuenta(c.estado)}</Pastilla>}
                  {/* Con la factura ya emitida y la venta sin registrar: se ve en la lista, para no olvidarse de cobrarla. */}
                  {c.factura && <Pastilla color="azul">Factura {c.factura.numero}</Pastilla>}
                </span>
              </div>
            ),
          },
          {
            titulo: "Total",
            derecha: true,
            celda: (c) => <span className="cifra font-semibold text-tinta">{formatearGuarani(c.totales.total)}</span>,
          },
        ]}
        renderPanel={(c) => (
          <DetalleCuentaDelivery cuenta={c} contexto={contexto} onCobrar={() => setCobrando(c)} onFacturar={() => setFacturando(c)} />
        )}
      />

      {cobrando && contexto.cobro.ok && (
        <PagarCuentaDeliveryPanel cuenta={cobrando} cobro={contexto.cobro} onCerrar={() => setCobrando(null)} />
      )}

      {facturando && contexto.facturaRapida.ok && (
        <FacturaRapidaDeliveryPanel
          cuenta={facturando}
          diasParaVencerTimbrado={contexto.facturaRapida.diasParaVencerTimbrado}
          nombreImpresora={contexto.facturaRapida.nombreImpresoraTicket}
          onCerrar={() => setFacturando(null)}
        />
      )}

      {abriendo && (
        <AbrirCuentaDeliveryPanel
          contexto={contexto}
          onCerrar={() => setAbriendo(false)}
          onAbierta={(numero, areas, conProductos) => {
            setAbriendo(false);
            setAviso(
              !conProductos
                ? `Cuenta ${formatearNumero(numero)} abierta sin productos: cargáselos desde su detalle.`
                : areas.length > 0
                  ? `Cuenta ${formatearNumero(numero)} abierta: la comanda salió a ${areas.join(" y ")}.`
                  : `Cuenta ${formatearNumero(numero)} abierta. Ningún producto tiene un área de impresión asignada, así que no salió ninguna comanda.`
            );
            router.refresh();
          }}
        />
      )}
    </>
  );
}
