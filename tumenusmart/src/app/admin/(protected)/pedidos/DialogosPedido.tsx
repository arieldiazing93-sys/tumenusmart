"use client";

import { useState, useTransition } from "react";
import { Campo, Entrada, MensajeError, clasesBoton } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { Segmentado } from "@/components/Segmentado";
import { formatearCantidad, formatearGuarani, formatearNumero } from "@/lib/format";
import { calcularDescuento } from "@/lib/descuento-venta";
import { anularProductoDePedido, aplicarDescuentoAPedido } from "./actions";
import type { ItemPedidoFila, PedidoFila } from "./tipos-pedido";

/**
 * Cancelar un producto del pedido abierto: todo, o solo algunas unidades (se cargaron 5 empanadas y eran 4: se cancela 1 y quedan 4).
 * Pide cuántas y el motivo (obligatorio). Por defecto propone cancelar UNA unidad (lo menos destructivo): para cancelar todo está el
 * botón "Todas". Lo cancelado vuelve al stock.
 */
export function DialogoCancelarProductoPedido({
  pedidoId,
  item,
  enPreparacion,
  onCerrar,
  onListo,
}: {
  pedidoId: string;
  item: ItemPedidoFila;
  /** El pedido ya está en preparación: se avisa que cocina tiene que enterarse. */
  enPreparacion: boolean;
  onCerrar: () => void;
  /** Con el aviso que haya devuelto el servidor (stock que no se devolvió solo, avisar a cocina…). */
  onListo: (aviso?: string) => void;
}) {
  const cantidad = item.cantidad;
  const puedeParcial = cantidad > 1;
  const [cuantas, setCuantas] = useState(puedeParcial ? 1 : cantidad);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const cancelaTodo = cuantas === cantidad;
  const quedan = cantidad - cuantas;

  function confirmarAhora() {
    if (motivo.trim().length < 3) {
      setError("Escribí el motivo (al menos 3 letras).");
      return;
    }
    setError(null);
    iniciar(async () => {
      try {
        const r = await anularProductoDePedido(pedidoId, item.id, motivo, cancelaTodo ? undefined : cuantas);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        onListo(r.aviso);
      } catch {
        setError("No se pudo completar la acción. Revisá la conexión y probá de nuevo.");
      }
    });
  }

  return (
    <Modal titulo="Cancelar un producto" onCerrar={onCerrar}>
      <div className="flex flex-col gap-3">
        <p className="text-[0.95rem] font-semibold text-tinta">
          {formatearCantidad(cantidad)} × {item.nombre}
        </p>

        {puedeParcial && (
          <div className="flex flex-col gap-1.5 rounded-xl border-2 border-azul/50 bg-superficie p-3">
            <p className="text-[0.85rem] font-semibold text-tinta">¿Cuántas cancelás?</p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-label="Cancelar una unidad menos"
                disabled={cuantas <= 1}
                onClick={() => setCuantas((c) => Math.max(1, c - 1))}
                className={`${clasesBoton("suave", "md")} w-10 justify-center`}
              >
                −
              </button>
              <span className="cifra w-10 text-center text-[1.3rem] font-semibold text-tinta">{cuantas}</span>
              <button
                type="button"
                aria-label="Cancelar una unidad más"
                disabled={cuantas >= cantidad}
                onClick={() => setCuantas((c) => Math.min(cantidad, c + 1))}
                className={`${clasesBoton("suave", "md")} w-10 justify-center`}
              >
                +
              </button>
              <button type="button" disabled={cancelaTodo} onClick={() => setCuantas(cantidad)} className={clasesBoton("suave", "md")}>
                Todas ({cantidad})
              </button>
            </div>
            <p className="text-[0.8rem] text-tinta-media">
              {cancelaTodo ? "Se cancela todo el producto." : `Se cancela${cuantas === 1 ? " 1" : `n ${cuantas}`} y quedan ${quedan} en el pedido.`}
            </p>
          </div>
        )}

        <p className="text-[0.85rem] leading-snug text-tinta-media">
          {puedeParcial && !cancelaTodo ? "Lo cancelado" : "Se cancela y"} se devuelve al stock y el total del pedido se recalcula.
          {enPreparacion ? " El pedido ya está en preparación: avisale a cocina que no lo prepare." : ""}
        </p>
        <Campo etiqueta="Motivo *">
          <Entrada
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmarAhora();
            }}
            maxLength={200}
            placeholder="Ej: se cargó de más, el cliente se arrepintió"
          />
        </Campo>
        {error && <MensajeError>{error}</MensajeError>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className={clasesBoton("suave", "md")}>
            No, volver
          </button>
          <button type="button" disabled={pendiente} onClick={confirmarAhora} className={clasesBoton("peligro", "md")}>
            {pendiente ? "Cancelando…" : cancelaTodo ? "Cancelar producto" : `Cancelar ${cuantas}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** El descuento general del pedido: porcentaje o monto fijo, con motivo, mostrando cuánto queda a pagar. */
export function DialogoDescuentoPedido({
  pedido,
  onCerrar,
  onListo,
}: {
  pedido: PedidoFila;
  onCerrar: () => void;
  onListo: () => void;
}) {
  const [tipo, setTipo] = useState<"porcentaje" | "monto">(pedido.descuentoTipo ?? "porcentaje");
  const [valorTexto, setValorTexto] = useState(pedido.descuentoValor != null ? String(pedido.descuentoValor).replace(".", ",") : "");
  const [motivo, setMotivo] = useState(pedido.descuentoMotivo ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const valor = parseFloat(valorTexto.replace(",", "."));
  const subtotal = pedido.subtotal;
  const calculado = Number.isFinite(valor) && valor > 0 ? calcularDescuento(subtotal, { tipo, valor }) : null;
  // Un 0 es "sin descuento": reemplaza al que ya tenía el pedido y lo deja en su monto original (para corregir uno mal puesto).
  const esCero = Number.isFinite(valor) && valor === 0;
  const tieneDescuento = pedido.descuentoTipo != null && pedido.descuento > 0;

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
        const r = await aplicarDescuentoAPedido(pedido.id, { tipo, valor }, motivo);
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
        const r = await aplicarDescuentoAPedido(pedido.id, null, "");
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
    <Modal titulo={`Descuento · pedido ${formatearNumero(pedido.numero)}`} onCerrar={onCerrar}>
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
            tieneDescuento
              ? "Escribí el nuevo valor y se reemplaza el descuento anterior. Con 0 el pedido vuelve a su monto original."
              : "Se descuenta de los productos; el envío no se descuenta."
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
            Con 0 el pedido queda sin descuento, en su monto original. No hace falta motivo.
          </p>
        ) : (
          <Campo etiqueta="Motivo *">
            <Entrada
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={200}
              placeholder="Ej: cliente frecuente, demora en la entrega"
            />
          </Campo>
        )}

        <div className="flex items-center justify-between rounded-lg bg-papel-suave px-3.5 py-3 text-[0.85rem] text-tinta-media">
          <span>
            {formatearGuarani(subtotal)}
            {calculado && calculado.ok ? ` − ${formatearGuarani(calculado.monto)}` : ""}
            {pedido.costoEnvio > 0 ? ` + envío ${formatearGuarani(pedido.costoEnvio)}` : ""}
          </span>
          <span className="cifra text-[1.2rem] font-bold text-tinta">
            {formatearGuarani((calculado && calculado.ok ? subtotal - calculado.monto : subtotal) + pedido.costoEnvio)}
          </span>
        </div>

        {error && <MensajeError>{error}</MensajeError>}
        <div className="flex flex-wrap justify-end gap-2">
          {tieneDescuento && (
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
