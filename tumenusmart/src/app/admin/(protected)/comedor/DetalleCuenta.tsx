"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Campo, Entrada, MensajeError, Pastilla, Tarjeta, clasesBoton } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { Segmentado } from "@/components/Segmentado";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { textoEstadoCuenta } from "@/lib/comedor";
import { calcularDescuento, textoPorcentaje } from "@/lib/descuento-venta";
import { anularProducto, aplicarDescuento, cancelarCuenta, imprimirCuenta, reabrirCuenta } from "./actions";
import type { ContextoCaja, CuentaCajaFila, ItemCuentaFila } from "./ComedorCaja";
import { CargarProductosPanel } from "./CargarProductosPanel";
import { Hace, HoraDe } from "./tiempo";

const ROTULO = "text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave";

type Dialogo = { tipo: "anular"; item: ItemCuentaFila } | { tipo: "cancelar" } | { tipo: "descuento" } | null;

/**
 * Todo lo que compone la cuenta de una mesa (los pedidos que cargó cada mozo, producto por producto, con su descuento y su
 * total) y, arriba, lo que la caja puede hacer con ella: cargar productos, dar un descuento, imprimir la cuenta, reabrirla,
 * cobrarla, y cerrarla solo si quedó vacía. Cancelar un producto o cerrar la cuenta siempre pide un motivo. Una cuenta con
 * productos NO se cancela acá: se cobra y, si hace falta, se cancela la venta desde el Historial de cuentas.
 *
 * Una cuenta impresa (por cobrar) no admite cambios: el mozo ya no puede cargarle más y la caja tampoco, hasta reabrirla.
 */
