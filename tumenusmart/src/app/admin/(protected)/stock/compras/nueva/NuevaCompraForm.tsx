"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { Tarjeta, Campo, Entrada, Selector, clasesBoton } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";
import { etiquetaIva } from "@/lib/iva";
import { calcularCompra } from "@/lib/compra-calculo";
import { registrarCompra, type InsumoParaCompra } from "../actions";
import { BuscarInsumoParaCompra } from "./BuscarInsumoParaCompra";

type Proveedor = { id: string; nombre: string; ruc: string | null };
type Almacen = { id: string; nombre: string };

type Linea = {
  clave: number;
  insumoId: string;
  nombre: string;
  unidadMedida: string;
  iva: string;
  /** Unidades que trae cada unidad de compra (ver Insumo.rendimiento). */
  rendimiento: number;
  almacenId: string;
  cantidad: string;
  /** Lo que se escribió como costo de una unidad de compra: sin IVA o con IVA, según `costoConIva`. */
  costo: string;
  /** true si `costo` se escribió en la columna "c/ IVA" — la otra columna se calcula sola. */
  costoConIva: boolean;
  descuentoPorcentaje: string;
};

/**
 * Las columnas de las líneas en pantalla ancha: insumo, cantidad, almacén,
 * costo sin IVA, costo con IVA, descuento, importe y quitar. La cabecera y
 * cada fila usan la misma, así quedan alineadas sin repetir las etiquetas.
 * (En pantallas más chicas no entran tantas columnas: cada línea se apila.)
 */
const COLUMNAS_LINEA =
  "xl:grid-cols-[minmax(0,1.5fr)_6rem_minmax(0,1fr)_6.5rem_6.5rem_5rem_7.5rem_5rem]";

/** La fecha de hoy en la zona del navegador (toISOString daría la de UTC, y de noche ya es "mañana"). */
function hoyLocal(): string {
  return new Date().toLocaleDateString("en-CA");
}

