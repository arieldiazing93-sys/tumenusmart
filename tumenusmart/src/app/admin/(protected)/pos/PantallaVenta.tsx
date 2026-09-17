"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Boton, Cabecera, Campo, Entrada, Tarjeta, clasesBoton } from "@/components/ui";
import { Segmentado } from "@/components/Segmentado";
import { formatearGuarani } from "@/lib/format";
import { type FormaPagoPos } from "@/lib/turno-pos";
import { buscarClientePorTelefono, registrarVenta } from "./actions";
import { CobrarModal } from "./CobrarModal";
import { MitadYMitadPickerPos } from "./MitadYMitadPickerPos";
import { AgregadosPickerPos } from "./AgregadosPickerPos";

type Agregado = { id: string; nombre: string; precioExtra: number };
type Producto = { id: string; nombre: string; precio: number; agregados: Agregado[] };
type Categoria = { id: string; nombre: string; productos: Producto[] };
type ProductoMitad = { id: string; nombre: string; precio: number; mitadYMitadModo: string; agregados: Agregado[] };
type GrupoMitad = { nombreVisible: string; categoriaId: string; productos: ProductoMitad[] };
type TipoEntregaPos = "local" | "llevar";

/**
 * Un producto normal (con o sin agregados elegidos) o un combo mitad y
 * mitad ya armado (con o sin agregados), con su propia clave. Un mismo
 * producto/combo con distintos agregados son líneas distintas del carrito —
 * mismo criterio que el menú público (construirKey por producto + opciones
 * elegidas).
 */
type ItemCarrito = { key: string; nombre: string; precio: number; cantidad: number; detalle?: string } & (
  | { tipo: "producto"; productId: string; agregadoIds: string[] }
  | { tipo: "combo"; productIdA: string; productIdB: string; agregadoIds: string[] }
);

const TODOS = "__todos__";

const TIPOS_ENTREGA_POS: { value: TipoEntregaPos; label: string }[] = [
  { value: "local", label: "🏪 En el local" },
  { value: "llevar", label: "🛵 Para llevar" },
];

const CHIP_ACTIVO = "border-brand bg-brand text-white";
const CHIP_INACTIVO = "border-linea text-tinta-media hover:border-brand hover:text-brand";

/**
 * La pantalla de venta rápida de mostrador.
 *
 * Grilla de productos + carrito. Cargar el pedido no cobra todavía —
 * "Confirmar pedido" recién abre el paso de cobro (CobrarModal), donde se
 * elige la forma de pago y, si es efectivo, se calcula el vuelto. Al cobrar
 * se va al ticket; volver de ahí a esta pantalla la deja en blanco de
 * nuevo, lista para la próxima cuenta.
 *
 * En pantallas angostas el carrito baja debajo de la grilla y una barra
 * flotante con el total se queda fija abajo para no tener que scrollear
 * hasta el final cada vez; en desktop el carrito queda fijo al costado.
 */
