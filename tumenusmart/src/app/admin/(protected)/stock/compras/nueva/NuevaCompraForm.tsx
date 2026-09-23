"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Tarjeta, Campo, Entrada, Selector, clasesBoton } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";
import { etiquetaIva } from "@/lib/iva";
import { calcularCompra } from "@/lib/compra-calculo";
import { registrarCompra, type InsumoParaCompra } from "../actions";
import { BuscarInsumoParaCompra } from "./BuscarInsumoParaCompra";

type Proveedor = { id: string; nombre: string; ruc: string | null };
type Almacen = { id: string; codigo: string; nombre: string };

type Linea = {
  clave: number;
  insumoId: string;
  nombre: string;
  unidadMedida: string;
  iva: string;
  almacenId: string;
  cantidad: string;
  costoUnitario: string;
  descuentoPorcentaje: string;
};

/** La fecha de hoy en la zona del navegador (toISOString daría la de UTC, y de noche ya es "mañana"). */
function hoyLocal(): string {
  return new Date().toLocaleDateString("en-CA");
}

function aNumero(texto: string): number {
  const n = Number(texto);
  return Number.isFinite(n) ? n : 0;
}

/**
 * El formulario de una compra: datos de la factura del proveedor, las líneas
 * (insumos buscados por nombre, con cantidad, almacén, costo y descuento) y
 * los totales. Lo que se ve abajo es una vista previa — el servidor recalcula
 * todo con la misma función (calcularCompra) antes de guardar.
 */
