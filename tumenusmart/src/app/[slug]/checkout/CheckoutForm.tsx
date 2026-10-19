"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useCart } from "@/components/CartProvider";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { distanciaKm, encontrarZonaPorDistancia } from "@/lib/geo";
import { Campo, Entrada, Aviso } from "@/components/ui";
import { Segmentado } from "@/components/Segmentado";
import { BotonEnviar } from "@/components/BotonEnviar";
import { BotonWhatsappCTA } from "@/components/BotonWhatsappCTA";
import { ConfirmarPorWhatsapp } from "@/components/ConfirmarPorWhatsapp";
import { IconoWhatsapp } from "@/components/iconos";
import { METODOS_PAGO_PEDIDO, type MetodoPagoPedido } from "@/lib/metodos-pago";
import { ingredientesQuitadosTexto, opcionesTexto, precioUnitario } from "@/lib/cart-types";
import { construirLinkWhatsapp, construirMensajePedido } from "@/lib/whatsapp";
import { guardarPedidoReciente } from "@/lib/pedidos-recientes";
import { enviarPedidoWeb } from "./actions";

// Leaflet usa `window`, así que el mapa se carga solo en el navegador.
const MapPicker = dynamic(
  () => import("@/components/MapPicker").then((m) => m.MapPicker),
  { ssr: false, loading: () => <div className="h-80 animate-pulse rounded-xl bg-papel-hundido" /> }
);

type Zona = { id: string; nombre: string; radioKm: number; costoEnvio: number };

type TipoEntrega = "delivery" | "retiro";

const TIPOS_ENTREGA: { value: TipoEntrega; label: string; sublabel?: string }[] = [
  { value: "delivery", label: "Delivery" },
  { value: "retiro", label: "Retiro en el local" },
];

/** Cada bloque del formulario: blanco, esquinas amplias y sombra suave (el título va aparte, grande). */
const BLOQUE = "flex flex-col gap-4 rounded-2xl bg-superficie p-4 shadow-sm ring-1 ring-linea";
const TITULO = "text-[1.15rem] font-semibold tracking-titular text-tinta";

/** Lo que se pidió, guardado al armar el mensaje (el carrito se vacía al enviarlo y la pantalla final lo sigue mostrando). */
type ResumenPedido = { lineas: { texto: string; monto: number }[]; entrega: string; pago: string; total: string };

type Props = {
  /** nombre del local en la URL (para volver a la carta) */
  slug: string;
  nombreLocal: string;
  /** El WhatsApp del local: a donde va el pedido. */
  whatsappNumero: string;
  /** El saludo con el que empieza el mensaje (Configuración), si el local lo cargó. */
  saludo: string | null;
  storeLat: number | null;
  storeLng: number | null;
  envioModo: "zonas" | "coordinar";
  /** false cuando el local está cerrado o con los pedidos pausados */
  aceptaPedidos: boolean;
  motivoBloqueo: string | null;
  /** Qué métodos de pago y formas de entrega tiene habilitados este local. */
  aceptaEfectivo: boolean;
  aceptaTransferencia: boolean;
  aceptaTarjetaDebito: boolean;
  aceptaTarjetaCredito: boolean;
  aceptaDelivery: boolean;
  aceptaRetiro: boolean;
  zonas: Zona[];
  /**
   * true: el pedido entra al sistema del local (queda registrado y el cliente lo sigue en una pantalla). false: como siempre, se
   * arma el mensaje de WhatsApp. Lo decide el local en Configuración.
   */
  pedidosEnSistema: boolean;
  /**
   * true: el local pide confirmar el pedido mandándolo por WhatsApp. El pedido queda pendiente y el cliente tiene unos minutos para
   * tocar «Enviar por WhatsApp»; si no, se cancela y el carrito sigue como estaba.
   */
  confirmaPorWhatsapp?: boolean;
};