export function DetalleCuenta({
  cuenta,
  contexto,
  onCobrar,
}: {
  cuenta: CuentaCajaFila;
  contexto: ContextoCaja;
  onCobrar: () => void;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [cargando, setCargando] = useState(false);

  const abierta = cuenta.estado === "abierta";
  const porCobrar = cuenta.estado === "por_cobrar";
  /** Todos sus productos se cancelaron: ya no hay nada que cobrar y la mesa se puede liberar. */
  const sinProductos = cuenta.items.every((i) => i.anulado);
  const t = cuenta.totales;

  /** Corre una acción del servidor y, si salió bien, actualiza la pantalla. Un fallo inesperado se explica igual. */
  function ejecutar(accion: () => Promise<{ ok: true } | { ok: false; error: string }>, alTerminar?: () => void) {
    setError(null);
    setAviso(null);
    iniciar(async () => {
      try {
        const r = await accion();
        if (!r.ok) {
          setError(r.error);
          return;
        }
        alTerminar?.();
        router.refresh();
      } catch {
        setError("No se pudo completar la acción. Revisá la conexión y probá de nuevo.");
      }
    });
  }

  function imprimir() {
    ejecutar(
      () => imprimirCuenta(cuenta.id),
      () => setAviso("La cuenta salió a la cola de impresión. La mesa quedó por cobrar: el mozo ya no puede cargarle más.")
    );
  }

  function reabrir() {
    ejecutar(
      () => reabrirCuenta(cuenta.id),
      () => setAviso("La cuenta se reabrió: ya se le pueden cargar más productos.")
    );
  }

  // Los pedidos, en el orden en que entraron.
  const rondas = new Map<number, ItemCuentaFila[]>();
  for (const i of cuenta.items) rondas.set(i.ronda, [...(rondas.get(i.ronda) ?? []), i]);

  return (
    <div className="flex flex-col gap-2">
      <Tarjeta padding={false} className="flex flex-col gap-2 !border-2 !border-azul/50 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-[1.15rem] font-semibold leading-tight tracking-titular text-tinta">Mesa {cuenta.mesa}</h2>
            <p className="text-[0.78rem] text-tinta-media">
              Cuenta {formatearNumero(cuenta.numero)} · a cargo de {cuenta.mozo}
              {cuenta.comensales ? ` · ${cuenta.comensales} personas` : ""} · <Hace iso={cuenta.abiertaEn} />
            </p>
          </div>
          <div className="flex flex-none flex-col items-end gap-0.5">
            <Pastilla color={porCobrar ? "amarillo" : "exito"} punto>
              {textoEstadoCuenta(cuenta.estado)}
            </Pastilla>
            <p className="cifra text-[1.35rem] font-bold leading-none text-tinta">{formatearGuarani(t.total)}</p>
            {t.descuento > 0 && (
              <p className="text-[0.72rem] text-tinta-media">
                {formatearGuarani(t.subtotal)} − desc. {formatearGuarani(t.descuento)}
                {t.porcentaje != null ? ` (${textoPorcentaje(t.porcentaje)}%)` : ""}
              </p>
            )}
          </div>
        </div>

        {porCobrar && cuenta.impresaEn && (
          <p className="text-[0.76rem] font-medium text-amarillo-oscuro">
            Cuenta impresa a las <HoraDe iso={cuenta.impresaEn} />: el mozo ya no puede cargarle productos.
          </p>
        )}
        {cuenta.descuento && (
          <p className="text-[0.76rem] text-tinta-media">
            <strong className="font-semibold text-tinta">Descuento</strong>: {cuenta.descuento.motivo}
            {cuenta.descuento.por ? ` — lo dio ${cuenta.descuento.por}` : ""}
          </p>
        )}
        {t.descuentoInvalido && (
          <p className="rounded-lg bg-peligro-luz px-2.5 py-1.5 text-[0.76rem] font-medium text-peligro">
            El descuento ya no corresponde a esta cuenta ({t.descuentoInvalido}) Cambialo o quitalo para poder imprimir y cobrar.
          </p>
        )}

        {/* ------------------------------------------------------------ lo que se puede hacer */}
        {contexto.puedeGestionar ? (
          <div className="flex flex-col gap-1.5 border-t border-linea pt-2">
            {/* Las funciones propias de esta pantalla van todas en el mismo celeste; solo cancelar es rojo. */}
            <div className="flex flex-wrap items-center gap-1.5">
              {abierta && (
                <button type="button" onClick={() => setCargando(true)} className={clasesBoton("navegar", "sm")}>
                  + Cargar productos
                </button>
              )}
              {abierta && (
                <button type="button" onClick={() => setDialogo({ tipo: "descuento" })} className={clasesBoton("navegar", "sm")}>
                  {cuenta.descuento ? "Cambiar descuento" : "Descuento"}
                </button>
              )}
              {porCobrar && (
                <button type="button" disabled={pendiente} onClick={reabrir} className={clasesBoton("navegar", "sm")}>
                  Reabrir cuenta
                </button>
              )}
              <button
                type="button"
                disabled={pendiente || !contexto.imprimirCuenta.ok || cuenta.items.every((i) => i.anulado)}
                onClick={imprimir}
                className={clasesBoton("navegar", "sm")}
              >
                {porCobrar ? "Imprimir otra copia" : "Imprimir cuenta"}
              </button>
              {contexto.puedeCobrar && (
                <button
                  type="button"
                  // Se cobra recién después de imprimir la cuenta (queda "por cobrar").
                  disabled={pendiente || !porCobrar || !contexto.cobro.ok || !!t.descuentoInvalido || t.total <= 0}
                  title={!porCobrar ? "Primero imprimí la cuenta" : undefined}
                  onClick={onCobrar}
                  className={clasesBoton("navegar", "sm")}
                >
                  Pagar cuenta
                </button>
              )}
              {/* Una cuenta CON productos no se cancela mientras se atiende (se cobra y, si hace falta, se cancela la venta desde
                  el Historial de cuentas). Solo se puede cerrar una cuenta que ya quedó vacía, para liberar la mesa. */}
              {sinProductos && (
                <button
                  type="button"
                  disabled={pendiente}
                  onClick={() => setDialogo({ tipo: "cancelar" })}
                  className={clasesBoton("peligro", "sm")}
                >
                  Cerrar cuenta vacía
                </button>
              )}
            </div>
            {!sinProductos && (
              <p className="text-[0.72rem] text-tinta-suave">
                Una cuenta con productos no se cancela mientras se atiende: se cobra y, si hace falta, se cancela la venta
                desde el Historial de cuentas.
              </p>
            )}
            {!contexto.imprimirCuenta.ok && contexto.imprimirCuenta.motivo && (
              <p className="text-[0.72rem] text-tinta-suave">No se puede imprimir desde acá: {contexto.imprimirCuenta.motivo}</p>
            )}
            {contexto.puedeCobrar && abierta && (
              <p className="text-[0.72rem] font-medium text-amarillo-oscuro">
                Para cobrar, primero imprimí la cuenta: “Pagar cuenta” se habilita cuando la cuenta ya está impresa.
              </p>
            )}
            {contexto.puedeCobrar && !contexto.cobro.ok && contexto.cobro.motivo && (
              <p className="text-[0.72rem] text-tinta-suave">No se puede cobrar desde acá: {contexto.cobro.motivo}</p>
            )}
            {porCobrar && (
              <p className="text-[0.72rem] text-tinta-suave">
                Para cargar más productos, dar un descuento o cancelar un producto, primero reabrí la cuenta.
              </p>
            )}
          </div>
        ) : (
          <p className="border-t border-linea pt-2 text-[0.76rem] text-tinta-suave">
            Solo podés mirar esta cuenta: para operarla hace falta el permiso de la caja.
          </p>
        )}

        {aviso && <p className="rounded-lg bg-exito-luz px-2.5 py-1.5 text-[0.78rem] font-medium text-exito">{aviso}</p>}
        {error && <MensajeError>{error}</MensajeError>}

        {/* ----------------------------------------------------------------------- los pedidos */}
        <div className="flex flex-col gap-2 border-t border-linea pt-2">
          {[...rondas.entries()].map(([ronda, items]) => (
            <section key={ronda}>
              <p className={ROTULO}>
                Pedido {ronda} · <HoraDe iso={items[0].enviadoEn} /> ·{" "}
                {items[0].cargadoPor ? `cargado en la caja por ${items[0].cargadoPor}` : items[0].mozo}
              </p>
              <ul className="mt-0.5 flex flex-col divide-y divide-linea-fina">
                {items.map((i) => (
                  <li key={i.id} className="flex items-start justify-between gap-2 py-1">
                    <div className={`min-w-0 text-[0.86rem] leading-snug ${i.anulado ? "text-tinta-suave" : "text-tinta"}`}>
                      <p className={i.anulado ? "line-through" : ""}>
                        <span className="font-semibold">{i.cantidad} ×</span> {i.nombre}
                      </p>
                      {i.opciones && <p className="text-[0.76rem] text-tinta-media">+ {i.opciones}</p>}
                      {i.quitados && <p className="text-[0.76rem] text-peligro">{i.quitados}</p>}
                      {i.nota && <p className="text-[0.76rem] text-tinta-media">“{i.nota}”</p>}
                      {i.anulado && (
                        <p className="text-[0.72rem] font-medium text-peligro">
                          Cancelado{i.anuladoPor ? ` por ${i.anuladoPor}` : ""}
                          {i.motivoAnulacion ? `: ${i.motivoAnulacion}` : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-none items-center gap-2">
                      <span
                        className={`cifra text-[0.86rem] font-medium ${i.anulado ? "text-tinta-suave line-through" : "text-tinta"}`}
                      >
                        {formatearGuarani(i.precioUnitario * i.cantidad)}
                      </span>
                      {abierta && !i.anulado && contexto.puedeGestionar && (
                        <button
                          type="button"
                          disabled={pendiente}
                          onClick={() => setDialogo({ tipo: "anular", item: i })}
                          className="rounded-md border border-peligro/30 bg-peligro-luz px-2 py-0.5 text-[0.72rem] font-semibold text-peligro transition-colors hover:bg-peligro hover:text-white disabled:opacity-45"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

      </Tarjeta>

      {/* ------------------------------------------------------------------------ ventanas */}
      {dialogo?.tipo === "anular" && (
        <DialogoMotivo
          titulo="Cancelar un producto"
          texto={`${dialogo.item.cantidad} × ${dialogo.item.nombre}. Se devuelve al stock y se le avisa a la cocina o la barra para que no lo preparen.`}
          confirmar="Cancelar producto"
          onCerrar={() => setDialogo(null)}
          onConfirmar={async (motivo) => {
            const r = await anularProducto(cuenta.id, dialogo.item.id, motivo);
            if (r.ok) router.refresh();
            return r;
          }}
        />
      )}
      {dialogo?.tipo === "cancelar" && (
        <DialogoMotivo
          titulo={`Cerrar la cuenta vacía de la mesa ${cuenta.mesa}`}
          texto="La cuenta no tiene productos activos: se cierra y la mesa queda libre. Esto no se puede deshacer. Queda en el Historial de cuentas, con tu nombre y el motivo."
          confirmar="Cerrar cuenta"
          onCerrar={() => setDialogo(null)}
          onConfirmar={async (motivo) => {
            const r = await cancelarCuenta(cuenta.id, motivo);
            if (r.ok) router.refresh();
            return r;
          }}
        />
      )}
      {dialogo?.tipo === "descuento" && (
        <DialogoDescuento
          cuenta={cuenta}
          onCerrar={() => setDialogo(null)}
          onListo={() => {
            setDialogo(null);
            router.refresh();
          }}
        />
      )}

      {cargando && (
        <CargarProductosPanel
          cuentaId={cuenta.id}
          mesa={cuenta.mesa}
          categorias={contexto.categorias}
          gruposMitad={contexto.gruposMitad}
          onCerrar={() => setCargando(false)}
          onEnviado={(areas) => {
            setCargando(false);
            setAviso(
              areas.length > 0
                ? `Pedido enviado: la comanda salió a ${areas.join(" y ")}.`
                : "Pedido enviado. Ningún producto tiene un área de impresión asignada, así que no salió ninguna comanda."
            );
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------

/** Pide el motivo de una cancelación: sin motivo (al menos 3 letras) no se hace nada. */
function DialogoMotivo({
  titulo,
  texto,
  confirmar,
  onCerrar,
  onConfirmar,
}: {
  titulo: string;
  texto: string;
  confirmar: string;
  onCerrar: () => void;
  onConfirmar: (motivo: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  function confirmarAhora() {
    if (motivo.trim().length < 3) {
      setError("Escribí el motivo (al menos 3 letras).");
      return;
    }
    setError(null);
    iniciar(async () => {
      try {
        const r = await onConfirmar(motivo);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        onCerrar();
      } catch {
        setError("No se pudo completar la acción. Revisá la conexión y probá de nuevo.");
      }
    });
  }

  return (
    <Modal titulo={titulo} onCerrar={onCerrar}>
      <div className="flex flex-col gap-3">
        <p className="text-[0.88rem] leading-snug text-tinta-media">{texto}</p>
        <Campo etiqueta="Motivo *">
          <Entrada
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmarAhora();
            }}
            maxLength={200}
            placeholder="Ej: el cliente se arrepintió, error al cargar"
          />
        </Campo>
        {error && <MensajeError>{error}</MensajeError>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className={clasesBoton("suave", "md")}>
            No, volver
          </button>
          <button type="button" disabled={pendiente} onClick={confirmarAhora} className={clasesBoton("peligro", "md")}>
            {pendiente ? "Cancelando…" : confirmar}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** El descuento general de la cuenta: porcentaje o monto fijo, con motivo, mostrando cuánto queda a pagar. */
function DialogoDescuento({
  cuenta,
  onCerrar,
  onListo,
}: {
  cuenta: CuentaCajaFila;
  onCerrar: () => void;
  onListo: () => void;
}) {
  const [tipo, setTipo] = useState<"porcentaje" | "monto">(cuenta.descuento?.tipo ?? "porcentaje");
  const [valorTexto, setValorTexto] = useState(cuenta.descuento ? String(cuenta.descuento.valor).replace(".", ",") : "");
  const [motivo, setMotivo] = useState(cuenta.descuento?.motivo ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const valor = parseFloat(valorTexto.replace(",", "."));
  const subtotal = cuenta.totales.subtotal;
  const calculado = Number.isFinite(valor) && valor > 0 ? calcularDescuento(subtotal, { tipo, valor }) : null;
  // Un 0 es "sin descuento": reemplaza al que ya tenía la cuenta y la deja en su monto original (para corregir uno mal puesto).
  const esCero = Number.isFinite(valor) && valor === 0;

  function guardar() {
    if (esCero) {
      quitar();
      return;
    }
    if (!calculado || !calculado.ok || calculado.monto <= 0) {
      setError(calculado && !calculado.ok ? calculado.error : "Escribí un descuento mayor a cero.");
      return;
    }
    if (motivo.trim().length < 3) {
      setError("Escribí el motivo (al menos 3 letras).");
      return;
    }
    setError(null);
    iniciar(async () => {
      try {
        const r = await aplicarDescuento(cuenta.id, { tipo, valor }, motivo);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        onListo();
      } catch {
        setError("No se pudo guardar el descuento. Revisá la conexión y probá de nuevo.");
      }
    });
  }

  function quitar() {
    setError(null);
    iniciar(async () => {
      try {
        const r = await aplicarDescuento(cuenta.id, null, "");
        if (!r.ok) {
          setError(r.error);
          return;
        }
        onListo();
      } catch {
        setError("No se pudo quitar el descuento. Revisá la conexión y probá de nuevo.");
      }
    });
  }

  return (
    <Modal titulo={`Descuento · mesa ${cuenta.mesa}`} onCerrar={onCerrar}>
      <div className="flex flex-col gap-3">
        <Segmentado
          opciones={[
            { value: "porcentaje", label: "Porcentaje (%)" },
            { value: "monto", label: "Monto (Gs.)" },
          ]}
          valor={tipo}
          onChange={setTipo}
          color="tinta"
        />
        <Campo
          etiqueta={tipo === "porcentaje" ? "Porcentaje de descuento *" : "Monto a descontar *"}
          ayuda={
            cuenta.descuento
              ? "Escribí el nuevo valor y se reemplaza el descuento anterior. Con 0 la cuenta vuelve a su monto original."
              : undefined
          }
        >
          <Entrada
            autoFocus
            inputMode="decimal"
            value={valorTexto}
            onChange={(e) => setValorTexto(e.target.value)}
            placeholder={tipo === "porcentaje" ? "10" : "5000"}
          />
        </Campo>
        {esCero ? (
          <p className="rounded-lg bg-papel-suave px-3 py-2 text-[0.8rem] text-tinta-media">
            Con 0 la cuenta queda sin descuento, en su monto original. No hace falta motivo.
          </p>
        ) : (
          <Campo etiqueta="Motivo *">
            <Entrada
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={200}
              placeholder="Ej: cliente frecuente, demora en la cocina"
            />
          </Campo>
        )}

        <div className="flex items-center justify-between rounded-lg bg-papel-suave px-3.5 py-3 text-[0.85rem] text-tinta-media">
          <span>
            {formatearGuarani(subtotal)}
            {calculado && calculado.ok ? ` − ${formatearGuarani(calculado.monto)}` : ""}
          </span>
          <span className="cifra text-[1.2rem] font-bold text-tinta">
            {formatearGuarani(calculado && calculado.ok ? subtotal - calculado.monto : subtotal)}
          </span>
        </div>

        {error && <MensajeError>{error}</MensajeError>}
        <div className="flex flex-wrap justify-end gap-2">
          {cuenta.descuento && (
            <button type="button" disabled={pendiente} onClick={quitar} className={clasesBoton("peligro", "md")}>
              Quitar descuento
            </button>
          )}
          <button type="button" onClick={onCerrar} className={clasesBoton("suave", "md")}>
            Volver
          </button>
          <button type="button" disabled={pendiente} onClick={guardar} className={clasesBoton("navegar", "md")}>
            {pendiente ? "Guardando…" : esCero ? "Dejar sin descuento" : "Guardar descuento"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
