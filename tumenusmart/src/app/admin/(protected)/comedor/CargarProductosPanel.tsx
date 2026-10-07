"use client";

import { useMemo, useState } from "react";
import { Boton, Entrada, MensajeError } from "@/components/ui";
import { PanelLateral } from "@/components/PanelLateral";
import { formatearGuarani } from "@/lib/format";
import type {
  AgregadoVenta,
  CategoriaVenta,
  GrupoMitadVenta,
  ProductoMitadVenta,
  ProductoVenta,
} from "@/lib/catalogo-venta";
import { AgregadosPickerPos } from "../pos/AgregadosPickerPos";
import { MitadYMitadPickerPos } from "../pos/MitadYMitadPickerPos";
import { abrirCuentaEnCaja, cargarProductosCaja } from "./actions";
import { usePromosVigentes } from "@/lib/use-promos-vigentes";
import { lineasParaPromos, repreciarCarrito } from "@/lib/precio-carrito-pos";
import { aplicarPromociones, detallePorLinea, type PromoDef } from "@/lib/promociones";
import { segundoDeSemanaAsuncion } from "@/lib/precio-promocion";

/** Un producto (con o sin agregados) o un combo mitad y mitad ya armado, con su nota para la cocina. */
type ItemCarrito = { key: string; nombre: string; precio: number; cantidad: number; detalle?: string; nota: string } & (
  | { tipo: "producto"; productId: string; agregadoIds: string[] }
  | { tipo: "combo"; productIdA: string; productIdB: string; agregadoIds: string[] }
);

/** Lo que se manda al enviar: qué y cuántos (el servidor pone nombres y precios). */
export type ItemParaEnviar =
  | { productId: string; opcionIds: string[]; cantidad: number; nota: string }
  | { mitadYMitad: { productIdA: string; productIdB: string }; opcionIds: string[]; cantidad: number; nota: string };

const TODOS = "__todos__";
const CHIP_ACTIVO = "border-brand bg-brand text-white";
const CHIP_INACTIVO = "border-linea text-tinta-media hover:border-brand hover:text-brand";

