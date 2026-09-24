"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { Area, Campo, Entrada, Selector, Tarjeta, clasesBoton } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";
import { TASAS_IVA, etiquetaIva } from "@/lib/iva";
import { calcularCotizacion, VALIDEZ_DIAS_POR_DEFECTO } from "@/lib/cotizacion";
import {
  actualizarCotizacion,
  crearCotizacion,
  type ClienteParaCotizacion,
  type ProductoParaCotizacion,
} from "./actions";
import { BuscarClienteParaCotizacion } from "./BuscarClienteParaCotizacion";
import { BuscarProductoParaCotizacion } from "./BuscarProductoParaCotizacion";

type TipoDescuento = "ninguno" | "porcentaje" | "monto";

type Linea = {
  clave: number;
  nombre: string;
  descripcion: string;
  cantidad: string;
  /** De una unidad, con IVA incluido. */
  precio: string;
  iva: string;
  /** true si no salió del catálogo: el nombre y el IVA se escriben a mano. */
  libre: boolean;
};

/** Los datos de un presupuesto ya guardado, para abrirlo en el mismo formulario y corregirlo. */
export type CotizacionInicial = {
  id: string;
  clienteNombre: string;
  clienteIdentificacion: string;
  clienteTelefono: string;
  clienteEmail: string;
  validezDias: string;
  notas: string;
  tipoDescuento: TipoDescuento;
  valorDescuento: string;
  lineas: Omit<Linea, "clave">[];
};

/** Las columnas de las líneas desde pantalla mediana: producto, cantidad, precio, importe y quitar. */
const COLUMNAS_LINEA = "sm:grid-cols-[minmax(0,2fr)_5.5rem_9rem_8rem_4.5rem]";

