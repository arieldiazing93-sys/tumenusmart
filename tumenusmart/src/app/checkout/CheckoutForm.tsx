"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/CartProvider";
import { precioUnitario, opcionesTexto } from "@/lib/cart-types";
import { formatearGuarani } from "@/lib/format";
import { crearPedido } from "./actions";

type Zona = { id: string; nombre: string; costoEnvio: number };

const METODOS_PAGO = [
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "tarjeta", label: "Tarjeta (POS al recibir)" },
  { value: "otro", label: "A coordinar" },
];

export function CheckoutForm({ zonas }: { zonas: Zona[] }) {
  const router = useRouter();
  const { items, subtotal, vaciarCarrito } = useCart();

  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [tipoEntrega, setTipoEntrega] = useState<"delivery" | "retiro">("delivery");
  const [zonaId, setZonaId] = useState(zonas[0]?.id ?? "");
  const [direccion, setDireccion] = useState("");
  const [metodoPago, setMetodoPago] = useState("efectivo");
  const [notas, setNotas] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const zonaSeleccionada = zonas.find((z) => z.id === zonaId);
  const costoEnvio = tipoEntrega === "delivery" ? zonaSeleccionada?.costoEnvio ?? 0 : 0;
  const total = subtotal + costoEnvio;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (items.length === 0) {
      setError("Tu carrito está vacío.");
      return;
    }

    setEnviando(true);
    try {
      const { orderId } = await crearPedido({
        clienteNombre: nombre,
        clienteTelefono: telefono,
        tipoEntrega,
        deliveryZoneId: tipoEntrega === "delivery" ? zonaId : undefined,
        direccion: tipoEntrega === "delivery" ? direccion : undefined,
        metodoPagoReferencia: metodoPago,
        notas: notas || undefined,
        items: items.map((i) => ({
          productId: i.productId,
          nombreProducto: i.nombreProducto,
          cantidad: i.cantidad,
          precioUnitario: precioUnitario(i),
          opcionesTexto: opcionesTexto(i) || undefined,
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
          {zonas.length > 0 && (
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                Zona de envío
              </label>
              <select
                value={zonaId}
                onChange={(e) => setZonaId(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2"
              >
                {zonas.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.nombre} — {formatearGuarani(z.costoEnvio)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Dirección
            </label>
            <input
              required
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2"
              placeholder="Calle, número, referencia"
            />
          </div>
        </>
      )}

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
          Nota (opcional)
        </label>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2"
          rows={2}
          placeholder="Ej: sin cebolla, tocar timbre 2 veces..."
        />
      </div>

      <div className="rounded-lg bg-neutral-100 p-4 text-sm">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatearGuarani(subtotal)}</span>
        </div>
        {tipoEntrega === "delivery" && (
          <div className="flex justify-between">
            <span>Envío</span>
            <span>{formatearGuarani(costoEnvio)}</span>
          </div>
        )}
        <div className="mt-1 flex justify-between border-t border-neutral-300 pt-1 font-semibold">
          <span>Total</span>
          <span>{formatearGuarani(total)}</span>
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
