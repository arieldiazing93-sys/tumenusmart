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
import { CantidadPrevia } from "../pos/CantidadPrevia";
import { MitadYMitadPickerPos } from "../pos/MitadYMitadPickerPos";
import { abrirCuentaEnCaja, cargarProductosCaja } from "./actions";
import { usePromosVigentes } from "@/lib/use-promos-vigentes";
import { lineasParaPromos, repreciarCarrito } from "@/lib/precio-carrito-pos";
import { aplicarPromociones, detallePorLinea, type PromoDef } from "@/lib/promociones";
import { segundoDeSemanaAsuncion } from "@/lib/precio-promocion";
import { CANTIDAD_MAXIMA_EN_CAJA, cargaDeProducto, leerCantidadEscrita, sumarCargaALista } from "@/lib/cantidad-escrita";
import { medidaDelPrecio, seVendePorPeso, textoDePeso } from "@/lib/unidad-medida";

/** Un producto (con o sin agregados) o un combo mitad y mitad ya armado, con su nota para la cocina. */
type ItemCarrito = { key: string; nombre: string; precio: number; cantidad: number; detalle?: string; nota: string } & (
  // `peso`: lo que se pesó de un producto por kilo o litro (0,285 = 285 g); `precio` ya es el de ESA porción (lista × peso).
  | { tipo: "producto"; productId: string; agregadoIds: string[]; peso?: number }
  | { tipo: "combo"; productIdA: string; productIdB: string; agregadoIds: string[] }
);

