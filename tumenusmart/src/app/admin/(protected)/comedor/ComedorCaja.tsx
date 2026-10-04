"use client";

import { useState } from "react";
import { MaestroDetalle } from "@/components/MaestroDetalle";
import { Pastilla } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";
import { textoEstadoCuenta, type TotalesDeCuenta } from "@/lib/comedor";
import type { CategoriaVenta, GrupoMitadVenta } from "@/lib/catalogo-venta";
import { DetalleCuenta } from "./DetalleCuenta";
import { PagarCuentaPanel } from "./PagarCuentaPanel";
import { Hace } from "./tiempo";

export type ItemCuentaFila = {
  id: string;
  ronda: number;
  enviadoEn: string;
  cantidad: number;
  nombre: string;
  opciones: string | null;
  quitados: string | null;
  nota: string | null;
  precioUnitario: number;
  anulado: boolean;
  motivoAnulacion: string | null;
  anuladoPor: string | null;
  /** El usuario de la caja que lo cargó desde el panel; null si lo envió el mozo. */
  cargadoPor: string | null;
  mozo: string;
};


export type CuentaCajaFila = {
  id: string;
  numero: number;
  mesa: string;
  /** "abierta" | "por_cobrar" */
  estado: string;
  mozo: string;
  abiertaEn: string;
  comensales: number | null;
  impresaEn: string | null;
  descuento: { tipo: "porcentaje" | "monto"; valor: number; motivo: string; por: string } | null;
  totales: TotalesDeCuenta;
  items: ItemCuentaFila[];
};

/** Lo que hace falta saber de esta computadora y de esta persona para operar las cuentas. */
export type ContextoCaja = {
  puedeGestionar: boolean;
  puedeCobrar: boolean;
  categorias: CategoriaVenta[];
  gruposMitad: GrupoMitadVenta[];
  /** Si esta computadora puede imprimir la cuenta (estación con impresora para el ticket) o por qué no. */
  imprimirCuenta: { ok: true } | { ok: false; motivo: string };
  /** Si se puede cobrar desde acá (estación con turno abierto) y con qué comprobantes, o por qué no. */
  cobro:
    | {
        ok: true;
        puedeFacturar: boolean;
        diasParaVencerTimbrado: number | null;
        facturaObligatoria: boolean;
        nombreImpresoraTicket: string | null;
        /** Si el local vende a crédito (Configuración): el cobro ofrece "A crédito". */
        permiteCredito: boolean;
      }
    | { ok: false; motivo: string };
};

/**
 * Las mesas en una columna, fila por fila; con doble clic en una se abre a la derecha todo lo que compone su cuenta y los
 * botones para operarla (ver DetalleCuenta). El panel de cobro vive acá y no dentro del detalle: cuando la cuenta se paga
 * desaparece de la lista, y el cobro tiene que poder mostrar su comprobante igual.
 */
export function ComedorCaja({ cuentas, contexto }: { cuentas: CuentaCajaFila[]; contexto: ContextoCaja }) {
  // Una copia de la cuenta que se está cobrando: sigue ahí aunque la lista se actualice y la cuenta ya no esté.
  const [cobrando, setCobrando] = useState<CuentaCajaFila | null>(null);

  const filas = cuentas.map((c) => ({ ...c, activo: true }));

  return (
    <>
      <MaestroDetalle
        items={filas}
        cerrarSiDesaparece
        textoVacio="No hay mesas abiertas. Cuando un mozo abra una mesa y envíe un pedido, la cuenta aparece acá."
        textoPlaceholder="Hacé doble clic en una mesa para ver su cuenta y operarla: cargar productos, dar un descuento, imprimir la cuenta o cobrarla."
        columnas={[
          {
            titulo: "Mesa",
            celda: (c) => (
              <div className="flex flex-col gap-0.5">
                <span className="text-[0.95rem] font-semibold text-tinta">Mesa {c.mesa}</span>
                <span className="text-[0.74rem] text-tinta-suave">
                  {c.mozo} · <Hace iso={c.abiertaEn} />
                </span>
                {c.estado === "por_cobrar" && (
                  <span className="mt-0.5">
                    <Pastilla color="amarillo" punto>
                      {textoEstadoCuenta(c.estado)}
                    </Pastilla>
                  </span>
                )}
              </div>
            ),
          },
          {
            titulo: "Total",
            derecha: true,
            celda: (c) => <span className="cifra font-semibold text-tinta">{formatearGuarani(c.totales.total)}</span>,
          },
        ]}
        renderPanel={(c) => <DetalleCuenta cuenta={c} contexto={contexto} onCobrar={() => setCobrando(c)} />}
      />

      {cobrando && contexto.cobro.ok && (
        <PagarCuentaPanel cuenta={cobrando} cobro={contexto.cobro} onCerrar={() => setCobrando(null)} />
      )}
    </>
  );
}