export function PantallaVenta({
  turnoId,
  categorias,
  gruposMitad,
  puedeFacturar,
  diasParaVencerTimbrado,
}: {
  turnoId: string;
  categorias: Categoria[];
  gruposMitad: GrupoMitad[];
  /** Si la estación de este turno tiene un punto de expedición vigente. */
  puedeFacturar: boolean;
  /** Días hasta que venza el timbrado de esa estación, o null si no aplica. */
  diasParaVencerTimbrado: number | null;
}) {
  const router = useRouter();
  const [categoriaId, setCategoriaId] = useState<string>(categorias[0]?.id ?? TODOS);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteTelefono, setClienteTelefono] = useState("");
  const [tipoEntrega, setTipoEntrega] = useState<TipoEntregaPos>("local");
  const [comprobanteTipo, setComprobanteTipo] = useState<"ticket" | "factura">("ticket");
  const [facturaRazonSocial, setFacturaRazonSocial] = useState("");
  const [facturaRuc, setFacturaRuc] = useState("");
  const [mostrarCobro, setMostrarCobro] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cobrando, setCobrando] = useState(false);
  const [productoEligiendo, setProductoEligiendo] = useState<Producto | null>(null);
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const [clienteEsNuevo, setClienteEsNuevo] = useState(false);

  // Suma, no pisa: un mismo producto puede estar en el carrito varias veces
  // con distintos agregados (líneas distintas), y el número sobre la
  // tarjeta tiene que mostrar el total, no la última línea agregada.
  const cantidadesPorProducto = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const i of carrito) {
      if (i.tipo === "producto") mapa.set(i.productId, (mapa.get(i.productId) ?? 0) + i.cantidad);
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
    // Con agregados para elegir, siempre abre el selector — igual que "Elegir
    // agregados" en el menú público, en vez de sumar 1 a ciegas sin preguntar.
    if (p.agregados.length > 0) {
      setProductoEligiendo(p);
      return;
    }
    setCarrito((actual) => {
      const existente = actual.find((i) => i.key === p.id);
      if (existente) {
        return actual.map((i) => (i.key === p.id ? { ...i, cantidad: i.cantidad + 1 } : i));
      }
      return [
        ...actual,
        { key: p.id, tipo: "producto", productId: p.id, agregadoIds: [], nombre: p.nombre, precio: p.precio, cantidad: 1 },
      ];
    });
  }

  function confirmarAgregadosProducto(agregadoIds: string[], cantidad: number) {
    const p = productoEligiendo;
    if (!p) return;
    const elegidos = p.agregados.filter((a) => agregadoIds.includes(a.id));
    const precio = p.precio + elegidos.reduce((s, a) => s + a.precioExtra, 0);
    const idsOrdenados = [...agregadoIds].sort();
    const key = idsOrdenados.length > 0 ? `${p.id}::${idsOrdenados.join(",")}` : p.id;
    const detalle = elegidos.length > 0 ? elegidos.map((a) => a.nombre).join(", ") : undefined;

    setError(null);
    setCarrito((actual) => {
      const existente = actual.find((i) => i.key === key);
      if (existente) {
        return actual.map((i) => (i.key === key ? { ...i, cantidad: i.cantidad + cantidad } : i));
      }
      return [
        ...actual,
        { key, tipo: "producto", productId: p.id, agregadoIds: idsOrdenados, nombre: p.nombre, precio, cantidad, detalle },
      ];
    });
    setProductoEligiendo(null);
  }

  function agregarCombo(
    a: ProductoMitad,
    b: ProductoMitad,
    agregadosElegidos: Agregado[],
    precio: number,
    cantidad: number
  ) {
    setError(null);
    const parIds = [a.id, b.id].sort();
    const idsAgregados = agregadosElegidos.map((x) => x.id).sort();
    const key = `combo:${parIds.join("+")}${idsAgregados.length > 0 ? `::${idsAgregados.join(",")}` : ""}`;
    const nombre = `Mitad ${a.nombre} / Mitad ${b.nombre}`;
    const detalle = agregadosElegidos.length > 0 ? agregadosElegidos.map((x) => x.nombre).join(", ") : undefined;
    setCarrito((actual) => {
      const existente = actual.find((i) => i.key === key);
      if (existente) {
        return actual.map((i) => (i.key === key ? { ...i, cantidad: i.cantidad + cantidad } : i));
      }
      return [
        ...actual,
        {
          key,
          tipo: "combo",
          productIdA: a.id,
          productIdB: b.id,
          agregadoIds: idsAgregados,
          nombre,
          precio,
          cantidad,
          detalle,
        },
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

  // Al tipear el teléfono y apretar Enter: si ya es cliente del local, le
  // completa el nombre solo. Si no, avisa que es nuevo — el cajero sigue y
  // lo carga a mano, y esa carga es lo que da de alta al cliente al cobrar.
  async function buscarCliente() {
    const telefono = clienteTelefono.trim();
    if (!telefono) return;
    setBuscandoCliente(true);
    setClienteEsNuevo(false);
    const r = await buscarClientePorTelefono(telefono);
    setBuscandoCliente(false);
    if (r.ok) {
      setClienteNombre(r.nombre);
    } else {
      setClienteEsNuevo(true);
    }
  }

  async function confirmarCobro(formaPago: FormaPagoPos) {
    if (comprobanteTipo === "factura" && (!facturaRazonSocial.trim() || !facturaRuc.trim())) {
      setError("Para factura hacen falta la razón social y el RUC.");
      return;
    }
    setCobrando(true);
    setError(null);
    const r = await registrarVenta(turnoId, {
      formaPago,
      tipoEntrega,
      clienteNombre,
      clienteTelefono,
      nota: "",
      comprobanteTipo,
      facturaRazonSocial: comprobanteTipo === "factura" ? facturaRazonSocial : undefined,
      facturaRuc: comprobanteTipo === "factura" ? facturaRuc : undefined,
      items: carrito.map((i) =>
        i.tipo === "combo"
          ? {
              mitadYMitad: { productIdA: i.productIdA, productIdB: i.productIdB },
              opcionIds: i.agregadoIds,
              cantidad: i.cantidad,
            }
          : { productId: i.productId, opcionIds: i.agregadoIds, cantidad: i.cantidad }
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
    <div className="pb-28 lg:pb-0">
      <Cabecera
        titulo="Punto de venta"
        bajada="Venta rápida de mostrador."
        acciones={
          <Link href="/admin/pos/cerrar" className={clasesBoton("navegar", "sm")}>
            🔒 Cerrar turno
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_23rem] lg:items-start">
        <div className="min-w-0">
          <div className="-mx-0.5 mb-4 flex gap-2 overflow-x-auto px-0.5 pb-1">
            <button
              type="button"
              onClick={() => setCategoriaId(TODOS)}
              className={`flex-none rounded-full border px-3.5 py-1.5 text-[0.85rem] font-medium transition-colors ${
                categoriaId === TODOS ? CHIP_ACTIVO : CHIP_INACTIVO
              }`}
            >
              ✨ Todos{" "}
              <span className={categoriaId === TODOS ? "text-white/80" : "text-tinta-suave"}>
                {totalProductos}
              </span>
            </button>
            {categorias.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoriaId(c.id)}
                className={`flex-none rounded-full border px-3.5 py-1.5 text-[0.85rem] font-medium transition-colors ${
                  c.id === categoriaId ? CHIP_ACTIVO : CHIP_INACTIVO
                }`}
              >
                {c.nombre}{" "}
                <span className={c.id === categoriaId ? "text-white/80" : "text-tinta-suave"}>
                  {c.productos.length}
                </span>
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

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {productosVisibles.map((p) => {
              const cantidadEnCarrito = cantidadesPorProducto.get(p.id) ?? 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => agregarProducto(p)}
                  className={`relative flex flex-col rounded-xl border bg-white p-3.5 text-left shadow-sm transition-all active:scale-[0.96] ${
                    cantidadEnCarrito > 0
                      ? "border-brand/50 ring-1 ring-brand/20"
                      : "border-linea hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-media"
                  }`}
                >
                  {cantidadEnCarrito > 0 && (
                    <span className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-papel-suave bg-brand px-1.5 text-[0.74rem] font-bold text-white shadow-sm">
                      {cantidadEnCarrito}
                    </span>
                  )}
                  <p className="text-[0.86rem] font-medium leading-snug text-tinta">{p.nombre}</p>
                  <p className="cifra mt-1.5 text-[0.9rem] font-semibold text-brand-texto">
                    {formatearGuarani(p.precio)}
                  </p>
                  {p.agregados.length > 0 && (
                    <span className="mt-1 text-[0.68rem] font-medium uppercase tracking-rotulo text-tinta-suave">
                      + agregados
                    </span>
                  )}
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

        <Tarjeta className="flex flex-col gap-4 lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100vh-5.5rem)] lg:overflow-y-auto">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[0.7rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
                {clienteNombre.trim() || "Cuenta"}
              </p>
              <p className="text-[1rem] font-semibold tracking-titular text-tinta">
                {cantidadTotal} {cantidadTotal === 1 ? "item" : "items"}
              </p>
            </div>
            {carrito.length > 0 && (
              <button
                type="button"
                onClick={limpiarCarrito}
                className="flex-none rounded-full border border-linea bg-white px-3 py-1.5 text-[0.8rem] font-medium text-tinta-media shadow-sm transition-colors hover:border-peligro hover:bg-peligro-luz hover:text-peligro"
              >
                Vaciar
              </button>
            )}
          </div>

          {carrito.length === 0 ? (
            <p className="rounded-lg border border-dashed border-linea bg-papel-suave px-3 py-6 text-center text-[0.85rem] text-tinta-suave">
              Tocá un producto para agregarlo.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {carrito.map((i) => (
                <div
                  key={i.key}
                  className="flex items-center justify-between gap-2 border-b border-linea-fina pb-2.5 last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[0.85rem] font-medium text-tinta">{i.nombre}</p>
                    {i.detalle && <p className="truncate text-[0.76rem] text-tinta-suave">+ {i.detalle}</p>}
                    <p className="cifra text-[0.78rem] text-tinta-suave">
                      {formatearGuarani(i.precio)} c/u · {formatearGuarani(i.precio * i.cantidad)}
                    </p>
                  </div>
                  <div className="flex flex-none items-center gap-1">
                    <button
                      type="button"
                      onClick={() => cambiarCantidad(i.key, -1)}
                      aria-label={`Restar ${i.nombre}`}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-peligro-luz text-peligro transition-all hover:bg-peligro hover:text-white active:scale-90"
                    >
                      −
                    </button>
                    <span className="cifra w-5 text-center text-[0.85rem] font-semibold text-tinta">
                      {i.cantidad}
                    </span>
                    <button
                      type="button"
                      onClick={() => cambiarCantidad(i.key, 1)}
                      aria-label={`Sumar ${i.nombre}`}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-exito-luz text-exito transition-all hover:bg-exito hover:text-white active:scale-90"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => quitarProducto(i.key)}
                      aria-label={`Quitar ${i.nombre}`}
                      className="ml-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-peligro-luz text-peligro transition-all hover:bg-peligro hover:text-white active:scale-90"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2 border-t border-linea pt-3.5">
            <p className="text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
              Cliente (opcional)
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Entrada
                placeholder="Nombre"
                value={clienteNombre}
                onChange={(e) => setClienteNombre(e.target.value)}
              />
              <Entrada
                placeholder="0981 234 567"
                value={clienteTelefono}
                onChange={(e) => {
                  setClienteTelefono(e.target.value);
                  setClienteEsNuevo(false);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  buscarCliente();
                }}
              />
            </div>
            {clienteEsNuevo ? (
              <p className="text-[0.74rem] font-medium text-aviso">
                Cliente nuevo — cargá el nombre para cobrar.
              </p>
            ) : (
              <p className="text-[0.74rem] text-tinta-suave">
                {buscandoCliente
                  ? "Buscando…"
                  : "Enter en el teléfono completa el nombre si ya es cliente. Se guarda con +595 automático."}
              </p>
            )}
          </div>

          {puedeFacturar && (
            <div className="flex flex-col gap-2 border-t border-linea pt-3.5">
              <p className="text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
                Comprobante
              </p>
              {diasParaVencerTimbrado != null && diasParaVencerTimbrado <= 30 && (
                <p className="rounded-lg bg-aviso-luz px-3 py-2 text-[0.78rem] font-medium text-aviso">
                  El timbrado de esta estación vence en {diasParaVencerTimbrado} día
                  {diasParaVencerTimbrado === 1 ? "" : "s"}.
                </p>
              )}
              <Segmentado
                opciones={[
                  { value: "ticket", label: "Ticket" },
                  { value: "factura", label: "Factura" },
                ]}
                valor={comprobanteTipo}
                onChange={setComprobanteTipo}
              />
              {comprobanteTipo === "factura" && (
                <div className="flex flex-col gap-2 rounded-lg border border-linea bg-papel-suave p-3">
                  <Campo etiqueta="Razón social">
                    <Entrada
                      value={facturaRazonSocial}
                      onChange={(e) => setFacturaRazonSocial(e.target.value)}
                      placeholder="Nombre de la empresa o del titular"
                    />
                  </Campo>
                  <Campo etiqueta="RUC">
                    <Entrada
                      value={facturaRuc}
                      onChange={(e) => setFacturaRuc(e.target.value)}
                      placeholder="80012345-6"
                    />
                  </Campo>
                </div>
              )}
            </div>
          )}

          <Segmentado opciones={TIPOS_ENTREGA_POS} valor={tipoEntrega} onChange={setTipoEntrega} />

          <div className="flex items-center justify-between border-t border-linea pt-3">
            <span className="text-[0.85rem] text-tinta-media">Total ({cantidadTotal})</span>
            <span className="cifra text-[1.4rem] font-bold text-tinta">{formatearGuarani(total)}</span>
          </div>

          {error && (
            <p className="rounded-lg bg-peligro-luz px-3 py-2 text-[0.82rem] font-medium text-peligro">
              {error}
            </p>
          )}

          <div className="hidden lg:block">
            <Boton
              onClick={() => setMostrarCobro(true)}
              disabled={carrito.length === 0}
              tam="lg"
              className="w-full"
            >
              Confirmar pedido
            </Boton>
          </div>
        </Tarjeta>
      </div>

      {/* Barra de cobro fija en celular/tablet angosto: el carrito queda
          debajo de toda la grilla, así que sin esto habría que scrollear
          hasta el final cada vez para cobrar. */}
      {carrito.length > 0 && (
        <div
          className="fixed inset-x-0 bottom-0 z-30 border-t border-linea bg-papel/95 px-4 py-3 shadow-alta backdrop-blur-sm lg:hidden"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
        >
          <button
            type="button"
            onClick={() => setMostrarCobro(true)}
            className="flex w-full items-center justify-between rounded-lg bg-brand px-4 py-3 text-white shadow-sm transition-transform active:scale-[0.98]"
          >
            <span className="text-[0.85rem] font-semibold">
              {cantidadTotal} {cantidadTotal === 1 ? "item" : "items"} · Confirmar pedido
            </span>
            <span className="cifra text-[1.05rem] font-bold">{formatearGuarani(total)}</span>
          </button>
        </div>
      )}

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

      {productoEligiendo && (
        <AgregadosPickerPos
          nombre={productoEligiendo.nombre}
          precioBase={productoEligiendo.precio}
          agregados={productoEligiendo.agregados}
          onCerrar={() => setProductoEligiendo(null)}
          onAgregar={confirmarAgregadosProducto}
        />
      )}
    </div>
  );
}