export function CheckoutForm({
  slug,
  nombreLocal,
  whatsappNumero,
  saludo,
  storeLat,
  storeLng,
  envioModo,
  aceptaPedidos,
  motivoBloqueo,
  aceptaEfectivo,
  aceptaTransferencia,
  aceptaTarjetaDebito,
  aceptaTarjetaCredito,
  aceptaDelivery,
  aceptaRetiro,
  zonas,
  pedidosEnSistema,
  confirmaPorWhatsapp = false,
}: Props) {
  const { items, subtotal, vaciarCarrito } = useCart();

  // Solo lo que el local dejó habilitado en Configuración — así el cliente
  // nunca ve una opción que ese negocio no puede cumplir.
  const metodosDisponibles = useMemo(
    () =>
      METODOS_PAGO_PEDIDO.filter(
        (m) =>
          ({
            efectivo: aceptaEfectivo,
            transferencia: aceptaTransferencia,
            tarjeta_debito: aceptaTarjetaDebito,
            tarjeta_credito: aceptaTarjetaCredito,
          })[m.value]
      ),
    [aceptaEfectivo, aceptaTransferencia, aceptaTarjetaDebito, aceptaTarjetaCredito]
  );
  const entregasDisponibles = useMemo(
    () =>
      TIPOS_ENTREGA.filter(
        (t) => ({ delivery: aceptaDelivery, retiro: aceptaRetiro })[t.value]
      ).map((t) =>
        t.value === "delivery"
          ? { ...t, sublabel: envioModo === "zonas" ? "Según zona" : "A coordinar" }
          : t
      ),
    [aceptaDelivery, aceptaRetiro, envioModo]
  );

  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  // Fallback defensivo: la Server Action de Configuración no deja guardar un
  // grupo en cero, así que esto solo cubriría un dato inconsistente.
  const [tipoEntrega, setTipoEntrega] = useState<TipoEntrega>(
    entregasDisponibles[0]?.value ?? "retiro"
  );
  const [clienteLat, setClienteLat] = useState<number | null>(null);
  const [clienteLng, setClienteLng] = useState<number | null>(null);
  const [direccion, setDireccion] = useState("");
  const [metodoPago, setMetodoPago] = useState<MetodoPagoPedido>(
    metodosDisponibles[0]?.value ?? "efectivo"
  );
  const [comprobanteTipo, setComprobanteTipo] = useState<"ticket" | "factura">("ticket");
  const [facturaRazonSocial, setFacturaRazonSocial] = useState("");
  const [facturaRuc, setFacturaRuc] = useState("");
  const [facturaEmail, setFacturaEmail] = useState("");
  // Solo con los pedidos por el sistema: la trampa para robots, el identificador del envío (el mismo si se
  // reintenta, para que un doble toque no duplique el pedido) y lo que devuelve el servidor al recibirlo.
  const [sitioWeb, setSitioWeb] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [envioId, setEnvioId] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `e${Date.now()}${Math.random().toString(36).slice(2)}`));
  const [recibido, setRecibido] = useState<{ token: string; numero: number; aceptado: boolean } | null>(null);
  // Con los pedidos por el sistema, además del registro se arma el aviso por WhatsApp al local (con el número de pedido). `abierto`:
  // el navegador ya abrió WhatsApp solo; si no, el botón de la pantalla final lo abre con un toque.
  const [avisoWsp, setAvisoWsp] = useState<{ enlace: string; abierto: boolean } | null>(null);
  // El pedido ya está creado pero espera que el cliente lo mande por WhatsApp (no entró al sistema ni se vació el carrito).
  const [pendiente, setPendiente] = useState<{ token: string; numero: number; segundos: number; enlace: string } | null>(null);
  /** El enlace de WhatsApp con el pedido ya escrito: cuando existe, se muestra la pantalla de "enviá tu pedido". */
  const [enlace, setEnlace] = useState<string | null>(null);
  /** El cliente ya tocó el botón de WhatsApp (el carrito se vació en ese momento). */
  const [enviado, setEnviado] = useState(false);
  const [resumen, setResumen] = useState<ResumenPedido | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Qué campo disparó el último error, para resaltarlo — no todo el aviso
  // sirve de igual manera si el ojo no sabe dónde corregir.
  const [campoInvalido, setCampoInvalido] = useState<"ubicacion" | "factura" | null>(null);
  const [intento, setIntento] = useState(0);

  function fallar(mensaje: string, campo?: "ubicacion" | "factura") {
    setError(mensaje);
    setCampoInvalido(campo ?? null);
    setIntento((n) => n + 1);
  }

  const hayUbicacionLocal = storeLat != null && storeLng != null;

  const distancia = useMemo(() => {
    if (!hayUbicacionLocal || clienteLat == null || clienteLng == null) return null;
    return distanciaKm(storeLat!, storeLng!, clienteLat, clienteLng);
  }, [hayUbicacionLocal, storeLat, storeLng, clienteLat, clienteLng]);

  const zonaEncontrada =
    envioModo === "zonas" && distancia != null
      ? encontrarZonaPorDistancia(zonas, distancia)
      : null;

  const costoEnvio =
    tipoEntrega === "delivery" && zonaEncontrada ? zonaEncontrada.costoEnvio : 0;
  const total = subtotal + costoEnvio;

  const fueraDeCobertura =
    tipoEntrega === "delivery" &&
    envioModo === "zonas" &&
    distancia != null &&
    !zonaEncontrada;

  let textoEnvio: string;
  if (envioModo === "coordinar") {
    textoEnvio = "A coordinar con el local";
  } else if (!hayUbicacionLocal) {
    textoEnvio = "A coordinar con el local";
  } else if (clienteLat == null) {
    textoEnvio = "Marcá tu ubicación en el mapa";
  } else if (zonaEncontrada) {
    textoEnvio = formatearGuarani(zonaEncontrada.costoEnvio);
  } else {
    textoEnvio = "Fuera de cobertura — a coordinar";
  }

  /** Manda el pedido al servidor: del navegador solo sale QUÉ eligió (productos, agregados, cantidades); los precios los calcula él. */
  async function enviarAlSistema(ventanaWsp: Window | null) {
    if (enviando) {
      ventanaWsp?.close();
      return;
    }
    setEnviando(true);
    try {
      const r = await enviarPedidoWeb(slug, {
        envioId,
        nombre: nombre.trim(),
        telefono: telefono.trim(),
        tipoEntrega,
        direccion: tipoEntrega === "delivery" ? direccion.trim() : undefined,
        clienteLat: tipoEntrega === "delivery" ? clienteLat : null,
        clienteLng: tipoEntrega === "delivery" ? clienteLng : null,
        metodoPago,
        comprobanteTipo,
        facturaRazonSocial: comprobanteTipo === "factura" ? facturaRazonSocial.trim() : undefined,
        facturaRuc: comprobanteTipo === "factura" ? facturaRuc.trim() : undefined,
        facturaEmail: comprobanteTipo === "factura" ? facturaEmail.trim() || undefined : undefined,
        items: items.map((i) => ({
          productId: i.mitadYMitad ? undefined : i.productId,
          mitadYMitad: i.mitadYMitad ? { productIdA: i.mitadYMitad.productIdA, productIdB: i.mitadYMitad.productIdB } : undefined,
          opcionIds: i.opciones.map((o) => o.id),
          ingredientesQuitados: i.ingredientesQuitados ?? [],
          cantidad: i.cantidad,
        })),
        // Lo que vio en pantalla: si el servidor calcula más, se le avisa antes de tomarlo.
        totalMostrado: total,
        sitioWeb,
      });
      if (!r.ok) {
        ventanaWsp?.close();
        fallar(r.error, r.campo === "ubicacion" ? "ubicacion" : r.campo === "factura" ? "factura" : undefined);
        return;
      }

      // El aviso por WhatsApp al local, con el número del pedido y el total que calculó el servidor.
      if (whatsappNumero.replace(/\D/g, "")) {
        const envio = tipoEntrega === "delivery" ? costoEnvio : 0;
        const mensaje = construirMensajePedido({
          numero: r.numero,
          // El enlace queda en el chat de WhatsApp: si el cliente retrocede o cierra la pestaña, desde ahí vuelve a su pedido.
          linkSeguimiento: `${window.location.origin}/${slug}/pedido/${r.token}`,
          saludo,
          clienteNombre: nombre.trim(),
          clienteTelefono: telefono.trim(),
          tipoEntrega,
          direccion: tipoEntrega === "delivery" ? direccion.trim() : null,
          zonaNombre: tipoEntrega === "delivery" ? zonaEncontrada?.nombre ?? null : null,
          clienteLat: tipoEntrega === "delivery" ? clienteLat : null,
          clienteLng: tipoEntrega === "delivery" ? clienteLng : null,
          metodoPagoReferencia: metodoPago,
          comprobanteTipo,
          facturaRazonSocial: comprobanteTipo === "factura" ? facturaRazonSocial.trim() : null,
          facturaRuc: comprobanteTipo === "factura" ? facturaRuc.trim() : null,
          facturaEmail: comprobanteTipo === "factura" ? facturaEmail.trim() || null : null,
          items: items.map((i) => ({
            nombreProducto: i.nombreProducto,
            cantidad: i.cantidad,
            precioUnitario: precioUnitario(i),
            opcionesTexto: opcionesTexto(i) || null,
            ingredientesQuitadosTexto: ingredientesQuitadosTexto(i) || null,
          })),
          subtotal: Math.max(0, r.total - envio),
          costoEnvio: envio,
          total: r.total,
        });
        const enlaceWsp = construirLinkWhatsapp(whatsappNumero, mensaje);

        // El local pide confirmar por WhatsApp: el pedido existe pero todavía no entró. Se espera que el cliente lo mande (con su
        // cuenta regresiva); el carrito NO se vacía, así si se cancela o se vence todo vuelve atrás y puede reintentar.
        if (r.pendiente) {
          ventanaWsp?.close();
          setResumen({
            lineas: items.map((i) => ({ texto: `${i.cantidad} × ${i.nombreProducto}`, monto: precioUnitario(i) * i.cantidad })),
            entrega: tipoEntrega === "delivery" ? "Delivery" : "Retiro en el local",
            pago: METODOS_PAGO_PEDIDO.find((m) => m.value === metodoPago)?.label ?? metodoPago,
            total: formatearGuarani(r.total),
          });
          setPendiente({ token: r.token, numero: r.numero, segundos: r.segundosRestantes, enlace: enlaceWsp });
          window.scrollTo({ top: 0 });
          return;
        }

        let abierto = false;
        if (ventanaWsp && !ventanaWsp.closed) {
          try {
            // La ventana se abrió con el toque (los navegadores no dejan abrir una después de esperar al servidor): acá se la lleva a WhatsApp.
            ventanaWsp.opener = null;
            ventanaWsp.location.href = enlaceWsp;
            abierto = true;
          } catch {
            abierto = false;
          }
        }
        setAvisoWsp({ enlace: enlaceWsp, abierto });
      } else {
        ventanaWsp?.close();
      }

      setResumen({
        lineas: items.map((i) => ({ texto: `${i.cantidad} × ${i.nombreProducto}`, monto: precioUnitario(i) * i.cantidad })),
        entrega: tipoEntrega === "delivery" ? "Delivery" : "Retiro en el local",
        pago: METODOS_PAGO_PEDIDO.find((m) => m.value === metodoPago)?.label ?? metodoPago,
        total: formatearGuarani(r.total),
      });
      setRecibido({ token: r.token, numero: r.numero, aceptado: r.aceptado });
      // Queda anotado en este navegador para poder volver a «Ver mi pedido» desde el menú si retrocede.
      guardarPedidoReciente(slug, { token: r.token, numero: r.numero });
      vaciarCarrito();
      window.scrollTo({ top: 0 });
    } catch {
      ventanaWsp?.close();
      fallar("No pudimos enviar tu pedido. Revisá tu conexión y probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  /**
   * Con los pedidos por el sistema, el pedido llega al local y queda registrado. Sin eso (el local no lo encendió) el menú NO crea el
   * pedido: arma el mensaje de WhatsApp con todo lo que el cliente eligió y lo escribió, y se lo manda al local; quien atiende lo carga
   * a mano. En ese caso nada de lo que escribe el cliente llega a un servidor ni a una base.
   */
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCampoInvalido(null);

    if (!aceptaPedidos) {
      fallar(motivoBloqueo ?? "En este momento no se pueden tomar pedidos.");
      return;
    }
    if (items.length === 0) {
      fallar("Tu carrito está vacío.");
      return;
    }
    if (!nombre.trim() || !telefono.trim()) {
      fallar("Escribí tu nombre y tu teléfono para que el local pueda confirmarte el pedido.");
      return;
    }
    if (!pedidosEnSistema && !whatsappNumero.replace(/\D/g, "")) {
      fallar("Este local todavía no configuró su WhatsApp: no se puede enviar el pedido por acá.");
      return;
    }
    if (tipoEntrega === "delivery" && (clienteLat == null || clienteLng == null)) {
      fallar("Marcá tu ubicación en el mapa para poder entregarte el pedido.", "ubicacion");
      return;
    }
    if (comprobanteTipo === "factura" && (!facturaRazonSocial.trim() || !facturaRuc.trim())) {
      fallar("Para factura necesitamos la razón social y el RUC.", "factura");
      return;
    }

    // El pedido entra al sistema del local: se manda al servidor (que recalcula todo) y el cliente lo sigue en su pantalla.
    if (pedidosEnSistema) {
      // Se abre ya, con el toque, una ventana en blanco para WhatsApp: después de esperar al servidor el navegador no deja abrir
      // ventanas nuevas. Si el pedido sale bien se la lleva al aviso; si falla, se cierra.
      // Si el local pide confirmar por WhatsApp, no se abre nada ahora: el cliente lo manda con el botón de la pantalla siguiente.
      const ventanaWsp = !confirmaPorWhatsapp && whatsappNumero.replace(/\D/g, "") ? window.open("", "_blank") : null;
      void enviarAlSistema(ventanaWsp);
      return;
    }

    const mensaje = construirMensajePedido({
      saludo,
      clienteNombre: nombre.trim(),
      clienteTelefono: telefono.trim(),
      tipoEntrega,
      direccion: tipoEntrega === "delivery" ? direccion.trim() : null,
      zonaNombre: tipoEntrega === "delivery" ? zonaEncontrada?.nombre ?? null : null,
      clienteLat: tipoEntrega === "delivery" ? clienteLat : null,
      clienteLng: tipoEntrega === "delivery" ? clienteLng : null,
      metodoPagoReferencia: metodoPago,
      comprobanteTipo,
      facturaRazonSocial: comprobanteTipo === "factura" ? facturaRazonSocial.trim() : null,
      facturaRuc: comprobanteTipo === "factura" ? facturaRuc.trim() : null,
      facturaEmail: comprobanteTipo === "factura" ? facturaEmail.trim() || null : null,
      items: items.map((i) => ({
        nombreProducto: i.nombreProducto,
        cantidad: i.cantidad,
        precioUnitario: precioUnitario(i),
        opcionesTexto: opcionesTexto(i) || null,
        ingredientesQuitadosTexto: ingredientesQuitadosTexto(i) || null,
      })),
      subtotal,
      costoEnvio: tipoEntrega === "delivery" ? costoEnvio : 0,
      total,
    });
    setResumen({
      lineas: items.map((i) => ({ texto: `${i.cantidad} × ${i.nombreProducto}`, monto: precioUnitario(i) * i.cantidad })),
      entrega: tipoEntrega === "delivery" ? "Delivery" : "Retiro en el local",
      pago: METODOS_PAGO_PEDIDO.find((m) => m.value === metodoPago)?.label ?? metodoPago,
      total: formatearGuarani(total) + (tipoEntrega === "delivery" && !zonaEncontrada && envioModo === "zonas" && hayUbicacionLocal ? " + envío" : ""),
    });
    setEnlace(construirLinkWhatsapp(whatsappNumero, mensaje));
    window.scrollTo({ top: 0 });
  }

  // El pedido está creado pero espera que el cliente lo mande por WhatsApp: cuenta regresiva y el botón. Si pasa el tiempo o lo
  // cancela, todo vuelve atrás (el carrito no se tocó) y puede reintentar con un envío nuevo.
  if (pendiente) {
    const volverAtras = (mensaje: string) => {
      setPendiente(null);
      setResumen(null);
      // Un identificador nuevo: el viejo quedó atado al pedido cancelado y el servidor lo devolvería tal cual.
      setEnvioId(typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `e${Date.now()}${Math.random().toString(36).slice(2)}`);
      fallar(mensaje);
      window.scrollTo({ top: 0 });
    };
    return (
      <div className="flex flex-col items-center px-1 pt-2">
        <h2 className="text-[1.4rem] font-semibold tracking-titular text-tinta">Pedido {formatearNumero(pendiente.numero)}</h2>
        <p className="mb-4 mt-1 max-w-sm text-center text-[0.9rem] leading-snug text-tinta-media">
          Ya armamos tu pedido. Para que {nombreLocal} lo reciba, mandalo por WhatsApp.
        </p>
        <div className="w-full max-w-sm">
          <ConfirmarPorWhatsapp
            slug={slug}
            token={pendiente.token}
            enlace={pendiente.enlace}
            segundos={pendiente.segundos}
            nombreLocal={nombreLocal}
            onConfirmado={(aceptado) => {
              // Ahora sí entró: queda anotado para «Ver mi pedido», se vacía el carrito y se muestra la pantalla de seguimiento.
              guardarPedidoReciente(slug, { token: pendiente.token, numero: pendiente.numero });
              setAvisoWsp({ enlace: pendiente.enlace, abierto: true });
              setRecibido({ token: pendiente.token, numero: pendiente.numero, aceptado });
              setPendiente(null);
              vaciarCarrito();
              window.scrollTo({ top: 0 });
            }}
            onVencido={() => volverAtras("Se acabó el tiempo y no se envió por WhatsApp: el pedido se canceló. Tu carrito sigue igual, podés volver a enviarlo.")}
            onCancelado={() => volverAtras("Cancelaste el pedido. Tu carrito sigue igual.")}
          />
        </div>

        {resumen && (
          <section aria-label="Resumen del pedido" className="mt-6 w-full max-w-sm rounded-2xl bg-superficie p-5 text-left shadow-sm ring-1 ring-linea">
            <p className="text-[0.74rem] font-semibold uppercase tracking-rotulo text-tinta-suave">Tu pedido</p>
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {resumen.lineas.map((l, i) => (
                <li key={i} className="flex justify-between gap-3 text-[0.9rem]">
                  <span className="min-w-0 text-tinta">{l.texto}</span>
                  <span className="cifra flex-none font-medium text-tinta-media">{formatearGuarani(l.monto)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-col gap-1.5 border-t border-dashed border-linea pt-3 text-[0.86rem] text-tinta-media">
              <div className="flex justify-between gap-3">
                <span>Entrega</span>
                <span className="text-right font-medium text-tinta">{resumen.entrega}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Pago</span>
                <span className="text-right font-medium text-tinta">{resumen.pago}</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <span className="text-[0.95rem] font-semibold text-tinta">Total</span>
                <span className="cifra text-[1.2rem] font-bold text-tinta">{resumen.total}</span>
              </div>
            </div>
          </section>
        )}
      </div>
    );
  }

  // El pedido ya llegó al local: pantalla final con el número y el enlace para seguirlo.
  if (recibido) {
    return (
      <div className="flex flex-col items-center px-1 pt-2 text-center">
        <span
          aria-hidden="true"
          className="flex h-20 w-20 animate-[entradaExito_0.5s_cubic-bezier(0.22,0.7,0.3,1)_both] items-center justify-center rounded-full bg-brand text-white shadow-media ring-8 ring-brand-light"
        >
          <svg viewBox="0 0 24 24" width={34} height={34} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <h2 className="mt-5 text-[1.5rem] font-semibold tracking-titular text-tinta">¡Pedido enviado!</h2>
        <p className="mt-1 text-[0.95rem] font-semibold text-tinta">Pedido {formatearNumero(recibido.numero)}</p>
        <p className="mt-1.5 max-w-sm text-[0.92rem] leading-snug text-tinta-media">
          {recibido.aceptado
            ? `${nombreLocal} ya lo aceptó y lo está preparando.`
            : `${nombreLocal} lo está revisando y en unos minutos te lo confirma.`}{" "}
          Podés ver cómo va en la pantalla de seguimiento.
        </p>

        {/* El aviso por WhatsApp al local: el pedido ya está en el sistema; esto hace que además le llegue al WhatsApp del negocio.
            WhatsApp no deja mandar el mensaje solo: el cliente tiene que tocar «Enviar» en su WhatsApp. */}
        {avisoWsp && (
          <div className="mt-5 w-full max-w-sm text-left">
            {avisoWsp.abierto ? (
              <p className="mb-2 text-center text-[0.86rem] leading-snug text-tinta-media">
                Se abrió WhatsApp con tu pedido: tocá <strong>Enviar</strong> allá para que {nombreLocal} lo reciba también por ese medio.
                Si no se abrió, tocá el botón.
              </p>
            ) : (
              <div className="mb-3">
                <Aviso titulo="Un paso más" color="aviso">
                  Tocá el botón y enviá el aviso por WhatsApp a {nombreLocal}, así lo recibe también por ahí.
                </Aviso>
              </div>
            )}
            <BotonWhatsappCTA link={avisoWsp.enlace} yaEnviado={avisoWsp.abierto} llamar={!avisoWsp.abierto} onEnviar={() => undefined} />
          </div>
        )}

        <Link
          href={`/${slug}/pedido/${recibido.token}`}
          className="mt-5 flex h-14 w-full max-w-sm items-center justify-center rounded-2xl bg-brand text-[1rem] font-semibold text-white shadow-alta transition-all active:scale-[0.98]"
        >
          Seguir mi pedido
        </Link>

        {resumen && (
          <section aria-label="Resumen del pedido" className="mt-6 w-full max-w-sm rounded-2xl bg-superficie p-5 text-left shadow-sm ring-1 ring-linea">
            <p className="text-[0.74rem] font-semibold uppercase tracking-rotulo text-tinta-suave">Tu pedido</p>
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {resumen.lineas.map((l, i) => (
                <li key={i} className="flex justify-between gap-3 text-[0.9rem]">
                  <span className="min-w-0 text-tinta">{l.texto}</span>
                  <span className="cifra flex-none font-medium text-tinta-media">{formatearGuarani(l.monto)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-col gap-1.5 border-t border-dashed border-linea pt-3 text-[0.86rem] text-tinta-media">
              <div className="flex justify-between gap-3">
                <span>Entrega</span>
                <span className="text-right font-medium text-tinta">{resumen.entrega}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Pago</span>
                <span className="text-right font-medium text-tinta">{resumen.pago}</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <span className="text-[0.95rem] font-semibold text-tinta">Total</span>
                <span className="cifra text-[1.2rem] font-bold text-tinta">{resumen.total}</span>
              </div>
            </div>
          </section>
        )}

        <Link
          href={`/${slug}`}
          className="mt-4 flex h-12 w-full max-w-sm items-center justify-center rounded-2xl bg-superficie text-[0.92rem] font-semibold text-tinta shadow-sm ring-1 ring-linea transition-all hover:ring-brand active:scale-[0.98]"
        >
          Volver al menú
        </Link>
      </div>
    );
  }

  // Ya está listo el mensaje: lo único que falta es que el cliente toque el botón y lo mande por WhatsApp.
  if (enlace) {
    return (
      <div className="flex flex-col items-center px-1 pt-2 text-center">
        <span
          aria-hidden="true"
          className="flex h-20 w-20 animate-[entradaExito_0.5s_cubic-bezier(0.22,0.7,0.3,1)_both] items-center justify-center rounded-full bg-brand text-white shadow-media ring-8 ring-brand-light"
        >
          <svg viewBox="0 0 24 24" width={34} height={34} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <h2 className="mt-5 text-[1.5rem] font-semibold tracking-titular text-tinta">
          {enviado ? "¡Pedido enviado!" : "Tu pedido está listo"}
        </h2>

        {enviado ? (
          <p className="mt-1.5 max-w-sm text-[0.92rem] leading-snug text-tinta-media">
            {nombreLocal} lo va a cargar y te lo confirma por WhatsApp. Si no se abrió WhatsApp, tocá el botón de nuevo.
          </p>
        ) : (
          <div className="mt-3 w-full max-w-sm text-left">
            <Aviso titulo="Falta un paso" color="aviso">
              Tocá el botón y enviá el mensaje por WhatsApp a {nombreLocal}. Hasta que no lo envíes, el local no se entera de tu
              pedido.
            </Aviso>
          </div>
        )}

        <div className="mt-5 w-full max-w-sm">
          <BotonWhatsappCTA
            link={enlace}
            yaEnviado={false}
            // El botón salta tres veces cada tanto mientras no se lo toca; el carrito se vacía recién al enviarlo.
            llamar
            onEnviar={() => {
              setEnviado(true);
              vaciarCarrito();
            }}
          />
        </div>

        {/* Lo que se pidió, como un ticket (se guarda al armar el mensaje: el carrito se vacía al enviarlo). */}
        {resumen && (
          <section aria-label="Resumen del pedido" className="mt-6 w-full max-w-sm rounded-2xl bg-superficie p-5 text-left shadow-sm ring-1 ring-linea">
            <p className="text-[0.74rem] font-semibold uppercase tracking-rotulo text-tinta-suave">Tu pedido</p>
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {resumen.lineas.map((l, i) => (
                <li key={i} className="flex justify-between gap-3 text-[0.9rem]">
                  <span className="min-w-0 text-tinta">{l.texto}</span>
                  <span className="cifra flex-none font-medium text-tinta-media">{formatearGuarani(l.monto)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-col gap-1.5 border-t border-dashed border-linea pt-3 text-[0.86rem] text-tinta-media">
              <div className="flex justify-between gap-3">
                <span>Entrega</span>
                <span className="text-right font-medium text-tinta">{resumen.entrega}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Pago</span>
                <span className="text-right font-medium text-tinta">{resumen.pago}</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <span className="text-[0.95rem] font-semibold text-tinta">Total</span>
                <span className="cifra text-[1.2rem] font-bold text-tinta">{resumen.total}</span>
              </div>
            </div>
          </section>
        )}

        {!enviado && (
          <button
            type="button"
            onClick={() => setEnlace(null)}
            className="mt-5 text-[0.9rem] font-semibold text-tinta-media underline-offset-2 hover:text-tinta hover:underline"
          >
            Corregir mi pedido
          </button>
        )}

        {enviado && (
          <Link
            href={`/${slug}`}
            className="mt-6 flex h-14 w-full max-w-sm items-center justify-center rounded-2xl bg-superficie text-[0.95rem] font-semibold text-tinta shadow-sm ring-1 ring-linea transition-all hover:ring-brand active:scale-[0.98]"
          >
            Volver al menú
          </Link>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Una columna en el celular; en notebook y monitor, «Tus datos» y «Comprobante» van lado a lado y el resto ocupa todo el ancho. */}
      <fieldset className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
        <section className={BLOQUE}>
          <h2 className={TITULO}>Tus datos</h2>
          <Campo etiqueta="Nombre">
            <Entrada
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Tu nombre"
              className="!h-12 !rounded-xl"
            />
          </Campo>
          <Campo etiqueta="Teléfono (WhatsApp)">
            <Entrada
              required
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="0981 234 567"
              className="!h-12 !rounded-xl"
            />
          </Campo>
        </section>

        <section className={BLOQUE}>
          <h2 className={TITULO}>Comprobante</h2>
          <Segmentado
            opciones={[
              { value: "ticket", label: "Ticket" },
              { value: "factura", label: "Factura" },
            ]}
            valor={comprobanteTipo}
            onChange={setComprobanteTipo}
            uniforme
          />

          {comprobanteTipo === "factura" && (
            <div
              key={campoInvalido === "factura" ? `sac-${intento}` : "factura"}
              className={`flex flex-col gap-3 rounded-2xl p-3.5 ${
                campoInvalido === "factura"
                  ? "animate-[sacudir_0.32s_ease] bg-peligro-luz/40 ring-2 ring-peligro/50"
                  : "bg-papel-suave ring-1 ring-linea"
              }`}
            >
              <Campo etiqueta="Razón social">
                <Entrada
                  required
                  value={facturaRazonSocial}
                  onChange={(e) => setFacturaRazonSocial(e.target.value)}
                  placeholder="Nombre de la empresa o del titular"
                  className="!h-12 !rounded-xl"
                />
              </Campo>
              <Campo etiqueta="RUC">
                <Entrada
                  required
                  value={facturaRuc}
                  onChange={(e) => setFacturaRuc(e.target.value)}
                  placeholder="80012345-0"
                  className="!h-12 !rounded-xl"
                />
              </Campo>
              <Campo etiqueta="Correo electrónico" ayuda="Opcional">
                <Entrada
                  type="email"
                  value={facturaEmail}
                  onChange={(e) => setFacturaEmail(e.target.value)}
                  placeholder="nombre@correo.com"
                  className="!h-12 !rounded-xl"
                />
              </Campo>
              <p className="text-[0.8rem] leading-snug text-tinta-media">
                {pedidosEnSistema
                  ? "Con estos datos se emite tu factura. Revisá el RUC con cuidado: si no existe, el local no puede facturarte."
                  : "Estos datos van en el mensaje de WhatsApp que vas a enviar al local. Ellos los revisan y cargan uno por uno para que la factura salga sin errores, así que escribilos con cuidado."}
              </p>
            </div>
          )}
        </section>

        <section className={`${BLOQUE} lg:col-span-2`}>
          <h2 className={TITULO}>Entrega y pago</h2>

          <Campo etiqueta="Método de pago" ayuda="Lo coordinás directamente con el local">
            {/* Tarjetas del mismo tamaño, de a dos por fila: con cuatro formas de pago quedan en dos filas. */}
            <Segmentado opciones={metodosDisponibles} valor={metodoPago} onChange={setMetodoPago} dosColumnas />
          </Campo>

          <div>
            <span className="mb-1.5 block text-[0.82rem] font-semibold text-tinta">Entrega</span>
            <Segmentado opciones={entregasDisponibles} valor={tipoEntrega} onChange={setTipoEntrega} uniforme />
          </div>

          {tipoEntrega === "delivery" && (
            <>
              <div>
                <Campo
                  etiqueta="¿Dónde te lo llevamos?"
                  ayuda="Marcá el punto en el mapa. Es lo que abre el repartidor para llegar, así que sin eso no se puede armar el pedido."
                >
                  <div
                    key={campoInvalido === "ubicacion" ? `sac-${intento}` : "mapa"}
                    className={`overflow-hidden rounded-2xl ${
                      campoInvalido === "ubicacion"
                        ? "animate-[sacudir_0.32s_ease] ring-2 ring-peligro/50"
                        : "ring-1 ring-linea"
                    }`}
                  >
                    <MapPicker
                      storeLat={storeLat}
                      storeLng={storeLng}
                      zonas={envioModo === "zonas" ? zonas : []}
                      lat={clienteLat}
                      lng={clienteLng}
                      onChange={(la, ln) => {
                        setClienteLat(la);
                        setClienteLng(ln);
                      }}
                    />
                  </div>
                </Campo>
                {fueraDeCobertura && (
                  <p className="mt-2 text-[0.84rem] text-aviso">
                    Tu ubicación está fuera de las zonas con precio automático — el local va a
                    coordinar el costo de envío directamente con vos por WhatsApp.
                  </p>
                )}
              </div>

              <Campo
                etiqueta="Referencia de la dirección"
                ayuda="Con el pin en el mapa ya alcanza. Esto ayuda al repartidor a encontrarte más rápido si el lugar es difícil. Opcional."
              >
                <Entrada
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  placeholder="Casa, depto, entre calles, portón de color..."
                  className="!h-12 !rounded-xl"
                />
              </Campo>
            </>
          )}

          {/* La trampa para robots: está fuera de la vista y de la tabulación; una persona nunca lo llena. (Antes iba junto a un campo de
              «Aclaraciones para el local» que el dueño pidió quitar: ocupaba lugar sin hacer falta.) */}
          {pedidosEnSistema && (
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>
                No completar
                <input type="text" tabIndex={-1} autoComplete="off" value={sitioWeb} onChange={(e) => setSitioWeb(e.target.value)} />
              </label>
            </div>
          )}
        </section>

        {/* El total, bien a la vista: lo que lleva, el envío y cuánto es. */}
        <section aria-label="Resumen de lo que pagás" className="rounded-2xl bg-brand-light/70 p-4 ring-1 ring-brand/15 lg:col-span-2">
          <div className="flex justify-between text-[0.92rem] text-tinta-media">
            <span>Subtotal</span>
            <span className="cifra font-medium text-tinta">{formatearGuarani(subtotal)}</span>
          </div>
          {tipoEntrega === "delivery" && (
            <div className="mt-1 flex justify-between text-[0.92rem] text-tinta-media">
              <span>Envío</span>
              <span className="cifra font-medium text-tinta">{textoEnvio}</span>
            </div>
          )}
          <div className="mt-2.5 flex items-baseline justify-between border-t border-brand/20 pt-2.5 text-tinta">
            <span className="text-[1rem] font-semibold">Total</span>
            <span className="cifra text-[1.4rem] font-bold">
              {formatearGuarani(total)}
              {tipoEntrega === "delivery" && !zonaEncontrada && envioModo === "zonas" && hayUbicacionLocal
                ? " + envío"
                : ""}
            </span>
          </div>
        </section>
      </fieldset>

      {/* Abajo, siempre a la vista: el aviso de lo que falte y el botón para armar el pedido, sobre una base sólida con un difuminado arriba. */}
      <div className="pointer-events-none fixed bottom-0 left-1/2 z-20 w-full max-w-2xl -translate-x-1/2 md:max-w-3xl lg:max-w-5xl">
        <div aria-hidden="true" className="h-8 bg-gradient-to-t from-papel-suave to-transparent" />
        <div className="pointer-events-auto bg-papel-suave px-4 pb-4">
          {error && (
            <div role="alert" className="mb-2.5 rounded-xl bg-peligro-luz px-3.5 py-2.5 text-[0.86rem] font-medium text-peligro">
              {error}
            </div>
          )}
          {/* Si el pedido termina en un WhatsApp (casi siempre: el local tiene su número), el botón es verde WhatsApp y lleva su
              ícono: el cliente reconoce de un vistazo que el envío pasa por ahí. Sin número de WhatsApp, queda el color de la marca. */}
          <BotonEnviar
            enviando={enviando}
            disabled={!aceptaPedidos || enviando}
            tono={aceptaPedidos && (!pedidosEnSistema || whatsappNumero.replace(/\D/g, "").length > 0) ? "whatsapp" : "principal"}
            className="w-full !h-14 !rounded-2xl shadow-alta"
          >
            {!aceptaPedidos ? (
              "No disponible en este momento"
            ) : pedidosEnSistema ? (
              enviando ? (
                "Enviando tu pedido…"
              ) : whatsappNumero.replace(/\D/g, "").length > 0 ? (
                <>
                  <IconoWhatsapp tam={26} />
                  Enviar pedido
                </>
              ) : (
                "Enviar pedido"
              )
            ) : (
              <>
                <IconoWhatsapp tam={26} />
                Armar mi pedido para enviar
              </>
            )}
          </BotonEnviar>
        </div>
      </div>
    </form>
  );
}
