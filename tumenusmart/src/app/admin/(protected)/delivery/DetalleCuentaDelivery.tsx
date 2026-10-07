"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MensajeError, Pastilla, Tarjeta, clasesBoton } from "@/components/ui";
import { formatearCantidad, formatearGuarani, formatearNumero } from "@/lib/format";
import { agruparPorClave, claveDeLinea, importeDeLinea, repartirEnFilas, textoEstadoCuenta } from "@/lib/comedor";
import { textoPorcentaje } from "@/lib/descuento-venta";
import { rutaParaAbrirTurno } from "@/lib/turno-requerido";
import { enlaceDeMapa, extraerUbicacion, primerEnlace, textoSinEnlaces } from "@/lib/ubicacion-mapa";
import { etiquetaTipoIdentificacion } from "@/lib/tipo-cliente";
import { DialogoCancelarProducto, DialogoDescuento, DialogoMotivo } from "../comedor/DetalleCuenta";
import { CargarProductosPanel } from "../comedor/CargarProductosPanel";
import { Hace, HoraDe } from "../comedor/tiempo";
import { imprimirComprobante } from "@/lib/impresion-comprobantes";
import {
  anularFacturaDelivery,
  anularProductosDelivery,
  aplicarDescuentoDelivery,
  asignarRepartidorDelivery,
  cancelarCuentaDelivery,
  cargarProductosDelivery,
  imprimirCuentaDelivery,
  reabrirCuentaDelivery,
} from "./actions";
import { AbrirCuentaDeliveryPanel } from "./AbrirCuentaDeliveryPanel";
import { rutaCrudoFactura, textoImpresionFactura } from "./FacturaRapidaDeliveryPanel";
import type { ContextoDelivery, CuentaDeliveryFila, ItemDeliveryFila } from "./tipos-delivery";

const ROTULO = "text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave";
/** Los rótulos del pie de la cuenta (Subtotal, Descuento, Envío, Impuestos, Total): en negrita. */
const ROTULO_PIE = "text-[0.7rem] font-bold uppercase tracking-rotulo text-tinta";

/**
 * El mismo producto cargado en varios pedidos, junto en UNA fila (10 empanadas, no 10 filas de 1): misma descripción, mismas
 * opciones, misma nota de cocina y mismo precio. Guarda las filas de la cuenta de las que sale (de la más vieja a la más nueva)
 * para saber de cuál cancelar si hace falta.
 */
type GrupoDeCuenta = {
  clave: string;
  nombre: string;
  opciones: string | null;
  quitados: string | null;
  nota: string | null;
  cantidad: number;
  /** Lo que vale la fila: la suma de lo que valía cada una (enteros de guaraníes, no se redondea nada). */
  importe: number;
  filas: ItemDeliveryFila[];
  rondas: number[];
};

type Dialogo =
  | { tipo: "anular"; grupo: GrupoDeCuenta }
  | { tipo: "cancelar" }
  | { tipo: "descuento" }
  | { tipo: "anularFactura" }
  | null;

/**
 * Todo lo que compone la cuenta de un delivery (los datos del cliente y la entrega, los productos cargados, su descuento y su total
 * con el envío) y, arriba, lo que la caja puede hacer con ella: cargar productos, dar un descuento, corregir los datos, imprimir la
 * cuenta, reabrirla, asignarle el repartidor, cobrarla, y cerrarla solo si quedó vacía. Cancelar un producto o cerrar la cuenta
 * siempre pide un motivo. Una cuenta con productos NO se cancela acá: se cobra y, si hace falta, se cancela la venta desde el
 * Historial de cuentas.
 *
 * Una cuenta impresa (por cobrar) no admite cambios hasta reabrirla. El repartidor se puede asignar en cualquier momento mientras la
 * cuenta esté abierta: asignarlo ya lo manda a trabajar (le aparece al instante en su enlace), no hay que marcar nada más.
 */
