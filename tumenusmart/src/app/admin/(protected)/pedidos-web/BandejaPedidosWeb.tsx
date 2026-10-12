"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Boton, Campo, Entrada, MensajeError, Pastilla, clasesBoton, type ColorEstado } from "@/components/ui";
import { IconoWhatsapp } from "@/components/iconos";
import { MaestroDetalle } from "@/components/MaestroDetalle";
import { Segmentado } from "@/components/Segmentado";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { METODOS_PAGO_PEDIDO } from "@/lib/metodos-pago";
import { etiquetasPersonal, type EstadoPedidoWeb, type RubroPedido } from "@/lib/pedido-web";
import type { PedidoWebFila } from "@/lib/pedido-web-servidor";
import { pareceRucConDigito } from "@/lib/sifen/ruc";
import { normalizarTelefonoParaWhatsapp } from "@/lib/whatsapp";
import { enlaceDeMapa } from "@/lib/ubicacion-mapa";
import { rutaParaAbrirTurno } from "@/lib/turno-requerido";
import { AvisoRucDnit, useVerificacionDeCliente, useVerificacionRuc } from "../pos/AvisoRucDnit";
import {
  aceptarPedido,
  corregirDatosDelPedido,
  entregarYCobrarPedido,
  marcarPedidoListo,
  quitarProductoDelPedido,
  rechazarPedido,
} from "./actions";

const MOTIVOS_RECHAZO = ["Sin stock", "Estamos cerrados", "Fuera de la zona de entrega", "No podemos atenderlo ahora"];

const COLOR_ESTADO: Record<EstadoPedidoWeb, ColorEstado> = {
  // El personal no lo ve (espera que el cliente lo mande por WhatsApp), pero el tipo es el mismo para todos los estados.
  pendiente: "amarillo",
  nuevo: "amarillo",
  aceptado: "azul",
  listo: "exito",
  entregado: "exito",
  rechazado: "peligro",
  cancelado: "neutro",
};

/** "hace 3 min" desde un instante ISO. `ahora` viene de un reloj que corre en el navegador (null hasta montarse). */
function haceCuanto(iso: string, ahora: number | null): string {
  if (ahora == null) return "";
  const minutos = Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 60000));
  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  return `hace ${horas} h ${minutos % 60} min`;
}

/** La fila de la lista: el pedido más `activo` (los cerrados de hoy se ven apagados). */
type PedidoLista = PedidoWebFila & { activo: boolean };

/** El estado, con las palabras del rubro del local (gastronomía: «En preparación», «Listo»…). */
function textoDeEstado(p: PedidoWebFila, rubro: RubroPedido): string {
  const e = etiquetasPersonal(rubro, p.tipoEntrega);
  switch (p.estado) {
    case "pendiente":
      return "Esperando el WhatsApp";
    case "nuevo":
      return "Nuevo";
    case "aceptado":
      return e.preparando;
    case "listo":
      return e.listo;
    case "entregado":
      return e.entregado;
    case "rechazado":
      return "Rechazado";
    default:
      return "Cancelado";
  }
}

/**
 * Los pedidos del menú, como el Servicio delivery: a la izquierda la lista (el pedido, quién lo hizo, cuánto hace, su estado, el total
 * y el botón Ver) y a la derecha todo el detalle del pedido que se abre, con los botones para atenderlo. Arriba van los nuevos (esperan
 * una decisión), después los que están en curso y al final lo que se cerró hoy, apagado.
 */
