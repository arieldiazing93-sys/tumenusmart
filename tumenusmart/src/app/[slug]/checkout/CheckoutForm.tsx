"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useCart } from "@/components/CartProvider";
import { formatearGuarani } from "@/lib/format";
import { distanciaKm, encontrarZonaPorDistancia } from "@/lib/geo";
import { Tarjeta, Campo, Entrada, Selector, Aviso } from "@/components/ui";
import { Segmentado } from "@/components/Segmentado";
import { BotonEnviar } from "@/components/BotonEnviar";
import { crearPedido } from "./actions";

// Leaflet usa `window`, así que el mapa se carga solo en el navegador.
const MapPicker = dynamic(
  () => import("@/components/MapPicker").then((m) => m.MapPicker),
  { ssr: false, loading: () => <div className="h-80 animate-pulse rounded-xl bg-papel-hundido" /> }
);

type Zona = { id: string; nombre: string; radioKm: number; costoEnvio: number };

const METODOS_PAGO = [
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "tarjeta", label: "Tarjeta (POS al recibir)" },
];

type Props = {
  /** nombre del local en la URL — viaja al servidor al confirmar el pedido */
  slug: string;
  storeLat: number | null;
  storeLng: number | null;
  envioModo: "zonas" | "coordinar";
  /** false cuando el local está cerrado o con los pedidos pausados */
  aceptaPedidos: boolean;
  motivoBloqueo: string | null;
  zonas: Zona[];
};

export function CheckoutForm({
  slug,
  storeLat,
  storeLng,
  envioModo,
  aceptaPedidos,
  motivoBloqueo,
  zonas,
}: Props) {
  const router = useRouter();
  const { items, subtotal, vaciarCarrito } = useCart();

  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [tipoEntrega, setTipoEntrega] = useState<"delivery" | "retiro">("delivery");
  const [clienteLat, setClienteLat] = useState<number | null>(null);
  const [clienteLng, setClienteLng] = useState<number | null>(null);
  const [direccion, setDireccion] = useState("");
  const [metodoPago, setMetodoPago] = useState("efectivo");
  const [comprobanteTipo, setComprobanteTipo] = useState<"ticket" | "factura">("ticket");
  const [facturaRazonSocial, setFacturaRazonSocial] = useState("");
  const [facturaRuc, setFacturaRuc] = useState("");
  const [facturaEmail, setFacturaEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
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

  async function handleSubmit(e: React.FormEvent) {
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
    if (tipoEntrega === "delivery" && (clienteLat == null || clienteLng == null)) {
      fallar("Marcá tu ubicación en el mapa para poder entregarte el pedido.", "ubicacion");
      return;
    }
    if (comprobanteTipo === "factura" && (!facturaRazonSocial.trim() || !facturaRuc.trim())) {
      fallar("Para factura necesitamos la razón social y el RUC.", "factura");
      return;
    }

    setEnviando(true);
    try {
      const { orderId } = await crearPedido({
        slug,
        clienteNombre: nombre,
        clienteTelefono: telefono,
        tipoEntrega,
        clienteLat: tipoEntrega === "delivery" ? clienteLat ?? undefined : undefined,
        clienteLng: tipoEntrega === "delivery" ? clienteLng ?? undefined : undefined,
        direccion: tipoEntrega === "delivery" ? direccion : undefined,
        metodoPagoReferencia: metodoPago,
        comprobanteTipo,
        facturaRazonSocial: comprobanteTipo === "factura" ? facturaRazonSocial : undefined,
        facturaRuc: comprobanteTipo === "factura" ? facturaRuc : undefined,
        facturaEmail: comprobanteTipo === "factura" ? facturaEmail || undefined : undefined,
        // Solo qué eligió el cliente. El precio, el nombre y los textos de
        // la comanda los arma el servidor leyendo la carta: si viajaran desde
        // acá, cualquiera los cambia antes de que salgan.
        items: items.map((i) => ({
          productId: i.mitadYMitad ? undefined : i.productId,
          mitadYMitad: i.mitadYMitad
            ? { productIdA: i.mitadYMitad.productIdA, productIdB: i.mitadYMitad.productIdB }
            : undefined,
          opcionIds: i.opciones.map((o) => o.id),
          ingredientesQuitados: i.ingredientesQuitados ?? [],
          cantidad: i.cantidad,
        })),
        // No es lo que se cobra: es lo que el cliente tenía en pantalla, para
        // que el servidor avise si un precio cambió mientras completaba.
        totalMostrado: total,
      });
      vaciarCarrito();
      router.push(`/${slug}/pedido/${orderId}`);
    } catch (err) {
      fallar(err instanceof Error ? err.message : "No se pudo generar el pedido.");
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <fieldset disabled={enviando} className="flex flex-col gap-4">
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
            </div>
          )}
        </Tarjeta>

        <Tarjeta className="flex flex-col gap-4">
          <p className="rotulo">Entrega y pago</p>

          <Campo etiqueta="Método de pago" ayuda="Lo coordinás directamente con el local">
            <Selector value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
              {METODOS_PAGO.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Selector>
          </Campo>

          <div>
            <span className="mb-1.5 block text-[0.82rem] font-semibold text-tinta">Entrega</span>
            <Segmentado
              opciones={[
                {
                  value: "delivery",
                  label: "Delivery",
                  sublabel: envioModo === "zonas" ? "Según zona" : "A coordinar",
                },
                { value: "retiro", label: "Retiro en el local" },
              ]}
              valor={tipoEntrega}
              onChange={setTipoEntrega}
            />
          </div>

          {tipoEntrega === "delivery" && (
            <>
              <div>
                <Campo
                  etiqueta="¿Dónde te lo llevamos?"
                  ayuda="Marcá el punto en el mapa. Es lo que abre el repartidor para llegar, así que sin eso no se puede enviar el pedido."
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

      <BotonEnviar
        enviando={enviando}
        disabled={!aceptaPedidos}
        enviandoTexto="Generando pedido..."
        className="w-full"
      >
        {aceptaPedidos ? "Confirmar pedido" : "No disponible en este momento"}
      </BotonEnviar>
    </form>
  );
}
