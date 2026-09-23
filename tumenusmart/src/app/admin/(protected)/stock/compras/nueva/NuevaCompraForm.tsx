"use client";

import { useState, useTransition } from "react";
import { Tarjeta, Campo, Entrada, Selector, clasesBoton } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";
import { etiquetaUnidadMedida } from "@/lib/unidad-medida";
import { registrarCompra } from "../actions";

type Insumo = { id: string; nombre: string; unidadMedida: string };
type Proveedor = { id: string; nombre: string };
type Linea = { insumoId: string; cantidad: string; costoUnitario: string };

function lineaVacia(): Linea {
  return { insumoId: "", cantidad: "", costoUnitario: "" };
}

export function NuevaCompraForm({ insumos, proveedores }: { insumos: Insumo[]; proveedores: Proveedor[] }) {
  const [pendiente, iniciar] = useTransition();
  const [proveedorId, setProveedorId] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [numeroComprobante, setNumeroComprobante] = useState("");
  const [notas, setNotas] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia()]);
  const [error, setError] = useState<string | null>(null);

  function actualizarLinea(i: number, cambios: Partial<Linea>) {
    setLineas((actuales) => actuales.map((l, idx) => (idx === i ? { ...l, ...cambios } : l)));
  }

  function agregarLinea() {
    setLineas((actuales) => [...actuales, lineaVacia()]);
  }

  function quitarLinea(i: number) {
    setLineas((actuales) => (actuales.length === 1 ? actuales : actuales.filter((_, idx) => idx !== i)));
  }

  const total = lineas.reduce((s, l) => {
    const c = Number(l.cantidad);
    const p = Number(l.costoUnitario);
    return s + (Number.isFinite(c) && Number.isFinite(p) ? c * p : 0);
  }, 0);

  function confirmar() {
    setError(null);
    const lineasValidas = lineas.filter((l) => l.insumoId && l.cantidad && l.costoUnitario);
    if (lineasValidas.length === 0) {
      setError("Agregá al menos un insumo con cantidad y costo.");
      return;
    }
    iniciar(async () => {
      const resultado = await registrarCompra({
        proveedorId: proveedorId || null,
        fecha,
        numeroComprobante: numeroComprobante.trim() || null,
        notas: notas.trim() || null,
        lineas: lineasValidas.map((l) => ({
          insumoId: l.insumoId,
          cantidad: Number(l.cantidad),
          costoUnitario: Number(l.costoUnitario),
        })),
      });
      // Si sale bien, registrarCompra redirige sola — este código no sigue.
      if (resultado && !resultado.ok) setError(resultado.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta className="flex flex-col gap-3">
        <p className="rotulo text-[0.8rem] font-bold">Datos de la compra</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo etiqueta="Proveedor (opcional)">
            <Selector value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
              <option value="">Sin proveedor</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Fecha">
            <Entrada type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Campo>
          <Campo etiqueta="N° de comprobante (opcional)">
            <Entrada value={numeroComprobante} onChange={(e) => setNumeroComprobante(e.target.value)} />
          </Campo>
          <Campo etiqueta="Notas (opcional)">
            <Entrada value={notas} onChange={(e) => setNotas(e.target.value)} />
          </Campo>
        </div>
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-3">
        <p className="rotulo text-[0.8rem] font-bold">Insumos comprados</p>
        <div className="flex flex-col gap-2">
          {lineas.map((l, i) => {
            const insumo = insumos.find((ins) => ins.id === l.insumoId);
            const subtotal =
              insumo && l.cantidad && l.costoUnitario
                ? Number(l.cantidad) * Number(l.costoUnitario)
                : null;
            return (
              <div key={i} className="grid grid-cols-1 gap-2 rounded-lg border border-linea p-3 sm:grid-cols-[1fr_7rem_9rem_auto]">
                <Selector
                  value={l.insumoId}
                  onChange={(e) => actualizarLinea(i, { insumoId: e.target.value })}
                >
                  <option value="">Elegí un insumo...</option>
                  {insumos.map((ins) => (
                    <option key={ins.id} value={ins.id}>
                      {ins.nombre} ({etiquetaUnidadMedida(ins.unidadMedida)})
                    </option>
                  ))}
                </Selector>
                <Entrada
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="Cantidad"
                  value={l.cantidad}
                  onChange={(e) => actualizarLinea(i, { cantidad: e.target.value })}
                />
                <Entrada
                  type="number"
                  step="1"
                  min="0"
                  placeholder="Costo unitario"
                  value={l.costoUnitario}
                  onChange={(e) => actualizarLinea(i, { costoUnitario: e.target.value })}
                />
                <div className="flex items-center justify-between gap-2 sm:justify-end">
                  <span className="text-xs text-tinta-suave">
                    {subtotal != null ? formatearGuarani(subtotal) : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => quitarLinea(i)}
                    disabled={lineas.length === 1}
                    className="text-xs text-peligro hover:underline disabled:opacity-40"
                  >
                    Quitar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={agregarLinea}
          className="self-start rounded-lg border border-dashed border-linea px-3 py-2 text-sm text-tinta-media hover:border-brand hover:text-brand"
        >
          + Agregar insumo
        </button>
      </Tarjeta>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="cifra text-[1.1rem] font-semibold">Total: {formatearGuarani(total)}</p>
        <button type="button" disabled={pendiente} onClick={confirmar} className={clasesBoton("principal")}>
          {pendiente ? "Registrando…" : "Registrar compra"}
        </button>
      </div>
      {error && <p className="text-sm font-medium text-peligro">{error}</p>}
    </div>
  );
}
