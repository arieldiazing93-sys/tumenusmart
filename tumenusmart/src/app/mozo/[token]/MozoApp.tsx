"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, Entrada, Pastilla, clasesBoton } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";
import { claveDeMesa } from "@/lib/comedor";
import type {
  AgregadoVenta,
  CategoriaVenta,
  GrupoMitadVenta,
  ProductoMitadVenta,
  ProductoVenta,
} from "@/lib/catalogo-venta";
import { AgregadosPickerPos } from "@/app/admin/(protected)/pos/AgregadosPickerPos";
import { MitadYMitadPickerPos } from "@/app/admin/(protected)/pos/MitadYMitadPickerPos";
import {
  detalleDeCuenta,
  enviarPedido,
  estadoDelSalon,
  salirDelSalon,
  type CuentaAbierta,
  type DetalleDeCuenta,
  type ResultadoEnvio,
} from "./actions";

type Vista = "salon" | "cuenta" | "productos" | "revision" | "enviado";
type DetalleOk = Extract<DetalleDeCuenta, { ok: true }>;
type EnvioOk = Extract<ResultadoEnvio, { ok: true }>;

/**
 * Un producto (con o sin agregados elegidos) o un combo mitad y mitad ya armado, con su nota para la cocina. Un mismo
 * producto con distintos agregados son líneas distintas — igual que el Punto de Venta.
 */
type ItemCarrito = { key: string; nombre: string; precio: number; cantidad: number; detalle?: string; nota: string } & (
  | { tipo: "producto"; productId: string; agregadoIds: string[] }
  | { tipo: "combo"; productIdA: string; productIdB: string; agregadoIds: string[] }
);

const TODOS = "__todos__";
/** Lo que se le dice al mozo cuando la caja ya imprimió la cuenta de la mesa. */
const MENSAJE_POR_COBRAR = "La caja ya imprimió la cuenta de esa mesa. Pedile que la reabra si querés cargar algo más.";
// Los mismos chips que el Punto de Venta.
const CHIP_ACTIVO = "border-brand bg-brand text-white";
const CHIP_INACTIVO = "border-linea text-tinta-media hover:border-brand hover:text-brand";
const ROTULO = "text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave";

