"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useCart } from "@/components/CartProvider";
import { precioUnitario, opcionesTexto, ingredientesQuitadosTexto } from "@/lib/cart-types";
import { formatearGuarani } from "@/lib/format";
import { distanciaKm, encontrarZonaPorDistancia } from "@/lib/geo";
import { crearPedido } from "./actions";

// Leaflet usa `window`, así que el mapa se carga solo en el navegador.
const MapPicker = dynamic(
  () => import("@/components/MapPicker").then((m) => m.MapPicker),
  { ssr: false, loading: () => <div className="h-80 animate-pulse rounded-xl bg-neutral-100" /> }
);

type Zona = { id: string; nombre: string; radioKm: number; costoEnvio: number };

const METODOS_PAGO = [
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "tarjeta", label: "Tarjeta (POS al recibir)" },
  { value: "otro", label: "A coordinar" },
];

type Props = {
  storeLat: number | null;
  storeLng: number | null;
  envioModo: "zonas" | "coordinar";
  zonas: Zona[];
};

export function CheckoutForm({ storeLat, storeLng, envioModo, zonas }: Props) {
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

    if (items.length === 0) {
      setError("Tu carrito está vacío.");
      return;
    }
    if (tipoEntrega === "delivery" && (clienteLat == null || clienteLng == null)) {
      setError("Marcá tu ubicación en el mapa para poder entregarte el pedido.");
      return;
    }
    if (comprobanteTipo === "factura" && (!facturaRazonSocial.trim() || !facturaRuc.trim())) {
      setError("Para factura necesitamos la razón social y el RUC.");
      return;
    }

    setEnviando(true);
    try {
      const { orderId } = await crearPedido({
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
        items: items.map((i) => ({
          productId: i.mitadYMitad ? undefined : i.productId,
          nombreProducto: i.nombreProducto,
          cantidad: i.cantidad,
          precioUnitario: precioUnitario(i),
          opcionesTexto: opcionesTexto(i) || undefined,
          ingredientesQuitadosTexto: ingredientesQuitadosTexto(i) || undefined,
        })),
      });
      vaciarCarrito();
      router.push(`/pedido/${orderId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el pedido.");
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">
          Nombre
        </label>
        <input
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2"
          placeholder="Tu nombre"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">
          Teléfono (WhatsApp)
        </label>
        <input
          required
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2"
          placeholder="0981 234 567"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">
          Comprobante
        </label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setComprobanteTipo("ticket")}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
              comprobanteTipo === "ticket"
                ? "border-brand bg-brand-light text-brand-dark"
                : "border-neutral-300 text-neutral-600"
            }`}
          >
            Ticket
          </button>
          <button
            type="button"
            onClick={() => setComprobanteTipo("factura")}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
              comprobanteTipo === "factura"
                ? "border-brand bg-brand-light text-brand-dark"
                : "border-neutral-300 text-neutral-600"
            }`}
          >
            Factura
          </button>
        </div>

        {comprobanteTipo === "factura" && (
          <div className="mt-3 flex flex-col gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                Razón social
              </label>
              <input
                required
                value={facturaRazonSocial}
                onChange={(e) => setFacturaRazonSocial(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2"
                placeholder="Nombre de la empresa o del titular"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                RUC
              </label>
              <input
                required
                value={facturaRuc}
                onChange={(e) => setFacturaRuc(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2"
                placeholder="80012345-6"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                Correo electrónico <span className="font-normal text-neutral-400">(opcional)</span>
              </label>
              <input
                type="email"
                value={facturaEmail}
                onChange={(e) => setFacturaEmail(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2"
                placeholder="nombre@correo.com"
              />
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">
          Método de pago (lo coordinás directamente con el local)
        </label>
        <select
          value={metodoPago}
          onChange={(e) => setMetodoPago(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2"
        >
          {METODOS_PAGO.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">
          Entrega
        </label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setTipoEntrega("delivery")}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
              tipoEntrega === "delivery"
                ? "border-brand bg-brand-light text-brand-dark"
                : "border-neutral-300 text-neutral-600"
            }`}
          >
            Delivery
            <span className="block text-xs opacity-70">
              {envioModo === "zonas" ? "Según zona" : "A coordinar"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTipoEntrega("retiro")}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
              tipoEntrega === "retiro"
                ? "border-brand bg-brand-light text-brand-dark"
                : "border-neutral-300 text-neutral-600"
            }`}
          >
            Retiro en el local
          </button>
        </div>
      </div>

      {tipoEntrega === "delivery" && (
        <>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              ¿Dónde te lo llevamos?
            </label>
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
            {fueraDeCobertura && (
              <p className="mt-2 text-sm text-amber-700">
                Tu ubicación está fuera de las zonas con precio automático — el local va a
                coordinar el costo de envío directamente con vos por WhatsApp.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Referencia de la dirección
            </label>
            <input
              required
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2"
              placeholder="Casa, depto, entre calles, portón de color..."
            />
          </div>
        </>
      )}

      <div className="rounded-lg bg-neutral-100 p-4 text-sm">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatearGuarani(subtotal)}</span>
        </div>
        {tipoEntrega === "delivery" && (
          <div className="flex justify-between">
            <span>Envío</span>
            <span>{textoEnvio}</span>
          </div>
        )}
        <div className="mt-1 flex justify-between border-t border-neutral-300 pt-1 font-semibold">
          <span>Total</span>
          <span>
            {formatearGuarani(total)}
            {tipoEntrega === "delivery" && !zonaEncontrada && envioModo === "zonas" && hayUbicacionLocal
              ? " + envío"
              : ""}
          </span>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={enviando}
        className="rounded-lg bg-brand px-6 py-3 font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {enviando ? "Generando pedido..." : "Confirmar pedido"}
      </button>
    </form>
  );
}
