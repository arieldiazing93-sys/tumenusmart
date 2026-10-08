"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Campo, Entrada, MensajeError, Pastilla, Tarjeta, clasesBoton } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { useAutorizacion } from "@/components/Autorizacion";
import { Segmentado } from "@/components/Segmentado";
import { formatearCantidad, formatearGuarani, formatearNumero } from "@/lib/format";
import { agruparPorClave, claveDeLinea, importeDeLinea, repartirEnFilas, textoEstadoCuenta } from "@/lib/comedor";
import { calcularDescuento, textoPorcentaje } from "@/lib/descuento-venta";
import type { TipoDescuentoDef } from "@/lib/tipos-descuento";
import { rutaParaAbrirTurno } from "@/lib/turno-requerido";
import { anularProductos, aplicarDescuento, cancelarCuenta, imprimirCuenta, reabrirCuenta } from "./actions";
import type { ContextoCaja, CuentaCajaFila, ItemCuentaFila } from "./ComedorCaja";
import { CargarProductosPanel } from "./CargarProductosPanel";
import { DividirCuentaPanel } from "./DividirCuentaPanel";
import { Hace, HoraDe } from "./tiempo";

const ROTULO = "text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave";
/** Los rótulos del pie de la cuenta (Subtotal, Descuento, Impuestos, Total): en negrita. */
const ROTULO_PIE = "text-[0.7rem] font-bold uppercase tracking-rotulo text-tinta";

/**
 * El mismo producto cargado en varios pedidos, junto en UNA fila (10 parrilladas, no 10 filas de 1): misma descripción, mismas
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
  filas: ItemCuentaFila[];
  rondas: number[];
  /** Todas las unidades son enteras (si no, el producto se cancela completo). */
  enteras: boolean;
};

type Dialogo = { tipo: "anular"; grupo: GrupoDeCuenta } | { tipo: "cancelar" } | { tipo: "descuento" } | null;

