"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Boton, Cabecera, Tarjeta, clasesBoton } from "@/components/ui";
import { Segmentado } from "@/components/Segmentado";
import { formatearGuarani } from "@/lib/format";
import { FORMAS_PAGO_POS, type FormaPagoPos } from "@/lib/turno-pos";
import { registrarVenta } from "./actions";

type Producto = { id: string; nombre: string; precio: number };
type Categoria = { id: string; nombre: string; productos: Producto[] };
type ItemCarrito = { productId: string; nombre: string; precio: number; cantidad: number };

/**
 * La pantalla de venta rápida de mostrador.
 *
 * Grilla de productos + carrito, todo en un click: tocar un producto lo
 * agrega, +/- ajusta la cantidad (en vez de un input de número, para no
 * arrastrar el bug del scroll del mouse sobre un <input type="number">), y
 * "Limpiar" vacía la cuenta si se cargó algo mal.
 */
export function PantallaVenta({
  turnoId,
  categorias,
}: {
  turnoId: string;
  categorias: Categoria[];
}) {
  const router = useRouter();
  const [categoriaId, setCategoriaId] = useState(categorias[0]?.id ?? "");
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [formaPago, setFormaPago] = useState<FormaPagoPos>("efectivo");
  const [error, setError] = useState<string | null>(null);
  const [cobrando, setCobrando] = useState(false);

  const categoriaActual = categorias.find((c) => c.id === categoriaId) ?? categorias[0];
  const total = useMemo(() => carrito.reduce((s, i) => s + i.precio * i.cantidad, 0), [carrito]);
  const cantidadTotal = useMemo(() => carrito.reduce((s, i) => s + i.cantidad, 0), [carrito]);

  function agregarProducto(p: Producto) {
    setError(null);
    setCarrito((actual) => {
      const existente = actual.find((i) => i.productId === p.id);
      if (existente) {
        return actual.map((i) => (i.productId === p.id ? { ...i, cantidad: i.cantidad + 1 } : i));
      }
      return [...actual, { productId: p.id, nombre: p.nombre, precio: p.precio, cantidad: 1 }];
    });
  }

  function cambiarCantidad(productId: string, delta: number) {
    setCarrito((actual) =>
      actual
        .map((i) => (i.productId === productId ? { ...i, cantidad: i.cantidad + delta } : i))
        .filter((i) => i.cantidad > 0)
    );
  }

  function limpiarCarrito() {
    setCarrito([]);
    setError(null);
  }

  async function pagar() {
    if (carrito.length === 0) return;
    setCobrando(true);
    setError(null);
    const r = await registrarVenta(
      turnoId,
      formaPago,
      carrito.map((i) => ({ productId: i.productId, cantidad: i.cantidad }))
    );
    setCobrando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    router.push(`/admin/pos/venta/${r.ventaId}/ticket`);
  }

  if (categorias.length === 0) {
    return (
      <div>
        <Cabecera titulo="Punto de venta" />
        <Tarjeta>
          <p className="text-[0.9rem] text-tinta-media">
            No hay productos disponibles para vender. Cargá productos en "Mi carta" primero.
          </p>
        </Tarjeta>
      </div>
    );
  }

  return (
    <div>
      <Cabecera
        titulo="Punto de venta"
        bajada="Venta rápida de mostrador."
        acciones={
          <Link href="/admin/pos/cerrar" className={clasesBoton("suave", "sm")}>
            Cerrar turno
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_22rem]">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            {categorias.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoriaId(c.id)}
                className={`rounded-lg border px-3 py-1.5 text-[0.85rem] font-medium transition-colors ${
                  c.id === categoriaActual?.id
                    ? "border-brand bg-brand-light text-brand-texto"
                    : "border-linea text-tinta-media hover:border-brand/40"
                }`}
              >
                {c.nombre}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {categoriaActual?.productos.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => agregarProducto(p)}
                className="rounded-xl border border-linea bg-white p-3 text-left transition-colors hover:border-brand"
              >
                <p className="text-[0.86rem] font-medium text-tinta">{p.nombre}</p>
                <p className="mt-1 text-[0.82rem] text-tinta-media">{formatearGuarani(p.precio)}</p>
              </button>
            ))}
            {categoriaActual?.productos.length === 0 && (
              <p className="col-span-full text-[0.85rem] text-tinta-suave">
                Esta categoría no tiene productos disponibles.
              </p>
            )}
          </div>
        </div>

        <Tarjeta className="flex h-fit flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[0.95rem] font-semibold tracking-titular text-tinta">Cuenta</h2>
            {carrito.length > 0 && (
              <button
                type="button"
                onClick={limpiarCarrito}
                className="text-[0.8rem] font-medium text-peligro hover:underline"
              >
                Limpiar
              </button>
            )}
          </div>

          {carrito.length === 0 ? (
            <p className="text-[0.85rem] text-tinta-suave">Tocá un producto para agregarlo.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {carrito.map((i) => (
                <div
                  key={i.productId}
                  className="flex items-center justify-between gap-2 border-b border-linea-fina pb-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[0.85rem] font-medium text-tinta">{i.nombre}</p>
                    <p className="text-[0.78rem] text-tinta-suave">{formatearGuarani(i.precio)} c/u</p>
                  </div>
                  <div className="flex flex-none items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => cambiarCantidad(i.productId, -1)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-linea text-tinta-media hover:border-brand hover:text-brand"
                    >
                      −
                    </button>
                    <span className="w-5 text-center text-[0.85rem] font-semibold text-tinta">
                      {i.cantidad}
                    </span>
                    <button
                      type="button"
                      onClick={() => cambiarCantidad(i.productId, 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-linea text-tinta-media hover:border-brand hover:text-brand"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-linea pt-2">
            <span className="text-[0.85rem] text-tinta-media">Total ({cantidadTotal})</span>
            <span className="cifra text-[1.3rem] font-semibold text-tinta">{formatearGuarani(total)}</span>
          </div>

          <div>
            <p className="mb-1.5 text-[0.8rem] font-semibold text-tinta">Forma de pago</p>
            <Segmentado
              opciones={FORMAS_PAGO_POS.map((f) => ({ value: f.valor, label: f.etiqueta }))}
              valor={formaPago}
              onChange={setFormaPago}
              className="flex-wrap"
            />
          </div>

          {error && <p className="text-[0.82rem] font-medium text-peligro">{error}</p>}

          <Boton onClick={pagar} disabled={carrito.length === 0 || cobrando} tam="lg">
            {cobrando ? "Cobrando…" : `Pagar ${formatearGuarani(total)}`}
          </Boton>
        </Tarjeta>
      </div>
    </div>
  );
}