function sinTildes(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Un identificador por envío: si el celular reintenta, el servidor reconoce que es el mismo y no duplica nada. */
function nuevoEnvioId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/** "hace 5 min", "hace 1 h 20 min". */
function hace(iso: string): string {
  const minutos = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `hace ${h} h` : `hace ${h} h ${m} min`;
}

function horaCorta(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** El aviso de si hay una estación imprimiendo ahora: si no, lo que se envíe queda en espera. */
function EstadoImpresion({ imprimiendo }: { imprimiendo: boolean | null }) {
  if (imprimiendo === null) return null;
  return imprimiendo ? (
    <Pastilla color="exito" punto>
      Impresión conectada
    </Pastilla>
  ) : (
    <p className="rounded-lg border border-amarillo/60 bg-amarillo-luz px-3 py-2 text-[0.82rem] font-medium text-amarillo-oscuro">
      ⚠ Nadie está imprimiendo ahora. Lo que envíes queda en espera hasta que la caja abra &ldquo;Impresión
      automática&rdquo;.
    </p>
  );
}

/**
 * La aplicación del mozo: el salón (mesas abiertas) → abrir o continuar una mesa → cargar los productos → vista previa →
 * enviar. El mozo solo carga y envía; anular, dar descuento y cobrar lo hace el cajero desde el panel.
 */
export function MozoApp({
  token,
  nombreLocal,
  mozo,
  categorias,
  gruposMitad,
}: {
  token: string;
  nombreLocal: string;
  mozo: string;
  categorias: CategoriaVenta[];
  gruposMitad: GrupoMitadVenta[];
}) {
  const router = useRouter();

  const [vista, setVista] = useState<Vista>("salon");
  const [cuentas, setCuentas] = useState<CuentaAbierta[]>([]);
  const [imprimiendo, setImprimiendo] = useState<boolean | null>(null);
  const [cargandoSalon, setCargandoSalon] = useState(true);
  const [errorSalon, setErrorSalon] = useState<string | null>(null);

  const [mesaTexto, setMesaTexto] = useState("");
  const [comensalesTexto, setComensalesTexto] = useState("");
  const [mesa, setMesa] = useState("");
  const [detalle, setDetalle] = useState<DetalleOk | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const [categoriaId, setCategoriaId] = useState<string>(categorias[0]?.id ?? TODOS);
  const [busqueda, setBusqueda] = useState("");
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [productoEligiendo, setProductoEligiendo] = useState<ProductoVenta | null>(null);
  const [notaAbierta, setNotaAbierta] = useState<string | null>(null);

  const [envioId, setEnvioId] = useState(() => nuevoEnvioId());
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState<EnvioOk | null>(null);

  // --------------------------------------------------------------- el salón
  const refrescarSalon = useCallback(async () => {
    try {
      const r = await estadoDelSalon(token);
      if (!r.ok) {
        if (r.sesionVencida) {
          router.refresh();
          return;
        }
        setErrorSalon(r.error);
        setCargandoSalon(false);
        return;
      }
      setCuentas(r.cuentas);
      setImprimiendo(r.imprimiendo);
      setErrorSalon(null);
    } catch {
      setErrorSalon("No hay conexión. Se vuelve a intentar solo.");
    }
    setCargandoSalon(false);
  }, [token, router]);

  // Mientras se mira el salón se actualiza solo, para ver las mesas que abrió otro mozo.
  useEffect(() => {
    if (vista !== "salon") return;
    void refrescarSalon();
    const reloj = setInterval(() => void refrescarSalon(), 20000);
    return () => clearInterval(reloj);
  }, [vista, refrescarSalon]);

  async function salir() {
    await salirDelSalon(token);
    router.refresh();
  }

  function abrirMesa() {
    const texto = mesaTexto.trim();
    if (!texto) {
      setError("Escribí el número o nombre de la mesa.");
      return;
    }
    // Si esa mesa ya tiene una cuenta abierta, el pedido se suma a ella.
    const existente = cuentas.find((c) => claveDeMesa(c.mesa) === claveDeMesa(texto));
    if (existente?.estado === "por_cobrar") {
      setError(MENSAJE_POR_COBRAR);
      return;
    }
    empezarPedido(existente ? existente.mesa : texto);
  }

  function empezarPedido(nombreDeMesa: string) {
    setMesa(nombreDeMesa);
    setCarrito([]);
    setBusqueda("");
    setError(null);
    setEnvioId(nuevoEnvioId());
    setVista("productos");
  }

  async function verCuenta(c: CuentaAbierta) {
    setMesa(c.mesa);
    setDetalle(null);
    setError(null);
    setCargandoDetalle(true);
    setVista("cuenta");
    try {
      const r = await detalleDeCuenta(token, c.id);
      if (!r.ok) {
        if (r.sesionVencida) {
          router.refresh();
          return;
        }
        setError(r.error);
      } else {
        setDetalle(r);
      }
    } catch {
      setError("No hay conexión. Probá de nuevo.");
    }
    setCargandoDetalle(false);
  }

  function volverAlSalon() {
    setError(null);
    setEnviado(null);
    setVista("salon");
  }

  // --------------------------------------------------------- cargar productos
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

  const totalProductos = categorias.reduce((s, c) => s + c.productos.length, 0);
  const total = useMemo(() => carrito.reduce((s, i) => s + i.precio * i.cantidad, 0), [carrito]);
  const cantidadTotal = useMemo(() => carrito.reduce((s, i) => s + i.cantidad, 0), [carrito]);

  function agregarProducto(p: ProductoVenta) {
    setError(null);
    // Con agregados para elegir, siempre abre el selector, en vez de sumar 1 a ciegas sin preguntar.
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
        {
          key: p.id,
          tipo: "producto",
          productId: p.id,
          agregadoIds: [],
          nombre: p.nombre,
          precio: p.precio,
          cantidad: 1,
          nota: "",
        },
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
      if (existente) {
        return actual.map((i) => (i.key === key ? { ...i, cantidad: i.cantidad + cantidad } : i));
      }
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

  function quitar(key: string) {
    setCarrito((actual) => actual.filter((i) => i.key !== key));
  }

  function cambiarNota(key: string, nota: string) {
    setCarrito((actual) => actual.map((i) => (i.key === key ? { ...i, nota: nota.slice(0, 120) } : i)));
  }

  // ------------------------------------------------------------------- enviar
  async function enviar() {
    if (enviando || carrito.length === 0) return;
    setEnviando(true);
    setError(null);
    const comensales = Number(comensalesTexto);
    let r: ResultadoEnvio;
    try {
      r = await enviarPedido(token, {
        envioId,
        mesa,
        comensales: Number.isInteger(comensales) && comensales > 0 ? comensales : undefined,
        items: carrito.map((i) =>
          i.tipo === "combo"
            ? {
                mitadYMitad: { productIdA: i.productIdA, productIdB: i.productIdB },
                opcionIds: i.agregadoIds,
                cantidad: i.cantidad,
                nota: i.nota,
              }
            : { productId: i.productId, opcionIds: i.agregadoIds, cantidad: i.cantidad, nota: i.nota }
        ),
      });
    } catch {
      // Se mantiene el mismo envioId: si el pedido sí llegó, al reintentar el servidor lo reconoce y no lo duplica.
      setEnviando(false);
      setError("No se pudo enviar. Revisá la conexión y tocá Enviar de nuevo: no se duplica nada.");
      return;
    }
    setEnviando(false);
    if (!r.ok) {
      if (r.sesionVencida) {
        router.refresh();
        return;
      }
      setError(r.error);
      return;
    }
    setEnviado(r);
    setImprimiendo(r.imprimiendo);
    setCarrito([]);
    setComensalesTexto("");
    setMesaTexto("");
    setEnvioId(nuevoEnvioId());
    setVista("enviado");
  }

  // ---------------------------------------------------------------- pantallas
  const hayBarraAbajo = vista === "productos" && carrito.length > 0;

  return (
    <div className={`mx-auto min-h-screen max-w-3xl ${hayBarraAbajo ? "pb-28" : "pb-8"}`}>
      <header className="sticky top-0 z-30 border-b border-linea bg-papel/95 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[0.7rem] font-semibold uppercase tracking-rotulo text-tinta-suave">{nombreLocal}</p>
            <p className="truncate text-[1rem] font-semibold tracking-titular text-tinta">
              {vista === "salon" ? "Mesas" : `Mesa ${mesa}`}
            </p>
          </div>
          <div className="flex flex-none items-center gap-2">
            <span className="hidden text-[0.8rem] text-tinta-media sm:inline">{mozo}</span>
            {vista === "salon" ? (
              <button type="button" onClick={salir} className={clasesBoton("suave", "sm")}>
                Salir
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (vista === "revision") setVista("productos");
                  else if (vista === "productos" && carrito.length > 0 && !confirm("Se pierde lo que cargaste. ¿Volver igual?")) return;
                  else volverAlSalon();
                }}
                className={clasesBoton("navegar", "sm")}
              >
                ← {vista === "revision" ? "Seguir cargando" : "Mesas"}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="px-4 pt-4">
        {error && (
          <p role="alert" className="mb-3 rounded-lg bg-peligro-luz px-3 py-2 text-[0.85rem] font-medium text-peligro">
            {error}
          </p>
        )}

        {/* ----------------------------------------------------- el salón */}
        {vista === "salon" && (
          <div className="flex flex-col gap-4">
            <EstadoImpresion imprimiendo={imprimiendo} />

            <section className="rounded-xl border-2 border-azul/50 bg-superficie p-3.5">
              <p className={ROTULO}>1 · Abrir una mesa</p>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <div className="min-w-[8rem] flex-1">
                  <Entrada
                    value={mesaTexto}
                    onChange={(e) => setMesaTexto(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") abrirMesa();
                    }}
                    placeholder="Mesa (ej: 5 o Terraza 2)"
                    maxLength={20}
                    aria-label="Número o nombre de la mesa"
                  />
                </div>
                <div className="w-24">
                  <Entrada
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={99}
                    value={comensalesTexto}
                    onChange={(e) => setComensalesTexto(e.target.value)}
                    placeholder="Personas"
                    aria-label="Cuántas personas"
                  />
                </div>
                <Boton tono="nuevo" tam="md" onClick={abrirMesa}>
                  Abrir mesa
                </Boton>
              </div>
              <p className="mt-1.5 text-[0.76rem] text-tinta-suave">
                Si la mesa ya tiene una cuenta abierta, el pedido se suma a esa cuenta.
              </p>
            </section>

            <section>
              <p className={`${ROTULO} mb-2`}>Mesas abiertas ({cuentas.length})</p>
              {errorSalon && <p className="mb-2 text-[0.8rem] text-aviso">{errorSalon}</p>}
              {cargandoSalon ? (
                <p className="text-[0.85rem] text-tinta-suave">Cargando…</p>
              ) : cuentas.length === 0 ? (
                <p className="rounded-lg border border-dashed border-linea bg-papel-suave px-3 py-6 text-center text-[0.85rem] text-tinta-suave">
                  No hay mesas abiertas. Abrí una arriba.
                </p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {cuentas.map((c) => (
                    <li key={c.id} className="rounded-xl border-2 border-azul/50 bg-superficie p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[1.15rem] font-semibold tracking-titular text-tinta">Mesa {c.mesa}</p>
                          {c.estado === "por_cobrar" && (
                            <Pastilla color="amarillo" punto>
                              Cuenta pedida
                            </Pastilla>
                          )}
                          <p className="text-[0.78rem] text-tinta-media">
                            {c.mozo} · {hace(c.abiertaEn)}
                          </p>
                        </div>
                        <p className="cifra flex-none text-[1rem] font-semibold text-tinta">{formatearGuarani(c.total)}</p>
                      </div>
                      <p className="mt-1 text-[0.78rem] text-tinta-suave">
                        {c.productos} {c.productos === 1 ? "producto" : "productos"} · {c.rondas}{" "}
                        {c.rondas === 1 ? "pedido" : "pedidos"}
                      </p>
                      <div className="mt-2.5 flex gap-2">
                        <button type="button" onClick={() => void verCuenta(c)} className={clasesBoton("navegar", "sm")}>
                          Ver cuenta
                        </button>
                        {c.estado === "por_cobrar" ? (
                          <p className="self-center text-[0.76rem] text-tinta-media">Esperando que la caja la cobre.</p>
                        ) : (
                          <button type="button" onClick={() => empezarPedido(c.mesa)} className={clasesBoton("nuevo", "sm")}>
                            Agregar pedido
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {/* ---------------------------------------------- la cuenta (solo ver) */}
        {vista === "cuenta" && (
          <div className="flex flex-col gap-3">
            {cargandoDetalle && <p className="text-[0.85rem] text-tinta-suave">Cargando la cuenta…</p>}
            {detalle && (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[0.85rem] text-tinta-media">
                    Cuenta #{detalle.numero} · {detalle.mozo}
                  </p>
                  <p className="cifra text-[1.3rem] font-bold text-tinta">{formatearGuarani(detalle.total)}</p>
                </div>
                {detalle.rondas.map((r) => (
                  <section key={r.ronda} className="rounded-xl border-2 border-azul/50 bg-superficie p-3">
                    <p className={ROTULO}>
                      Pedido {r.ronda} · {horaCorta(r.enviadoEn)} · {r.mozo}
                    </p>
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {r.items.map((i) => (
                        <li key={i.id} className={`text-[0.88rem] ${i.anulado ? "text-tinta-suave line-through" : "text-tinta"}`}>
                          <span className="font-semibold">{i.cantidad} ×</span> {i.nombre}
                          {i.detalle && <span className="block pl-5 text-[0.78rem] text-tinta-suave">+ {i.detalle}</span>}
                          {i.nota && <span className="block pl-5 text-[0.78rem] text-tinta-media">“{i.nota}”</span>}
                          {i.anulado && <span className="ml-1 text-[0.72rem] font-semibold text-peligro">ANULADO</span>}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
                <p className="rounded-lg bg-papel-suave px-3 py-2 text-[0.8rem] text-tinta-media">
                  Para anular un producto, dar un descuento o cobrar, hablá con el cajero.
                </p>
                {detalle.estado === "por_cobrar" ? (
                  <p className="rounded-lg bg-amarillo-luz px-3 py-2 text-[0.82rem] font-medium text-amarillo-oscuro">
                    {MENSAJE_POR_COBRAR}
                  </p>
                ) : (
                  <Boton tono="nuevo" tam="lg" className="w-full" onClick={() => empezarPedido(detalle.mesa)}>
                    Agregar pedido a esta mesa
                  </Boton>
                )}
              </>
            )}
          </div>
        )}

        {/* ------------------------------------------------ cargar productos */}
        {vista === "productos" && (
          <div>
            <p className={`${ROTULO} mb-2`}>2 · Cargá los productos</p>
            <Entrada
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto"
              aria-label="Buscar producto"
              className="mb-3"
            />

            {!textoBusqueda && (
              <div className="-mx-0.5 mb-4 flex gap-2 overflow-x-auto px-0.5 pb-1">
                <button
                  type="button"
                  onClick={() => setCategoriaId(TODOS)}
                  className={`flex-none rounded-full border px-3.5 py-1.5 text-[0.85rem] font-medium transition-colors ${
                    categoriaId === TODOS ? CHIP_ACTIVO : CHIP_INACTIVO
                  }`}
                >
                  ✨ Todos{" "}
                  <span className={categoriaId === TODOS ? "text-white/80" : "text-tinta-suave"}>{totalProductos}</span>
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
                    <span className={c.id === categoriaId ? "text-white/80" : "text-tinta-suave"}>{c.productos.length}</span>
                  </button>
                ))}
              </div>
            )}

            {gruposVisibles.map((g) => (
              <MitadYMitadPickerPos
                key={g.nombreVisible}
                grupoNombre={g.nombreVisible}
                productos={g.productos}
                onAgregar={agregarCombo}
              />
            ))}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {productosVisibles.map((p) => {
                const enCarrito = cantidadesPorProducto.get(p.id) ?? 0;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => agregarProducto(p)}
                    className={`relative flex flex-col rounded-xl border p-3.5 text-left shadow-sm transition-all active:scale-[0.96] ${
                      enCarrito > 0
                        ? "border-brand/50 bg-brand-light ring-1 ring-brand/20"
                        : "border-linea bg-brand-light/40 hover:-translate-y-0.5 hover:border-brand/40 hover:bg-brand-light/70 hover:shadow-media"
                    }`}
                  >
                    {enCarrito > 0 && (
                      <span className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-papel-suave bg-brand px-1.5 text-[0.74rem] font-bold text-white shadow-sm">
                        {enCarrito}
                      </span>
                    )}
                    <p className="text-[0.86rem] font-medium leading-snug text-tinta">{p.nombre}</p>
                    <p className="cifra mt-1.5 text-[0.9rem] font-semibold text-tinta">{formatearGuarani(p.precio)}</p>
                    {p.agregados.length > 0 && (
                      <span className="mt-2 self-center text-[0.68rem] font-semibold uppercase tracking-rotulo text-azul">
                        + agregados
                      </span>
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
        )}

        {/* ------------------------------------------------- vista previa */}
        {vista === "revision" && (
          <div className="flex flex-col gap-3">
            <p className={ROTULO}>3 · Revisá antes de enviar</p>
            <EstadoImpresion imprimiendo={imprimiendo} />
            <ul className="flex flex-col gap-2.5 rounded-xl border-2 border-azul/50 bg-superficie p-3">
              {carrito.map((i) => (
                <li key={i.key} className="border-b border-linea-fina pb-2.5 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[0.9rem] font-medium text-tinta">{i.nombre}</p>
                      {i.detalle && <p className="text-[0.78rem] text-tinta-suave">+ {i.detalle}</p>}
                      <p className="cifra text-[0.8rem] font-medium text-tinta">
                        {formatearGuarani(i.precio)} c/u · {formatearGuarani(i.precio * i.cantidad)}
                      </p>
                    </div>
                    <div className="flex flex-none items-center gap-1">
                      <button
                        type="button"
                        onClick={() => cambiarCantidad(i.key, -1)}
                        aria-label={`Restar ${i.nombre}`}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-peligro-luz text-peligro transition-all hover:bg-peligro hover:text-white active:scale-90"
                      >
                        −
                      </button>
                      <span className="cifra w-6 text-center text-[0.95rem] font-semibold text-tinta">{i.cantidad}</span>
                      <button
                        type="button"
                        onClick={() => cambiarCantidad(i.key, 1)}
                        aria-label={`Sumar ${i.nombre}`}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-exito-luz text-exito transition-all hover:bg-exito hover:text-white active:scale-90"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => quitar(i.key)}
                        aria-label={`Quitar ${i.nombre}`}
                        className="ml-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-peligro-luz text-peligro transition-all hover:bg-peligro hover:text-white active:scale-90"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  {notaAbierta === i.key || i.nota ? (
                    <Entrada
                      value={i.nota}
                      onChange={(e) => cambiarNota(i.key, e.target.value)}
                      placeholder="Nota para la cocina (ej: sin cebolla, bien cocido)"
                      maxLength={120}
                      aria-label={`Nota para ${i.nombre}`}
                      className="mt-2"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setNotaAbierta(i.key)}
                      className="mt-1.5 text-[0.78rem] font-medium text-azul"
                    >
                      + Agregar una nota
                    </button>
                  )}
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between rounded-lg bg-papel-suave px-3.5 py-3">
              <span className="text-[0.85rem] text-tinta-media">
                Total ({cantidadTotal}) · Mesa {mesa}
              </span>
              <span className="cifra text-[1.4rem] font-bold text-tinta">{formatearGuarani(total)}</span>
            </div>

            <div className="flex flex-col gap-2">
              <Boton tono="principal" tam="lg" className="w-full" disabled={enviando || carrito.length === 0} onClick={() => void enviar()}>
                {enviando ? "Enviando…" : "4 · Enviar a cocina"}
              </Boton>
              <button type="button" onClick={() => setVista("productos")} className={clasesBoton("navegar", "md")}>
                ← Seguir cargando
              </button>
            </div>
          </div>
        )}

        {/* --------------------------------------------------------- enviado */}
        {vista === "enviado" && enviado && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-exito text-[2.5rem] text-white">
              ✓
            </span>
            <div>
              <p className="text-[1.3rem] font-semibold tracking-titular text-tinta">
                {enviado.yaEnviado ? "Ese pedido ya estaba enviado" : "¡Pedido enviado!"}
              </p>
              <p className="mt-1 text-[0.95rem] text-tinta-media">
                Mesa {enviado.mesa} · pedido {enviado.ronda} · {formatearGuarani(enviado.totalEnvio)}
              </p>
              {enviado.areas.length > 0 && (
                <p className="mt-1 text-[0.85rem] text-tinta-suave">Salió a: {enviado.areas.join(", ")}</p>
              )}
            </div>
            <EstadoImpresion imprimiendo={enviado.imprimiendo} />
            <div className="flex w-full flex-col gap-2">
              <Boton tono="nuevo" tam="lg" className="w-full" onClick={() => empezarPedido(enviado.mesa)}>
                Agregar otro pedido a esta mesa
              </Boton>
              <button type="button" onClick={volverAlSalon} className={clasesBoton("navegar", "md")}>
                Volver a las mesas
              </button>
            </div>
          </div>
        )}
      </main>

      {/* La barra de abajo mientras se cargan productos: cuántos hay y el botón para pasar a la vista previa. */}
      {hayBarraAbajo && (
        <div
          className="fixed inset-x-0 bottom-0 z-30 border-t border-linea bg-papel/95 px-4 py-3 shadow-alta backdrop-blur-sm"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="mx-auto max-w-3xl">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setNotaAbierta(null);
                setVista("revision");
              }}
              className="flex w-full items-center justify-between rounded-lg bg-brand px-4 py-3 text-white shadow-sm transition-transform active:scale-[0.98]"
            >
              <span className="text-[0.88rem] font-semibold">
                {cantidadTotal} {cantidadTotal === 1 ? "item" : "items"} · Ver pedido
              </span>
              <span className="cifra text-[1.05rem] font-bold">{formatearGuarani(total)}</span>
            </button>
          </div>
        </div>
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
