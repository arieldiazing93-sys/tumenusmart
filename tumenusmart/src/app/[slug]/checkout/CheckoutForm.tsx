"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useCart } from "@/components/CartProvider";
import { formatearGuarani } from "@/lib/format";
import { distanciaKm, encontrarZonaPorDistancia } from "@/lib/geo";
import { Tarjeta, Campo, Entrada, Aviso } from "@/components/ui";
import { Segmentado } from "@/components/Segmentado";
import { BotonEnviar } from "@/components/BotonEnviar";
import { BotonWhatsappCTA } from "@/components/BotonWhatsappCTA";
import { IconoWhatsapp } from "@/components/iconos";
import { METODOS_PAGO_PEDIDO, type MetodoPagoPedido } from "@/lib/metodos-pago";
import { ingredientesQuitadosTexto, opcionesTexto, precioUnitario } from "@/lib/cart-types";
import { construirLinkWhatsapp, construirMensajePedido } from "@/lib/whatsapp";

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
  /** El enlace de WhatsApp con el pedido ya escrito: cuando existe, se muestra la pantalla de "enviá tu pedido". */
  const [enlace, setEnlace] = useState<string | null>(null);
  /** El cliente ya tocó el botón de WhatsApp (el carrito se vació en ese momento). */
  const [enviado, setEnviado] = useState(false);
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

  /**
   * El menú digital NO crea el pedido: arma el mensaje de WhatsApp con todo lo que el cliente eligió y lo escribió (también sus datos
   * de factura) y se lo manda al local. Quien atiende lo lee y lo carga a mano en el sistema (Pedidos → Nuevo pedido), donde recién
   * se calculan los precios de verdad, se cobra y se factura. Nada de lo que escribe el cliente llega a un servidor ni a una base.
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
    if (!whatsappNumero.replace(/\D/g, "")) {
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
    setEnlace(construirLinkWhatsapp(whatsappNumero, mensaje));
    window.scrollTo({ top: 0 });
  }

  // Ya está listo el mensaje: lo único que falta es que el cliente toque el botón y lo mande por WhatsApp.
  if (enlace) {
    return (
      <div className="flex flex-col items-center px-1 pt-2 text-center">
        <span aria-hidden="true" className="flex h-16 w-16 items-center justify-center rounded-full bg-brand text-white">
          <svg viewBox="0 0 24 24" width={30} height={30} fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <h2 className="mt-4 text-[1.3rem] font-semibold tracking-titular text-tinta">
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

        <div className="mt-6 flex w-full justify-center">
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

        {!enviado && (
          <button
            type="button"
            onClick={() => setEnlace(null)}
            className="mt-4 text-[0.88rem] font-medium text-tinta-media underline-offset-2 hover:text-tinta hover:underline"
          >
            Corregir mi pedido
          </button>
        )}

        {enviado && (
          <Link
            href={`/${slug}`}
            className="mt-6 flex h-12 w-full max-w-sm items-center justify-center rounded-xl border border-linea bg-superficie text-[0.92rem] font-semibold text-tinta transition-colors hover:border-brand"
          >
            Volver al menú
          </Link>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-4">
        <Tarjeta className="flex flex-col gap-4">
          <p className="rotulo">Tus datos</p>
          <Campo etiqueta="Nombre">
            <Entrada
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Tu nombre"
            />
          </Campo>
          <Campo etiqueta="Teléfono (WhatsApp)">
            <Entrada
              required
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="0981 234 567"
            />
          </Campo>
        </Tarjeta>

        <Tarjeta className="flex flex-col gap-4">
          <p className="rotulo">Comprobante</p>
          <Segmentado
            opciones={[
              { value: "ticket", label: "Ticket" },
              { value: "factura", label: "Factura" },
            ]}
            valor={comprobanteTipo}
            onChange={setComprobanteTipo}
          />

          {comprobanteTipo === "factura" && (
            <div
              key={campoInvalido === "factura" ? `sac-${intento}` : "factura"}
              className={`flex flex-col gap-3 rounded-lg border p-3 ${
                campoInvalido === "factura"
                  ? "animate-[sacudir_0.32s_ease] border-peligro/50 bg-peligro-luz/30"
                  : "border-linea bg-papel-suave"
              }`}
            >
              <Campo etiqueta="Razón social">
                <Entrada
                  required
                  value={facturaRazonSocial}
                  onChange={(e) => setFacturaRazonSocial(e.target.value)}
                  placeholder="Nombre de la empresa o del titular"
                />
              </Campo>
              <Campo etiqueta="RUC">
                <Entrada
                  required
                  value={facturaRuc}
                  onChange={(e) => setFacturaRuc(e.target.value)}
                  placeholder="80012345-6"
                />
              </Campo>
              <Campo etiqueta="Correo electrónico" ayuda="Opcional">
                <Entrada
                  type="email"
                  value={facturaEmail}
                  onChange={(e) => setFacturaEmail(e.target.value)}
                  placeholder="nombre@correo.com"
                />
              </Campo>
              <p className="text-[0.78rem] leading-snug text-tinta-media">
                Estos datos van en el mensaje de WhatsApp que vas a enviar al local. Ellos los revisan y cargan uno por uno para que
                la factura salga sin errores, así que escribilos con cuidado.
              </p>
            </div>
          )}
        </Tarjeta>

        <Tarjeta className="flex flex-col gap-4">
          <p className="rotulo">Entrega y pago</p>

          <Campo etiqueta="Método de pago" ayuda="Lo coordinás directamente con el local">
            <Segmentado opciones={metodosDisponibles} valor={metodoPago} onChange={setMetodoPago} />
          </Campo>

          <div>
            <span className="mb-1.5 block text-[0.82rem] font-semibold text-tinta">Entrega</span>
            <Segmentado opciones={entregasDisponibles} valor={tipoEntrega} onChange={setTipoEntrega} />
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
                    className={`overflow-hidden rounded-xl ${
                      campoInvalido === "ubicacion"
                        ? "animate-[sacudir_0.32s_ease] ring-2 ring-peligro/50"
                        : ""
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
                  <p className="mt-2 text-[0.82rem] text-aviso">
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
                />
              </Campo>
            </>
          )}
        </Tarjeta>

        <div className="rounded-xl border border-linea bg-papel-suave p-4">
          <div className="flex justify-between text-[0.88rem] text-tinta-media">
            <span>Subtotal</span>
            <span className="cifra">{formatearGuarani(subtotal)}</span>
          </div>
          {tipoEntrega === "delivery" && (
            <div className="flex justify-between text-[0.88rem] text-tinta-media">
              <span>Envío</span>
              <span className="cifra">{textoEnvio}</span>
            </div>
          )}
          <div className="mt-1.5 flex justify-between border-t border-linea pt-1.5 text-[0.95rem] font-semibold text-tinta">
            <span>Total</span>
            <span className="cifra">
              {formatearGuarani(total)}
              {tipoEntrega === "delivery" && !zonaEncontrada && envioModo === "zonas" && hayUbicacionLocal
                ? " + envío"
                : ""}
            </span>
          </div>
        </div>
      </fieldset>

      {error && <Aviso color="peligro">{error}</Aviso>}

      <BotonEnviar enviando={false} disabled={!aceptaPedidos} className="w-full">
        {aceptaPedidos ? (
          <>
            <IconoWhatsapp tam={26} />
            Armar mi pedido para enviar
          </>
        ) : (
          "No disponible en este momento"
        )}
      </BotonEnviar>
    </form>
  );
}