/** Lo que se manda al enviar: qué y cuántos (el servidor pone nombres y precios). */
export type ItemParaEnviar =
  | { productId: string; opcionIds: string[]; cantidad: number; nota: string; peso?: number }
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
  conCantidad = false,
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
  /**
   * Con el campo «Cantidad»: se escribe la cantidad (35) o, para un producto por kilo o litro, el peso (0,285) ANTES de tocar el
   * producto. Solo lo usa el Servicio comedor (su servidor acepta pesos y los topes de la caja); el delivery sigue como siempre.
   */
  conCantidad?: boolean;
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

  // La carta por producto: para saber en qué unidad se vende cada uno y mostrar lo pesado.
  const productoPorId = useMemo(() => {
    const mapa = new Map<string, ProductoVenta>();
    for (const c of categorias) for (const p of c.productos) mapa.set(p.id, p);
    return mapa;
  }, [categorias]);

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

  // La cantidad que se escribe ANTES de tocar el producto («35», o «0,285» para un producto por kilo): opcional; se usa en el próximo
  // producto que se toque y se borra. Sin nada escrito, cada toque suma de a uno. Solo con `conCantidad` (Servicio comedor).
  const [cantidadPrevia, setCantidadPrevia] = useState("");
  const [errorCantidad, setErrorCantidad] = useState<string | null>(null);
  // Si el producto tocado tiene agregados para elegir, lo escrito espera a que se confirme el cuadro de agregados.
  const [cargaPendiente, setCargaPendiente] = useState<{ cantidad: number; peso?: number } | null>(null);

  /** Lo escrito en «Cantidad» aplicado al producto que se tocó; null si no se puede (ya se avisó cuál es el problema). */
  function cargaPara(p: ProductoVenta): { cantidad: number; peso?: number } | null {
    if (!conCantidad) return { cantidad: 1 };
    const carga = cargaDeProducto(leerCantidadEscrita(cantidadPrevia), { nombre: p.nombre, porPeso: seVendePorPeso(p.unidadMedida), unidad: p.unidadMedida });
    if (!carga.ok) {
      setErrorCantidad(carga.error);
      return null;
    }
    setErrorCantidad(null);
    return carga;
  }

  /** Suma lo cargado a la lista (junta lo pesado del mismo producto en una línea). Devuelve false, avisando, si no se pudo. */
  function sumarAlCarrito(item: ItemCarrito): boolean {
    const r = sumarCargaALista(carritoGuardado, item);
    if (!r.ok) {
      setErrorCantidad(r.error);
      return false;
    }
    setCarrito(r.lista);
    return true;
  }

  function agregarProducto(p: ProductoVenta) {
    setError(null);
    const carga = cargaPara(p);
    if (!carga) return;
    // Con agregados para elegir, siempre abre el selector, en vez de sumar a ciegas sin preguntar. Lo escrito en «Cantidad» espera ahí.
    if (p.agregados.length > 0) {
      setCargaPendiente(carga);
      setProductoEligiendo(p);
      return;
    }
    const agregado = sumarAlCarrito({
      key: p.id,
      tipo: "producto",
      productId: p.id,
      agregadoIds: [],
      nombre: p.nombre,
      precio: p.precio,
      cantidad: carga.cantidad,
      nota: "",
      ...(carga.peso !== undefined ? { peso: carga.peso } : {}),
    });
    if (agregado) setCantidadPrevia("");
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
    // Un producto por peso lleva lo escrito como peso (y las porciones que se hayan puesto en el cuadro); uno por unidad, la cantidad del cuadro.
    const peso = cargaPendiente?.peso;
    const agregado = sumarAlCarrito({
      key,
      tipo: "producto",
      productId: p.id,
      agregadoIds: idsOrdenados,
      nombre: p.nombre,
      precio,
      cantidad,
      detalle: detalleTexto,
      nota: "",
      ...(peso !== undefined ? { peso } : {}),
    });
    if (agregado) {
      setCantidadPrevia("");
      setProductoEligiendo(null);
      setCargaPendiente(null);
    }
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
      actual
        .map((i) => (i.key === key ? { ...i, cantidad: Math.min(i.cantidad + delta, CANTIDAD_MAXIMA_EN_CAJA) } : i))
        .filter((i) => i.cantidad > 0)
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
          : {
              productId: i.productId,
              opcionIds: i.agregadoIds,
              cantidad: i.cantidad,
              nota: i.nota,
              // Lo que se pesó (producto por kilo o litro): el servidor calcula el monto con el precio de lista.
              ...(i.peso !== undefined ? { peso: i.peso } : {}),
            }
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

          {/* La cantidad se escribe ANTES de tocar el producto (35 de algo; 0,285 de un producto por kilo, el peso de la balanza). En
              blanco y opcional: vacía, cada toque suma de a uno. Solo en el Servicio comedor. */}
          {conCantidad && (
            <CantidadPrevia
              valor={cantidadPrevia}
              onCambio={(t) => {
                setCantidadPrevia(t);
                setErrorCantidad(null);
              }}
              error={errorCantidad}
            />
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
                  <p className="cifra mt-1.5 text-[0.88rem] font-semibold text-tinta">
                    {formatearGuarani(p.precio)}
                    {/* Un producto por kilo o por litro: el precio es de esa medida (se escribe el peso en «Cantidad»). */}
                    {conCantidad && seVendePorPeso(p.unidadMedida) && (
                      <span className="ml-1 text-[0.7rem] font-medium text-tinta-suave">/ {medidaDelPrecio(p.unidadMedida)}</span>
                    )}
                  </p>
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
                      {/* Lo que se pesó (producto por kilo o litro): el precio ya es el de esa porción. */}
                      {i.tipo === "producto" && i.peso !== undefined && (
                        <p className="truncate text-[0.74rem] font-semibold text-azul-oscuro">
                          ⚖ {textoDePeso(i.peso, productoPorId.get(i.productId)?.unidadMedida ?? "kilogramo")} ·{" "}
                          <span className="cifra">{formatearGuarani(i.precio * i.cantidad)}</span>
                        </p>
                      )}
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
          // Si ya había una cantidad escrita (35), el cuadro arranca con ella; con un peso (0,285) las porciones arrancan en 1.
          cantidadInicial={cargaPendiente && cargaPendiente.peso === undefined ? cargaPendiente.cantidad : 1}
          onCerrar={() => {
            setProductoEligiendo(null);
            setCargaPendiente(null);
          }}
          onAgregar={confirmarAgregadosProducto}
        />
      )}
    </PanelLateral>
  );
}
