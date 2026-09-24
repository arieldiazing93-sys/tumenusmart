"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { Tarjeta, Campo, Entrada, Selector, clasesBoton } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";
import { etiquetaIva, TASAS_IVA } from "@/lib/iva";
import { calcularCompra } from "@/lib/compra-calculo";
import { actualizarCompra, registrarCompra, type InsumoParaCompra } from "../actions";
import { BuscarInsumoParaCompra } from "./BuscarInsumoParaCompra";

type Proveedor = { id: string; nombre: string; ruc: string | null };
type Almacen = { id: string; nombre: string };

/**
 * Los datos de una compra ya guardada, para abrirla en el mismo formulario y
 * corregirla. Todo va como texto, tal cual lo escribiría quien la carga.
 */
export type CompraInicial = {
  compraId: string;
  proveedorId: string;
  fecha: string;
  folioFactura: string;
  timbrado: string;
  condicionPago: "contado" | "credito";
  fechaVencimiento: string;
  notas: string;
  descuentoGeneral: string;
  lineas: Omit<Linea, "clave">[];
};

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
  /** Costo de una unidad de compra CON IVA, tal cual lo dice la factura del proveedor. El costo sin IVA se calcula solo. */
  costo: string;
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

/** El porcentaje de IVA de un insumo ("gravado10" → 10). */
function porcentajeIva(iva: string): number {
  return TASAS_IVA.find((t) => t.valor === iva)?.porcentaje ?? 10;
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
  inicial,
}: {
  proveedores: Proveedor[];
  almacenes: Almacen[];
  /** Si viene, el formulario corrige esa compra ya guardada en vez de cargar una nueva. */
  inicial?: CompraInicial;
}) {
  const editando = inicial !== undefined;
  const lineasIniciales = (): Linea[] => (inicial?.lineas ?? []).map((l, i) => ({ ...l, clave: i + 1 }));

  const [pendiente, iniciar] = useTransition();
  const [proveedorId, setProveedorId] = useState(inicial?.proveedorId ?? "");
  const [fecha, setFecha] = useState(inicial?.fecha ?? "");
  const [folioFactura, setFolioFactura] = useState(inicial?.folioFactura ?? "");
  const [timbrado, setTimbrado] = useState(inicial?.timbrado ?? "");
  const [condicionPago, setCondicionPago] = useState<"contado" | "credito">(inicial?.condicionPago ?? "contado");
  const [fechaVencimiento, setFechaVencimiento] = useState(inicial?.fechaVencimiento ?? "");
  const [notas, setNotas] = useState(inicial?.notas ?? "");
  const [descuentoGeneral, setDescuentoGeneral] = useState(inicial?.descuentoGeneral ?? "");
  const [lineas, setLineas] = useState<Linea[]>(lineasIniciales);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const contador = useRef(inicial?.lineas.length ?? 0);
  /** La línea recién agregada: al dibujarse, el cursor va a su cantidad. */
  const enfocarClave = useRef<number | null>(null);

  // Se completa recién en el navegador: en el servidor "hoy" sería el de UTC.
  // Una compra que se está corrigiendo ya trae su propia fecha.
  useEffect(() => {
    if (!editando) setFecha(hoyLocal());
  }, [editando]);

  // Escape en el modal de confirmación = "No" (salvo mientras ya está guardando).
  useEffect(() => {
    if (!confirmando) return;
    function alTeclado(e: KeyboardEvent) {
      if (e.key === "Escape" && !pendiente) setConfirmando(false);
    }
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [confirmando, pendiente]);

  // Después de elegir un insumo el cursor sigue en su cantidad (la línea ya
  // existe en pantalla), así se carga todo con el teclado: buscar, elegir,
  // cantidad, costo… y con Tab se vuelve al buscador de abajo.
  useEffect(() => {
    const clave = enfocarClave.current;
    if (clave == null) return;
    enfocarClave.current = null;
    const campo = document.querySelector<HTMLInputElement>(`input[data-cantidad-linea="${clave}"]`);
    campo?.focus();
  }, [lineas]);

  const calculo = useMemo(
    () =>
      calcularCompra(
        lineas.map((l) => ({
          cantidad: aNumero(l.cantidad),
          costoUnitario: aNumero(l.costo),
          costoIncluyeIva: true,
          descuentoPorcentaje: aNumero(l.descuentoPorcentaje),
          iva: l.iva,
        })),
        aNumero(descuentoGeneral)
      ),
    [lineas, descuentoGeneral]
  );

  function agregarLinea(insumo: InsumoParaCompra) {
    setError(null);
    contador.current += 1;
    const clave = contador.current;
    enfocarClave.current = clave;
    setLineas((actuales) => {
      // Todo insumo entra a un almacén: cada línea arranca en el de la línea
      // anterior, o en el primero de la lista si es la primera.
      const almacenPorDefecto =
        actuales.length > 0 ? actuales[actuales.length - 1].almacenId : (almacenes[0]?.id ?? "");
      return [
        ...actuales,
        {
          clave,
          insumoId: insumo.id,
          nombre: insumo.nombre,
          unidadMedida: insumo.unidadMedida,
          iva: insumo.iva,
          rendimiento: insumo.rendimiento,
          almacenId: almacenPorDefecto,
          cantidad: "",
          // El último costo que se guardó es neto: se le suma el IVA para
          // precargarlo como se carga siempre, con IVA.
          costo:
            insumo.ultimoCostoPorCompra != null
              ? String(Math.round(insumo.ultimoCostoPorCompra * (1 + porcentajeIva(insumo.iva) / 100)))
              : "",
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
    return lineas.length > 0 || !!folioFactura || !!timbrado || !!notas || !!proveedorId || !!descuentoGeneral;
  }

  /** Nueva compra: vacía todo. Compra en corrección: vuelve a lo que estaba guardado. */
  function deshacer() {
    const pregunta = editando
      ? "¿Volver a los datos guardados de la compra? Se pierden los cambios que hiciste."
      : "¿Descartar todo lo que cargaste en esta compra?";
    if ((editando || hayAlgoCargado()) && !confirm(pregunta)) return;
    setProveedorId(inicial?.proveedorId ?? "");
    setFecha(inicial?.fecha ?? hoyLocal());
    setFolioFactura(inicial?.folioFactura ?? "");
    setTimbrado(inicial?.timbrado ?? "");
    setCondicionPago(inicial?.condicionPago ?? "contado");
    setFechaVencimiento(inicial?.fechaVencimiento ?? "");
    setNotas(inicial?.notas ?? "");
    setDescuentoGeneral(inicial?.descuentoGeneral ?? "");
    contador.current = inicial?.lineas.length ?? 0;
    setLineas(lineasIniciales());
    setError(null);
  }

  /** Revisa que la compra esté completa y, si lo está, pregunta antes de guardar. */
  function pedirConfirmacion() {
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
    setConfirmando(true);
  }

  /** Guarda de verdad. Solo se llega acá con el "Sí" del modal de confirmación. */
  function guardar() {
    setError(null);
    const validas = lineas.filter((l) => aNumero(l.cantidad) > 0 && l.costo !== "");
    const datos = {
      proveedorId: proveedorId || null,
      fecha,
      folioFactura: folioFactura.trim() || null,
      timbrado: timbrado.trim() || null,
      condicionPago,
      fechaVencimiento: condicionPago === "credito" ? fechaVencimiento || null : null,
      descuentoGeneralPorcentaje: aNumero(descuentoGeneral),
      notas: notas.trim() || null,
      lineas: validas.map((l) => ({
        insumoId: l.insumoId,
        almacenId: l.almacenId,
        cantidad: aNumero(l.cantidad),
        costoUnitario: aNumero(l.costo),
        costoIncluyeIva: true,
        descuentoPorcentaje: aNumero(l.descuentoPorcentaje),
      })),
    };
    iniciar(async () => {
      const resultado = inicial ? await actualizarCompra(inicial.compraId, datos) : await registrarCompra(datos);
      // Si sale bien, la acción redirige sola — este código no sigue.
      if (resultado && !resultado.ok) {
        setConfirmando(false);
        setError(resultado.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Barra de acciones. Imprimir todavía no existe (queda para el reporte);
          "Eliminar" de una línea es el Quitar de cada una, y anular una compra
          ya guardada se hace desde su detalle. */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={pendiente} onClick={pedirConfirmacion} className={clasesBoton("principal")}>
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" disabled={pendiente} onClick={deshacer} className={clasesBoton("suave")}>
          Deshacer
        </button>
        <Link
          href={inicial ? `/admin/stock/compras/${inicial.compraId}` : "/admin/stock/compras"}
          className={clasesBoton("navegar")}
        >
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
          <Campo etiqueta="Timbrado de la factura" ayuda="Hasta 8 números. Se necesita para el registro de compras de la DNIT (RG 90).">
            <Entrada
              inputMode="numeric"
              maxLength={8}
              value={timbrado}
              onChange={(e) => setTimbrado(e.target.value.replace(/\D/g, ""))}
              placeholder="Ej: 12345678"
            />
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
            etiqueta="Fecha de vencimiento de la factura (solo a crédito)"
            ayuda={
              condicionPago === "credito"
                ? "La fecha límite para pagarle al proveedor."
                : "Se completa solo si la compra es a crédito."
            }
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

        {lineas.length > 0 && (
          <p className="text-[0.78rem] text-tinta-suave">
            Cargá el costo con IVA, como dice la factura: el costo sin IVA se calcula solo.
          </p>
        )}

        {lineas.length === 0 ? (
          <p className="rounded-lg border border-dashed border-linea px-3 py-6 text-center text-sm text-tinta-suave">
            Todavía no agregaste ningún insumo — buscalo abajo por nombre.
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
                        data-cantidad-linea={l.clave}
                        value={l.cantidad}
                        onChange={(e) => actualizarLinea(l.clave, { cantidad: e.target.value })}
                      />
                    </Celda>
                    <Celda etiqueta="Almacén">
                      <Selector
                        value={l.almacenId}
                        onChange={(e) => actualizarLinea(l.clave, { almacenId: e.target.value })}
                      >
                        {almacenes.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.nombre}
                          </option>
                        ))}
                      </Selector>
                    </Celda>
                    {/* Solo se escribe el costo CON IVA (así viene en la factura);
                        este otro se ve pero no se puede tipear, para que nadie
                        cargue el costo en la columna equivocada. */}
                    <Celda etiqueta="Costo s/ IVA">
                      <Entrada
                        disabled
                        value={l.costo !== "" ? formatearGuarani(calculada.costoUnitarioNeto) : ""}
                      />
                    </Celda>
                    <Celda etiqueta="Costo c/ IVA">
                      <Entrada
                        type="number"
                        step="any"
                        min="0"
                        value={l.costo}
                        onChange={(e) => actualizarLinea(l.clave, { costo: e.target.value })}
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
                    {/* Fuera del recorrido con Tab: al terminar la línea, el
                        siguiente Tab tiene que ir al buscador de abajo. */}
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => quitarLinea(l.clave)}
                      className={clasesBoton("peligro", "sm")}
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* El buscador va DEBAJO de las líneas: después del último campo de la
            última línea, Tab cae acá para seguir agregando insumos. */}
        <BuscarInsumoParaCompra onElegir={agregarLinea} />
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
        <button type="button" disabled={pendiente} onClick={pedirConfirmacion} className={clasesBoton("principal")}>
          {pendiente ? "Guardando…" : editando ? "Guardar cambios" : "Guardar compra"}
        </button>
      </div>

      {confirmando && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/45 p-4"
          onClick={() => {
            if (!pendiente) setConfirmando(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Confirmar compra"
            className="w-full max-w-sm rounded-xl bg-superficie p-5 shadow-alta animate-[subir_0.22s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[1.05rem] font-semibold text-tinta">
              ¿Están correctos los datos que cargaste?
            </p>
            <p className="mt-1.5 text-[0.85rem] text-tinta-media">
              {editando
                ? "Revisalos antes de guardar: el stock de los insumos se ajusta por la diferencia con lo que ya estaba registrado."
                : "Revisalos antes de guardar: al guardar, el stock de los insumos sube y el costo queda registrado."}
            </p>
            <p className="cifra mt-3 rounded-lg bg-papel-suave px-3 py-2 text-[0.88rem] text-tinta">
              {lineas.length} {lineas.length === 1 ? "insumo" : "insumos"} · Total {formatearGuarani(calculo.total)}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={pendiente}
                onClick={() => setConfirmando(false)}
                className={clasesBoton("suave")}
              >
                No
              </button>
              <button
                type="button"
                autoFocus
                disabled={pendiente}
                onClick={guardar}
                className={clasesBoton("principal")}
              >
                {pendiente ? "Guardando…" : "Sí, guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