export function BandejaPedidosWeb({
  abiertos,
  cerrados,
  rubro,
  puedeGestionar,
  puedeCobrar,
  aceptaSolo,
  slug = "",
  nombreLocal = "",
}: {
  abiertos: PedidoWebFila[];
  cerrados: PedidoWebFila[];
  rubro: RubroPedido;
  puedeGestionar: boolean;
  puedeCobrar: boolean;
  aceptaSolo: boolean;
  /** La dirección del menú y el nombre del local: para armar el WhatsApp que se le manda al cliente con su enlace de seguimiento. */
  slug?: string;
  nombreLocal?: string;
}) {
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => {
    setAhora(Date.now());
    const reloj = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(reloj);
  }, []);

  const nuevos = abiertos.filter((p) => p.estado === "nuevo");
  const enCurso = abiertos.filter((p) => p.estado !== "nuevo");
  const items: PedidoLista[] = [
    ...nuevos.map((p) => ({ ...p, activo: true })),
    ...enCurso.map((p) => ({ ...p, activo: true })),
    ...cerrados.map((p) => ({ ...p, activo: false })),
  ];

  return (
    <div className="flex flex-col gap-4">
      {aceptaSolo && (
        <p className="rounded-xl bg-azul-luz px-4 py-3 text-[0.86rem] text-azul-oscuro">
          Los pedidos se aceptan solos apenas llegan. Los que quedan acá como «nuevos» necesitan una persona (por ejemplo, el envío es a
          coordinar).
        </p>
      )}

      <p className="flex flex-wrap items-center gap-2 text-[0.82rem] text-tinta-media">
        <Pastilla color={nuevos.length > 0 ? "amarillo" : "neutro"} punto={nuevos.length > 0}>
          Nuevos {nuevos.length}
        </Pastilla>
        <Pastilla color="azul">En curso {enCurso.length}</Pastilla>
        <Pastilla color="neutro">Cerrados hoy {cerrados.length}</Pastilla>
      </p>

      <MaestroDetalle
        items={items}
        cerrarSiDesaparece
        textoVacio="Todavía no entró ningún pedido del menú. Cuando entre uno, suena el aviso y aparece acá."
        textoPlaceholder="Hacé doble clic en un pedido, o tocá Ver, para ver todo lo que pidió el cliente y atenderlo: aceptarlo, avisar que está listo o cobrarlo."
        columnas={[
          {
            titulo: "Pedido",
            celda: (p) => (
              <div className="flex flex-col gap-0.5">
                <span className="text-[0.95rem] font-semibold text-tinta">
                  {formatearNumero(p.numero)} · {p.clienteNombre}
                </span>
                {ahora != null && p.estado !== "entregado" && p.estado !== "rechazado" && p.estado !== "cancelado" && (
                  <span className="text-[0.74rem] text-tinta-suave">{haceCuanto(p.creadoEn, ahora)}</span>
                )}
                <span className="mt-0.5 flex flex-wrap items-center gap-1">
                  {/* Retiro o delivery en lila: se distingue de un vistazo en la lista, igual que en el detalle. */}
                  <Pastilla color="violeta">{p.tipoEntrega === "retiro" ? "Retiro" : "Delivery"}</Pastilla>
                  <Pastilla color={COLOR_ESTADO[p.estado]} punto={p.estado === "nuevo"}>
                    {textoDeEstado(p, rubro)}
                  </Pastilla>
                  {p.cuentaNumero != null && <Pastilla color="azul">Cuenta {formatearNumero(p.cuentaNumero)}</Pastilla>}
                </span>
              </div>
            ),
          },
          {
            titulo: "Total",
            derecha: true,
            celda: (p) => <span className="cifra whitespace-nowrap font-semibold text-tinta">{formatearGuarani(p.total)}</span>,
          },
        ]}
        renderPanel={(p) => (
          <TarjetaPedido
            pedido={p}
            rubro={rubro}
            ahora={ahora}
            puedeGestionar={puedeGestionar}
            puedeCobrar={puedeCobrar}
            slug={slug}
            nombreLocal={nombreLocal}
          />
        )}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
//  Una tarjeta
// ---------------------------------------------------------------------------------------------------------------------

function TarjetaPedido({
  pedido: p,
  rubro,
  ahora,
  puedeGestionar,
  puedeCobrar,
  slug,
  nombreLocal,
}: {
  pedido: PedidoWebFila;
  rubro: RubroPedido;
  ahora: number | null;
  puedeGestionar: boolean;
  puedeCobrar: boolean;
  slug: string;
  nombreLocal: string;
}) {
  const router = useRouter();
  // La dirección del sitio, recién en el navegador (el servidor no la sabe): para armar el enlace de seguimiento del cliente.
  const [origen, setOrigen] = useState("");
  useEffect(() => setOrigen(window.location.origin), []);
  const etiquetas = etiquetasPersonal(rubro, p.tipoEntrega);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [rechazando, setRechazando] = useState(false);
  const [otroMotivo, setOtroMotivo] = useState("");
  const [editando, setEditando] = useState(false);
  // El envío "a coordinar" lo fija quien atiende antes de aceptar.
  const [envio, setEnvio] = useState("");
  const esNuevo = p.estado === "nuevo";
  const conFactura = p.comprobanteTipo === "factura" && !!p.facturaRuc;

  // El RUC que dio el cliente se verifica solo contra la DNIT apenas aparece el pedido nuevo.
  const { verificacion, verificando, verificar } = useVerificacionRuc();
  useEffect(() => {
    if (esNuevo && conFactura && p.facturaRuc && pareceRucConDigito(p.facturaRuc)) void verificar(p.facturaRuc);
  }, [esNuevo, conFactura, p.facturaRuc, verificar]);

  async function ejecutar(accion: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    setOcupado(true);
    try {
      const r = await accion();
      if (!r.ok) setError(r.error ?? "No se pudo completar. Actualizá la pantalla.");
      else router.refresh();
      return r.ok;
    } catch {
      setError("No se pudo completar. Revisá la conexión y probá de nuevo.");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function aceptar() {
    let costo: number | undefined;
    if (p.tipoEntrega === "delivery" && p.envioACoordinar) {
      const n = Number(envio.replace(",", "."));
      if (envio.trim() === "" || !Number.isFinite(n) || n < 0) {
        setError("El envío es «a coordinar»: poné el costo (o 0 si es gratis) antes de aceptar.");
        return;
      }
      costo = Math.round(n);
    }
    await ejecutar(() => aceptarPedido(p.id, costo));
  }

  async function rechazar(motivo: string) {
    const ok = await ejecutar(() => rechazarPedido(p.id, motivo));
    if (ok) setRechazando(false);
  }

  async function entregarYCobrar() {
    setError(null);
    setOcupado(true);
    try {
      const r = await entregarYCobrarPedido(p.id);
      if (!r.ok) {
        // Sin turno de caja abierto: se manda directo a abrirlo y se vuelve acá (regla del sistema: sin turno no se vende).
        if (r.sinTurno) {
          router.push(rutaParaAbrirTurno("/admin/pedidos-web"));
          return;
        }
        setError(r.error);
        return;
      }
      router.refresh();
    } catch {
      setError("No se pudo cobrar. Revisá la conexión y probá de nuevo.");
    } finally {
      setOcupado(false);
    }
  }

  // El WhatsApp que el local le manda al cliente: dice cómo va su pedido y lleva el enlace para seguirlo (si retrocede o cierra la
  // pantalla, lo tiene en el chat). El teléfono se lleva al formato internacional que pide wa.me.
  const telefonoWa = normalizarTelefonoParaWhatsapp(p.clienteTelefono);
  const enlaceSeguimiento = origen && slug && p.token ? `${origen}/${slug}/pedido/${p.token}` : null;
  const mensajeAlCliente = mensajeParaElCliente({
    nombre: p.clienteNombre,
    local: nombreLocal,
    numero: p.numero,
    estado: p.estado,
    tipoEntrega: p.tipoEntrega,
    enlace: enlaceSeguimiento,
  });
  const metodo = METODOS_PAGO_PEDIDO.find((m) => m.value === p.metodoPago)?.label ?? p.metodoPago;
  const textoEstado = esNuevo ? "Nuevo" : p.estado === "aceptado" ? etiquetas.preparando : p.estado === "listo" ? etiquetas.listo : p.estado;

  return (
    <article className="rounded-xl border-2 border-azul/50 bg-superficie p-4" aria-label={`Pedido ${p.numero}`}>
      {/* ------------------------------------------------------------------ cabecera */}
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[1.05rem] font-semibold text-tinta">Pedido {formatearNumero(p.numero)}</h3>
          <Pastilla color={COLOR_ESTADO[p.estado]}>{textoEstado}</Pastilla>
          {/* El tipo de pedido, grande y en lila: a primera vista se distingue un retiro de un delivery. */}
          <Pastilla color="violeta" grande>
            {p.tipoEntrega === "retiro" ? "Retiro" : "Delivery"}
          </Pastilla>
          {p.cuentaNumero != null && <Pastilla color="azul">Cuenta {formatearNumero(p.cuentaNumero)}</Pastilla>}
        </div>
        <span className="text-[0.78rem] text-tinta-suave">{haceCuanto(p.creadoEn, ahora)}</span>
      </header>

      {/* ------------------------------------------------------------------ cliente */}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[0.95rem] font-semibold text-tinta">{p.clienteNombre}</p>
          <p className="text-[0.86rem] text-tinta-media">{p.clienteTelefono}</p>
          {p.tipoEntrega === "delivery" && p.direccion && <p className="text-[0.84rem] text-tinta-media">{p.direccion}</p>}
          {p.tipoEntrega === "delivery" && p.zonaNombre && <p className="text-[0.8rem] text-tinta-suave">Zona: {p.zonaNombre}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {telefonoWa && (
            <a
              href={`https://wa.me/${telefonoWa}?text=${encodeURIComponent(mensajeAlCliente)}`}
              target="_blank"
              rel="noopener noreferrer"
              // El verde de WhatsApp (el mismo del botón que ve el cliente): se reconoce de un vistazo qué abre.
              className={clasesBoton("whatsapp", "sm")}
              title="Escribirle al cliente por WhatsApp con el enlace para seguir su pedido"
            >
              <IconoWhatsapp tam={16} />
              WhatsApp
            </a>
          )}
          {p.tipoEntrega === "delivery" && p.clienteLat != null && p.clienteLng != null && (
            <a
              href={enlaceDeMapa({ lat: p.clienteLat, lng: p.clienteLng })}
              target="_blank"
              rel="noopener noreferrer"
              className={clasesBoton("navegar", "sm")}
            >
              Ver en el mapa
            </a>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ productos */}
      <ul className="mt-3 flex flex-col divide-y divide-linea rounded-lg border border-linea">
        {p.lineas.map((l, i) => (
          <li key={i} className="flex items-start justify-between gap-3 px-3 py-2 text-[0.9rem]">
            <span className="min-w-0 text-tinta">
              {l.cantidad} × {l.nombre}
              {l.detalle && <span className="block text-[0.78rem] text-tinta-suave">{l.detalle}</span>}
            </span>
            <span className="flex flex-none items-center gap-2">
              <span className="cifra font-medium text-tinta-media">{formatearGuarani(l.precioUnitario * l.cantidad)}</span>
              {esNuevo && puedeGestionar && p.lineas.length > 1 && (
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => void ejecutar(() => quitarProductoDelPedido(p.id, i))}
                  className={clasesBoton("peligro", "sm")}
                  title="Quitar este producto porque no lo tenemos"
                >
                  No hay
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>

      {/* ------------------------------------------------------------------ totales */}
      <div className="mt-3 flex flex-col gap-1 text-[0.88rem] text-tinta-media">
        <div className="flex justify-between gap-3">
          <span>Productos</span>
          <span className="cifra font-medium text-tinta">{formatearGuarani(p.subtotal)}</span>
        </div>
        {p.tipoEntrega === "delivery" && (
          <div className="flex items-center justify-between gap-3">
            <span>Envío</span>
            {esNuevo && p.envioACoordinar ? (
              <span className="flex items-center gap-2">
                <span className="text-[0.78rem] text-aviso">A coordinar:</span>
                <Entrada
                  inputMode="numeric"
                  value={envio}
                  onChange={(e) => setEnvio(e.target.value)}
                  placeholder="Costo"
                  className="!h-9 !w-28"
                  aria-label="Costo de envío"
                />
              </span>
            ) : (
              <span className="cifra font-medium text-tinta">{formatearGuarani(p.costoEnvio)}</span>
            )}
          </div>
        )}
        <div className="flex items-baseline justify-between gap-3 border-t border-linea pt-1.5 text-tinta">
          <span className="font-semibold">Total</span>
          <span className="cifra text-[1.15rem] font-bold">{formatearGuarani(p.subtotal + (p.tipoEntrega === "delivery" && esNuevo && p.envioACoordinar ? Math.max(0, Math.round(Number(envio.replace(",", ".")) || 0)) : p.costoEnvio))}</span>
        </div>
      </div>

      {/* ------------------------------------------------------------------ pago, comprobante y avisos */}
      <div className="mt-3 flex flex-col gap-1.5 text-[0.86rem] text-tinta-media">
        <p>
          <span className="font-medium text-tinta">Paga:</span> {metodo} al recibir
        </p>
        <p>
          <span className="font-medium text-tinta">Comprobante:</span>{" "}
          {conFactura ? `Factura a ${p.facturaRazonSocial ?? ""} · RUC ${p.facturaRuc}` : p.comprobanteTipo === "factura" ? "Factura" : "Ticket"}
        </p>
        {esNuevo && conFactura && <AvisoRucDnit verificacion={verificacion} verificando={verificando} />}
        {p.notas && (
          <p className="rounded-lg bg-papel-suave px-3 py-2 text-tinta">
            <span className="font-medium">Aclaraciones del cliente:</span> {p.notas}
          </p>
        )}
        {p.avisos.length > 0 && (
          <ul className="rounded-lg bg-aviso-luz px-3 py-2 text-[0.82rem] text-aviso">
            {p.avisos.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        )}
        {p.estado === "rechazado" && p.motivoRechazo && <p className="text-peligro">Motivo del rechazo: {p.motivoRechazo}</p>}
      </div>

      {error && <MensajeError>{error}</MensajeError>}

      {/* ------------------------------------------------------------------ corregir los datos (pedido nuevo) */}
      {esNuevo && puedeGestionar && editando && (
        <PanelCorregir
          pedido={p}
          onCerrar={() => setEditando(false)}
          onGuardado={() => {
            setEditando(false);
            router.refresh();
          }}
        />
      )}

      {/* ------------------------------------------------------------------ rechazar: el motivo es una lista corta */}
      {esNuevo && puedeGestionar && rechazando && (
        <div className="mt-3 rounded-lg border border-peligro/30 bg-peligro-luz/40 p-3">
          <p className="mb-2 text-[0.84rem] font-semibold text-peligro">¿Por qué lo rechazás? El cliente lo lee en su pantalla.</p>
          <div className="flex flex-wrap gap-2">
            {MOTIVOS_RECHAZO.map((m) => (
              <button key={m} type="button" disabled={ocupado} onClick={() => void rechazar(m)} className={clasesBoton("suave", "sm")}>
                {m}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Entrada
              value={otroMotivo}
              onChange={(e) => setOtroMotivo(e.target.value)}
              placeholder="Otro motivo"
              maxLength={200}
              className="!h-9 min-w-0 flex-1"
              aria-label="Otro motivo"
            />
            <Boton tono="peligro" tam="sm" disabled={ocupado || otroMotivo.trim().length < 3} onClick={() => void rechazar(otroMotivo)}>
              Rechazar
            </Boton>
            <Boton tono="suave" tam="sm" onClick={() => setRechazando(false)}>
              Volver
            </Boton>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ acciones */}
      {puedeGestionar && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {esNuevo && !rechazando && (
            <>
              <Boton tono="nuevo" tam="lg" disabled={ocupado} onClick={() => void aceptar()}>
                {ocupado ? "Aceptando…" : "Aceptar"}
              </Boton>
              <Boton tono="navegar" tam="md" disabled={ocupado} onClick={() => setEditando((v) => !v)}>
                Corregir datos
              </Boton>
              <Boton tono="peligro" tam="md" disabled={ocupado} onClick={() => setRechazando(true)}>
                Rechazar
              </Boton>
            </>
          )}
          {p.estado === "aceptado" && (
            <Boton tono="principal" tam="lg" disabled={ocupado} onClick={() => void ejecutar(() => marcarPedidoListo(p.id))}>
              {etiquetas.accionListo}
            </Boton>
          )}
          {(p.estado === "aceptado" || p.estado === "listo") && puedeCobrar && (
            <Boton tono={p.estado === "listo" ? "principal" : "navegar"} tam={p.estado === "listo" ? "lg" : "md"} disabled={ocupado} onClick={() => void entregarYCobrar()}>
              {ocupado ? "Cobrando…" : etiquetas.accionEntregado}
            </Boton>
          )}
          {(p.estado === "aceptado" || p.estado === "listo") && (
            <Link href="/admin/delivery" className={clasesBoton("navegar", "sm")}>
              Abrir la cuenta en el delivery
            </Link>
          )}
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
//  Corregir los datos de un pedido nuevo (el RUC mal tipeado se arregla acá, antes de aceptar)
// ---------------------------------------------------------------------------------------------------------------------

function PanelCorregir({ pedido: p, onCerrar, onGuardado }: { pedido: PedidoWebFila; onCerrar: () => void; onGuardado: () => void }) {
  const [nombre, setNombre] = useState(p.clienteNombre);
  const [telefono, setTelefono] = useState(p.clienteTelefono);
  const [comprobante, setComprobante] = useState<"ticket" | "factura">(p.comprobanteTipo === "factura" ? "factura" : "ticket");
  const [ruc, setRuc] = useState(p.facturaRuc ?? "");
  const [razon, setRazon] = useState(p.facturaRazonSocial ?? "");
  const [email, setEmail] = useState(p.facturaEmail ?? "");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const { verificacion, verificando, verificarAhora, usarNombreDeLaDnit } = useVerificacionDeCliente({
    tipo: comprobante === "factura" ? "ruc" : "otro",
    numero: ruc,
    razonSocial: razon,
    ponerNumero: setRuc,
    ponerRazonSocial: setRazon,
  });

  async function guardar() {
    setError(null);
    if (comprobante === "factura" && verificacion?.bloquea) {
      setError(verificacion.mensaje ?? "La DNIT no acepta facturas a ese RUC.");
      return;
    }
    setGuardando(true);
    try {
      const r = await corregirDatosDelPedido(p.id, {
        clienteNombre: nombre,
        clienteTelefono: telefono,
        comprobanteTipo: comprobante,
        facturaTipoIdentificacion: "ruc",
        facturaRuc: ruc,
        facturaRazonSocial: razon,
        facturaEmail: email,
      });
      if (!r.ok) setError(r.error);
      else onGuardado();
    } catch {
      setError("No se pudo guardar. Probá de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-azul/30 bg-azul-luz/40 p-3">
      <p className="mb-2 text-[0.84rem] font-semibold text-azul-oscuro">Corregir los datos del pedido</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo etiqueta="Nombre">
          <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} />
        </Campo>
        <Campo etiqueta="Teléfono">
          <Entrada value={telefono} onChange={(e) => setTelefono(e.target.value)} maxLength={20} inputMode="tel" />
        </Campo>
      </div>
      <div className="mt-3">
        <Segmentado
          opciones={[
            { value: "ticket", label: "Ticket" },
            { value: "factura", label: "Factura" },
          ]}
          valor={comprobante}
          onChange={setComprobante}
          uniforme
        />
      </div>
      {comprobante === "factura" && (
        <div className="mt-3 flex flex-col gap-3">
          <div>
            <Campo etiqueta="RUC (con su dígito)">
              <Entrada value={ruc} onChange={(e) => setRuc(e.target.value)} placeholder="80012345-0" maxLength={30} />
            </Campo>
            <AvisoRucDnit verificacion={verificacion} verificando={verificando} conRazonSocial={false} />
            <div className="mt-2 flex flex-wrap gap-2">
              <Boton tono="navegar" tam="sm" disabled={verificando || !ruc.trim()} onClick={() => void verificarAhora(ruc.trim(), true)}>
                {verificando ? "Verificando…" : "Verificar en la DNIT"}
              </Boton>
              {verificacion?.resultado === "encontrado" && verificacion.razonSocial && razon.trim() !== verificacion.razonSocial && (
                <Boton tono="navegar" tam="sm" onClick={usarNombreDeLaDnit}>
                  Usar el nombre de la DNIT
                </Boton>
              )}
            </div>
          </div>
          <Campo etiqueta="Razón social">
            <Entrada value={razon} onChange={(e) => setRazon(e.target.value)} maxLength={120} />
          </Campo>
          <Campo etiqueta="Correo (opcional)">
            <Entrada type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} />
          </Campo>
        </div>
      )}
      {error && <MensajeError>{error}</MensajeError>}
      <div className="mt-3 flex gap-2">
        <Boton tono="navegar" tam="md" disabled={guardando} onClick={() => void guardar()}>
          {guardando ? "Guardando…" : "Guardar"}
        </Boton>
        <Boton tono="peligro" tam="md" onClick={onCerrar}>
          Cancelar
        </Boton>
      </div>
    </div>
  );
}

/**
 * El WhatsApp que el local le escribe al cliente por su pedido: lo saluda, le dice en qué paso está y le deja el enlace para
 * seguirlo. Va armado según el estado (recién llegado, en preparación, listo).
 */
export function mensajeParaElCliente(d: {
  nombre: string;
  local: string;
  numero: number;
  estado: EstadoPedidoWeb;
  tipoEntrega: "delivery" | "retiro";
  enlace: string | null;
}): string {
  const primerNombre = d.nombre.trim().split(/\s+/)[0] || "";
  const saludo = `Hola${primerNombre ? ` ${primerNombre}` : ""}${d.local ? `, te escribimos de ${d.local}` : ""} por tu pedido ${formatearNumero(d.numero)}.`;
  let situacion = "";
  if (d.estado === "nuevo") situacion = "Lo recibimos y lo estamos revisando.";
  else if (d.estado === "aceptado") situacion = "Ya lo estamos preparando.";
  else if (d.estado === "listo") situacion = d.tipoEntrega === "retiro" ? "¡Ya está listo para que lo retires!" : "¡Ya está listo y sale en camino!";
  const partes = [saludo, situacion];
  if (d.enlace) partes.push(`Podés ver cómo va tu pedido acá: ${d.enlace}`);
  return partes.filter(Boolean).join("\n");
}