function aNumero(texto: string): number {
  const n = Number(texto);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Un campo de una línea. Desde pantalla mediana la etiqueta ya está en la
 * cabecera de la tabla; en el celular no hay cabecera, así que se muestra acá.
 */
function Celda({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[0.78rem] font-semibold text-tinta-media sm:hidden">{etiqueta}</span>
      {children}
    </label>
  );
}

/**
 * El formulario de un presupuesto: datos del cliente, las líneas (productos o
 * servicios buscados en el catálogo, o escritos a mano), el descuento y las
 * condiciones. Lo que se ve abajo es una vista previa — el servidor recalcula
 * todo con la misma función (calcularCotizacion) antes de guardar.
 */
export function CotizacionForm({ inicial }: { inicial?: CotizacionInicial }) {
  const editando = inicial !== undefined;
  const lineasIniciales = (): Linea[] => (inicial?.lineas ?? []).map((l, i) => ({ ...l, clave: i + 1 }));

  const [pendiente, iniciar] = useTransition();
  const [clienteNombre, setClienteNombre] = useState(inicial?.clienteNombre ?? "");
  const [clienteIdentificacion, setClienteIdentificacion] = useState(inicial?.clienteIdentificacion ?? "");
  const [clienteTelefono, setClienteTelefono] = useState(inicial?.clienteTelefono ?? "");
  const [clienteEmail, setClienteEmail] = useState(inicial?.clienteEmail ?? "");
  const [validezDias, setValidezDias] = useState(inicial?.validezDias ?? String(VALIDEZ_DIAS_POR_DEFECTO));
  const [notas, setNotas] = useState(inicial?.notas ?? "");
  const [tipoDescuento, setTipoDescuento] = useState<TipoDescuento>(inicial?.tipoDescuento ?? "ninguno");
  const [valorDescuento, setValorDescuento] = useState(inicial?.valorDescuento ?? "");
  const [lineas, setLineas] = useState<Linea[]>(lineasIniciales);
  const [error, setError] = useState<string | null>(null);
  const contador = useRef(inicial?.lineas.length ?? 0);
  /** La línea recién agregada: al dibujarse, el cursor va a su primer campo. */
  const enfocarClave = useRef<number | null>(null);

  // Después de agregar una línea el cursor sigue en ella (la cantidad si salió
  // del catálogo, el nombre si es libre): se carga todo con el teclado y con
  // Tab se vuelve al buscador de abajo.
  useEffect(() => {
    const clave = enfocarClave.current;
    if (clave == null) return;
    enfocarClave.current = null;
    document.querySelector<HTMLInputElement>(`input[data-foco-linea="${clave}"]`)?.focus();
  }, [lineas]);

  const calculo = useMemo(
    () =>
      calcularCotizacion(
        lineas.map((l) => ({ cantidad: aNumero(l.cantidad), precioUnitario: aNumero(l.precio), iva: l.iva })),
        tipoDescuento === "ninguno" ? null : { tipo: tipoDescuento, valor: aNumero(valorDescuento) }
      ),
    [lineas, tipoDescuento, valorDescuento]
  );

  function agregarLinea(nueva: Omit<Linea, "clave">) {
    setError(null);
    contador.current += 1;
    const clave = contador.current;
    enfocarClave.current = clave;
    setLineas((actuales) => [...actuales, { ...nueva, clave }]);
  }

  function agregarDelCatalogo(p: ProductoParaCotizacion) {
    agregarLinea({
      nombre: p.nombre,
      descripcion: "",
      cantidad: "1",
      precio: String(p.precio),
      iva: p.iva,
      libre: false,
    });
  }

  function agregarLibre() {
    agregarLinea({ nombre: "", descripcion: "", cantidad: "1", precio: "", iva: "gravado10", libre: true });
  }

  function usarCliente(c: ClienteParaCotizacion) {
    setClienteNombre(c.nombre);
    setClienteIdentificacion(c.identificacion ?? "");
    setClienteTelefono(c.telefono ?? "");
    setClienteEmail(c.email ?? "");
  }

  function actualizarLinea(clave: number, cambios: Partial<Linea>) {
    setLineas((actuales) => actuales.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));
  }

  function quitarLinea(clave: number) {
    setLineas((actuales) => actuales.filter((l) => l.clave !== clave));
  }

  function guardar() {
    setError(null);
    if (!clienteNombre.trim()) {
      setError("Escribí el nombre del cliente.");
      return;
    }
    if (lineas.length === 0) {
      setError("Agregá al menos un producto o servicio.");
      return;
    }
    if (lineas.some((l) => !l.nombre.trim() || aNumero(l.cantidad) <= 0 || l.precio === "")) {
      setError("Cada línea necesita nombre, cantidad y precio — completalas o quitalas.");
      return;
    }
    if (!calculo.ok) {
      setError(calculo.error);
      return;
    }
    const datos = {
      clienteNombre: clienteNombre.trim(),
      clienteIdentificacion: clienteIdentificacion.trim() || null,
      clienteTelefono: clienteTelefono.trim() || null,
      clienteEmail: clienteEmail.trim() || null,
      validezDias: aNumero(validezDias) || VALIDEZ_DIAS_POR_DEFECTO,
      notas: notas.trim() || null,
      descuento: tipoDescuento === "ninguno" ? null : { tipo: tipoDescuento, valor: aNumero(valorDescuento) },
      lineas: lineas.map((l) => ({
        nombre: l.nombre.trim(),
        descripcion: l.descripcion.trim() || null,
        cantidad: aNumero(l.cantidad),
        precioUnitario: aNumero(l.precio),
        iva: l.iva,
      })),
    };
    iniciar(async () => {
      const resultado = inicial ? await actualizarCotizacion(inicial.id, datos) : await crearCotizacion(datos);
      // Si sale bien, la acción redirige sola al presupuesto — este código no sigue.
      if (resultado && !resultado.ok) setError(resultado.error);
    });
  }

  const volverA = inicial ? `/admin/cotizaciones/${inicial.id}` : "/admin/cotizaciones";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={pendiente} onClick={guardar} className={clasesBoton("principal")}>
          {pendiente ? "Guardando…" : editando ? "Guardar cambios" : "Guardar presupuesto"}
        </button>
        <Link href={volverA} className={clasesBoton("navegar")}>
          Cancelar
        </Link>
      </div>

      <Tarjeta className="flex flex-col gap-3">
        <p className="rotulo text-[0.8rem] font-bold">Datos del cliente</p>
        <BuscarClienteParaCotizacion onElegir={usarCliente} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Campo etiqueta="Nombre o razón social" className="lg:col-span-2">
            <Entrada value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} placeholder="Ej: Juan Pérez" />
          </Campo>
          <Campo etiqueta="RUC o cédula (opcional)">
            <Entrada value={clienteIdentificacion} onChange={(e) => setClienteIdentificacion(e.target.value)} />
          </Campo>
          <Campo etiqueta="Teléfono (opcional)">
            <Entrada value={clienteTelefono} onChange={(e) => setClienteTelefono(e.target.value)} inputMode="tel" />
          </Campo>
          <Campo etiqueta="Correo (opcional)" className="sm:col-span-2 lg:col-span-4">
            <Entrada type="email" value={clienteEmail} onChange={(e) => setClienteEmail(e.target.value)} />
          </Campo>
        </div>
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-3">
        <p className="rotulo text-[0.8rem] font-bold">Productos y servicios</p>

        {lineas.length === 0 ? (
          <p className="rounded-lg border border-dashed border-linea px-3 py-6 text-center text-sm text-tinta-suave">
            Todavía no agregaste nada — buscalo abajo por nombre.
          </p>
        ) : (
          <div className="flex flex-col">
            {/* Cabecera de la tabla: desde pantalla mediana. En el celular cada
                campo trae su propia etiqueta (ver Celda). */}
            <div
              className={`hidden gap-2 px-0.5 pb-1.5 text-[0.78rem] font-semibold text-tinta-media sm:grid ${COLUMNAS_LINEA}`}
            >
              <span>Producto o servicio</span>
              <span>Cant.</span>
              <span>Precio unit. (IVA incl.)</span>
              <span className="text-right">Importe</span>
              <span />
            </div>

            {lineas.map((l, i) => {
              const importe = calculo.ok ? calculo.importes[i] : Math.round(aNumero(l.cantidad) * aNumero(l.precio));
              return (
                <div
                  key={l.clave}
                  className={`grid grid-cols-2 items-start gap-2 border-t border-linea py-2.5 ${COLUMNAS_LINEA}`}
                >
                  <div className="col-span-2 flex min-w-0 flex-col gap-1.5 sm:col-span-1">
                    {l.libre ? (
                      <>
                        <Entrada
                          data-foco-linea={l.clave}
                          value={l.nombre}
                          onChange={(e) => actualizarLinea(l.clave, { nombre: e.target.value })}
                          placeholder="Nombre del producto o servicio"
                        />
                        <Selector value={l.iva} onChange={(e) => actualizarLinea(l.clave, { iva: e.target.value })}>
                          {TASAS_IVA.map((t) => (
                            <option key={t.valor} value={t.valor}>
                              {t.etiqueta}
                            </option>
                          ))}
                        </Selector>
                      </>
                    ) : (
                      <div>
                        <p className="font-medium leading-tight">{l.nombre}</p>
                        <p className="text-xs text-tinta-suave">{etiquetaIva(l.iva)}</p>
                      </div>
                    )}
                    <Entrada
                      value={l.descripcion}
                      onChange={(e) => actualizarLinea(l.clave, { descripcion: e.target.value })}
                      placeholder="Detalle (opcional)"
                      className="!py-1.5 !text-[0.82rem]"
                    />
                  </div>

                  <Celda etiqueta="Cantidad">
                    <Entrada
                      type="number"
                      step="any"
                      min="0"
                      data-foco-linea={l.libre ? undefined : l.clave}
                      value={l.cantidad}
                      onChange={(e) => actualizarLinea(l.clave, { cantidad: e.target.value })}
                    />
                  </Celda>
                  <Celda etiqueta="Precio unit. (IVA incl.)">
                    <Entrada
                      type="number"
                      step="any"
                      min="0"
                      value={l.precio}
                      onChange={(e) => actualizarLinea(l.clave, { precio: e.target.value })}
                    />
                  </Celda>
                  <div>
                    <span className="mb-1 block text-[0.78rem] font-semibold text-tinta-media sm:hidden">Importe</span>
                    <p className="cifra py-2.5 text-[0.88rem] font-medium sm:text-right">{formatearGuarani(importe)}</p>
                  </div>
                  <div className="justify-self-end">
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
            última línea, Tab cae acá para seguir agregando. */}
        <BuscarProductoParaCotizacion onElegir={agregarDelCatalogo} />
        <div>
          <button type="button" onClick={agregarLibre} className={clasesBoton("suave", "sm")}>
            + Agregar línea libre (algo que no está en el catálogo)
          </button>
        </div>
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-3">
            <Campo etiqueta="Validez del presupuesto (días)" ayuda="Cuántos días vale el precio desde hoy.">
              <Entrada
                type="number"
                min="1"
                max="365"
                step="1"
                value={validezDias}
                onChange={(e) => setValidezDias(e.target.value)}
                className="sm:w-40"
              />
            </Campo>
            <Campo etiqueta="Descuento general">
              <div className="flex flex-wrap gap-2">
                <Selector
                  value={tipoDescuento}
                  onChange={(e) => setTipoDescuento(e.target.value as TipoDescuento)}
                  className="sm:w-44"
                >
                  <option value="ninguno">Sin descuento</option>
                  <option value="porcentaje">En porcentaje (%)</option>
                  <option value="monto">En guaraníes (Gs.)</option>
                </Selector>
                {tipoDescuento !== "ninguno" && (
                  <Entrada
                    type="number"
                    min="0"
                    step="any"
                    value={valorDescuento}
                    onChange={(e) => setValorDescuento(e.target.value)}
                    placeholder={tipoDescuento === "porcentaje" ? "Ej: 10" : "Ej: 50000"}
                    className="sm:w-40"
                  />
                )}
              </div>
            </Campo>
          </div>

          <dl className="cifra flex flex-col gap-1.5 self-start text-[0.88rem]">
            {calculo.ok ? (
              <>
                <div className="flex justify-between gap-4">
                  <dt className="text-tinta-media">Subtotal</dt>
                  <dd>{formatearGuarani(calculo.subtotal)}</dd>
                </div>
                {calculo.descuento > 0 && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-tinta-media">Descuento</dt>
                    <dd>− {formatearGuarani(calculo.descuento)}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-4 border-t border-linea pt-1.5 text-[1.05rem] font-semibold">
                  <dt>Total</dt>
                  <dd>{formatearGuarani(calculo.total)}</dd>
                </div>
                {(calculo.iva10 > 0 || calculo.iva5 > 0) && (
                  <p className="text-xs text-tinta-suave">
                    IVA incluido:
                    {calculo.iva10 > 0 && ` 10% ${formatearGuarani(calculo.iva10)}`}
                    {calculo.iva10 > 0 && calculo.iva5 > 0 && " ·"}
                    {calculo.iva5 > 0 && ` 5% ${formatearGuarani(calculo.iva5)}`}
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm font-medium text-peligro">{calculo.error}</p>
            )}
          </dl>
        </div>

        <Campo etiqueta="Notas o condiciones (opcional)" ayuda="Salen al pie del presupuesto. Ej: forma de pago, plazo de entrega.">
          <Area rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} />
        </Campo>
      </Tarjeta>

      {error && <p className="text-sm font-medium text-peligro">{error}</p>}
      <div>
        <button type="button" disabled={pendiente} onClick={guardar} className={clasesBoton("principal")}>
          {pendiente ? "Guardando…" : editando ? "Guardar cambios" : "Guardar presupuesto"}
        </button>
      </div>
    </div>
  );
}
