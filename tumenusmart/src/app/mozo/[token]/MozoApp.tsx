"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Boton, Entrada, Pastilla, clasesBoton } from "@/components/ui";
import { formatearCantidad, formatearGuarani } from "@/lib/format";
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
import { usePromosVigentes } from "@/lib/use-promos-vigentes";
import { lineasParaPromos, repreciarCarrito } from "@/lib/precio-carrito-pos";
import { aplicarPromociones, detallePorLinea, type PromoDef } from "@/lib/promociones";
import { segundoDeSemanaAsuncion } from "@/lib/precio-promocion";
import {
  detalleDeCuenta,
  enviarPedido,
  estadoDelSalon,
  imprimirCuentaDelMozo,
  salirDelSalon,
  type CuentaAbierta,
  type DetalleDeCuenta,
  type MesaDelSalon,
  type ReglasDelSalon,
  type ResultadoEnvio,
  type SectorDelSalon,
} from "./actions";

type Vista = "salon" | "cuenta" | "personas" | "productos" | "revision" | "enviado";
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
/** Las opciones del selector de sectores que no son un sector del dueño. */
const TODAS_LAS_MESAS = "__todas_las_mesas__";
const SIN_SECTOR = "__sin_sector__";
/** Lo que se le dice al mozo cuando la caja ya imprimió la cuenta de la mesa. */
const MENSAJE_POR_COBRAR = "La caja ya imprimió la cuenta de esa mesa. Pedile que la reabra si querés cargar algo más.";
// Chips redondeados y altos (para el pulgar): el activo en el color de la marca, el resto en blanco con un aro fino.
const CHIP_BASE = "flex h-10 flex-none items-center gap-1.5 rounded-full px-4 text-[0.88rem] font-semibold transition-all active:scale-95";
const CHIP_ACTIVO = "bg-brand text-white shadow-sm";
const CHIP_INACTIVO = "bg-superficie text-tinta-media ring-1 ring-linea hover:text-brand hover:ring-brand/50";
const ROTULO = "text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave";
/** Los bloques de la pantalla: blanco, esquinas amplias, sombra suave y un aro azul finito (sin el marco grueso de antes). */
const TARJETA = "rounded-2xl bg-superficie p-4 shadow-sm ring-1 ring-azul/20";

type EstadoVisual = "libre" | "mia" | "otra" | "por_cobrar";
/** Cómo se ve cada mesa del salón según su estado: la caja, el puntito de color y el color de la etiqueta. */
const TILE_MESA: Record<EstadoVisual, { caja: string; punto: string; etiqueta: string }> = {
  libre: { caja: "bg-superficie text-tinta ring-1 ring-linea hover:ring-azul/60 active:bg-azul-luz", punto: "bg-exito", etiqueta: "text-exito" },
  mia: { caja: "bg-brand text-white shadow-media", punto: "bg-white", etiqueta: "text-white" },
  otra: { caja: "bg-papel-hundido text-tinta-media ring-1 ring-linea", punto: "bg-tinta-suave", etiqueta: "text-tinta-suave" },
  por_cobrar: { caja: "bg-amarillo-campo text-amarillo-oscuro ring-1 ring-amarillo", punto: "bg-amarillo", etiqueta: "text-amarillo-oscuro" },
};

/** Las iniciales del mozo para el círculo de arriba ("Juan Pérez" → "JP"). */
function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  const primera = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1][0] ?? "") : "";
  return (primera + ultima).toUpperCase() || "?";
}

