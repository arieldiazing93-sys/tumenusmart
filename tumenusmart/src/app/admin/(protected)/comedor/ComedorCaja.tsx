"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MaestroDetalle } from "@/components/MaestroDetalle";
import { Boton, Pastilla } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";
import { textoEstadoCuenta, type TotalesDeCuenta } from "@/lib/comedor";
import type { CategoriaVenta, GrupoMitadVenta } from "@/lib/catalogo-venta";
import { AbrirCuentaPanel } from "./AbrirCuentaPanel";
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
  /** Si la cuenta nació de dividir otra: la mesa original ("1" para la cuenta "1-A"). */
  mesaBase: string | null;
  /** "abierta" | "por_cobrar" */
  estado: string;
  mozo: string;
  /** El mozo a cargo (su id): la propina que se deja al cobrar se le anota a él por defecto. */
  mozoId: string;
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
  /** Para ABRIR una cuenta desde la caja: los mozos activos, las mesas del salón (con su sector) y cuáles están ocupadas. */
  apertura: {
    mozos: { id: string; nombre: string }[];
    /** Las mesas activas que cargó el local. Vacío = el local no cargó mesas: la mesa se escribe a mano. */
    mesas: { nombre: string; sectorId: string | null; ocupada: boolean }[];
    sectores: { id: string; nombre: string }[];
    /** Las mesas que tienen una cuenta abierta ahora (para avisar cuando se escribe una a mano). */
    mesasOcupadas: string[];
  };
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
    /** `sinTurno`: lo único que falta es abrir el turno de caja: "Pagar cuenta" lleva directo a abrirlo (src/lib/turno-requerido.ts). */
    | { ok: false; motivo: string; sinTurno?: boolean };
};

/**
 * Las mesas en una columna, fila por fila; con doble clic en una se abre a la derecha todo lo que compone su cuenta y los
 * botones para operarla (ver DetalleCuenta). El panel de cobro vive acá y no dentro del detalle: cuando la cuenta se paga
 * desaparece de la lista, y el cobro tiene que poder mostrar su comprobante igual.
 */
export function ComedorCaja({ cuentas, contexto }: { cuentas: CuentaCajaFila[]; contexto: ContextoCaja }) {
  const router = useRouter();
  // Una copia de la cuenta que se está cobrando: sigue ahí aunque la lista se actualice y la cuenta ya no esté.
  const [cobrando, setCobrando] = useState<CuentaCajaFila | null>(null);
  // La caja está abriendo una cuenta (elige mesa y mozo, y carga los productos) y lo que se avisa al terminar.
  const [abriendo, setAbriendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const filas = cuentas.map((c) => ({ ...c, activo: true }));

  return (
    <>
      {contexto.puedeGestionar && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[0.8rem] text-tinta-media">
            ¿El mozo no está o el cliente pide en la caja? Abrí la cuenta desde acá.
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
        items={filas}
        cerrarSiDesaparece
        textoVacio="No hay mesas abiertas. Cuando un mozo abra una mesa y envíe un pedido, o la abras vos con “Abrir cuenta”, la cuenta aparece acá."
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
        <PagarCuentaPanel
          cuenta={cobrando}
          cobro={contexto.cobro}
          mozos={contexto.apertura.mozos}
          onCerrar={() => setCobrando(null)}
        />
      )}

      {abriendo && (
        <AbrirCuentaPanel
          contexto={contexto}
          onCerrar={() => setAbriendo(false)}
          onAbierta={(mesa, areas) => {
            setAbriendo(false);
            setAviso(
              areas.length > 0
                ? `Cuenta de la mesa ${mesa} abierta: la comanda salió a ${areas.join(" y ")}.`
                : `Cuenta de la mesa ${mesa} abierta. Ningún producto tiene un área de impresión asignada, así que no salió ninguna comanda.`
            );
            router.refresh();
          }}
        />
      )}
    </>
  );
}