function sinTildes(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Un identificador por envío: si se reintenta, el servidor reconoce que es el mismo y no duplica nada. */
function nuevoEnvioId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * La caja le carga productos a la cuenta de una mesa desde el panel: la misma carta que ve el mozo, a la derecha de la
 * pantalla. Al enviar hace lo mismo que cuando envía el mozo: el servidor recalcula el precio, descuenta el stock y manda
 * la comanda al área (Cocina, Barra…).
 *
 * También sirve para ABRIR una cuenta nueva desde la caja (`nuevaCuenta`): es la misma carta y el mismo envío, pero en vez de
 * sumar a una cuenta que ya existe, el primer envío la abre con la mesa y el mozo a cargo que se eligieron antes.
 */
export function CargarProductosPanel({
  cuentaId,
  nuevaCuenta,
  mesa = "",
  categorias: categoriasBase,
  gruposMitad: gruposBase,
  promociones: promocionesBase,
  onCerrar,
  onEnviado,
  enviarItems,
  titulo,
  textoEnviar,
  sinNotas,
}: {
  /** La cuenta a la que se le carga. Sin esto, tiene que venir `nuevaCuenta` (o `enviarItems`). */
  cuentaId?: string;
  /** Para abrir la cuenta de una mesa que todavía no la tiene: la mesa, el mozo a cargo (simbólico) y cuántas personas. */
  nuevaCuenta?: { mesa: string; mozoId: string; mozoNombre: string; comensales: number | null; manual?: boolean };
  mesa?: string;
  categorias: CategoriaVenta[];
  gruposMitad: GrupoMitadVenta[];
  /** Las promociones activas (por descuento y por volumen). Sin esto, la carga se comporta como siempre. */
  promociones?: PromoDef[];
  onCerrar: () => void;
  /** Con las áreas a las que salió una comanda (y un aviso si el servidor tiene algo que decir). */
  onEnviado: (areas: string[], aviso?: string) => void;
  /**
   * Para cargar productos en otra cosa que no sea una cuenta de mesa (por ejemplo, un pedido abierto): en vez de las acciones del
   * comedor, se llama a esta con los productos armados. El panel y la carta son los mismos.
   */
  enviarItems?: (items: ItemParaEnviar[], envioId: string) => Promise<{ ok: true; areas: string[]; aviso?: string } | { ok: false; error: string }>;
  /** El título del panel, si no es el de una mesa. */
  titulo?: string;
  /** El texto del botón de enviar, si no es el del comedor. */
  textoEnviar?: string;
  /** Sin la nota para la cocina en cada producto (un pedido no guarda notas por producto). */
  sinNotas?: boolean;
}) {
  // Los precios de ESTE momento: un producto con precio de promoción (de lunes a viernes de 18 a 20, por ejemplo) viene con el precio que
  // vale ahora y cambia solo cuando empieza o termina la franja. El servidor cobra con el mismo cálculo.
  const { categorias, gruposMitad, promociones, ahora } = usePromosVigentes(categoriasBase, gruposBase, promocionesBase);
  const [categoriaId, setCategoriaId] = useState<string>(categorias[0]?.id ?? TODOS);
  const [busqueda, setBusqueda] = useState("");
  // Lo que se pidió; el precio de cada línea se vuelve a calcular con los precios vigentes.
  const [carritoGuardado, setCarrito] = useState<ItemCarrito[]>([]);
  const carrito = useMemo(
    () => repreciarCarrito(carritoGuardado, categorias, gruposMitad),
    [carritoGuardado, categorias, gruposMitad]
  );
  const [productoEligiendo, setProductoEligiendo] = useState<ProductoVenta | null>(null);
  const [notaAbierta, setNotaAbierta] = useState<string | null>(null);
  const [envioId, setEnvioId] = useState(() => nuevoEnvioId());
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cantidadesPorProducto = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const i of carrito) {
      if (i.tipo === "producto") mapa.set(i.productId, (mapa.get(i.productId) ?? 0) + i.cantidad);
    }
    return mapa;
  }, [carrito]);

  const textoBusqueda = sinTildes(busqueda.trim());
  const productosVisibles: ProductoVenta[] = textoBusqueda
    ? categorias.flatMap((c) => c.productos).filter((p) => sinTildes(p.nombre).includes(textoBusqueda))
    : categoriaId === TODOS
      ? categorias.flatMap((c) => c.productos)
      : (categorias.find((c) => c.id === categoriaId)?.productos ?? []);
  const gruposVisibles: GrupoMitadVenta[] = textoBusqueda
    ? []
    : categoriaId === TODOS
      ? gruposMitad
      : gruposMitad.filter((g) => g.categoriaId === categoriaId);

  // El producto cuyo selector de agregados está abierto, con los precios de este momento.
  const productoVivo = productoEligiendo
    ? categorias.flatMap((c) => c.productos).find((p) => p.id === productoEligiendo.id)
    : undefined;
  // Las promociones aplicadas a lo que se está cargando. Es una vista previa: al enviar, el servidor vuelve a calcular con lo que la
  // cuenta ya tiene (dos cervezas en dos pedidos distintos son "dos") y con la hora exacta del envío.
  const lineasPromo = useMemo(() => lineasParaPromos(carrito, categorias), [carrito, categorias]);
  const resultadoPromos = useMemo(
    () => aplicarPromociones(lineasPromo, promociones, segundoDeSemanaAsuncion(ahora)),
    [lineasPromo, promociones, ahora]
  );
  const detallePromos = useMemo(
    () => detallePorLinea(lineasPromo, resultadoPromos, promociones),
    [lineasPromo, resultadoPromos, promociones]
  );
  const ahorroPromos = resultadoPromos.ahorro;
  const total = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0) - ahorroPromos;
  const cantidadTotal = carrito.reduce((s, i) => s + i.cantidad, 0);

  function agregarProducto(p: ProductoVenta) {
    setError(null);
    // Con agregados para elegir, siempre abre el selector, en vez de sumar 1 a ciegas sin preguntar.
    if (p.agregados.length > 0) {
      setProductoEligiendo(p);
      return;
    }
    setCarrito((actual) => {
      const existente = actual.find((i) => i.key === p.id);
      if (existente) return actual.map((i) => (i.key === p.id ? { ...i, cantidad: i.cantidad + 1 } : i));
      return [
        ...actual,
        { key: p.id, tipo: "producto", productId: p.id, agregadoIds: [], nombre: p.nombre, precio: p.precio, cantidad: 1, nota: "" },
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
    const detalleTexto = elegidos.length > 0 ? elegidos.map((a) => a.nombre).join(", ") : undefined;

    setError(null);
    setCarrito((actual) => {
      const existente = actual.find((i) => i.key === key);
      if (existente) return actual.map((i) => (i.key === key ? { ...i, cantidad: i.cantidad + cantidad } : i));
      return [
        ...actual,
        {
          key,
          tipo: "producto",
          productId: p.id,
          agregadoIds: idsOrdenados,
          nombre: p.nombre,
          precio,
          cantidad,
          detalle: detalleTexto,
          nota: "",
        },
      ];
    });
    setProductoEligiendo(null);
  }

  function agregarCombo(
    a: ProductoMitadVenta,
    b: ProductoMitadVenta,
    agregadosElegidos: AgregadoVenta[],
    precio: number,
    cantidad: number
  ) {
    setError(null);
    const parIds = [a.id, b.id].sort();
    const idsAgregados = agregadosElegidos.map((x) => x.id).sort();
    const key = `combo:${parIds.join("+")}${idsAgregados.length > 0 ? `::${idsAgregados.join(",")}` : ""}`;
    const nombreCombo = `Mitad ${a.nombre} / Mitad ${b.nombre}`;
    const detalleTexto = agregadosElegidos.length > 0 ? agregadosElegidos.map((x) => x.nombre).join(", ") : undefined;
    setCarrito((actual) => {
      const existente = actual.find((i) => i.key === key);
      if (existente) return actual.map((i) => (i.key === key ? { ...i, cantidad: i.cantidad + cantidad } : i));
      return [
        ...actual,
        {
          key,
          tipo: "combo",
          productIdA: a.id,
          productIdB: b.id,
          agregadoIds: idsAgregados,
          nombre: nombreCombo,
          precio,
          cantidad,
          detalle: detalleTexto,
          nota: "",
        },
      ];
    });
  }

  function cambiarCantidad(key: string, delta: number) {
    setCarrito((actual) =>
      actual.map((i) => (i.key === key ? { ...i, cantidad: i.cantidad + delta } : i)).filter((i) => i.cantidad > 0)
    );
  }

  function cambiarNota(key: string, nota: string) {
    setCarrito((actual) => actual.map((i) => (i.key === key ? { ...i, nota: nota.slice(0, 120) } : i)));
  }

  async function enviar() {
    if (enviando || carrito.length === 0) return;
    setEnviando(true);
    setError(null);
    try {
      const items: ItemParaEnviar[] = carrito.map((i) =>
        i.tipo === "combo"
          ? {
              mitadYMitad: { productIdA: i.productIdA, productIdB: i.productIdB },
              opcionIds: i.agregadoIds,
              cantidad: i.cantidad,
              nota: i.nota,
            }
          : { productId: i.productId, opcionIds: i.agregadoIds, cantidad: i.cantidad, nota: i.nota }
      );
      let r: { ok: true; areas: string[]; aviso?: string } | { ok: false; error: string };
      if (enviarItems) {
        r = await enviarItems(items, envioId);
      } else if (nuevaCuenta) {
        r = await abrirCuentaEnCaja({
          mesa: nuevaCuenta.mesa,
          mozoId: nuevaCuenta.mozoId,
          comensales: nuevaCuenta.comensales ?? undefined,
          envioId,
          items,
          mesaManual: nuevaCuenta.manual === true,
        });
      } else if (cuentaId) {
        r = await cargarProductosCaja(cuentaId, { envioId, items });
      } else {
        r = { ok: false, error: "No se sabe a qué cuenta cargarle los productos." };
      }
      setEnviando(false);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      // Un envío nuevo para lo que se cargue después.
      setEnvioId(nuevoEnvioId());
      onEnviado(r.areas, r.aviso);
    } catch {
      // Se mantiene el mismo envioId: si el pedido sí llegó, al reintentar el servidor lo reconoce y no lo duplica.
      setEnviando(false);
      setError("No se pudo enviar. Revisá la conexión y tocá Enviar de nuevo: no se duplica nada.");
    }
  }

  const totalProductos = categorias.reduce((s, c) => s + c.productos.length, 0);

  return (
    <PanelLateral
      // El título lleva todo lo que importa en UNA línea (mesa y mozo a cargo) y la barra va compacta, para dejarle el lugar a
      // los productos.
      titulo={
        titulo ??
        (nuevaCuenta ? `Abrir cuenta · Mesa ${mesa} · ${nuevaCuenta.mozoNombre}` : `Cargar productos · Mesa ${mesa}`)
      }
      // Escape cierra el selector de agregados si está abierto, no este panel.
      onCerrar={() => {
        if (!productoEligiendo) onCerrar();
      }}
      ancho="amplio"
      compacto
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-2.5">
          <Entrada
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto"
            aria-label="Buscar producto"
            className="!py-1.5"
          />

          {/* Las pastillas de grupo se acomodan en hasta DOS filas (en vez de una sola fila que se corre hacia el costado);
              si hay más grupos de los que entran, esa zona se desliza hacia abajo. */}
          {!textoBusqueda && (
            <div className="flex max-h-[4.4rem] flex-none flex-wrap content-start gap-1.5 overflow-y-auto pb-0.5">
              <button
                type="button"
                onClick={() => setCategoriaId(TODOS)}
                className={`rounded-full border px-3 py-1 text-[0.8rem] font-medium transition-colors ${
                  categoriaId === TODOS ? CHIP_ACTIVO : CHIP_INACTIVO
                }`}
              >
                Todos <span className={categoriaId === TODOS ? "text-white/80" : "text-tinta-suave"}>{totalProductos}</span>
              </button>
              {categorias.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoriaId(c.id)}
                  className={`rounded-full border px-3 py-1 text-[0.8rem] font-medium transition-colors ${
                    c.id === categoriaId ? CHIP_ACTIVO : CHIP_INACTIVO
                  }`}
                >
                  {c.nombre}{" "}
                  <span className={c.id === categoriaId ? "text-white/80" : "text-tinta-suave"}>{c.productos.length}</span>
                </button>
              ))}
            </div>
          )}

          {gruposVisibles.map((g) => (
            <MitadYMitadPickerPos key={g.nombreVisible} grupoNombre={g.nombreVisible} productos={g.productos} onAgregar={agregarCombo} />
          ))}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {productosVisibles.map((p) => {
              const enCarrito = cantidadesPorProducto.get(p.id) ?? 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => agregarProducto(p)}
                  className={`relative flex flex-col rounded-xl border p-2.5 text-left shadow-sm transition-all active:scale-[0.96] ${
                    enCarrito > 0
                      ? "border-brand/50 bg-brand-light ring-1 ring-brand/20"
                      : "border-linea bg-brand-light/40 hover:-translate-y-0.5 hover:border-brand/40 hover:bg-brand-light/70"
                  }`}
                >
                  {enCarrito > 0 && (
                    <span className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-papel-suave bg-brand px-1.5 text-[0.74rem] font-bold text-white shadow-sm">
                      {enCarrito}
                    </span>
                  )}
                  <p className="text-[0.85rem] font-medium leading-snug text-tinta">{p.nombre}</p>
                  <p className="cifra mt-1.5 text-[0.88rem] font-semibold text-tinta">{formatearGuarani(p.precio)}</p>
                  {/* Promoción por descuento o por volumen que rige ahora para este producto (2x1, −20 %…). */}
                  {p.promo && (
                    <p className="mt-1">
                      <span
                        title={p.promo.nombre}
                        className="rounded-full bg-exito-luz px-1.5 py-0.5 text-[0.64rem] font-bold uppercase tracking-rotulo text-exito"
                      >
                        {p.promo.etiqueta}
                      </span>
                    </p>
                  )}
                  {/* Precio de promoción: se ve el precio normal y que ahora rige la promoción. */}
                  {p.enPromocion && (
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-exito-luz px-1.5 py-0.5 text-[0.64rem] font-bold uppercase tracking-rotulo text-exito">
                        Promo
                      </span>
                      <span className="cifra text-[0.72rem] text-tinta-suave line-through">
                        {formatearGuarani(p.precioNormal ?? p.precio)}
                      </span>
                    </p>
                  )}
                  {p.agregados.length > 0 && (
                    <span className="mt-1.5 text-[0.66rem] font-semibold uppercase tracking-rotulo text-azul">+ agregados</span>
                  )}
                </button>
              );
            })}
            {productosVisibles.length === 0 && (
              <p className="col-span-full text-[0.85rem] text-tinta-suave">
                {textoBusqueda ? "Ningún producto coincide." : "Esta categoría no tiene productos disponibles."}
              </p>
            )}
          </div>
        </div>

        {/* ---------------------------------------------------------- lo cargado, siempre a la vista */}
        <div className="flex flex-none flex-col gap-1.5 border-t border-linea bg-superficie px-3 py-2">
          {carrito.length > 0 && (
            <ul className="flex max-h-44 flex-col gap-2 overflow-y-auto">
              {carrito.map((i, indice) => (
                <li key={i.key} className="rounded-lg border border-linea-fina px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[0.85rem] font-medium text-tinta">{i.nombre}</p>
                      {i.detalle && <p className="truncate text-[0.74rem] text-tinta-suave">+ {i.detalle}</p>}
                      {detallePromos[indice]?.texto && (
                        <p className="text-[0.74rem] font-semibold text-exito">
                          🎁 {detallePromos[indice].texto} · −{formatearGuarani(detallePromos[indice].ahorro)}
                        </p>
                      )}
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
                      <span className="cifra w-6 text-center text-[0.9rem] font-semibold text-tinta">{i.cantidad}</span>
                      <button
                        type="button"
                        onClick={() => cambiarCantidad(i.key, 1)}
                        aria-label={`Sumar ${i.nombre}`}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-exito-luz text-exito transition-all hover:bg-exito hover:text-white active:scale-90"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  {sinNotas ? null : notaAbierta === i.key || i.nota ? (
                    <Entrada
                      value={i.nota}
                      onChange={(e) => cambiarNota(i.key, e.target.value)}
                      placeholder="Nota para la cocina (ej: sin cebolla)"
                      maxLength={120}
                      aria-label={`Nota para ${i.nombre}`}
                      className="mt-1.5"
                    />
                  ) : (
                    <button type="button" onClick={() => setNotaAbierta(i.key)} className="mt-1 text-[0.74rem] font-medium text-azul">
                      + Agregar una nota
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {error && <MensajeError>{error}</MensajeError>}
          <div className="flex items-center justify-between gap-3">
            <span className="text-[0.82rem] text-tinta-media">
              {cantidadTotal} {cantidadTotal === 1 ? "producto" : "productos"}
            </span>
            <span className="cifra text-[1.3rem] font-bold text-tinta">{formatearGuarani(total)}</span>
          </div>
          {ahorroPromos > 0 && (
            <p className="text-[0.74rem] text-exito">
              Con promociones: −{formatearGuarani(ahorroPromos)}. Al enviar, el servidor termina de calcularlas con lo que la cuenta ya tiene.
            </p>
          )}
          <Boton tono="principal" tam="lg" className="w-full" disabled={enviando || carrito.length === 0} onClick={() => void enviar()}>
            {enviando ? "Enviando…" : (textoEnviar ?? (nuevaCuenta ? "Abrir la cuenta y enviar a cocina" : "Enviar a cocina"))}
          </Boton>
        </div>
      </div>

      {productoEligiendo && (
        <AgregadosPickerPos
          nombre={productoEligiendo.nombre}
          precioBase={(productoVivo ?? productoEligiendo).precio}
          agregados={(productoVivo ?? productoEligiendo).agregados}
          onCerrar={() => setProductoEligiendo(null)}
          onAgregar={confirmarAgregadosProducto}
        />
      )}
    </PanelLateral>
  );
}