/** Un número con su puntito de color, para el resumen del salón en la franja de arriba. */
function Contador({ punto, n, texto }: { punto: string; n: number; texto: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${punto}`} />
      <span className="cifra font-bold text-white">{n}</span>
      <span className="text-noche-suave">{texto}</span>
    </span>
  );
}

/** Los pasos del pedido (personas, productos, revisar) como barritas con su nombre, dentro de la franja oscura de arriba. */
function Pasos({ pasos, actual }: { pasos: string[]; actual: number }) {
  return (
    <ol aria-label="Pasos del pedido" className="mx-auto flex max-w-3xl gap-2 px-4 pb-3">
      {pasos.map((p, i) => (
        <li key={p} aria-current={i === actual ? "step" : undefined} className="flex-1">
          <span className={`block h-1.5 rounded-full transition-colors ${i <= actual ? "bg-brand" : "bg-white/15"}`} />
          <span className={`mt-1.5 block text-[0.72rem] font-semibold ${i === actual ? "text-white" : "text-noche-suave"}`}>
            {i + 1} · {p}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** La barra fija de abajo con el botón grande de cada paso, flotando sobre un difuminado para que se lea. */
function BarraAccion({ children }: { children: ReactNode }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-papel-suave via-papel-suave/90 to-transparent px-3 pt-8"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="pointer-events-auto mx-auto max-w-3xl">{children}</div>
    </div>
  );
}

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
    <p className="rounded-xl border border-amarillo/60 bg-amarillo-luz px-3.5 py-2.5 text-[0.84rem] font-medium text-amarillo-oscuro">
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
  categorias: categoriasBase,
  gruposMitad: gruposBase,
  promociones: promocionesBase,
}: {
  token: string;
  nombreLocal: string;
  mozo: string;
  categorias: CategoriaVenta[];
  gruposMitad: GrupoMitadVenta[];
  /** Las promociones activas (por descuento y por volumen). */
  promociones: PromoDef[];
}) {
  const router = useRouter();
  // Los precios de ESTE momento: un producto con precio de promoción (de lunes a viernes de 18 a 20, por ejemplo) viene con el precio que
  // vale ahora y cambia solo cuando empieza o termina la franja, aunque la tablet quede abierta todo el día. El servidor cobra con el mismo cálculo.
  const { categorias, gruposMitad, promociones, ahora } = usePromosVigentes(categoriasBase, gruposBase, promocionesBase);

  const [vista, setVista] = useState<Vista>("salon");
  const [cuentas, setCuentas] = useState<CuentaAbierta[]>([]);
  // Las mesas que el dueño cargó en Ajustes y las reglas que configuró (vienen del servidor al abrir el salón).
  const [mesas, setMesas] = useState<MesaDelSalon[]>([]);
  // Los sectores del restaurante y cuál está mirando el mozo (null = todavía no eligió: se muestra el primero).
  const [sectores, setSectores] = useState<SectorDelSalon[]>([]);
  const [sectorElegido, setSectorElegido] = useState<string | null>(null);
  const [reglas, setReglas] = useState<ReglasDelSalon>({ usaMesas: false, puedeImprimirCuenta: false, veCuentasAjenas: true });
  const [imprimiendoCuenta, setImprimiendoCuenta] = useState(false);
  const [avisoCuenta, setAvisoCuenta] = useState<string | null>(null);
  const [imprimiendo, setImprimiendo] = useState<boolean | null>(null);
  const [cargandoSalon, setCargandoSalon] = useState(true);
  const [errorSalon, setErrorSalon] = useState<string | null>(null);

  const [mesaTexto, setMesaTexto] = useState("");
  const [comensalesTexto, setComensalesTexto] = useState("");
  // Cuántas personas son: obligatorio al abrir una mesa nueva (de 1 a 99).
  const personasNumero = Number(comensalesTexto);
  const personasValidas =
    comensalesTexto.trim() !== "" && Number.isInteger(personasNumero) && personasNumero >= 1 && personasNumero <= 99;
  const [mesa, setMesa] = useState("");
  // true mientras se está ABRIENDO la mesa (la tocó libre o escribió su número); false al "Agregar pedido" a una que ya existe.
  const [abriendoMesa, setAbriendoMesa] = useState(false);
  const [detalle, setDetalle] = useState<DetalleOk | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

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
      setMesas(r.mesas);
      setSectores(r.sectores);
      setReglas(r.reglas);
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
    // Si esa mesa ya tiene una cuenta abierta NO se abre otra: se avisa, y para sumarle productos se usa "Agregar pedido".
    const existente = cuentas.find((c) => claveDeMesa(c.mesa) === claveDeMesa(texto));
    if (existente?.estado === "por_cobrar") {
      setError(MENSAJE_POR_COBRAR);
      return;
    }
    if (existente) {
      setError(
        `La mesa ${existente.mesa} ya está abierta (${existente.mia ? "la tenés vos" : `la atiende ${existente.mozo}`}). No se abre otra: tocá “Agregar pedido” en su cuenta, más abajo.`
      );
      return;
    }
    pedirPersonas(texto);
  }

  /**
   * Antes de cargar productos en una mesa NUEVA se pregunta cuántas personas son, y es obligatorio (al menos 1): sirve para los
   * reportes y para que el salón sepa cuánta gente hay. Para sumarle un pedido a una cuenta que ya existe no se pregunta.
   */
  function pedirPersonas(nombreDeMesa: string) {
    setMesa(nombreDeMesa);
    setAbriendoMesa(true);
    setComensalesTexto("");
    setError(null);
    setVista("personas");
  }

  /** Con las personas ya dichas, sigue la carga de productos de la mesa que se está abriendo. */
  function continuarConPersonas() {
    if (!personasValidas) {
      setError("Indicá cuántas personas son (al menos 1).");
      return;
    }
    empezarPedido(mesa, true);
  }

  /** Se toca una mesa de la lista del dueño: libre abre la cuenta; ocupada lleva a su cuenta si este mozo la puede ver. */
  function tocarMesa(m: MesaDelSalon) {
    setError(null);
    if (m.estado === "libre") {
      pedirPersonas(m.nombre);
      return;
    }
    const cuenta = m.cuentaId ? cuentas.find((c) => c.id === m.cuentaId) : undefined;
    if (!cuenta) {
      setError(`La mesa ${m.nombre} la atiende ${m.mozo ?? "otro mozo"}.`);
      return;
    }
    void verCuenta(cuenta);
  }

  /** El mozo imprime la cuenta de su mesa (solo si el dueño lo activó). La cuenta queda por cobrar. */
  async function imprimirCuenta(cuentaId: string, mesaDeLaCuenta: string) {
    if (imprimiendoCuenta) return;
    setImprimiendoCuenta(true);
    setError(null);
    setAvisoCuenta(null);
    try {
      const r = await imprimirCuentaDelMozo(token, cuentaId);
      if (!r.ok) {
        if (r.sesionVencida) {
          router.refresh();
          return;
        }
        setError(r.error);
      } else {
        // Se vuelve a mirar la cuenta para que se vea "por cobrar" (esto limpia el aviso, por eso el aviso va después).
        const actualizado = cuentas.find((c) => c.id === cuentaId);
        if (actualizado) void verCuenta({ ...actualizado, estado: "por_cobrar" });
        setAvisoCuenta(`La cuenta de la mesa ${mesaDeLaCuenta} salió en la caja. Ya no se le puede cargar más.`);
      }
    } catch {
      setError("No hay conexión. Probá de nuevo.");
    }
    setImprimiendoCuenta(false);
  }

  /** `abrir` es true cuando se está abriendo la mesa; sin eso es "Agregar pedido" a una cuenta que ya existe. */
  function empezarPedido(nombreDeMesa: string, abrir = false) {
    setMesa(nombreDeMesa);
    setAbriendoMesa(abrir);
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
    setAvisoCuenta(null);
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
    setAvisoCuenta(null);
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
  // El producto cuyo selector de agregados está abierto, con los precios de este momento.
  const productoVivo = productoEligiendo
    ? categorias.flatMap((c) => c.productos).find((p) => p.id === productoEligiendo.id)
    : undefined;
  // Las promociones aplicadas a lo que se está cargando. Es una vista previa: al enviar, el servidor vuelve a calcular con lo que la cuenta
  // ya tiene (dos cervezas en dos pedidos distintos son "dos") y con la hora exacta del envío.
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
  const total = useMemo(() => carrito.reduce((s, i) => s + i.precio * i.cantidad, 0) - ahorroPromos, [carrito, ahorroPromos]);
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
    // Una mesa nueva no se abre sin decir cuántas personas son (el servidor también lo exige).
    if (abriendoMesa && !personasValidas) {
      setError("Indicá cuántas personas son (al menos 1).");
      setVista("personas");
      return;
    }
    setEnviando(true);
    setError(null);
    const comensales = Number(comensalesTexto);
    let r: ResultadoEnvio;
    try {
      r = await enviarPedido(token, {
        envioId,
        mesa,
        comensales: Number.isInteger(comensales) && comensales > 0 ? comensales : undefined,
        abrirNueva: abriendoMesa,
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
    // La cuenta ya existe: el próximo pedido a esta mesa es "agregar", no "abrir".
    setAbriendoMesa(false);
    setCarrito([]);
    setComensalesTexto("");
    setMesaTexto("");
    setEnvioId(nuevoEnvioId());
    setVista("enviado");
  }

  // ------------------------------------------------------------- los sectores
  // Con sectores cargados, el mozo elige primero el sector (o "Todas") y ve solo las mesas que le corresponden.
  const conSectores = sectores.length > 0;
  const hayMesasSinSector = mesas.some((m) => !m.sectorId);
  const opcionesDeSector = [
    ...sectores.map((s) => ({ id: s.id, nombre: s.nombre })),
    ...(hayMesasSinSector ? [{ id: SIN_SECTOR, nombre: "Otras mesas" }] : []),
    { id: TODAS_LAS_MESAS, nombre: "Todas" },
  ];
  // Sin haber elegido (o si el elegido ya no existe) se muestra el primer sector.
  const sectorActivo = opcionesDeSector.some((o) => o.id === sectorElegido)
    ? (sectorElegido ?? TODAS_LAS_MESAS)
    : opcionesDeSector[0].id;
  const mesasDe = (sectorId: string) =>
    sectorId === TODAS_LAS_MESAS
      ? mesas
      : sectorId === SIN_SECTOR
        ? mesas.filter((m) => !m.sectorId)
        : mesas.filter((m) => m.sectorId === sectorId);
  const mesasDelSector = conSectores ? mesasDe(sectorActivo) : mesas;
  const libresDe = (lista: MesaDelSalon[]) => lista.filter((m) => m.estado === "libre").length;

  // Con las mesas del dueño cargadas, cada cuenta abierta se ve en su tarjeta de mesa (al tocarla se abre la cuenta), así que
  // no se repite la lista de abajo. Solo quedan en ella las cuentas cuya mesa ya no está para elegir (una desactivada o
  // borrada con la cuenta todavía abierta): sin esto el mozo no llegaría a ellas.
  const clavesDeMesas = new Set(mesas.map((m) => claveDeMesa(m.nombre)));
  const cuentasEnLista = reglas.usaMesas ? cuentas.filter((c) => !clavesDeMesas.has(claveDeMesa(c.mesa))) : cuentas;
  // De la cuenta que se está mirando, lo que ya se sabe del salón (sector y desde cuándo está abierta).
  const cuentaVista = detalle ? cuentas.find((c) => c.id === detalle.id) : undefined;

  // ---------------------------------------------------------------- pantallas
  // La barra fija de abajo (el botón grande de cada paso) aparece en personas, en productos con algo cargado y en la revisión.
  const hayBarraAbajo = (vista === "productos" && carrito.length > 0) || vista === "personas" || vista === "revision";
  // Los pasos del pedido, en la franja de arriba: abrir una mesa nueva suma el de las personas.
  const pasos = abriendoMesa ? ["Personas", "Productos", "Revisar"] : ["Productos", "Revisar"];
  const pasoActual =
    vista === "personas" ? 0 : vista === "productos" ? (abriendoMesa ? 1 : 0) : vista === "revision" ? (abriendoMesa ? 2 : 1) : -1;
  const libresTotal = mesas.filter((m) => m.estado === "libre").length;
  const ocupadasTotal = mesas.filter((m) => m.estado === "ocupada").length;
  const porCobrarTotal = mesas.filter((m) => m.estado === "por_cobrar").length;

  /** El botón de volver de arriba: de la revisión vuelve a cargar; de lo demás, al salón (avisando si se pierde lo cargado). */
  function alVolver() {
    if (vista === "revision") setVista("productos");
    else if (vista === "productos" && carrito.length > 0 && !confirm("Se pierde lo que cargaste. ¿Volver igual?")) return;
    else volverAlSalon();
  }

  return (
    <div className={`min-h-screen bg-papel-suave ${hayBarraAbajo ? "pb-32" : "pb-10"}`}>
      <header className="sticky top-0 z-30 bg-noche text-noche-tinta shadow-media" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          {vista !== "salon" && (
            <button
              type="button"
              onClick={alVolver}
              aria-label={vista === "revision" ? "Seguir cargando productos" : "Volver a las mesas"}
              className="flex h-11 flex-none items-center gap-1.5 rounded-full bg-white/10 pl-3.5 pr-4 text-[0.88rem] font-semibold text-white transition-all active:scale-95 active:bg-white/20"
            >
              <span aria-hidden="true" className="text-[1.1rem] leading-none">
                ←
              </span>
              {vista === "revision" ? "Atrás" : "Mesas"}
            </button>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.68rem] font-semibold uppercase tracking-rotulo text-noche-suave">{nombreLocal}</p>
            <p className="truncate text-[1.3rem] font-semibold leading-tight tracking-titular text-white">
              {vista === "salon" ? "Mesas" : `Mesa ${mesa}`}
            </p>
          </div>
          <div className="flex flex-none items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-[0.85rem] font-bold text-white"
            >
              {iniciales(mozo)}
            </span>
            <span className="hidden max-w-[9rem] truncate text-[0.85rem] font-medium text-noche-tinta sm:inline">{mozo}</span>
            {vista === "salon" && (
              <button
                type="button"
                onClick={salir}
                className="h-10 rounded-full bg-white/10 px-4 text-[0.82rem] font-semibold text-white transition-all active:scale-95 active:bg-white/20"
              >
                Salir
              </button>
            )}
          </div>
        </div>

        {/* El resumen del salón, de un vistazo. */}
        {vista === "salon" && !cargandoSalon && (
          <div className="mx-auto flex max-w-3xl flex-wrap gap-x-5 gap-y-1 px-4 pb-3.5 text-[0.82rem] text-noche-tinta">
            {reglas.usaMesas ? (
              <>
                <Contador punto="bg-exito" n={libresTotal} texto={libresTotal === 1 ? "libre" : "libres"} />
                <Contador punto="bg-brand" n={ocupadasTotal} texto={ocupadasTotal === 1 ? "ocupada" : "ocupadas"} />
                {porCobrarTotal > 0 && <Contador punto="bg-amarillo" n={porCobrarTotal} texto="por cobrar" />}
              </>
            ) : (
              <Contador punto="bg-brand" n={cuentas.length} texto={cuentas.length === 1 ? "mesa abierta" : "mesas abiertas"} />
            )}
          </div>
        )}

        {pasoActual >= 0 && <Pasos pasos={pasos} actual={pasoActual} />}
      </header>

      <main className="mx-auto max-w-3xl px-4 pt-5">
        {error && (
          <p role="alert" className="mb-4 rounded-xl bg-peligro-luz px-3.5 py-2.5 text-[0.88rem] font-medium text-peligro">
            {error}
          </p>
        )}

        {/* ----------------------------------------------------- el salón */}
        {vista === "salon" && (
          <div className="flex flex-col gap-5">
            <EstadoImpresion imprimiendo={imprimiendo} />
            {errorSalon && <p className="text-[0.8rem] text-aviso">{errorSalon}</p>}

            {cargandoSalon ? (
              <p className="text-[0.85rem] text-tinta-suave">Cargando las mesas…</p>
            ) : reglas.usaMesas ? (
              <section className={TARJETA}>
                <h2 className="text-[1.1rem] font-semibold tracking-titular text-tinta">
                  {conSectores ? "Elegí el sector y la mesa" : "Elegí la mesa"}
                </h2>
                {conSectores && mesas.length > 0 && (
                  <div
                    role="tablist"
                    aria-label="Sectores del restaurante"
                    className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  >
                    {opcionesDeSector.map((o) => {
                      const activo = o.id === sectorActivo;
                      const libres = libresDe(mesasDe(o.id));
                      return (
                        <button
                          key={o.id}
                          type="button"
                          role="tab"
                          aria-selected={activo}
                          onClick={() => setSectorElegido(o.id)}
                          className={`${CHIP_BASE} ${activo ? CHIP_ACTIVO : CHIP_INACTIVO}`}
                        >
                          {o.nombre}
                          <span className={`text-[0.76rem] font-medium ${activo ? "text-white/80" : "text-tinta-suave"}`}>
                            {libres} {libres === 1 ? "libre" : "libres"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {mesas.length === 0 ? (
                  <p className="mt-3 text-[0.85rem] text-tinta-suave">No hay mesas activas para elegir. Avisale al encargado.</p>
                ) : mesasDelSector.length === 0 ? (
                  <p className="mt-3 text-[0.85rem] text-tinta-suave">Este sector no tiene mesas para elegir.</p>
                ) : (
                  <ul className="mt-3.5 grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5">
                    {mesasDelSector.map((m) => {
                      const visual: EstadoVisual =
                        m.estado === "libre" ? "libre" : m.estado === "por_cobrar" ? "por_cobrar" : m.mia ? "mia" : "otra";
                      const estilo = TILE_MESA[visual];
                      // De la cuenta de esa mesa, el total (solo si este mozo la puede ver).
                      const cuentaDeLaMesa = m.cuentaId ? cuentas.find((c) => c.id === m.cuentaId) : undefined;
                      return (
                        <li key={m.nombre}>
                          <button
                            type="button"
                            onClick={() => tocarMesa(m)}
                            className={`relative flex aspect-square w-full flex-col items-center justify-center rounded-2xl px-1.5 text-center transition-all active:scale-[0.95] ${estilo.caja}`}
                          >
                            <span aria-hidden="true" className={`absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full ${estilo.punto}`} />
                            <span
                              className={`max-w-full truncate font-bold leading-none tracking-titular ${m.nombre.length > 4 ? "text-[1.05rem]" : "text-[1.7rem]"}`}
                            >
                              {m.nombre}
                            </span>
                            <span className={`mt-1.5 line-clamp-2 max-w-full break-words text-[0.7rem] font-semibold leading-tight ${estilo.etiqueta}`}>
                              {visual === "libre"
                                ? "Libre"
                                : visual === "por_cobrar"
                                  ? "Cuenta pedida"
                                  : visual === "mia"
                                    ? "Tuya"
                                    : (m.mozo ?? "Ocupada")}
                            </span>
                            {cuentaDeLaMesa && visual !== "libre" && (
                              <span className="cifra mt-0.5 text-[0.74rem] font-medium leading-tight opacity-90">
                                {cuentaDeLaMesa.total.toLocaleString("es-PY")}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <ul className="mt-3.5 flex flex-wrap gap-x-4 gap-y-1 text-[0.74rem] text-tinta-suave">
                  <li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-exito" />Libre</li>
                  <li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-brand" />Tuya</li>
                  <li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-tinta-suave" />De otro mozo</li>
                  <li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-amarillo" />Cuenta pedida</li>
                </ul>
                <p className="mt-2 text-[0.78rem] text-tinta-suave">Tocá una mesa libre para abrirla, o una ocupada para ver su cuenta.</p>
              </section>
            ) : (
              <section className={TARJETA}>
                <h2 className="text-[1.1rem] font-semibold tracking-titular text-tinta">Abrir una mesa</h2>
                <div className="mt-3 flex flex-wrap items-end gap-2.5">
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
                      className="!h-12 !rounded-xl !text-[1rem]"
                    />
                  </div>
                  <Boton tono="nuevo" tam="lg" className="!rounded-xl" onClick={abrirMesa}>
                    Abrir mesa
                  </Boton>
                </div>
                <p className="mt-2 text-[0.78rem] text-tinta-suave">Si la mesa ya tiene una cuenta abierta, el pedido se suma a esa cuenta.</p>
              </section>
            )}

            {!cargandoSalon && (!reglas.usaMesas || cuentasEnLista.length > 0) && (
              <section>
                <h2 className="mb-2.5 text-[1.1rem] font-semibold tracking-titular text-tinta">
                  {reglas.usaMesas ? "Otras cuentas abiertas" : "Mesas abiertas"}{" "}
                  <span className="text-[0.9rem] font-medium text-tinta-suave">({cuentasEnLista.length})</span>
                </h2>
                {cuentasEnLista.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-linea bg-superficie px-3 py-8 text-center text-[0.88rem] text-tinta-suave">
                    No hay mesas abiertas. Abrí una arriba.
                  </p>
                ) : (
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {cuentasEnLista.map((c) => (
                      <li key={c.id} className={`${TARJETA} flex flex-col`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[1.25rem] font-semibold tracking-titular text-tinta">Mesa {c.mesa}</p>
                            {c.estado === "por_cobrar" && (
                              <Pastilla color="amarillo" punto>
                                Cuenta pedida
                              </Pastilla>
                            )}
                            <p className="mt-0.5 text-[0.8rem] text-tinta-media">
                              {c.sector ? `${c.sector} · ` : ""}
                              {c.mozo} · {hace(c.abiertaEn)}
                            </p>
                          </div>
                          <p className="cifra flex-none text-[1.15rem] font-bold text-tinta">{formatearGuarani(c.total)}</p>
                        </div>
                        <p className="mt-1 text-[0.8rem] text-tinta-suave">
                          {c.productos} {c.productos === 1 ? "producto" : "productos"} · {c.rondas} {c.rondas === 1 ? "pedido" : "pedidos"}
                        </p>
                        <div className="mt-3 flex gap-2">
                          <button type="button" onClick={() => void verCuenta(c)} className={`${clasesBoton("navegar", "md")} flex-1 !rounded-xl`}>
                            Ver cuenta
                          </button>
                          {c.estado === "por_cobrar" ? (
                            <p className="flex-1 self-center text-[0.78rem] text-tinta-media">Esperando que la caja la cobre.</p>
                          ) : (
                            <button type="button" onClick={() => empezarPedido(c.mesa)} className={`${clasesBoton("nuevo", "md")} flex-1 !rounded-xl`}>
                              Agregar pedido
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>
        )}

        {/* ------------------------------------- cuántas personas (obligatorio para abrir la mesa) */}
        {vista === "personas" && (
          <section className={TARJETA}>
            <h2 className="text-[1.3rem] font-semibold tracking-titular text-tinta">¿Cuántas personas son?</h2>
            <p className="mt-1 text-[0.85rem] text-tinta-media">Hace falta para abrir la mesa. Tocá la cantidad, o escribila abajo si son más.</p>
            <div className="mt-4 grid grid-cols-4 gap-2.5">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => {
                const elegido = comensalesTexto === String(n);
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setComensalesTexto(String(n));
                      setError(null);
                    }}
                    aria-pressed={elegido}
                    className={`flex h-[4.25rem] items-center justify-center rounded-2xl text-[1.6rem] font-bold transition-all active:scale-[0.95] ${
                      elegido ? "bg-brand text-white shadow-media" : "bg-papel-suave text-tinta ring-1 ring-linea hover:ring-brand/50"
                    }`}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <span className="text-[0.88rem] font-medium text-tinta-media">Otra cantidad</span>
              <div className="w-28">
                <Entrada
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={99}
                  value={comensalesTexto}
                  onChange={(e) => {
                    setComensalesTexto(e.target.value);
                    setError(null);
                  }}
                  placeholder="Ej: 12"
                  aria-label="Cantidad de personas"
                  className="!h-12 !rounded-xl !text-[1.05rem]"
                />
              </div>
            </div>
          </section>
        )}

        {/* ---------------------------------------------- la cuenta (solo ver) */}
        {vista === "cuenta" && (
          <div className="flex flex-col gap-3.5">
            {cargandoDetalle && <p className="text-[0.85rem] text-tinta-suave">Cargando la cuenta…</p>}
            {detalle && (
              <>
                <div className={`${TARJETA} flex items-end justify-between gap-3`}>
                  <div className="min-w-0">
                    <p className={ROTULO}>Cuenta #{detalle.numero}</p>
                    <p className="mt-1 text-[0.82rem] leading-snug text-tinta-media">
                      {detalle.mozo}
                      {cuentaVista ? ` · ${cuentaVista.sector ? `${cuentaVista.sector} · ` : ""}abierta ${hace(cuentaVista.abiertaEn)}` : ""}
                    </p>
                  </div>
                  <p className="cifra flex-none text-[1.75rem] font-bold leading-none tracking-tight text-tinta">{formatearGuarani(detalle.total)}</p>
                </div>
                {detalle.rondas.map((r) => (
                  <section key={r.ronda} className={TARJETA}>
                    <p className="flex items-baseline justify-between gap-2">
                      <span className="text-[0.95rem] font-semibold tracking-titular text-tinta">Pedido {r.ronda}</span>
                      <span className="text-[0.78rem] text-tinta-suave">
                        {horaCorta(r.enviadoEn)} · {r.mozo}
                      </span>
                    </p>
                    <ul className="mt-2.5 flex flex-col gap-2.5">
                      {r.items.map((i) => (
                        <li key={i.id} className="flex items-start gap-2.5">
                          <span
                            className={`cifra flex h-7 min-w-8 flex-none items-center justify-center rounded-lg px-1.5 text-[0.8rem] font-bold ${
                              i.anulado ? "bg-papel-hundido text-tinta-suave" : "bg-brand-light text-brand-texto"
                            }`}
                          >
                            {formatearCantidad(i.cantidad)}×
                          </span>
                          <div className={`min-w-0 text-[0.92rem] ${i.anulado ? "text-tinta-suave line-through" : "text-tinta"}`}>
                            {i.nombre}
                            {i.anulado && <span className="ml-1.5 text-[0.72rem] font-bold text-peligro">ANULADO</span>}
                            {i.detalle && <span className="block text-[0.78rem] text-tinta-suave">+ {i.detalle}</span>}
                            {i.nota && <span className="block text-[0.78rem] text-tinta-media">“{i.nota}”</span>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
                <p className="rounded-xl bg-papel-hundido px-3.5 py-2.5 text-[0.82rem] text-tinta-media">
                  Para anular un producto, dar un descuento o cobrar, hablá con el cajero.
                </p>
                {detalle.estado === "por_cobrar" ? (
                  <p className="rounded-xl bg-amarillo-luz px-3.5 py-2.5 text-[0.85rem] font-medium text-amarillo-oscuro">
                    {MENSAJE_POR_COBRAR}
                  </p>
                ) : (
                  <Boton tono="nuevo" tam="lg" className="w-full !h-14 !rounded-2xl" onClick={() => empezarPedido(detalle.mesa)}>
                    Agregar pedido a esta mesa
                  </Boton>
                )}
                {avisoCuenta && (
                  <p className="rounded-xl bg-exito-luz px-3.5 py-2.5 text-[0.85rem] font-medium text-exito">{avisoCuenta}</p>
                )}
                {reglas.puedeImprimirCuenta && detalle.estado === "abierta" && (
                  <Boton
                    tono="navegar"
                    tam="lg"
                    className="w-full !h-14 !rounded-2xl"
                    disabled={imprimiendoCuenta}
                    onClick={() => {
                      if (confirm("Al imprimir la cuenta ya no vas a poder cargarle más productos. ¿Imprimir igual?")) {
                        void imprimirCuenta(detalle.id, detalle.mesa);
                      }
                    }}
                  >
                    {imprimiendoCuenta ? "Imprimiendo…" : "Imprimir la cuenta"}
                  </Boton>
                )}
              </>
            )}
          </div>
        )}

        {/* ------------------------------------------------ cargar productos */}
        {vista === "productos" && (
          <div>
            <Entrada
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto"
              aria-label="Buscar producto"
              className="mb-3.5 !h-12 !rounded-xl !text-[1rem]"
            />

            {!textoBusqueda && (
              <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <button
                  type="button"
                  onClick={() => setCategoriaId(TODOS)}
                  className={`${CHIP_BASE} ${categoriaId === TODOS ? CHIP_ACTIVO : CHIP_INACTIVO}`}
                >
                  Todos
                  <span className={`text-[0.76rem] font-medium ${categoriaId === TODOS ? "text-white/80" : "text-tinta-suave"}`}>{totalProductos}</span>
                </button>
                {categorias.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategoriaId(c.id)}
                    className={`${CHIP_BASE} ${c.id === categoriaId ? CHIP_ACTIVO : CHIP_INACTIVO}`}
                  >
                    {c.nombre}
                    <span className={`text-[0.76rem] font-medium ${c.id === categoriaId ? "text-white/80" : "text-tinta-suave"}`}>{c.productos.length}</span>
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
                const simple = p.agregados.length === 0;
                return (
                  <div
                    key={p.id}
                    className={`flex flex-col rounded-2xl bg-superficie shadow-sm transition-all ${
                      enCarrito > 0 ? "ring-2 ring-brand" : "ring-1 ring-linea"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => agregarProducto(p)}
                      className="flex flex-1 flex-col items-start p-3.5 pb-2 text-left transition-transform active:scale-[0.97]"
                    >
                      <p className="line-clamp-2 text-[0.95rem] font-semibold leading-snug text-tinta">{p.nombre}</p>
                      <p className="cifra mt-1.5 text-[1rem] font-bold text-brand-texto">{formatearGuarani(p.precio)}</p>
                      {/* Promoción por descuento o por volumen que rige ahora para este producto (2x1, −20 %…). */}
                      {p.promo && (
                        <span
                          title={p.promo.nombre}
                          className="mt-1.5 rounded-full bg-exito-luz px-2 py-0.5 text-[0.66rem] font-bold uppercase tracking-rotulo text-exito"
                        >
                          {p.promo.etiqueta}
                        </span>
                      )}
                      {/* Precio de promoción: se ve el precio normal y que ahora rige la promoción. */}
                      {p.enPromocion && (
                        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full bg-exito-luz px-2 py-0.5 text-[0.66rem] font-bold uppercase tracking-rotulo text-exito">
                            Promo
                          </span>
                          <span className="cifra text-[0.74rem] text-tinta-suave line-through">
                            {formatearGuarani(p.precioNormal ?? p.precio)}
                          </span>
                        </span>
                      )}
                      {!simple && (
                        <span className="mt-1.5 text-[0.68rem] font-semibold uppercase tracking-rotulo text-azul">Con agregados</span>
                      )}
                    </button>
                    <div className="flex items-center justify-end gap-1.5 px-3 pb-3">
                      {enCarrito > 0 && (
                        <>
                          {simple && (
                            <button
                              type="button"
                              onClick={() => cambiarCantidad(p.id, -1)}
                              aria-label={`Restar ${p.nombre}`}
                              className="flex h-10 w-10 items-center justify-center rounded-full bg-papel-hundido text-[1.25rem] font-semibold text-tinta transition-all active:scale-90"
                            >
                              −
                            </button>
                          )}
                          <span className="cifra min-w-7 text-center text-[1.05rem] font-bold text-tinta" aria-label={`${enCarrito} en el pedido`}>
                            {enCarrito}
                          </span>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => agregarProducto(p)}
                        aria-label={`Agregar ${p.nombre}`}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-[1.3rem] font-semibold text-white shadow-sm transition-all active:scale-90"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
              {productosVisibles.length === 0 && (
                <p className="col-span-full text-[0.88rem] text-tinta-suave">
                  {textoBusqueda ? "Ningún producto coincide." : "Esta categoría no tiene productos disponibles."}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ------------------------------------------------- vista previa */}
        {vista === "revision" && (
          <div className="flex flex-col gap-3.5">
            <h2 className="text-[1.3rem] font-semibold tracking-titular text-tinta">Revisá antes de enviar</h2>
            <EstadoImpresion imprimiendo={imprimiendo} />
            <ul className={`${TARJETA} flex flex-col gap-3`}>
              {carrito.map((i, indice) => (
                <li key={i.key} className="border-b border-linea-fina pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[0.95rem] font-semibold text-tinta">{i.nombre}</p>
                      {i.detalle && <p className="text-[0.8rem] text-tinta-suave">+ {i.detalle}</p>}
                      <p className="cifra text-[0.82rem] font-medium text-tinta-media">
                        {formatearGuarani(i.precio)} c/u · <span className="font-bold text-tinta">{formatearGuarani(i.precio * i.cantidad)}</span>
                      </p>
                      {detallePromos[indice]?.texto && (
                        <p className="text-[0.8rem] font-semibold text-exito">
                          🎁 {detallePromos[indice].texto} · −{formatearGuarani(detallePromos[indice].ahorro)}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-none items-center gap-1">
                      <button
                        type="button"
                        onClick={() => cambiarCantidad(i.key, -1)}
                        aria-label={`Restar ${i.nombre}`}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-papel-hundido text-[1.25rem] font-semibold text-tinta transition-all active:scale-90"
                      >
                        −
                      </button>
                      <span className="cifra w-7 text-center text-[1.05rem] font-bold text-tinta">{i.cantidad}</span>
                      <button
                        type="button"
                        onClick={() => cambiarCantidad(i.key, 1)}
                        aria-label={`Sumar ${i.nombre}`}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-[1.3rem] font-semibold text-white transition-all active:scale-90"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => quitar(i.key)}
                        aria-label={`Quitar ${i.nombre}`}
                        className="ml-1 flex h-10 w-10 items-center justify-center rounded-full bg-peligro-luz text-peligro transition-all hover:bg-peligro hover:text-white active:scale-90"
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
                      className="mt-2.5 !rounded-xl"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setNotaAbierta(i.key)}
                      className="mt-1.5 text-[0.82rem] font-semibold text-azul"
                    >
                      + Agregar una nota
                    </button>
                  )}
                </li>
              ))}
            </ul>

            <div className={`${TARJETA} flex items-center justify-between`}>
              <span className="text-[0.88rem] text-tinta-media">
                Total ({cantidadTotal}) · Mesa {mesa}
              </span>
              <span className="cifra text-[1.6rem] font-bold leading-none tracking-tight text-tinta">{formatearGuarani(total)}</span>
            </div>
            {ahorroPromos > 0 && (
              <p className="text-[0.82rem] text-exito">
                Con promociones: −{formatearGuarani(ahorroPromos)}. Al enviar, el servidor termina de calcularlas con lo que la cuenta ya tiene.
              </p>
            )}
          </div>
        )}

        {/* --------------------------------------------------------- enviado */}
        {vista === "enviado" && enviado && (
          <div className="flex flex-col items-center gap-5 py-6 text-center">
            <span className="flex h-24 w-24 animate-[entradaExito_0.5s_cubic-bezier(0.22,0.7,0.3,1)_both] items-center justify-center rounded-full bg-exito text-[2.8rem] text-white shadow-media ring-8 ring-exito-tinte">
              ✓
            </span>
            <div>
              <p className="text-[1.5rem] font-semibold tracking-titular text-tinta">
                {enviado.yaEnviado ? "Ese pedido ya estaba enviado" : "¡Pedido enviado!"}
              </p>
              <p className="mt-1.5 text-[0.98rem] text-tinta-media">
                Mesa {enviado.mesa} · pedido {enviado.ronda} · <span className="cifra font-semibold text-tinta">{formatearGuarani(enviado.totalEnvio)}</span>
              </p>
              {enviado.areas.length > 0 && (
                <p className="mt-1 text-[0.85rem] text-tinta-suave">Salió a: {enviado.areas.join(", ")}</p>
              )}
            </div>
            <EstadoImpresion imprimiendo={enviado.imprimiendo} />
            <div className="flex w-full flex-col gap-2.5">
              <Boton tono="nuevo" tam="lg" className="w-full !h-14 !rounded-2xl" onClick={() => empezarPedido(enviado.mesa)}>
                Agregar otro pedido a esta mesa
              </Boton>
              <button type="button" onClick={volverAlSalon} className={`${clasesBoton("navegar", "lg")} !h-14 !rounded-2xl`}>
                Volver a las mesas
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Personas: el botón grande para seguir (solo se enciende con una cantidad válida). */}
      {vista === "personas" && (
        <BarraAccion>
          <Boton tono="principal" tam="lg" className="w-full !h-14 !rounded-2xl shadow-alta" disabled={!personasValidas} onClick={continuarConPersonas}>
            Continuar y cargar productos
          </Boton>
        </BarraAccion>
      )}

      {/* Productos: cuántos hay cargados y el paso a la vista previa. */}
      {vista === "productos" && carrito.length > 0 && (
        <BarraAccion>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setNotaAbierta(null);
              setVista("revision");
            }}
            className="flex h-14 w-full items-center gap-3 rounded-2xl bg-brand px-4 text-white shadow-alta transition-transform active:scale-[0.98]"
          >
            <span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-white/20 px-2 text-[0.9rem] font-bold">{cantidadTotal}</span>
            <span className="flex-1 text-left text-[0.98rem] font-semibold">Ver pedido</span>
            <span className="cifra text-[1.1rem] font-bold">{formatearGuarani(total)}</span>
          </button>
        </BarraAccion>
      )}

      {/* Revisión: el total y el envío a cocina. */}
      {vista === "revision" && (
        <BarraAccion>
          <Boton
            tono="principal"
            tam="lg"
            className="w-full !h-14 !justify-between !rounded-2xl px-5 shadow-alta"
            disabled={enviando || carrito.length === 0}
            onClick={() => void enviar()}
          >
            <span>{enviando ? "Enviando…" : "Enviar a cocina"}</span>
            {!enviando && <span className="cifra">{formatearGuarani(total)}</span>}
          </Boton>
        </BarraAccion>
      )}

      {productoEligiendo && (
        <AgregadosPickerPos
          nombre={productoEligiendo.nombre}
          precioBase={(productoVivo ?? productoEligiendo).precio}
          agregados={(productoVivo ?? productoEligiendo).agregados}
          onCerrar={() => setProductoEligiendo(null)}
          onAgregar={confirmarAgregadosProducto}
        />
      )}
    </div>
  );
}