function aNumero(texto: string): number {
  const n = Number(texto);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Un campo de una línea. En pantalla ancha la etiqueta ya está en la cabecera
 * de la tabla; en pantallas más chicas no hay cabecera, así que se muestra acá.
 */
function Celda({
  etiqueta,
  children,
  className = "",
}: {
  etiqueta: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[0.78rem] font-semibold text-tinta-media xl:hidden">{etiqueta}</span>
      {children}
    </label>
  );
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
          costoUnitario: aNumero(l.costo),
          costoIncluyeIva: l.costoConIva,
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
          rendimiento: insumo.rendimiento,
          almacenId: almacenPorDefecto,
          cantidad: "",
          // El último costo que se guardó es neto.
          costo: insumo.ultimoCostoPorCompra != null ? String(insumo.ultimoCostoPorCompra) : "",
          costoConIva: false,
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
    const validas = lineas.filter((l) => aNumero(l.cantidad) > 0 && l.costo !== "");
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
          costoUnitario: aNumero(l.costo),
          costoIncluyeIva: l.costoConIva,
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

        {lineas.length > 0 && (
          <p className="text-[0.78rem] text-tinta-suave">
            Cargá el costo como dice la factura, sin IVA o con IVA: al escribir en una columna, la otra se calcula sola.
          </p>
        )}

        {lineas.length === 0 ? (
          <p className="rounded-lg border border-dashed border-linea px-3 py-6 text-center text-sm text-tinta-suave">
            Todavía no agregaste ningún insumo — buscalo arriba por nombre.
          </p>
        ) : (
          <div className="flex flex-col">
            {/* Cabecera de la tabla: solo en pantalla ancha. En pantallas más
                chicas cada campo trae su propia etiqueta (ver Celda). */}
            <div
              className={`hidden gap-2 px-0.5 pb-1.5 text-[0.78rem] font-semibold text-tinta-media xl:grid ${COLUMNAS_LINEA}`}
            >
              <span>Insumo</span>
              <span>Cantidad</span>
              <span>Almacén</span>
              <span>Costo s/ IVA</span>
              <span>Costo c/ IVA</span>
              <span>Desc. %</span>
              <span className="text-right">Importe s/ IVA</span>
              <span />
            </div>

            {lineas.map((l, i) => {
              const calculada = calculo.lineas[i];
              const unidadesQueEntran = Math.round(aNumero(l.cantidad) * l.rendimiento * 1000) / 1000;
              // Lo escrito se muestra tal cual; la otra columna, calculada.
              const hayCosto = l.costo !== "";
              const costoSinIva = hayCosto ? (l.costoConIva ? String(calculada.costoUnitarioNeto) : l.costo) : "";
              const costoConIva = hayCosto ? (l.costoConIva ? l.costo : String(calculada.costoUnitarioConImpuesto)) : "";
              return (
                <div
                  key={l.clave}
                  className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-t border-linea py-2 ${COLUMNAS_LINEA}`}
                >
                  <div className="order-1 min-w-0 xl:order-none">
                    <p className="font-medium leading-tight">{l.nombre}</p>
                    <p className="text-xs leading-snug text-tinta-suave">
                      {l.unidadMedida} · {etiquetaIva(l.iva)}
                      {l.rendimiento !== 1 && ` · cada compra trae ${l.rendimiento} ${l.unidadMedida}`}
                      {unidadesQueEntran > 0 && (
                        <>
                          {" · "}
                          <span className="cifra font-semibold text-exito">
                            Ingresa al stock: {unidadesQueEntran} {l.unidadMedida}
                          </span>
                        </>
                      )}
                    </p>
                  </div>

                  {/* En pantalla ancha este contenedor "desaparece" (contents) y
                      sus campos caen directo en las columnas de la fila. */}
                  <div className="order-3 col-span-2 grid grid-cols-2 items-end gap-2 sm:grid-cols-3 lg:grid-cols-6 xl:contents">
                    <Celda etiqueta="Cantidad">
                      <Entrada
                        type="number"
                        step="0.001"
                        min="0"
                        value={l.cantidad}
                        onChange={(e) => actualizarLinea(l.clave, { cantidad: e.target.value })}
                      />
                    </Celda>
                    <Celda etiqueta="Almacén">
                      <Selector
                        value={l.almacenId}
                        onChange={(e) => actualizarLinea(l.clave, { almacenId: e.target.value })}
                      >
                        <option value="">Sin almacén</option>
                        {almacenes.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.nombre}
                          </option>
                        ))}
                      </Selector>
                    </Celda>
                    <Celda etiqueta="Costo s/ IVA">
                      <Entrada
                        type="number"
                        step="any"
                        min="0"
                        value={costoSinIva}
                        onChange={(e) => actualizarLinea(l.clave, { costo: e.target.value, costoConIva: false })}
                      />
                    </Celda>
                    <Celda etiqueta="Costo c/ IVA">
                      <Entrada
                        type="number"
                        step="any"
                        min="0"
                        value={costoConIva}
                        onChange={(e) => actualizarLinea(l.clave, { costo: e.target.value, costoConIva: true })}
                      />
                    </Celda>
                    <Celda etiqueta="Desc. %">
                      <Entrada
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        placeholder="0"
                        value={l.descuentoPorcentaje}
                        onChange={(e) => actualizarLinea(l.clave, { descuentoPorcentaje: e.target.value })}
                      />
                    </Celda>
                    <div>
                      <span className="mb-1 block text-[0.78rem] font-semibold text-tinta-media xl:hidden">
                        Importe s/ IVA
                      </span>
                      <p className="cifra py-2.5 text-[0.88rem] font-medium xl:py-0 xl:text-right">
                        {formatearGuarani(calculada.subtotal)}
                      </p>
                    </div>
                  </div>

                  <div className="order-2 justify-self-end xl:order-none">
                    <button type="button" onClick={() => quitarLinea(l.clave)} className={clasesBoton("peligro", "sm")}>
                      Quitar
                    </button>
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
