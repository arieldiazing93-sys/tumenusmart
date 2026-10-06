"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pastilla, Tarjeta, clasesBoton } from "@/components/ui";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { textoPorcentaje } from "@/lib/descuento-venta";
import { colorEstado, etiquetaEstado } from "@/lib/estados-pedido";
import { etiquetaFormaPagoPos } from "@/lib/turno-pos";
import { rutaParaAbrirTurno } from "@/lib/turno-requerido";
import { SIN_REGISTRO_FISCAL, etiquetaTipoIdentificacion } from "@/lib/tipo-cliente";
import { enlaceDeMapa, extraerUbicacion, primerEnlace, textoSinEnlaces } from "@/lib/ubicacion-mapa";
import { linkWhatsappCliente } from "@/lib/whatsapp";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { CargarProductosPanel } from "../comedor/CargarProductosPanel";
import { agregarProductosAPedido } from "./actions";
import { CobrarPedidoPanel } from "./CobrarPedidoPanel";
import { DialogoCancelarProductoPedido, DialogoDescuentoPedido } from "./DialogosPedido";
import { EstadoBotones } from "./EstadoBotones";
import { RepartidorSelect } from "./RepartidorSelect";
import type { ContextoPedidos, ItemPedidoFila, PedidoFila } from "./tipos-pedido";

const BLOQUE = "rounded-lg border border-linea bg-white p-3";
const ROTULO = "mb-1 text-[0.72rem] font-bold uppercase tracking-rotulo text-tinta";
/** Los rótulos del pie del pedido (Subtotal, Descuento, Envío, Total): en negrita, con los valores en peso normal. */
const ROTULO_PIE = "text-[0.7rem] font-bold uppercase tracking-rotulo text-tinta";