/** "Pedido 1", "Pedidos 1 y 2", "Pedidos 1, 2 y 3". */
function textoDePedidos(rondas: number[]): string {
  if (rondas.length === 1) return `Pedido ${rondas[0]}`;
  return `Pedidos ${rondas.slice(0, -1).join(", ")} y ${rondas[rondas.length - 1]}`;
}

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
  // El cuadro que pide la contraseña de un usuario autorizado cuando la acción está protegida (Ajustes → Seguridad).
  const { autorizar, dialogo: dialogoClave } = useAutorizacion();
  const [cargando, setCargando] = useState(false);
  const [dividiendo, setDividiendo] = useState(false);
  // El producto marcado en la lista (para cancelarlo con el botón de arriba).
  const [seleccionadaClave, setSeleccionadaClave] = useState<string | null>(null);

  const abierta = cuenta.estado === "abierta";
  const porCobrar = cuenta.estado === "por_cobrar";
  /** Todos sus productos se cancelaron: ya no hay nada que cobrar y la mesa se puede liberar. */
  const sinProductos = cuenta.items.every((i) => i.anulado);
  const t = cuenta.totales;
  /** Los productos se marcan para cancelarlos solo con la cuenta abierta y con el permiso de la caja. */
  const puedeMarcar = abierta && contexto.puedeGestionar;

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
    cantidad: Math.round(filas.reduce((s, f) => s + f.cantidad, 0) * 10000) / 10000,
    importe: filas.reduce((s, f) => s + importeDeLinea(f), 0),
    filas,
    rondas: [...new Set(filas.map((f) => f.ronda))].sort((a, b) => a - b),
    enteras: filas.every((f) => Number.isInteger(f.cantidad)),
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
      () => imprimirCuenta(cuenta.id),
      () => setAviso("La cuenta salió a la cola de impresión. La mesa quedó por cobrar: el mozo ya no puede cargarle más.")
    );
  }

  function reabrir() {
    ejecutar(
      () => autorizar((clave) => reabrirCuenta(cuenta.id, clave)),
      () => setAviso("La cuenta se reabrió: ya se le pueden cargar más productos.")
    );
  }

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
            {cuenta.mesaBase && (
              <p className="text-[0.74rem] font-medium text-tinta-media">Cuenta dividida de la mesa {cuenta.mesaBase}.</p>
            )}
          </div>
          <div className="flex flex-none flex-col items-end gap-0.5">
            <Pastilla color={porCobrar ? "amarillo" : "exito"} punto>
              {textoEstadoCuenta(cuenta.estado)}
            </Pastilla>
            <p className="cifra text-[1.35rem] font-bold leading-none text-tinta">{formatearGuarani(t.total)}</p>
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
              {/* Cada uno quiere su factura: en partes iguales o por producto, cada parte es una cuenta que se cobra aparte. Solo con
                  la cuenta abierta: una vez impresa ya no se divide (hay que reabrirla). */}
              {abierta && !sinProductos && (
                <button
                  type="button"
                  disabled={pendiente || !!t.descuentoInvalido}
                  title={t.descuentoInvalido ? "Corregí el descuento antes de dividir" : undefined}
                  onClick={() => setDividiendo(true)}
                  className={clasesBoton("navegar", "sm")}
                >
                  Dividir cuenta
                </button>
              )}
              {contexto.puedeCobrar && (
                <button
                  type="button"
                  // Se cobra recién después de imprimir la cuenta (queda "por cobrar"). Sin turno de caja abierto no se cobra: el
                  // botón lleva directo a abrirlo y, al abrirlo, se vuelve acá.
                  disabled={pendiente || !porCobrar || (!contexto.cobro.ok && !contexto.cobro.sinTurno) || !!t.descuentoInvalido || t.subtotal <= 0}
                  title={!porCobrar ? "Primero imprimí la cuenta" : undefined}
                  onClick={() => (contexto.cobro.ok ? onCobrar() : router.push(rutaParaAbrirTurno("/admin/comedor")))}
                  className={clasesBoton("navegar", "sm")}
                >
                  Pagar cuenta
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
            {puedeMarcar && !sinProductos && (
              <p className="text-[0.72rem] text-tinta-suave">
                Para cancelar un producto (o solo algunas unidades), marcalo en la lista y tocá “Cancelar producto”.
              </p>
            )}
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
            {contexto.puedeCobrar && !contexto.cobro.ok && contexto.cobro.sinTurno && (
              <p className="text-[0.72rem] font-medium text-amarillo-oscuro">
                No hay un turno de caja abierto: al tocar “Pagar cuenta” te llevo a abrirlo, y después volvés acá para cobrar.
              </p>
            )}
            {contexto.puedeCobrar && !contexto.cobro.ok && !contexto.cobro.sinTurno && contexto.cobro.motivo && (
              <p className="text-[0.72rem] text-tinta-suave">No se puede cobrar desde acá: {contexto.cobro.motivo}</p>
            )}
            {porCobrar && (
              <p className="text-[0.72rem] text-tinta-suave">
                Para cargar más productos, dar un descuento, cancelar un producto o dividir la cuenta, primero reabrí la cuenta.
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
                const marcable = puedeMarcar;
                const marcado = seleccionado?.clave === g.clave;
                // Un producto de un solo pedido dice quién y cuándo lo cargó; el de varios, solo en cuáles está.
                const primera = g.filas[0];
                return (
                  <tr
                    key={g.clave}
                    onClick={(e) => {
                      // Un clic en la fila marca el producto; el de la casilla ya lo marca por su cuenta.
                      if (marcable && (e.target as HTMLElement).tagName !== "INPUT") setSeleccionadaClave(marcado ? null : g.clave);
                    }}
                    className={`align-top text-tinta ${marcable ? "cursor-pointer" : ""} ${marcado ? "bg-azul-luz/50" : ""}`}
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
                      <p className="text-[0.7rem] text-tinta-suave">
                        {textoDePedidos(g.rondas)}
                        {g.rondas.length === 1 && (
                          <>
                            {" "}
                            · <HoraDe iso={primera.enviadoEn} /> · {primera.cargadoPor ? `cargado en la caja por ${primera.cargadoPor}` : primera.mozo}
                          </>
                        )}
                      </p>
                    </td>
                    <td className="cifra py-1 text-right text-[0.86rem] font-medium">{formatearGuarani(g.importe)}</td>
                  </tr>
                );
              })}
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

        {/* ------------------------------------------------------------------ el pie: subtotal, descuento, impuestos y total */}
        <PieDeCuenta cuenta={cuenta} />
      </Tarjeta>

      {/* ------------------------------------------------------------------------ ventanas */}
      {dialogo?.tipo === "anular" && (
        <DialogoCancelarProducto
          nombre={dialogo.grupo.nombre}
          cantidad={dialogo.grupo.cantidad}
          enteras={dialogo.grupo.enteras}
          onCerrar={() => setDialogo(null)}
          onConfirmar={async (motivo, cuantas) => {
            // Se cancela de las filas de más abajo (lo último que se cargó) hacia arriba; si se cancela todo, salen todas completas.
            const partes =
              cuantas === dialogo.grupo.cantidad
                ? dialogo.grupo.filas.map((f) => ({ itemId: f.id, cantidad: f.cantidad }))
                : repartirEnFilas(dialogo.grupo.filas, cuantas);
            const r = await autorizar((clave) => anularProductos(cuenta.id, partes, motivo, clave));
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
          titulo={`Cerrar la cuenta vacía de la mesa ${cuenta.mesa}`}
          texto="La cuenta no tiene productos activos: se cierra y la mesa queda libre. Esto no se puede deshacer. Queda en el Historial de cuentas, con tu nombre y el motivo."
          confirmar="Cerrar cuenta"
          onCerrar={() => setDialogo(null)}
          onConfirmar={async (motivo) => {
            const r = await autorizar((clave) => cancelarCuenta(cuenta.id, motivo, clave));
            if (r.ok) router.refresh();
            return r;
          }}
        />
      )}
      {dialogo?.tipo === "descuento" && (
        <DialogoDescuento
          titulo={`Descuento · mesa ${cuenta.mesa}`}
          descuento={cuenta.descuento}
          subtotal={cuenta.totales.subtotal}
          tipos={contexto.tiposDescuento}
          onAplicar={(d, motivo) => autorizar((clave) => aplicarDescuento(cuenta.id, d, motivo, clave))}
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
          promociones={contexto.promociones}
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

      {dividiendo && (
        <DividirCuentaPanel
          cuenta={cuenta}
          mesasOcupadas={contexto.apertura.mesasOcupadas}
          onCerrar={() => setDividiendo(false)}
          onHecho={(mensaje) => {
            setDividiendo(false);
            setError(null);
            setAviso(mensaje);
            router.refresh();
          }}
        />
      )}

      {/* La contraseña de un usuario autorizado, cuando la acción está protegida (Ajustes → Seguridad). Va al final: queda por encima del resto. */}
      {dialogoClave}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------

/**
 * El pie de la cuenta, como en cualquier caja: subtotal, descuento (con su tipo: general en porcentaje o por importe), impuestos
 * y el total que se cobra. Los precios de la carta ya traen el IVA adentro: "Impuestos" dice cuánto de lo que se cobra es IVA y
 * no suma al total. Es la misma cuenta que después sale en la factura.
 */
function PieDeCuenta({ cuenta }: { cuenta: CuentaCajaFila }) {
  const t = cuenta.totales;
  const im = cuenta.impuestos;
  const descuento = cuenta.descuento;
  const hayDescuento = t.descuento > 0;
  const detalleIva = [
    im.iva10 > 0 ? `IVA 10 %: ${formatearGuarani(im.iva10)}` : null,
    im.iva5 > 0 ? `IVA 5 %: ${formatearGuarani(im.iva5)}` : null,
    im.exento > 0 ? `Exento: ${formatearGuarani(im.exento)}` : null,
  ].filter(Boolean);

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
                {descuento.tipo === "porcentaje" && t.porcentaje != null
                  ? `General ${textoPorcentaje(t.porcentaje)} %`
                  : "Por importe"}
              </Pastilla>
            )}
          </dt>
          <dd className={`cifra font-normal ${hayDescuento ? "text-amarillo-oscuro" : "text-tinta-suave"}`}>
            {hayDescuento ? `− ${formatearGuarani(t.descuento)}` : formatearGuarani(0)}
          </dd>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className={ROTULO_PIE}>Impuestos (IVA)</dt>
            <dd className="cifra font-normal text-tinta">{formatearGuarani(im.total)}</dd>
          </div>
          <p className="text-[0.66rem] leading-tight text-tinta-suave">
            {detalleIva.length > 0 ? `${detalleIva.join(" · ")} · incluidos en el precio` : "Incluidos en el precio"}
          </p>
        </div>

        <div className="mt-0.5 flex items-baseline justify-between gap-3 border-t border-azul/40 pt-1">
          <dt className={ROTULO_PIE}>Total</dt>
          <dd className="cifra text-[0.9rem] font-normal text-tinta">{formatearGuarani(t.total)}</dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * Cancelar un producto de la cuenta: todo, o solo algunas unidades (el mozo comandó 5 empanadas y eran 4: se cancela 1 y quedan
 * 4). Pide cuántas y el motivo (obligatorio). Un producto de una sola unidad, o que quedó con una fracción por haber dividido la
 * cuenta en partes iguales, se cancela entero. Por defecto propone cancelar UNA unidad (lo menos destructivo): para cancelar todo
 * está el botón "Todas".
 */
export function DialogoCancelarProducto({
  nombre,
  cantidad,
  enteras,
  onCerrar,
  onConfirmar,
}: {
  nombre: string;
  /** Cuántas hay en la cuenta (todas las filas de ese producto juntas). */
  cantidad: number;
  /** Todas sus unidades son enteras: solo así se pueden cancelar algunas. */
  enteras: boolean;
  onCerrar: () => void;
  onConfirmar: (motivo: string, cantidad: number) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const puedeParcial = enteras && Number.isInteger(cantidad) && cantidad > 1;
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
        const r = await onConfirmar(motivo, cuantas);
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
    <Modal titulo="Cancelar un producto" onCerrar={onCerrar}>
      <div className="flex flex-col gap-3">
        <p className="text-[0.95rem] font-semibold text-tinta">
          {formatearCantidad(cantidad)} × {nombre}
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
              <button
                type="button"
                disabled={cancelaTodo}
                onClick={() => setCuantas(cantidad)}
                className={clasesBoton("suave", "md")}
              >
                Todas ({formatearCantidad(cantidad)})
              </button>
            </div>
            <p className="text-[0.8rem] text-tinta-media">
              {cancelaTodo
                ? "Se cancela todo el producto."
                : `Se cancela${cuantas === 1 ? " 1" : `n ${cuantas}`} y quedan ${quedan} en la cuenta.`}
            </p>
          </div>
        )}

        <p className="text-[0.85rem] leading-snug text-tinta-media">
          {puedeParcial && !cancelaTodo ? "Lo cancelado" : "Se cancela y"} se devuelve al stock y se le avisa a la cocina o la barra
          para que no lo preparen.
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
            placeholder="Ej: el mozo cargó una de más, el cliente se arrepintió"
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

/** Pide el motivo de una cancelación: sin motivo (al menos 3 letras) no se hace nada. */
export function DialogoMotivo({
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

/**
 * El descuento general de la cuenta: porcentaje o monto fijo, con motivo, mostrando cuánto queda a pagar. Lo usan la cuenta de una mesa
 * y la de un delivery: cada una dice cómo se guarda (`onAplicar`), cuánto valen sus productos y, si lo tiene, su costo de envío (que
 * no se descuenta pero sí se suma al total que se muestra).
 */
export function DialogoDescuento({
  titulo,
  descuento,
  subtotal,
  envio = 0,
  tipos = [],
  onAplicar,
  onCerrar,
  onListo,
}: {
  titulo: string;
  /** El descuento que ya tiene la cuenta, si lo tiene. */
  descuento: { tipo: "porcentaje" | "monto"; valor: number; motivo: string } | null;
  /** Lo que valen los productos de la cuenta, sin descuento. */
  subtotal: number;
  /** El costo de envío de un delivery (0 en una mesa). */
  envio?: number;
  /** Los tipos de descuento de Ajustes (Cortesía 100 %, Tarjeta 20 %…): al elegir "Porcentaje" se ofrecen para elegir uno. */
  tipos?: TipoDescuentoDef[];
  /** Guarda el descuento (o lo quita con `null`). Con un tipo elegido va su `tipoDescuentoId`: el porcentaje sale de él. */
  onAplicar: (
    descuento: { tipo: "porcentaje" | "monto"; valor: number; tipoDescuentoId?: string } | null,
    motivo: string
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  onCerrar: () => void;
  onListo: () => void;
}) {
  const [tipo, setTipo] = useState<"porcentaje" | "monto">(descuento?.tipo ?? "porcentaje");
  const [valorTexto, setValorTexto] = useState(descuento ? String(descuento.valor).replace(".", ",") : "");
  const [motivo, setMotivo] = useState(descuento?.motivo ?? "");
  // El tipo de descuento elegido de la lista; si la cuenta ya tenía uno del 100 %, ese queda marcado (los demás porcentajes se editan a mano).
  const [tipoId, setTipoId] = useState<string | null>(() =>
    descuento && descuento.tipo === "porcentaje" && descuento.valor >= 100 ? (tipos.find((t) => t.porcentaje === descuento.valor)?.id ?? null) : null
  );
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const tipoElegido = tipoId ? (tipos.find((t) => t.id === tipoId) ?? null) : null;
  const ofreceTipos = tipo === "porcentaje" && tipos.length > 0;

  const valor = parseFloat(valorTexto.replace(",", "."));
  const calculado = Number.isFinite(valor) && valor > 0 ? calcularDescuento(subtotal, { tipo, valor }) : null;
  // Un 0 es "sin descuento": reemplaza al que ya tenía la cuenta y la deja en su monto original (para corregir uno mal puesto).
  const esCero = Number.isFinite(valor) && valor === 0;
  // La cuenta queda en cero (cortesía): descuento del 100 % y, en un delivery, sin costo de envío.
  const quedaEnCero = !!calculado && calculado.ok && subtotal - calculado.monto + envio <= 0;

  /** Elige un tipo de la lista (o "Otro porcentaje" con null): el porcentaje y el motivo salen del tipo. */
  function elegirTipo(nuevo: TipoDescuentoDef | null) {
    // El motivo se completa con el nombre del tipo mientras esté vacío o sea el del tipo anterior; si ya escribieron algo propio, no se pisa.
    const motivoDelAnterior = tipoElegido?.nombre ?? "";
    const puedePisarMotivo = motivo.trim() === "" || motivo.trim() === motivoDelAnterior;
    setError(null);
    setTipoId(nuevo?.id ?? null);
    if (nuevo) {
      setValorTexto(String(nuevo.porcentaje).replace(".", ","));
      if (puedePisarMotivo) setMotivo(nuevo.nombre);
    } else {
      setValorTexto("");
      if (puedePisarMotivo) setMotivo("");
    }
  }

  function guardar() {
    if (esCero && !tipoId) {
      quitar();
      return;
    }
    if (tipo === "porcentaje" && valor >= 100 && !tipoId) {
      setError("El 100 % se da eligiendo un tipo de descuento de 100 % (por ejemplo Cortesía). Se crea en Ajustes → Tipos de descuentos.");
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
        const r = await onAplicar(tipoId ? { tipo, valor, tipoDescuentoId: tipoId } : { tipo, valor }, motivo);
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
        const r = await onAplicar(null, "");
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
    <Modal titulo={titulo} onCerrar={onCerrar}>
      <div className="flex flex-col gap-3">
        <Segmentado
          opciones={[
            { value: "porcentaje", label: "Porcentaje (%)" },
            { value: "monto", label: "Monto (Gs.)" },
          ]}
          valor={tipo}
          onChange={(nuevo) => {
            setTipo(nuevo);
            // Un tipo de descuento es siempre un porcentaje: al pasar a monto se suelta.
            if (nuevo === "monto" && tipoId) {
              setTipoId(null);
              setValorTexto("");
            }
          }}
          color="tinta"
        />
        {/* Los tipos de descuento de Ajustes: al elegir uno, el porcentaje (y el motivo) salen de él. "Otro porcentaje" es escribirlo a mano. */}
        {ofreceTipos && (
          <div>
            <p className="mb-1.5 text-[0.82rem] font-semibold text-tinta">Tipo de descuento</p>
            <div className="flex flex-wrap gap-1.5">
              {tipos.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={tipoId === t.id}
                  onClick={() => elegirTipo(t)}
                  className={`rounded-lg border px-3 py-1.5 text-[0.84rem] font-medium transition-colors ${
                    tipoId === t.id ? "border-azul bg-azul-luz text-azul-oscuro" : "border-linea text-tinta-media hover:border-azul/40"
                  }`}
                >
                  {t.nombre} · {textoPorcentaje(t.porcentaje)} %
                </button>
              ))}
              <button
                type="button"
                aria-pressed={tipoId === null}
                onClick={() => elegirTipo(null)}
                className={`rounded-lg border px-3 py-1.5 text-[0.84rem] font-medium transition-colors ${
                  tipoId === null ? "border-azul bg-azul-luz text-azul-oscuro" : "border-linea text-tinta-media hover:border-azul/40"
                }`}
              >
                Otro porcentaje
              </button>
            </div>
          </div>
        )}
        <Campo
          etiqueta={tipo === "porcentaje" ? "Porcentaje de descuento *" : "Monto a descontar *"}
          ayuda={
            tipoElegido
              ? `El porcentaje lo da el tipo “${tipoElegido.nombre}”. Para otro valor, elegí “Otro porcentaje”.`
              : descuento
                ? "Escribí el nuevo valor y se reemplaza el descuento anterior. Con 0 la cuenta vuelve a su monto original."
                : undefined
          }
        >
          <Entrada
            autoFocus
            inputMode="decimal"
            value={valorTexto}
            readOnly={!!tipoElegido}
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
            {envio > 0 ? ` + envío ${formatearGuarani(envio)}` : ""}
          </span>
          <span className="cifra text-[1.2rem] font-bold text-tinta">
            {formatearGuarani((calculado && calculado.ok ? subtotal - calculado.monto : subtotal) + envio)}
          </span>
        </div>

        {quedaEnCero && (
          <p className="rounded-lg bg-exito-luz px-3 py-2 text-[0.8rem] font-medium leading-snug text-exito">
            Cuenta en cero (cortesía): se vende y se factura en cero, y los productos igual bajan el stock. Si hace falta, la factura se anula después.
          </p>
        )}
        {error && <MensajeError>{error}</MensajeError>}
        <div className="flex flex-wrap justify-end gap-2">
          {descuento && (
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