export function DetalleCuentaDelivery({
  cuenta,
  contexto,
  onCobrar,
  onFacturar,
}: {
  cuenta: CuentaDeliveryFila;
  contexto: ContextoDelivery;
  onCobrar: () => void;
  /** Abre el panel de la "factura rápida": emite solo la factura, sin cobrar ni registrar la venta. */
  onFacturar: () => void;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [cargando, setCargando] = useState(false);
  const [editando, setEditando] = useState(false);
  // El producto marcado en la lista (para cancelarlo con el botón de arriba).
  const [seleccionadaClave, setSeleccionadaClave] = useState<string | null>(null);

  const abierta = cuenta.estado === "abierta";
  const porCobrar = cuenta.estado === "por_cobrar";
  /** Todos sus productos se cancelaron: ya no hay nada que cobrar y la cuenta se puede cerrar. */
  const sinProductos = cuenta.items.every((i) => i.anulado);
  const t = cuenta.totales;
  /** Los productos se marcan para cancelarlos solo con la cuenta abierta y con el permiso de la caja. */
  const puedeMarcar = abierta && contexto.puedeGestionar;

  // La ubicación del cliente: el punto marcado o pegado (coordenadas) o, si solo hay un enlace corto, ese enlace.
  const coordenadas =
    cuenta.clienteLat != null && cuenta.clienteLng != null
      ? { lat: cuenta.clienteLat, lng: cuenta.clienteLng }
      : extraerUbicacion(cuenta.direccion);
  const linkUbicacion = coordenadas ? enlaceDeMapa(coordenadas) : primerEnlace(cuenta.direccion);
  const direccionEscrita = textoSinEnlaces(cuenta.direccion);

  // Lo que sigue en la cuenta, con el mismo producto de varios pedidos junto en una fila; lo cancelado va aparte, tal cual (cada
  // cancelación tiene su motivo y su responsable).
  const grupos: GrupoDeCuenta[] = agruparPorClave(
    cuenta.items.filter((i) => !i.anulado),
    (i) => claveDeLinea({ nombre: i.nombre, opciones: i.opciones, quitados: i.quitados, nota: i.nota, precioUnitario: i.precioUnitario }, true)
  ).map((filas) => ({
    clave: claveDeLinea(
      { nombre: filas[0].nombre, opciones: filas[0].opciones, quitados: filas[0].quitados, nota: filas[0].nota, precioUnitario: filas[0].precioUnitario },
      true
    ),
    nombre: filas[0].nombre,
    opciones: filas[0].opciones,
    quitados: filas[0].quitados,
    nota: filas[0].nota,
    cantidad: filas.reduce((s, f) => s + f.cantidad, 0),
    importe: filas.reduce((s, f) => s + importeDeLinea(f), 0),
    filas,
    rondas: [...new Set(filas.map((f) => f.ronda))].sort((a, b) => a - b),
  }));
  const cancelados = cuenta.items.filter((i) => i.anulado);
  // Si el producto marcado ya no está (se canceló, o la lista se actualizó), no hay ninguno marcado.
  const seleccionado = grupos.find((g) => g.clave === seleccionadaClave) ?? null;

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
      () => imprimirCuentaDelivery(cuenta.id),
      () => setAviso("La cuenta salió a la cola de impresión. Quedó por cobrar: ya no se le puede cargar nada hasta reabrirla.")
    );
  }

  function reabrir() {
    ejecutar(
      () => reabrirCuentaDelivery(cuenta.id),
      () => setAviso("La cuenta se reabrió: ya se le pueden cargar más productos.")
    );
  }

  /** Vuelve a mandar a la impresora la factura que ya se emitió (no emite otra ni gasta un número). */
  async function imprimirFactura() {
    setError(null);
    setAviso(null);
    const r = await imprimirComprobante(rutaCrudoFactura(cuenta.id), contexto.facturaRapida.ok ? contexto.facturaRapida.nombreImpresoraTicket : null);
    if (r.ok) setAviso(textoImpresionFactura(r));
    else setError(`${textoImpresionFactura(r)} Podés verla e imprimirla a mano desde “Ver factura”.`);
  }

  return (
    <div className="flex flex-col gap-2">
      <Tarjeta padding={false} className="flex flex-col gap-2 !border-2 !border-azul/50 p-3">
        {/* ----------------------------------------------------------------------- encabezado */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-[1.15rem] font-semibold leading-tight tracking-titular text-tinta">
              Delivery {formatearNumero(cuenta.numero)} · {cuenta.clienteNombre}
            </h2>
            <p className="text-[0.78rem] text-tinta-media">
              <a href={`tel:${cuenta.clienteTelefono}`} className="text-brand-texto hover:underline">
                📞 {cuenta.clienteTelefono}
              </a>{" "}
              · <Hace iso={cuenta.abiertaEn} />
            </p>
          </div>
          <div className="flex flex-none flex-col items-end gap-0.5">
            <Pastilla color={porCobrar ? "amarillo" : "marca"} punto>
              {textoEstadoCuenta(cuenta.estado)}
            </Pastilla>
            <p className="cifra text-[1.35rem] font-bold leading-none text-tinta">{formatearGuarani(t.total)}</p>
          </div>
        </div>

        {/* ----------------------------------------------------------------------- la entrega y el cliente */}
        <div className="flex flex-col gap-0.5 rounded-lg bg-papel-suave px-2.5 py-2 text-[0.82rem] text-tinta-media">
          {direccionEscrita && <p>📍 {direccionEscrita}</p>}
          {linkUbicacion && (
            <a href={linkUbicacion} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-texto hover:underline">
              Ver la ubicación en el mapa
            </a>
          )}
          {!direccionEscrita && !linkUbicacion && <p>📍 Sin dirección</p>}
          <p>
            🛵 {cuenta.zonaNombre} · envío <span className="cifra font-medium text-tinta">{formatearGuarani(cuenta.costoEnvio)}</span>
          </p>
          {cuenta.notas && <p>Nota: {cuenta.notas}</p>}
          {cuenta.ficha && (
            <p>
              Factura a nombre de <span className="font-medium text-tinta">{cuenta.ficha.razon}</span> ({etiquetaTipoIdentificacion(cuenta.ficha.tipo)}{" "}
              {cuenta.ficha.numero})
            </p>
          )}
        </div>

        {porCobrar && cuenta.impresaEn && !cuenta.factura && (
          <p className="text-[0.76rem] font-medium text-amarillo-oscuro">
            Cuenta impresa a las <HoraDe iso={cuenta.impresaEn} />: no se le puede cargar nada hasta reabrirla.
          </p>
        )}
        {/* Con la factura emitida y la venta sin registrar: queda a la vista para no olvidarse de cobrarla. */}
        {cuenta.factura && (
          <p className="rounded-lg border border-azul/40 bg-azul-luz/40 px-2.5 py-1.5 text-[0.78rem] font-medium text-azul-oscuro">
            Factura {cuenta.factura.numero} emitida a las <HoraDe iso={cuenta.factura.emitidaEn} />
            {cuenta.factura.cliente ? ` a nombre de ${cuenta.factura.cliente}` : ""}: falta cobrar la cuenta. Hasta entonces no se puede cambiar.
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
              {abierta && (
                <button type="button" onClick={() => setEditando(true)} className={clasesBoton("navegar", "sm")}>
                  Editar datos
                </button>
              )}
              {/* Con la factura ya emitida no se reabre: primero se anula la factura. */}
              {porCobrar && !cuenta.factura && (
                <button type="button" disabled={pendiente} onClick={reabrir} className={clasesBoton("navegar", "sm")}>
                  Reabrir cuenta
                </button>
              )}
              {(abierta || porCobrar) && (
                <button
                  type="button"
                  disabled={pendiente || !contexto.imprimirCuenta.ok || sinProductos || !!t.descuentoInvalido}
                  onClick={imprimir}
                  className={clasesBoton("navegar", "sm")}
                >
                  {porCobrar ? "Imprimir otra copia" : "Imprimir cuenta"}
                </button>
              )}
              {/* Factura rápida: sale solo la factura (no se cobra ni se registra la venta), para que el repartidor lleve todos los
                  documentos. Después, "Cobrar cuenta" usa esta misma factura. */}
              {contexto.puedeCobrar && porCobrar && !cuenta.factura && (
                <button
                  type="button"
                  disabled={pendiente || !contexto.facturaRapida.ok || sinProductos || !!t.descuentoInvalido || t.total <= 0}
                  title={contexto.facturaRapida.ok ? "Emite e imprime solo la factura, sin cobrar" : contexto.facturaRapida.motivo}
                  onClick={onFacturar}
                  className={clasesBoton("navegar", "sm")}
                >
                  Factura rápida
                </button>
              )}
              {cuenta.factura && (
                <>
                  <button type="button" disabled={pendiente} onClick={() => void imprimirFactura()} className={clasesBoton("navegar", "sm")}>
                    Imprimir factura
                  </button>
                  <a href={`/admin/delivery/${cuenta.id}/factura`} target="_blank" rel="noopener noreferrer" className={clasesBoton("navegar", "sm")}>
                    Ver factura
                  </a>
                  {contexto.puedeCobrar && (
                    <button type="button" disabled={pendiente} onClick={() => setDialogo({ tipo: "anularFactura" })} className={clasesBoton("peligro", "sm")}>
                      Anular factura
                    </button>
                  )}
                </>
              )}
              {contexto.puedeCobrar && porCobrar && (
                <button
                  type="button"
                  // Se cobra recién después de imprimir la cuenta (queda "por cobrar"). Sin turno de caja abierto no se cobra: el
                  // botón lleva directo a abrirlo y, al abrirlo, se vuelve acá.
                  disabled={pendiente || (!contexto.cobro.ok && !contexto.cobro.sinTurno) || !!t.descuentoInvalido || t.total <= 0}
                  onClick={() => (contexto.cobro.ok ? onCobrar() : router.push(rutaParaAbrirTurno("/admin/delivery")))}
                  className={clasesBoton("principal", "sm")}
                >
                  Cobrar cuenta
                </button>
              )}
              {/* Cancelar un producto (o algunas de sus unidades): se marca en la lista de abajo y se toca acá. */}
              {abierta && !sinProductos && (
                <button
                  type="button"
                  disabled={pendiente || !seleccionado}
                  title={seleccionado ? undefined : "Primero marcá un producto de la lista"}
                  onClick={() => seleccionado && setDialogo({ tipo: "anular", grupo: seleccionado })}
                  className={clasesBoton("peligro", "sm")}
                >
                  Cancelar producto
                </button>
              )}
              {/* Una cuenta CON productos no se cancela mientras se atiende. Solo se puede cerrar una cuenta que quedó vacía. */}
              {sinProductos && (abierta || porCobrar) && (
                <button type="button" disabled={pendiente} onClick={() => setDialogo({ tipo: "cancelar" })} className={clasesBoton("peligro", "sm")}>
                  Cerrar cuenta vacía
                </button>
              )}
            </div>
            {/* Solo se avisa lo que de verdad impide hacer algo (sin impresora, sin turno); las explicaciones de siempre se sacaron. */}
            {!contexto.imprimirCuenta.ok && contexto.imprimirCuenta.motivo && (abierta || porCobrar) && (
              <p className="text-[0.72rem] text-tinta-suave">No se puede imprimir desde acá: {contexto.imprimirCuenta.motivo}</p>
            )}
            {contexto.puedeCobrar && porCobrar && !contexto.cobro.ok && contexto.cobro.sinTurno && (
              <p className="text-[0.72rem] font-medium text-amarillo-oscuro">
                No hay un turno de caja abierto: al tocar “Cobrar cuenta” te llevo a abrirlo, y después volvés acá para cobrar.
              </p>
            )}
            {contexto.puedeCobrar && porCobrar && !contexto.cobro.ok && !contexto.cobro.sinTurno && contexto.cobro.motivo && (
              <p className="text-[0.72rem] text-tinta-suave">No se puede cobrar desde acá: {contexto.cobro.motivo}</p>
            )}
          </div>
        ) : (
          <p className="border-t border-linea pt-2 text-[0.76rem] text-tinta-suave">
            Solo podés mirar esta cuenta: para operarla hace falta el permiso de la caja.
          </p>
        )}

        {/* ------------------------------------------------------------ el repartidor: asignarlo ya lo manda a trabajar */}
        {contexto.puedeGestionar && (
          // Compacto, en UNA fila: el rótulo y el selector (sin leyendas ni pastilla aparte: el selector ya dice quién es).
          <div className="flex w-fit max-w-full items-center gap-2 rounded-lg border-2 border-amarillo/60 bg-amarillo-luz/40 px-2.5 py-1.5">
            <p className={`${ROTULO} flex-none`}>Repartidor</p>
            {/* Es lo que falta para que el pedido salga: en amarillo se ve de un vistazo (igual que "personal" en el POS). */}
            <select
              value={cuenta.repartidorId ?? ""}
              disabled={pendiente}
              onChange={(e) => {
                const nuevo = e.target.value;
                ejecutar(() => asignarRepartidorDelivery(cuenta.id, nuevo));
              }}
              aria-label="Repartidor"
              className="w-44 min-w-0 max-w-full rounded-lg border-2 border-amarillo bg-amarillo-campo px-2.5 py-1 text-[0.85rem] font-semibold text-tinta focus:outline-none focus:ring-2 focus:ring-amarillo/40 disabled:opacity-50"
            >
              <option value="">Sin repartidor</option>
              {contexto.repartidores.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
              {/* Un repartidor que ya no está activo se sigue viendo en la cuenta que ya tenía. */}
              {cuenta.repartidorId && !contexto.repartidores.some((r) => r.id === cuenta.repartidorId) && (
                <option value={cuenta.repartidorId}>{cuenta.repartidor ?? "Repartidor"}</option>
              )}
            </select>
          </div>
        )}

        {aviso && <p className="rounded-lg bg-exito-luz px-2.5 py-1.5 text-[0.78rem] font-medium text-exito">{aviso}</p>}
        {error && <MensajeError>{error}</MensajeError>}

        {/* ----------------------------------------------------------------------- los pedidos */}
        {/* Una tabla con tres columnas —cantidad, descripción y monto—; los pedidos van en el orden en que entraron. Con la cuenta
            abierta se marca un producto (casilla o clic en la fila) y se cancela con el botón de arriba. */}
        <div className="border-t border-linea pt-2">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className={`${ROTULO} border-b border-linea`}>
                {puedeMarcar && <th scope="col" className="w-7 pb-1" aria-label="Marcar" />}
                <th scope="col" className="w-12 pb-1 pr-2 font-semibold">
                  Cant.
                </th>
                <th scope="col" className="pb-1 pr-2 font-semibold">
                  Descripción
                </th>
                <th scope="col" className="w-24 pb-1 text-right font-semibold">
                  Monto
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linea-fina">
              {grupos.map((g) => {
                const marcado = seleccionado?.clave === g.clave;
                return (
                  <tr
                    key={g.clave}
                    onClick={(e) => {
                      // Un clic en la fila marca el producto; el de la casilla ya lo marca por su cuenta.
                      if (puedeMarcar && (e.target as HTMLElement).tagName !== "INPUT") setSeleccionadaClave(marcado ? null : g.clave);
                    }}
                    className={`align-top text-tinta ${puedeMarcar ? "cursor-pointer" : ""} ${marcado ? "bg-azul-luz/50" : ""}`}
                  >
                    {puedeMarcar && (
                      <td className="py-1 pr-1">
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={() => setSeleccionadaClave(marcado ? null : g.clave)}
                          aria-label={`Marcar ${formatearCantidad(g.cantidad)} × ${g.nombre}`}
                          className="mt-0.5 h-4 w-4 accent-peligro"
                        />
                      </td>
                    )}
                    <td className="cifra py-1 pr-2 text-[0.86rem] font-semibold">{formatearCantidad(g.cantidad)}</td>
                    <td className="py-1 pr-2 text-[0.86rem] leading-snug">
                      <p>{g.nombre}</p>
                      {g.opciones && <p className="text-[0.76rem] text-tinta-media">+ {g.opciones}</p>}
                      {g.quitados && <p className="text-[0.76rem] text-peligro">{g.quitados}</p>}
                      {g.nota && <p className="text-[0.76rem] text-tinta-media">“{g.nota}”</p>}
                    </td>
                    <td className="cifra py-1 text-right text-[0.86rem] font-medium">{formatearGuarani(g.importe)}</td>
                  </tr>
                );
              })}
              {/* El envío es una línea más de la cuenta (así sale en la factura): se ve con su zona y su monto, no solo en el pie.
                  No se marca ni se cancela, y el descuento no lo toca. */}
              <tr className="align-top text-tinta">
                {puedeMarcar && <td className="py-1 pr-1" />}
                <td className="cifra py-1 pr-2 text-[0.86rem] font-semibold">1</td>
                <td className="py-1 pr-2 text-[0.86rem] leading-snug">
                  <p>🛵 Costo de envío</p>
                </td>
                <td className="cifra py-1 text-right text-[0.86rem] font-medium">{formatearGuarani(cuenta.costoEnvio)}</td>
              </tr>
            </tbody>
            {/* Lo cancelado queda a la vista aparte, sin juntarse con nada: cada uno con quién lo canceló y por qué. */}
            {cancelados.length > 0 && (
              <tbody className="divide-y divide-linea-fina">
                <tr>
                  <td colSpan={puedeMarcar ? 4 : 3} className="pb-0.5 pt-3">
                    <p className={ROTULO}>Cancelados</p>
                  </td>
                </tr>
                {cancelados.map((i) => (
                  <tr key={i.id} className="align-top text-tinta-suave">
                    {puedeMarcar && <td className="py-1 pr-1" />}
                    <td className="cifra py-1 pr-2 text-[0.86rem] font-semibold line-through">{formatearCantidad(i.cantidad)}</td>
                    <td className="py-1 pr-2 text-[0.86rem] leading-snug">
                      <p className="line-through">{i.nombre}</p>
                      {i.opciones && <p className="text-[0.76rem]">+ {i.opciones}</p>}
                      <p className="text-[0.72rem] font-medium text-peligro">
                        Cancelado{i.anuladoPor ? ` por ${i.anuladoPor}` : ""}
                        {i.motivoAnulacion ? `: ${i.motivoAnulacion}` : ""}
                      </p>
                    </td>
                    <td className="cifra py-1 text-right text-[0.86rem] font-medium line-through">{formatearGuarani(importeDeLinea(i))}</td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </div>

        {/* ------------------------------------------------------------------ el pie: subtotal, descuento, envío, impuestos y total */}
        <PieDeCuenta cuenta={cuenta} />
      </Tarjeta>

      {/* ------------------------------------------------------------------------ ventanas */}
      {dialogo?.tipo === "anular" && (
        <DialogoCancelarProducto
          nombre={dialogo.grupo.nombre}
          cantidad={dialogo.grupo.cantidad}
          enteras
          onCerrar={() => setDialogo(null)}
          onConfirmar={async (motivo, cuantas) => {
            // Se cancela de las filas de más abajo (lo último que se cargó) hacia arriba; si se cancela todo, salen todas completas.
            const partes =
              cuantas === dialogo.grupo.cantidad
                ? dialogo.grupo.filas.map((f) => ({ itemId: f.id, cantidad: f.cantidad }))
                : repartirEnFilas(dialogo.grupo.filas, cuantas);
            const r = await anularProductosDelivery(cuenta.id, partes, motivo);
            if (r.ok) {
              setSeleccionadaClave(null);
              router.refresh();
            }
            return r;
          }}
        />
      )}
      {dialogo?.tipo === "cancelar" && (
        <DialogoMotivo
          titulo={`Cerrar la cuenta vacía ${formatearNumero(cuenta.numero)}`}
          texto="La cuenta no tiene productos activos: se cierra. Esto no se puede deshacer. Queda en el Historial de cuentas, con tu nombre y el motivo."
          confirmar="Cerrar cuenta"
          onCerrar={() => setDialogo(null)}
          onConfirmar={async (motivo) => {
            const r = await cancelarCuentaDelivery(cuenta.id, motivo);
            if (r.ok) router.refresh();
            return r;
          }}
        />
      )}
      {dialogo?.tipo === "anularFactura" && cuenta.factura && (
        <DialogoMotivo
          titulo={`Anular la factura ${cuenta.factura.numero}`}
          texto="La factura se anula: su número queda consumido y registrado como anulado, con tu nombre y el motivo. Después se puede reabrir la cuenta y emitir otra factura. Si ya se la entregaron al cliente, recuperala."
          confirmar="Anular factura"
          onCerrar={() => setDialogo(null)}
          onConfirmar={async (motivo) => {
            const r = await anularFacturaDelivery(cuenta.id, motivo);
            if (r.ok) router.refresh();
            return r;
          }}
        />
      )}
      {dialogo?.tipo === "descuento" && (
        <DialogoDescuento
          titulo={`Descuento · delivery ${formatearNumero(cuenta.numero)}`}
          descuento={cuenta.descuento}
          subtotal={t.subtotal}
          envio={t.envio}
          onAplicar={(d, motivo) => aplicarDescuentoDelivery(cuenta.id, d, motivo)}
          onCerrar={() => setDialogo(null)}
          onListo={() => {
            setDialogo(null);
            router.refresh();
          }}
        />
      )}

      {cargando && (
        <CargarProductosPanel
          categorias={contexto.categorias}
          gruposMitad={contexto.gruposMitad}
          titulo={`Cargar productos · Delivery ${formatearNumero(cuenta.numero)} · ${cuenta.clienteNombre}`}
          textoEnviar="Enviar a cocina"
          enviarItems={(items, envioId) => cargarProductosDelivery(cuenta.id, { envioId, items })}
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

      {editando && (
        <AbrirCuentaDeliveryPanel
          contexto={contexto}
          cuenta={cuenta}
          onCerrar={() => setEditando(false)}
          onEditada={() => {
            setEditando(false);
            setAviso("Datos de la cuenta actualizados.");
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------

/**
 * El pie de la cuenta, como en cualquier caja: subtotal, descuento (sobre los productos), envío, impuestos y el total que se cobra.
 * Los precios de la carta ya traen el IVA adentro: "Impuestos" dice cuánto de lo que se cobra es IVA y no suma al total. Es la
 * misma cuenta que después sale en la factura (el envío entra como una línea más, gravada al 10 %).
 */
function PieDeCuenta({ cuenta }: { cuenta: CuentaDeliveryFila }) {
  const t = cuenta.totales;
  const im = cuenta.impuestos;
  const descuento = cuenta.descuento;
  const hayDescuento = t.descuento > 0;

  return (
    <div className="rounded-lg border-2 border-azul/50 bg-azul-luz/30 px-2.5 py-1.5 sm:ml-auto sm:w-full sm:max-w-[16rem]">
      {/* Los rótulos van en negrita y los valores en peso normal, sin destacar ninguno. */}
      <dl className="flex flex-col gap-0.5 text-[0.78rem] leading-tight">
        <div className="flex items-baseline justify-between gap-3">
          <dt className={ROTULO_PIE}>Subtotal</dt>
          <dd className="cifra font-normal text-tinta">{formatearGuarani(t.subtotal)}</dd>
        </div>

        <div className="flex items-baseline justify-between gap-3">
          <dt className="flex flex-wrap items-center gap-1">
            <span className={ROTULO_PIE}>Descuento</span>
            {hayDescuento && descuento && (
              <Pastilla color={descuento.tipo === "porcentaje" ? "azul" : "amarillo"}>
                {descuento.tipo === "porcentaje" && t.porcentaje != null ? `General ${textoPorcentaje(t.porcentaje)} %` : "Por importe"}
              </Pastilla>
            )}
          </dt>
          <dd className={`cifra font-normal ${hayDescuento ? "text-amarillo-oscuro" : "text-tinta-suave"}`}>
            {hayDescuento ? `− ${formatearGuarani(t.descuento)}` : formatearGuarani(0)}
          </dd>
        </div>

        <div className="flex items-baseline justify-between gap-3">
          <dt className={ROTULO_PIE}>Envío</dt>
          <dd className="cifra font-normal text-tinta">{formatearGuarani(t.envio)}</dd>
        </div>

        <div className="flex items-baseline justify-between gap-3">
          <dt className={ROTULO_PIE}>Impuestos (IVA)</dt>
          <dd className="cifra font-normal text-tinta">{formatearGuarani(im.total)}</dd>
        </div>

        <div className="mt-0.5 flex items-baseline justify-between gap-3 border-t border-azul/40 pt-1">
          <dt className={ROTULO_PIE}>Total</dt>
          <dd className="cifra text-[0.9rem] font-normal text-tinta">{formatearGuarani(t.total)}</dd>
        </div>
      </dl>
    </div>
  );
}