export function NuevaCompraForm({
  proveedores,
  almacenes,
}: {
  proveedores: Proveedor[];
  almacenes: Almacen[];
}) {
  const [pendiente, iniciar] = useTransition();
  const [proveedorId, setProveedorId] = useState("");
  const [fecha, setFecha] = useState("");
  const [folioFactura, setFolioFactura] = useState("");
  const [condicionPago, setCondicionPago] = useState<"contado" | "credito">("contado");
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const [notas, setNotas] = useState("");
  const [descuentoGeneral, setDescuentoGeneral] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [error, setError] = useState<string | null>(null);
  const contador = useRef(0);

  // Se completa recién en el navegador: en el servidor "hoy" sería el de UTC.
  useEffect(() => {
    setFecha(hoyLocal());
  }, []);

  const calculo = useMemo(
    () =>
      calcularCompra(
        lineas.map((l) => ({
          cantidad: aNumero(l.cantidad),
          costoUnitario: aNumero(l.costoUnitario),
          descuentoPorcentaje: aNumero(l.descuentoPorcentaje),
          iva: l.iva,
        })),
        aNumero(descuentoGeneral)
      ),
    [lineas, descuentoGeneral]
  );

  function agregarLinea(insumo: InsumoParaCompra) {
    setError(null);
    setLineas((actuales) => {
      const almacenPorDefecto =
        actuales.length > 0
          ? actuales[actuales.length - 1].almacenId
          : almacenes.length === 1
            ? almacenes[0].id
            : "";
      contador.current += 1;
      return [
        ...actuales,
        {
          clave: contador.current,
          insumoId: insumo.id,
          nombre: insumo.nombre,
          unidadMedida: insumo.unidadMedida,
          iva: insumo.iva,
          almacenId: almacenPorDefecto,
          cantidad: "",
          costoUnitario: insumo.costoUnitario != null ? String(insumo.costoUnitario) : "",
          descuentoPorcentaje: "",
        },
      ];
    });
  }

  function actualizarLinea(clave: number, cambios: Partial<Linea>) {
    setLineas((actuales) => actuales.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));
  }

  function quitarLinea(clave: number) {
    setLineas((actuales) => actuales.filter((l) => l.clave !== clave));
  }

  function hayAlgoCargado() {
    return lineas.length > 0 || !!folioFactura || !!notas || !!proveedorId || !!descuentoGeneral;
  }

  function deshacer() {
    if (hayAlgoCargado() && !confirm("¿Descartar todo lo que cargaste en esta compra?")) return;
    setProveedorId("");
    setFecha(hoyLocal());
    setFolioFactura("");
    setCondicionPago("contado");
    setFechaVencimiento("");
    setNotas("");
    setDescuentoGeneral("");
    setLineas([]);
    setError(null);
  }

  function guardar() {
    setError(null);
    const validas = lineas.filter((l) => aNumero(l.cantidad) > 0 && l.costoUnitario !== "");
    if (validas.length === 0) {
      setError("Agregá al menos un insumo con cantidad y costo unitario.");
      return;
    }
    if (validas.length !== lineas.length) {
      setError("Hay líneas sin cantidad o sin costo unitario — completalas o quitalas.");
      return;
    }
    iniciar(async () => {
      const resultado = await registrarCompra({
        proveedorId: proveedorId || null,
        fecha,
        folioFactura: folioFactura.trim() || null,
        condicionPago,
        fechaVencimiento: condicionPago === "credito" ? fechaVencimiento || null : null,
        descuentoGeneralPorcentaje: aNumero(descuentoGeneral),
        notas: notas.trim() || null,
        lineas: validas.map((l) => ({
          insumoId: l.insumoId,
          almacenId: l.almacenId || null,
          cantidad: aNumero(l.cantidad),
          costoUnitario: aNumero(l.costoUnitario),
          descuentoPorcentaje: aNumero(l.descuentoPorcentaje),
        })),
      });
      // Si sale bien, registrarCompra redirige sola — este código no sigue.
      if (resultado && !resultado.ok) setError(resultado.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Barra de acciones. Imprimir todavía no existe (queda para el reporte);
          "Eliminar" de una línea es el Quitar de cada una, y anular una compra
          ya guardada se hace desde su detalle. */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={pendiente} onClick={guardar} className={clasesBoton("principal")}>
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" disabled={pendiente} onClick={deshacer} className={clasesBoton("suave")}>
          Deshacer
        </button>
        <Link href="/admin/stock/compras" className={clasesBoton("navegar")}>
          Cerrar
        </Link>
      </div>

      <Tarjeta className="flex flex-col gap-3">
        <p className="rotulo text-[0.8rem] font-bold">Datos de la compra</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Campo etiqueta="Proveedor" className="lg:col-span-2">
            <Selector value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
              <option value="">Sin proveedor</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                  {p.ruc ? ` — RUC ${p.ruc}` : ""}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Folio de factura">
            <Entrada value={folioFactura} onChange={(e) => setFolioFactura(e.target.value)} placeholder="Ej: 001-001-0001234" />
          </Campo>
          <Campo etiqueta="Fecha de la factura">
            <Entrada type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Campo>
          <Campo etiqueta="Condición de pago">
            <Selector
              value={condicionPago}
              onChange={(e) => setCondicionPago(e.target.value === "credito" ? "credito" : "contado")}
            >
              <option value="contado">Al contado</option>
              <option value="credito">A crédito</option>
            </Selector>
          </Campo>
          <Campo
            etiqueta="Fecha de vencimiento"
            ayuda={condicionPago === "credito" ? undefined : "Solo si la compra es a crédito."}
          >
            <Entrada
              type="date"
              value={fechaVencimiento}
              disabled={condicionPago !== "credito"}
              onChange={(e) => setFechaVencimiento(e.target.value)}
            />
          </Campo>
          <Campo etiqueta="Notas (opcional)" className="sm:col-span-2 lg:col-span-3">
            <Entrada value={notas} onChange={(e) => setNotas(e.target.value)} />
          </Campo>
        </div>
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-3">
        <p className="rotulo text-[0.8rem] font-bold">Insumos comprados</p>

        <BuscarInsumoParaCompra onElegir={agregarLinea} />

        {lineas.length === 0 ? (
          <p className="rounded-lg border border-dashed border-linea px-3 py-6 text-center text-sm text-tinta-suave">
            Todavía no agregaste ningún insumo — buscalo arriba por nombre.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {lineas.map((l, i) => {
              const calculada = calculo.lineas[i];
              return (
                <div key={l.clave} className="flex flex-col gap-2 rounded-lg border border-linea p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{l.nombre}</p>
                      <p className="text-xs text-tinta-suave">
                        {l.unidadMedida} · {etiquetaIva(l.iva)}
                      </p>
                    </div>
                    <button type="button" onClick={() => quitarLinea(l.clave)} className={clasesBoton("peligro", "sm")}>
                      Quitar
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                    <Campo etiqueta="Cantidad">
                      <Entrada
                        type="number"
                        step="0.001"
                        min="0"
                        value={l.cantidad}
                        onChange={(e) => actualizarLinea(l.clave, { cantidad: e.target.value })}
                      />
                    </Campo>
                    <Campo etiqueta="Almacén">
                      <Selector
                        value={l.almacenId}
                        onChange={(e) => actualizarLinea(l.clave, { almacenId: e.target.value })}
                      >
                        <option value="">Sin almacén</option>
                        {almacenes.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.codigo} — {a.nombre}
                          </option>
                        ))}
                      </Selector>
                    </Campo>
                    <Campo etiqueta="Costo unitario">
                      <Entrada
                        type="number"
                        step="1"
                        min="0"
                        value={l.costoUnitario}
                        onChange={(e) => actualizarLinea(l.clave, { costoUnitario: e.target.value })}
                      />
                    </Campo>
                    <Campo etiqueta="Costo c/ impuesto">
                      <Entrada disabled value={formatearGuarani(calculada.costoUnitarioConImpuesto)} />
                    </Campo>
                    <Campo etiqueta="Desc. %">
                      <Entrada
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        placeholder="0"
                        value={l.descuentoPorcentaje}
                        onChange={(e) => actualizarLinea(l.clave, { descuentoPorcentaje: e.target.value })}
                      />
                    </Campo>
                    <Campo etiqueta="Importe s/ impuesto">
                      <Entrada disabled value={formatearGuarani(calculada.subtotal)} />
                    </Campo>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Campo
            etiqueta="Descuento general (%)"
            ayuda="Se aplica a toda la factura, además de los descuentos de cada línea."
          >
            <Entrada
              type="number"
              step="0.01"
              min="0"
              max="100"
              placeholder="0"
              value={descuentoGeneral}
              onChange={(e) => setDescuentoGeneral(e.target.value)}
              className="sm:w-40"
            />
          </Campo>
          <dl className="cifra flex flex-col gap-1.5 text-[0.88rem]">
            <div className="flex justify-between gap-4">
              <dt className="text-tinta-media">Subtotal</dt>
              <dd>{formatearGuarani(calculo.subtotal)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-tinta-media">Descuento general</dt>
              <dd>− {formatearGuarani(calculo.descuentoGeneral)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-tinta-media">IVA</dt>
              <dd>{formatearGuarani(calculo.iva)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-linea pt-1.5 text-[1.05rem] font-semibold">
              <dt>Total</dt>
              <dd>{formatearGuarani(calculo.total)}</dd>
            </div>
          </dl>
        </div>
      </Tarjeta>

      {error && <p className="text-sm font-medium text-peligro">{error}</p>}
      <div>
        <button type="button" disabled={pendiente} onClick={guardar} className={clasesBoton("principal")}>
          {pendiente ? "Guardando…" : "Guardar compra"}
        </button>
      </div>
    </div>
  );
}
