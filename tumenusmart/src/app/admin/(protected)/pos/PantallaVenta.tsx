"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Area, Boton, Cabecera, Entrada, Tarjeta, clasesBoton } from "@/components/ui";
import { Segmentado } from "@/components/Segmentado";
import { formatearGuarani } from "@/lib/format";
import { type FormaPagoPos } from "@/lib/turno-pos";
import { registrarVenta } from "./actions";
import { CobrarModal } from "./CobrarModal";
import { MitadYMitadPickerPos } from "./MitadYMitadPickerPos";

type Producto = { id: string; nombre: string; precio: number };
type Categoria = { id: string; nombre: string; productos: Producto[] };
type ProductoMitad = { id: string; nombre: string; precio: number; mitadYMitadModo: string };
type GrupoMitad = { nombreVisible: string; categoriaId: string; productos: ProductoMitad[] };
type TipoEntregaPos = "local" | "llevar";

/** Un producto normal o un combo mitad y mitad ya armado, con su propia clave. */
type ItemCarrito = { key: string; nombre: string; precio: number; cantidad: number } & (
  | { tipo: "producto"; productId: string }
  | { tipo: "combo"; productIdA: string; productIdB: string }
);

const TODOS = "__todos__";

const TIPOS_ENTREGA_POS: { value: TipoEntregaPos; label: string }[] = [
  { value: "local", label: "🏪 En el local" },
  { value: "llevar", label: "🛵 Despacho" },
];

/**
 * La pantalla de venta rápida de mostrador.
 *
 * Grilla de productos + carrito. Cargar el pedido no cobra todavía —
 * "Confirmar pedido" recién abre el paso de cobro (CobrarModal), donde se
 * elige la forma de pago y, si es efectivo, se calcula el vuelto. Al cobrar
 * se va al ticket; volver de ahí a esta pantalla la deja en blanco de
 * nuevo, lista para la próxima cuenta.
 */