function fechaYHora(iso: string): string {
  return new Date(iso).toLocaleString("es-PY", { timeZone: ZONA_NEGOCIO, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

/**
 * Todo lo que compone un pedido y lo que la caja puede hacer con él, para mostrar a la derecha de la lista (igual que el detalle de
 * una cuenta del Servicio comedor).
 *
 * Mientras el pedido está ABIERTO (no se cobró ni se canceló) la caja lo corrige: cargarle más productos, darle un descuento o cancelar
 * un producto (marcándolo en la lista, con motivo). Al final lo cobra con "Cobrar pedido": forma de pago y comprobante, y recién ahí
 * entra a la caja del turno. Después del cobro queda cerrado a cambios. Además: el recorrido de la entrega (preparación, despacho,
 * entrega), cancelarlo con motivo, el repartidor, la factura y los productos. Lo usan la lista de Pedidos y la página de un pedido suelto.
 */
export function DetallePedido({ pedido, contexto }: { pedido: PedidoFila; contexto: ContextoPedidos }) {
  const router = useRouter();
  const esDelivery = pedido.tipoEntrega === "delivery";
  const cancelado = pedido.estado === "cancelado";

  const [cargando, setCargando] = useState(false);
  const [descontando, setDescontando] = useState(false);
  const [cancelando, setCancelando] = useState<ItemPedidoFila | null>(null);
  const [cobrando, setCobrando] = useState(false);
  // El producto marcado en la lista (para cancelarlo con el botón de arriba).
  const [marcadoId, setMarcadoId] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const puedeOperar = pedido.abierto && (contexto.puedeAgregar || contexto.puedeGestionar);
  /** Los productos se marcan para cancelarlos solo con el pedido abierto y con el permiso de la caja. */
  const puedeMarcar = pedido.abierto && contexto.puedeGestionar;
  // Si el producto marcado ya no está (se canceló, o la lista se actualizó), no hay ninguno marcado.
  const marcado = pedido.items.find((i) => i.id === marcadoId) ?? null;
  const enPreparacion = pedido.estado === "en_preparacion" || pedido.estado === "en_despacho";

  // La ubicación del cliente: el punto marcado o pegado (coordenadas) o, si solo hay un enlace corto, ese enlace.
  const coordenadas =
    pedido.clienteLat != null && pedido.clienteLng != null
      ? { lat: pedido.clienteLat, lng: pedido.clienteLng }
      : extraerUbicacion(pedido.direccion);
  const linkUbicacion = coordenadas ? enlaceDeMapa(coordenadas) : primerEnlace(pedido.direccion);
  const direccionEscrita = textoSinEnlaces(pedido.direccion);

  /** Cobrar: sin turno de caja abierto no se cobra, se va directo a abrirlo (y se vuelve a este pedido, que sigue abierto). */
  function irACobrar() {
    if (!contexto.cobro.ok && contexto.cobro.sinTurno) {
      router.push(rutaParaAbrirTurno(`/admin/pedidos/${pedido.id}`));
      return;
    }
    setCobrando(true);
  }

  // La ficha fiscal cargada al crear el pedido (todavía sin factura): se usa al cobrar si se elige factura.
  const fichaDelCliente =
    !pedido.facturaNumero && pedido.facturaRuc && pedido.facturaTipoIdentificacion !== SIN_REGISTRO_FISCAL.tipo && pedido.facturaRazonSocial;

  return (
    <div className="flex flex-col gap-2">
      <Tarjeta padding={false} className="flex flex-col gap-3 !border-2 !border-azul/50 p-3">
        {/* ----------------------------------------------------------------------- encabezado */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-[1.15rem] font-semibold leading-tight tracking-titular text-tinta">
              Pedido {formatearNumero(pedido.numero)}
            </h2>
            <p className="text-[0.78rem] text-tinta-media">
              {pedido.clienteNombre} · {pedido.clienteTelefono} · {fechaYHora(pedido.creadoEn)}
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {pedido.origen === "telefono" && <Pastilla color="azul">Cargado a mano</Pastilla>}
              {pedido.abierto && <Pastilla color="amarillo">Abierto · sin cobrar</Pastilla>}
            </div>
          </div>
          <div className="flex flex-none flex-col items-end gap-1">
            <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[0.74rem] font-semibold ${colorEstado(pedido.estado)}`}>
              {etiquetaEstado(pedido.estado)}
            </span>
            <p className="cifra text-[1.35rem] font-bold leading-none text-tinta">{formatearGuarani(pedido.total)}</p>
          </div>
        </div>

        {pedido.descuento > 0 && (
          <p className="text-[0.76rem] text-tinta-media">
            <strong className="font-semibold text-tinta">Descuento</strong>: {pedido.descuentoMotivo}
            {pedido.descuentoPor ? ` — lo dio ${pedido.descuentoPor}` : ""}
          </p>
        )}

        {/* ------------------------------------------------------------ lo que se puede hacer con el pedido abierto */}
        {puedeOperar && (
          <div className="flex flex-col gap-1.5 border-t border-linea pt-2">
            {/* Las funciones propias de esta pantalla van en celeste; solo cancelar es rojo y el cobro, que avanza, naranja. */}
            <div className="flex flex-wrap items-center gap-1.5">
              {contexto.puedeAgregar && (
                <button type="button" onClick={() => setCargando(true)} className={clasesBoton("navegar", "sm")}>
                  + Cargar productos
                </button>
              )}
              {contexto.puedeGestionar && (
                <>
                  <button type="button" onClick={() => setDescontando(true)} className={clasesBoton("navegar", "sm")}>
                    {pedido.descuento > 0 ? "Cambiar descuento" : "Descuento"}
                  </button>
                  {/* Cancelar un producto (o algunas de sus unidades): se marca en la lista de abajo y se toca acá. */}
                  <button
                    type="button"
                    disabled={!marcado}
                    title={marcado ? undefined : "Primero marcá un producto de la lista"}
                    onClick={() => marcado && setCancelando(marcado)}
                    className={clasesBoton("peligro", "sm")}
                  >
                    Cancelar producto
                  </button>
                  <button
                    type="button"
                    disabled={!contexto.cobro.ok && !contexto.cobro.sinTurno}
                    onClick={irACobrar}
                    className={`${clasesBoton("principal", "sm")} sm:ml-auto`}
                  >
                    Cobrar pedido
                  </button>
                </>
              )}
            </div>
            {contexto.puedeGestionar && pedido.items.length > 0 && (
              <p className="text-[0.72rem] text-tinta-suave">
                Para cancelar un producto (o solo algunas unidades), marcalo en la lista y tocá “Cancelar producto”. Cuando todo esté
                bien, tocá “Cobrar pedido”: ahí elegís la forma de pago y si lleva factura.
              </p>
            )}
            {contexto.puedeGestionar && !contexto.cobro.ok && contexto.cobro.sinTurno && (
              <p className="text-[0.72rem] font-medium text-amarillo-oscuro">
                No hay un turno de caja abierto: al tocar “Cobrar pedido” te llevo a abrirlo, y después volvés acá para cobrar.
              </p>
            )}
            {contexto.puedeGestionar && !contexto.cobro.ok && !contexto.cobro.sinTurno && (
              <p className="text-[0.72rem] text-tinta-suave">No se puede cobrar desde acá: {contexto.cobro.motivo}</p>
            )}
            {enPreparacion && (
              <p className="text-[0.72rem] text-tinta-suave">
                El pedido ya está en preparación: si le cargás algo o le cancelás un producto, avisale a cocina (y volvé a imprimir la
                comanda si agregaste productos).
              </p>
            )}
          </div>
        )}
        {pedido.cobrado && !cancelado && (
          <p className="border-t border-linea pt-2 text-[0.76rem] text-tinta-suave">
            El pedido ya está cobrado: no se puede modificar. Si hay que corregir algo, se cancela y se carga de nuevo.
          </p>
        )}
        {aviso && <p className="rounded-lg bg-aviso-luz px-2.5 py-1.5 text-[0.78rem] font-medium text-aviso">{aviso}</p>}

        {/* ----------------------------------------------------------------------- papeles y mensajes */}
        {/* Se abren en una pestaña aparte y disparan la impresión solas, para no perder de vista el pedido que se atiende. */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-linea pt-2">
          <a href={`/admin/pedidos/${pedido.id}/comanda`} target="_blank" rel="noopener noreferrer" className={clasesBoton("navegar", "sm")}>
            Comanda de cocina
          </a>
          <a href={`/admin/pedidos/${pedido.id}/ticket`} target="_blank" rel="noopener noreferrer" className={clasesBoton("navegar", "sm")}>
            {pedido.comprobanteTipo === "factura" && pedido.facturaNumero ? "Factura" : "Ticket"}
          </a>
          <a
            href={linkWhatsappCliente(
              pedido.clienteTelefono,
              `Hola ${pedido.clienteNombre}, te escribimos de ${contexto.nombreLocal} por tu pedido ${formatearNumero(pedido.numero)}.`
            )}
            target="_blank"
            rel="noopener noreferrer"
            title={`Escribirle a ${pedido.clienteNombre} por WhatsApp`}
            className={clasesBoton("exito", "sm")}
          >
            Escribirle por WhatsApp
          </a>
        </div>

        {/* ----------------------------------------------------------------------- el recorrido (y cancelar) */}
        <div className="border-t border-linea pt-2">
          <h3 className={ROTULO}>Estado del pedido</h3>
          <EstadoBotones
            orderId={pedido.id}
            estadoActual={pedido.estado}
            tipoEntrega={pedido.tipoEntrega}
            repartidorId={pedido.repartidorId}
            cobrado={pedido.cobrado}
            comprobanteTipo={pedido.comprobanteTipo}
            facturaNumero={pedido.facturaNumero}
            facturaAnulada={pedido.facturaAnulada}
            nombreImpresoraTicket={contexto.nombreImpresoraTicket}
            impresorasPorArea={contexto.impresorasPorArea}
          />
        </div>

        {/* ----------------------------------------------------------------------- entrega y pago */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className={BLOQUE}>
            <p className={ROTULO}>Entrega</p>
            <p className="text-sm text-tinta">{esDelivery ? `Delivery — ${pedido.zona ?? "a coordinar"}` : "Retiro en el local"}</p>
            {esDelivery && direccionEscrita && <p className="text-sm text-tinta-media">{direccionEscrita}</p>}
            {/* La ubicación: el punto marcado/pegado (coordenadas) o, si solo hay un enlace corto de Google Maps, ese enlace. */}
            {esDelivery && linkUbicacion && (
              <a href={linkUbicacion} target="_blank" rel="noopener noreferrer" className="text-sm text-brand hover:underline">
                Ver ubicación en el mapa
              </a>
            )}
            {esDelivery && (
              <div className="mt-2.5 border-t border-linea-fina pt-2.5">
                <p className={ROTULO}>Repartidor</p>
                <RepartidorSelect orderId={pedido.id} repartidorIdActual={pedido.repartidorId} repartidores={contexto.repartidores} />
              </div>
            )}
          </div>

          <div className={BLOQUE}>
            <p className={ROTULO}>Cobro</p>
            {pedido.cobrado ? (
              <p className="text-sm text-tinta">
                <span className="font-medium text-exito">Cobrado</span> con {etiquetaFormaPagoPos(pedido.formaPagoPos ?? "efectivo")}
                {pedido.cobradoEn ? ` · ${fechaYHora(pedido.cobradoEn)}` : ""}
                {esDelivery && pedido.formaPagoPos === "efectivo" ? " · el repartidor tiene que traer el efectivo" : ""}
              </p>
            ) : cancelado ? (
              <p className="text-sm text-tinta-media">Pedido cancelado: no se cobró.</p>
            ) : (
              <p className="text-sm text-tinta">
                <span className="font-medium text-amarillo-oscuro">Sin cobrar</span> — se cobra al final, con “Cobrar pedido”.
              </p>
            )}

            {/* La ficha del cliente cargada al crear el pedido: se usa en el cobro si se elige factura con registro fiscal. */}
            {fichaDelCliente && !cancelado && (
              <div className="mt-2.5 rounded bg-papel-suave px-2 py-1.5 text-sm text-tinta-media">
                <p className="font-medium text-tinta">Datos de factura del cliente</p>
                <p>Razón social: {pedido.facturaRazonSocial}</p>
                <p>
                  {etiquetaTipoIdentificacion(pedido.facturaTipoIdentificacion ?? "ruc")}: {pedido.facturaRuc}
                </p>
                {pedido.facturaEmail && <p>Correo: {pedido.facturaEmail}</p>}
                {pedido.abierto && <p className="mt-1 text-[0.78rem]">Se completan solos en “Cobrar pedido” si elegís factura.</p>}
              </div>
            )}

            {pedido.comprobanteTipo === "factura" && (pedido.facturaNumero || pedido.facturaRuc) && (
              <div className="mt-2.5 rounded bg-aviso-luz px-2 py-1.5 text-sm text-aviso">
                <p className="font-medium">
                  {pedido.facturaNumero ? `Factura N° ${pedido.facturaNumero}` : "Factura (todavía sin emitir)"}
                  {pedido.facturaAnulada && <span className="ml-1.5 text-peligro">(ANULADA)</span>}
                </p>
                <p>
                  Razón social:{" "}
                  {pedido.facturaTipoIdentificacion === SIN_REGISTRO_FISCAL.tipo ? SIN_REGISTRO_FISCAL.etiquetaDisplay : pedido.facturaRazonSocial}
                </p>
                <p>
                  {pedido.facturaTipoIdentificacion === SIN_REGISTRO_FISCAL.tipo
                    ? "RUC"
                    : etiquetaTipoIdentificacion(pedido.facturaTipoIdentificacion ?? "ruc")}
                  : {pedido.facturaRuc}
                </p>
                {pedido.facturaEmail && <p>Correo: {pedido.facturaEmail}</p>}
              </div>
            )}

            {pedido.notas && (
              <div className="mt-2.5 border-t border-linea-fina pt-2.5">
                <p className={ROTULO}>Nota del cliente</p>
                <p className="text-sm text-tinta-media">{pedido.notas}</p>
              </div>
            )}
          </div>
        </div>

        {/* ----------------------------------------------------------------------- los productos */}
        <div className={BLOQUE}>
          <p className={`${ROTULO} mb-2`}>Productos</p>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-linea text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
                {puedeMarcar && <th scope="col" className="w-7 pb-1" aria-label="Marcar" />}
                <th scope="col" className="w-12 pb-1 pr-2">
                  Cant.
                </th>
                <th scope="col" className="pb-1 pr-2">
                  Descripción
                </th>
                <th scope="col" className="w-24 pb-1 text-right">
                  Monto
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linea-fina">
              {pedido.items.map((item) => {
                const esteMarcado = marcado?.id === item.id;
                return (
                  <tr
                    key={item.id}
                    onClick={(e) => {
                      // Un clic en la fila marca el producto; el de la casilla ya lo marca por su cuenta.
                      if (puedeMarcar && (e.target as HTMLElement).tagName !== "INPUT") setMarcadoId(esteMarcado ? null : item.id);
                    }}
                    className={`align-top text-tinta ${puedeMarcar ? "cursor-pointer" : ""} ${esteMarcado ? "bg-azul-luz/50" : ""}`}
                  >
                    {puedeMarcar && (
                      <td className="py-1 pr-1">
                        <input
                          type="checkbox"
                          checked={esteMarcado}
                          onChange={() => setMarcadoId(esteMarcado ? null : item.id)}
                          aria-label={`Marcar ${item.cantidad} × ${item.nombre}`}
                          className="mt-0.5 h-4 w-4 accent-peligro"
                        />
                      </td>
                    )}
                    <td className="cifra py-1 pr-2 text-[0.86rem] font-semibold">{item.cantidad}</td>
                    <td className="py-1 pr-2 text-[0.86rem] leading-snug">
                      <p>{item.nombre}</p>
                      {item.opciones && <p className="text-[0.76rem] text-tinta-media">+ {item.opciones}</p>}
                      {item.quitados && <p className="text-[0.76rem] text-peligro">{item.quitados}</p>}
                    </td>
                    <td className="cifra py-1 text-right text-[0.86rem] font-medium">{formatearGuarani(item.cantidad * item.precioUnitario)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* ---------------------------------------------------------- el pie: subtotal, descuento, envío y total */}
          <div className="mt-3 rounded-lg border-2 border-azul/50 bg-azul-luz/30 px-2.5 py-1.5 sm:ml-auto sm:w-full sm:max-w-[16rem]">
            <dl className="flex flex-col gap-0.5 text-[0.78rem] leading-tight">
              <div className="flex items-baseline justify-between gap-3">
                <dt className={ROTULO_PIE}>Subtotal</dt>
                <dd className="cifra font-normal text-tinta">{formatearGuarani(pedido.subtotal)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="flex flex-wrap items-center gap-1">
                  <span className={ROTULO_PIE}>Descuento</span>
                  {pedido.descuento > 0 && pedido.descuentoTipo && (
                    <Pastilla color={pedido.descuentoTipo === "porcentaje" ? "azul" : "amarillo"}>
                      {pedido.descuentoTipo === "porcentaje" && pedido.descuentoValor != null
                        ? `General ${textoPorcentaje(pedido.descuentoValor)} %`
                        : "Por importe"}
                    </Pastilla>
                  )}
                </dt>
                <dd className={`cifra font-normal ${pedido.descuento > 0 ? "text-amarillo-oscuro" : "text-tinta-suave"}`}>
                  {pedido.descuento > 0 ? `− ${formatearGuarani(pedido.descuento)}` : formatearGuarani(0)}
                </dd>
              </div>
              {esDelivery && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className={ROTULO_PIE}>Envío</dt>
                  <dd className="cifra font-normal text-tinta">{formatearGuarani(pedido.costoEnvio)}</dd>
                </div>
              )}
              <div className="mt-0.5 flex items-baseline justify-between gap-3 border-t border-azul/40 pt-1">
                <dt className={ROTULO_PIE}>Total</dt>
                <dd className="cifra text-[0.9rem] font-normal text-tinta">{formatearGuarani(pedido.total)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </Tarjeta>

      {/* ------------------------------------------------------------------------ ventanas y paneles */}
      {cargando && (
        <CargarProductosPanel
          categorias={contexto.categorias}
          gruposMitad={contexto.gruposMitad}
          titulo={`Cargar productos · Pedido ${formatearNumero(pedido.numero)}`}
          textoEnviar="Agregar al pedido"
          sinNotas
          enviarItems={async (items) => {
            const r = await agregarProductosAPedido(
              pedido.id,
              items.map((i) =>
                "mitadYMitad" in i
                  ? { mitadYMitad: i.mitadYMitad, opcionIds: i.opcionIds, cantidad: i.cantidad }
                  : { productId: i.productId, opcionIds: i.opcionIds, cantidad: i.cantidad }
              )
            );
            return r;
          }}
          onCerrar={() => setCargando(false)}
          onEnviado={(_areas, avisoDelServidor) => {
            setCargando(false);
            setAviso(avisoDelServidor ?? "Productos agregados al pedido: el total ya los incluye.");
            router.refresh();
          }}
        />
      )}

      {descontando && (
        <DialogoDescuentoPedido
          pedido={pedido}
          onCerrar={() => setDescontando(false)}
          onListo={() => {
            setDescontando(false);
            setAviso(null);
            router.refresh();
          }}
        />
      )}

      {cancelando && (
        <DialogoCancelarProductoPedido
          pedidoId={pedido.id}
          item={cancelando}
          enPreparacion={enPreparacion}
          onCerrar={() => setCancelando(null)}
          onListo={(avisoDelServidor) => {
            setCancelando(null);
            setMarcadoId(null);
            setAviso(avisoDelServidor ?? null);
            router.refresh();
          }}
        />
      )}

      {cobrando && <CobrarPedidoPanel pedido={pedido} contexto={contexto} onCerrar={() => setCobrando(false)} />}
    </div>
  );
}