export function PantallaVenta({
  turnoId,
  categorias,
  gruposMitad,
}: {
  turnoId: string;
  categorias: Categoria[];
  gruposMitad: GrupoMitad[];
}) {
  const router = useRouter();
  const [categoriaId, setCategoriaId] = useState<string>(categorias[0]?.id ?? TODOS);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteTelefono, setClienteTelefono] = useState("");
  const [tipoEntrega, setTipoEntrega] = useState<TipoEntregaPos>("local");
  const [nota, setNota] = useState("");
  const [mostrarCobro, setMostrarCobro] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cobrando, setCobrando] = useState(false);

  const cantidadesPorProducto = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const i of carrito) {
      if (i.tipo === "producto") mapa.set(i.productId, i.cantidad);
    }
    return mapa;
  }, [carrito]);

  const productosVisibles =
    categoriaId === TODOS
      ? categorias.flatMap((c) => c.productos)
      : categorias.find((c) => c.id === categoriaId)?.productos ?? [];

  const gruposVisibles =
    categoriaId === TODOS ? gruposMitad : gruposMitad.filter((g) => g.categoriaId === categoriaId);

  const totalProductos = categorias.reduce((s, c) => s + c.productos.length, 0);
  const total = useMemo(() => carrito.reduce((s, i) => s + i.precio * i.cantidad, 0), [carrito]);
  const cantidadTotal = useMemo(() => carrito.reduce((s, i) => s + i.cantidad, 0), [carrito]);

  function agregarProducto(p: Producto) {
    setError(null);
    setCarrito((actual) => {
      const existente = actual.find((i) => i.key === p.id);
      if (existente) {
        return actual.map((i) => (i.key === p.id ? { ...i, cantidad: i.cantidad + 1 } : i));
      }
      return [
        ...actual,
        { key: p.id, tipo: "producto", productId: p.id, nombre: p.nombre, precio: p.precio, cantidad: 1 },
      ];
    });
  }

  function agregarCombo(a: ProductoMitad, b: ProductoMitad, precio: number, cantidad: number) {
    setError(null);
    const parIds = [a.id, b.id].sort();
    const key = `combo:${parIds.join("+")}`;
    const nombre = `Mitad ${a.nombre} / Mitad ${b.nombre}`;
    setCarrito((actual) => {
      const existente = actual.find((i) => i.key === key);
      if (existente) {
        return actual.map((i) => (i.key === key ? { ...i, cantidad: i.cantidad + cantidad } : i));
      }
      return [
        ...actual,
        { key, tipo: "combo", productIdA: a.id, productIdB: b.id, nombre, precio, cantidad },
      ];
    });
  }

  function cambiarCantidad(key: string, delta: number) {
    setCarrito((actual) =>
      actual.map((i) => (i.key === key ? { ...i, cantidad: i.cantidad + delta } : i)).filter((i) => i.cantidad > 0)
    );
  }

  function quitarProducto(key: string) {
    setCarrito((actual) => actual.filter((i) => i.key !== key));
  }

  function limpiarCarrito() {
    setCarrito([]);
    setError(null);
  }

  async function confirmarCobro(formaPago: FormaPagoPos) {
    setCobrando(true);
    setError(null);
    const r = await registrarVenta(turnoId, {
      formaPago,
      tipoEntrega,
      clienteNombre,
      clienteTelefono,
      nota,
      items: carrito.map((i) =>
        i.tipo === "combo"
          ? { mitadYMitad: { productIdA: i.productIdA, productIdB: i.productIdB }, cantidad: i.cantidad }
          : { productId: i.productId, cantidad: i.cantidad }
      ),
    });
    setCobrando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setMostrarCobro(false);
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
            <button
              type="button"
              onClick={() => setCategoriaId(TODOS)}
              className={`rounded-lg border px-3 py-1.5 text-[0.85rem] font-medium transition-colors ${
                categoriaId === TODOS
                  ? "border-brand bg-brand-light text-brand-texto"
                  : "border-linea text-tinta-media hover:border-brand/40"
              }`}
            >
              Todos <span className="text-tinta-suave">{totalProductos}</span>
            </button>
            {categorias.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoriaId(c.id)}
                className={`rounded-lg border px-3 py-1.5 text-[0.85rem] font-medium transition-colors ${
                  c.id === categoriaId
                    ? "border-brand bg-brand-light text-brand-texto"
                    : "border-linea text-tinta-media hover:border-brand/40"
                }`}
              >
                {c.nombre} <span className="text-tinta-suave">{c.productos.length}</span>
              </button>
            ))}
          </div>

          {gruposVisibles.map((g) => (
            <MitadYMitadPickerPos
              key={g.nombreVisible}
              grupoNombre={g.nombreVisible}
              productos={g.productos}
              onAgregar={agregarCombo}
            />
          ))}

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {productosVisibles.map((p) => {
              const cantidadEnCarrito = cantidadesPorProducto.get(p.id) ?? 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => agregarProducto(p)}
                  className="relative rounded-xl border border-linea bg-white p-3 text-left transition-colors hover:border-brand"
                >
                  {cantidadEnCarrito > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[0.72rem] font-semibold text-white">
                      {cantidadEnCarrito}
                    </span>
                  )}
                  <p className="text-[0.86rem] font-medium text-tinta">{p.nombre}</p>
                  <p className="mt-1 text-[0.82rem] font-semibold text-brand-texto">
                    {formatearGuarani(p.precio)}
                  </p>
                </button>
              );
            })}
            {productosVisibles.length === 0 && (
              <p className="col-span-full text-[0.85rem] text-tinta-suave">
                Esta categoría no tiene productos disponibles.
              </p>
            )}
          </div>
        </div>

        <Tarjeta className="flex h-fit flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[0.7rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
                {clienteNombre.trim() || "Cuenta"}
              </p>
              <p className="text-[0.95rem] font-semibold tracking-titular text-tinta">
                {cantidadTotal} {cantidadTotal === 1 ? "item" : "items"}
              </p>
            </div>
            {carrito.length > 0 && (
              <button
                type="button"
                onClick={limpiarCarrito}
                className="flex-none text-[0.8rem] font-medium text-tinta-suave hover:text-peligro"
              >
                Vaciar
              </button>
            )}
          </div>

          {carrito.length === 0 ? (
            <p className="text-[0.85rem] text-tinta-suave">Tocá un producto para agregarlo.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {carrito.map((i) => (
                <div
                  key={i.key}
                  className="flex items-center justify-between gap-2 border-b border-linea-fina pb-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[0.85rem] font-medium text-tinta">{i.nombre}</p>
                    <p className="text-[0.78rem] text-tinta-suave">
                      {formatearGuarani(i.precio)} c/u · subtotal {formatearGuarani(i.precio * i.cantidad)}
                    </p>
                  </div>
                  <div className="flex flex-none items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => cambiarCantidad(i.key, -1)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-linea text-tinta-media hover:border-brand hover:text-brand"
                    >
                      −
                    </button>
                    <span className="w-5 text-center text-[0.85rem] font-semibold text-tinta">
                      {i.cantidad}
                    </span>
                    <button
                      type="button"
                      onClick={() => cambiarCantidad(i.key, 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-linea text-tinta-media hover:border-brand hover:text-brand"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => quitarProducto(i.key)}
                      aria-label={`Quitar ${i.nombre}`}
                      className="ml-1 text-tinta-suave hover:text-peligro"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Entrada
              placeholder="Nombre"
              value={clienteNombre}
              onChange={(e) => setClienteNombre(e.target.value)}
            />
            <Entrada
              placeholder="0981 234 567"
              value={clienteTelefono}
              onChange={(e) => setClienteTelefono(e.target.value)}
            />
          </div>
          <p className="-mt-2 text-[0.74rem] text-tinta-suave">
            Opcional. Se guarda con +595 automático, no hace falta escribirlo. Si el local tiene
            fidelización activa, suma el sello.
          </p>

          <Segmentado opciones={TIPOS_ENTREGA_POS} valor={tipoEntrega} onChange={setTipoEntrega} />

          <Area
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Nota interna del pedido (opcional): mesa 3, llamar al cliente, etc."
            rows={2}
          />

          <div className="flex items-center justify-between border-t border-linea pt-2">
            <span className="text-[0.85rem] text-tinta-media">Total ({cantidadTotal})</span>
            <span className="cifra text-[1.3rem] font-semibold text-tinta">{formatearGuarani(total)}</span>
          </div>

          {error && !mostrarCobro && (
            <p className="text-[0.82rem] font-medium text-peligro">{error}</p>
          )}

          <Boton onClick={() => setMostrarCobro(true)} disabled={carrito.length === 0} tam="lg">
            Confirmar pedido
          </Boton>
        </Tarjeta>
      </div>

      {mostrarCobro && (
        <CobrarModal
          clienteNombre={clienteNombre}
          cantidadItems={cantidadTotal}
          total={total}
          cobrando={cobrando}
          error={error}
          onCerrar={() => setMostrarCobro(false)}
          onCobrar={confirmarCobro}
        />
      )}
    </div>
  );
}
