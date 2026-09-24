"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Boton, Cabecera, Campo, Entrada, Tarjeta, clasesBoton } from "@/components/ui";
import { Segmentado } from "@/components/Segmentado";
import { formatearGuarani } from "@/lib/format";
import { calcularDescuento, textoPorcentaje } from "@/lib/descuento-venta";
import { FORMA_PAGO_A_CREDITO, type FormaPagoPos } from "@/lib/turno-pos";
import { SIN_REGISTRO_FISCAL, TIPOS_IDENTIFICACION_FISCAL, etiquetaCortaTipoIdentificacion } from "@/lib/tipo-cliente";
import { buscarClientePorIdentificacion, buscarClientePorTelefono, registrarVenta } from "./actions";
import { CobrarModal } from "./CobrarModal";
import { MovimientosCajaBoton } from "./caja/MovimientosCajaBoton";
import { EntradaConLupa } from "./EntradaConLupa";
import { ClienteFiscalModal, type DatosClienteFiscal } from "./ClienteFiscalModal";
import { MitadYMitadPickerPos } from "./MitadYMitadPickerPos";
import { AgregadosPickerPos } from "./AgregadosPickerPos";
import { imprimirComprobante, type ResultadoImpresion } from "@/lib/impresion-comprobantes";

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
  facturaObligatoria,
  ventasACredito,
  nombreImpresoraTicket,
  impresorasPorArea,
}: {
  turnoId: string;
  categorias: Categoria[];
  gruposMitad: GrupoMitad[];
  /** Si la estación de este turno tiene un punto de expedición vigente. */
  puedeFacturar: boolean;
  /** Días hasta que venza el timbrado de esa estación, o null si no aplica. */
  diasParaVencerTimbrado: number | null;
  /** Si el local exige facturar TODA venta (timbrado Autoimpresor). */
  facturaObligatoria: boolean;
  /** Si el local vende a crédito (Configuración): el cobro ofrece "A crédito". */
  ventasACredito: boolean;
  /** Impresora QZ Tray para el ticket/factura, en esta estación — null = sin configurar, cae al manual. */
  nombreImpresoraTicket: string | null;
  /** Mapa Área de Impresión → impresora QZ Tray, en esta estación. */
  impresorasPorArea: Record<string, string>;
}) {
  const router = useRouter();
  // Si el local exige facturar todo y esta estación puede hacerlo, no hay
  // "Ticket" que elegir — arranca directo en factura. Si exige facturar
  // todo pero esta estación NO puede (sin punto de expedición vigente), no
  // se puede vender nada (ver bloqueadoSinFacturar más abajo).
  const facturaForzada = facturaObligatoria && puedeFacturar;
  const bloqueadoSinFacturar = facturaObligatoria && !puedeFacturar;
  const [categoriaId, setCategoriaId] = useState<string>(categorias[0]?.id ?? TODOS);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteTelefono, setClienteTelefono] = useState("");
  const [tipoEntrega, setTipoEntrega] = useState<TipoEntregaPos>("local");
  const [comprobanteTipo, setComprobanteTipo] = useState<"ticket" | "factura">(
    facturaForzada ? "factura" : "ticket"
  );
  const [registroFiscal, setRegistroFiscal] = useState<"con" | "sin">("con");
  const [facturaRazonSocial, setFacturaRazonSocial] = useState("");
  const [facturaNumeroIdentificacion, setFacturaNumeroIdentificacion] = useState("");
  const [facturaTipoIdentificacionElegido, setFacturaTipoIdentificacionElegido] = useState<string>(
    TIPOS_IDENTIFICACION_FISCAL[0].valor
  );
  const [facturaEmail, setFacturaEmail] = useState("");
  const [clienteFiscalEsNuevo, setClienteFiscalEsNuevo] = useState(false);
  const [clienteFiscalEncontrado, setClienteFiscalEncontrado] = useState(false);
  const [buscandoClienteFiscal, setBuscandoClienteFiscal] = useState(false);
  const [mostrarModalClienteFiscal, setMostrarModalClienteFiscal] = useState(false);
  const [mostrarCobro, setMostrarCobro] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cobrando, setCobrando] = useState(false);
  const [productoEligiendo, setProductoEligiendo] = useState<Producto | null>(null);
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const [clienteEsNuevo, setClienteEsNuevo] = useState(false);
  // Descuento general de la cuenta: se tilda "Con descuento" y se escribe un
  // porcentaje o un monto. El valor va como texto para poder tipear "12,5".
  const [conDescuento, setConDescuento] = useState<"no" | "si">("no");
  const [tipoDescuento, setTipoDescuento] = useState<"porcentaje" | "monto">("porcentaje");
  const [valorDescuento, setValorDescuento] = useState("");

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
  const subtotal = useMemo(() => carrito.reduce((s, i) => s + i.precio * i.cantidad, 0), [carrito]);
  // Sin descuento tildado, o con el campo vacío, no se descuenta nada. Es la
  // misma función que usa el servidor (registrarVenta), así que el total que se
  // ve acá es el que se cobra.
  const descuentoPedido =
    conDescuento === "si" && valorDescuento.trim() !== ""
      ? { tipo: tipoDescuento, valor: Number(valorDescuento.replace(",", ".")) }
      : undefined;
  const descuento = calcularDescuento(subtotal, descuentoPedido);
  const descuentoInvalido = !descuento.ok;
  const descuentoMonto = descuento.ok ? descuento.monto : 0;
  const total = subtotal - descuentoMonto;
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
    setConDescuento("no");
    setValorDescuento("");
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

  // Mismo patrón que buscarCliente(), pero por identificación fiscal: si ya
  // facturó antes con ese número, autocompleta razón social y tipo. Si no,
  // avisa que es nuevo y el cajero carga tipo + razón social a mano.
  async function buscarClienteFiscal() {
    const numero = facturaNumeroIdentificacion.trim();
    if (!numero) return;
    setBuscandoClienteFiscal(true);
    setClienteFiscalEsNuevo(false);
    setClienteFiscalEncontrado(false);
    const r = await buscarClientePorIdentificacion(numero);
    setBuscandoClienteFiscal(false);
    if (r.ok) {
      setFacturaRazonSocial(r.nombre);
      setFacturaTipoIdentificacionElegido(r.tipoIdentificacion);
      setFacturaEmail("");
      setClienteFiscalEncontrado(true);
    } else {
      setFacturaRazonSocial("");
      setClienteFiscalEsNuevo(true);
    }
  }

  async function confirmarCobro(formaPago: FormaPagoPos | typeof FORMA_PAGO_A_CREDITO, creditoDias?: number) {
    if (
      comprobanteTipo === "factura" &&
      registroFiscal === "con" &&
      (!facturaNumeroIdentificacion.trim() || !facturaRazonSocial.trim())
    ) {
      setError("Para factura con registro fiscal hacen falta el número y la razón social.");
      return;
    }
    // A crédito hay que saber a quién cobrarle después: el nombre y una forma
    // de ubicarlo (teléfono o RUC/cédula). El servidor lo vuelve a exigir.
    if (formaPago === FORMA_PAGO_A_CREDITO) {
      const conRegistro = comprobanteTipo === "factura" && registroFiscal === "con";
      const tieneNombre = !!clienteNombre.trim() || (conRegistro && !!facturaRazonSocial.trim());
      const tieneContacto = !!clienteTelefono.trim() || (conRegistro && !!facturaNumeroIdentificacion.trim());
      if (!tieneNombre || !tieneContacto) {
        setError(
          "Una venta a crédito necesita el nombre del cliente y su teléfono o su RUC/cédula. Cargalos arriba, en los datos del cliente."
        );
        return;
      }
    }
    if (!descuento.ok) {
      setError(descuento.error);
      return;
    }
    setCobrando(true);
    setError(null);
    const esFactura = comprobanteTipo === "factura";
    const esSinRegistroFiscal = esFactura && registroFiscal === "sin";
    // Si el servidor falla por algo inesperado (la base, la red), la llamada
    // lanza en vez de devolver {ok:false}: sin este try, la pantalla se quedaba
    // para siempre en "Cobrando…" sin decir nada.
    let r: Awaited<ReturnType<typeof registrarVenta>>;
    try {
      r = await registrarVenta(turnoId, {
      formaPago,
      tipoEntrega,
      clienteNombre,
      clienteTelefono,
      nota: "",
      comprobanteTipo,
      facturaTipoIdentificacion: esFactura
        ? esSinRegistroFiscal
          ? SIN_REGISTRO_FISCAL.tipo
          : facturaTipoIdentificacionElegido
        : undefined,
      facturaNumeroIdentificacion: esFactura && !esSinRegistroFiscal ? facturaNumeroIdentificacion.trim() : undefined,
      facturaRazonSocial: esFactura && !esSinRegistroFiscal ? facturaRazonSocial : undefined,
      facturaEmail: esFactura && !esSinRegistroFiscal ? facturaEmail.trim() || undefined : undefined,
      descuento: descuentoPedido,
      creditoDias: formaPago === FORMA_PAGO_A_CREDITO ? creditoDias : undefined,
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
    } catch {
      setCobrando(false);
      setError(
        "No se pudo confirmar el cobro. Antes de volver a intentar, fijate en Cuentas del mostrador si la venta quedó registrada."
      );
      return;
    }
    setCobrando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setMostrarCobro(false);

    // El POS no tiene una fase de "preparación" separada del cobro: ticket
    // y comanda(s) se imprimen solos en el mismo momento — una comanda por
    // cada Área de Impresión presente en el carrito (ver
    // src/lib/impresion-comprobantes.ts). Uno por vez, NUNCA en paralelo:
    // mandar varios trabajos juntos a la misma impresora física los mezcla
    // en su buffer (confirmado con una impresora real — salían líneas
    // superpuestas/ilegibles salteadas). Comandas primero (para que la
    // cocina las tenga antes), el ticket al final.
    const urlTicket = `/admin/pos/venta/${r.ventaId}/ticket`;
    const resultadosComandas: ResultadoImpresion[] = [];
    for (const areaId of r.areasImpresion) {
      resultadosComandas.push(
        await imprimirComprobante(
          `/admin/pos/venta/${r.ventaId}/comanda/crudo?area=${areaId}`,
          impresorasPorArea[areaId] ?? null
        )
      );
    }
    const resultadoTicket = await imprimirComprobante(`/admin/pos/venta/${r.ventaId}/ticket/crudo`, nombreImpresoraTicket);

    // Las comandas que no salieron solas se avisan en la pantalla del
    // ticket (esta pantalla ya se desmonta al navegar) — nunca con un
    // window.open ciego: entre el clic original y este momento pasaron
    // varios `await` (conectar QZ, traer el HTML, imprimir), y para
    // entonces los navegadores ya no lo consideran un gesto directo del
    // usuario, así que un popup automático se bloquearía en silencio.
    const areasFallidas = r.areasImpresion.filter((_, i) => !resultadosComandas[i].ok);
    const parametroFallidas = areasFallidas.length > 0 ? `&comandasFallidas=${areasFallidas.join(",")}` : "";

    // Si el ticket se imprimió solo, se navega con ?silencioso=1 para no
    // disparar además el diálogo de impresión del navegador encima de algo
    // que ya salió — si no se pudo, se navega igual que siempre y el propio
    // ImprimirAuto de esa pantalla ofrece la impresión manual.
    router.push(
      resultadoTicket.ok
        ? `${urlTicket}?silencioso=1${parametroFallidas}`
        : `${urlTicket}${parametroFallidas ? `?${parametroFallidas.slice(1)}` : ""}`
    );
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
          <>
            <MovimientosCajaBoton turnoId={turnoId} />
            <Link href="/admin/pos/cerrar" className={clasesBoton("navegar", "sm")}>
              🔒 Cerrar turno
            </Link>
          </>
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
                  className={`relative flex flex-col rounded-xl border p-3.5 text-left shadow-sm transition-all active:scale-[0.96] ${
                    cantidadEnCarrito > 0
                      ? "border-brand/50 bg-brand-light ring-1 ring-brand/20"
                      : "border-linea bg-brand-light/40 hover:-translate-y-0.5 hover:border-brand/40 hover:bg-brand-light/70 hover:shadow-media"
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

        <Tarjeta className="flex flex-col gap-4 ring-2 ring-brand/60 lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100vh-5.5rem)] lg:overflow-y-auto">
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

          {/* Descuento general: sobre toda la cuenta, no por producto. Solo tiene
              sentido con algo cargado. */}
          {carrito.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-linea pt-3.5">
              <p className="text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
                Descuento
              </p>
              <Segmentado
                opciones={[
                  { value: "no", label: "Sin descuento" },
                  { value: "si", label: "Con descuento" },
                ]}
                valor={conDescuento}
                onChange={setConDescuento}
                color="tinta"
              />
              {conDescuento === "si" && (
                <>
                  <div className="flex items-stretch gap-2">
                    <Segmentado
                      opciones={[
                        { value: "porcentaje", label: "%" },
                        { value: "monto", label: "Gs." },
                      ]}
                      valor={tipoDescuento}
                      onChange={(v) => {
                        setTipoDescuento(v);
                        setValorDescuento("");
                      }}
                      className="w-32 flex-none"
                    />
                    <Entrada
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step={tipoDescuento === "porcentaje" ? "0.01" : "1"}
                      placeholder={tipoDescuento === "porcentaje" ? "Ej: 10" : "Ej: 5000"}
                      aria-label={tipoDescuento === "porcentaje" ? "Porcentaje de descuento" : "Monto del descuento en guaraníes"}
                      value={valorDescuento}
                      onChange={(e) => setValorDescuento(e.target.value)}
                      invalido={descuentoInvalido}
                    />
                  </div>
                  {!descuento.ok ? (
                    <p className="text-[0.76rem] font-medium text-peligro">{descuento.error}</p>
                  ) : descuentoMonto > 0 ? (
                    <p className="text-[0.76rem] font-medium text-exito">
                      Se descuenta {formatearGuarani(descuentoMonto)}
                      {descuento.porcentaje != null && ` (${textoPorcentaje(descuento.porcentaje)} %)`} de toda la cuenta.
                    </p>
                  ) : (
                    <p className="text-[0.74rem] text-tinta-suave">
                      Escribí el porcentaje o el monto a descontar de toda la cuenta.
                    </p>
                  )}
                </>
              )}
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
              {/* La lupa hace lo mismo que Enter: en el celular el teclado
                  numérico no tiene esa tecla. */}
              <EntradaConLupa
                placeholder="0981 234 567"
                value={clienteTelefono}
                onChange={(e) => {
                  setClienteTelefono(e.target.value);
                  setClienteEsNuevo(false);
                }}
                onBuscar={buscarCliente}
                buscando={buscandoCliente}
                etiquetaBoton="Buscar cliente por teléfono"
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
                  : "Tocá la lupa (o Enter) para completar el nombre si ya es cliente. Se guarda con +595 automático."}
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
              {facturaObligatoria ? (
                <p className="rounded-lg bg-papel-suave px-3 py-2 text-[0.78rem] text-tinta-media">
                  Este local factura todas las ventas — no se puede vender
                  como ticket.
                </p>
              ) : (
                <Segmentado
                  opciones={[
                    { value: "ticket", label: "Ticket" },
                    { value: "factura", label: "Factura" },
                  ]}
                  valor={comprobanteTipo}
                  onChange={setComprobanteTipo}
                />
              )}
              {comprobanteTipo === "factura" && (
                <div className="flex flex-col gap-2 rounded-lg border border-linea bg-papel-suave p-3">
                  <Segmentado
                    opciones={[
                      { value: "con", label: "Con registro fiscal" },
                      { value: "sin", label: "Sin registro fiscal" },
                    ]}
                    valor={registroFiscal}
                    onChange={setRegistroFiscal}
                    color="tinta"
                  />
                  {registroFiscal === "sin" ? (
                    <p className="text-[0.8rem] text-tinta-media">
                      Se factura a Consumidor Final (Sin Nombre).
                    </p>
                  ) : (
                    <>
                      <Campo etiqueta="N° de RUC / Cédula / etc.">
                        <EntradaConLupa
                          value={facturaNumeroIdentificacion}
                          onChange={(e) => {
                            setFacturaNumeroIdentificacion(e.target.value);
                            setClienteFiscalEsNuevo(false);
                            setClienteFiscalEncontrado(false);
                            setFacturaEmail("");
                          }}
                          onBuscar={buscarClienteFiscal}
                          buscando={buscandoClienteFiscal}
                          etiquetaBoton="Buscar cliente por RUC o cédula"
                          placeholder="80012345-6"
                        />
                      </Campo>
                      {clienteFiscalEncontrado ? (
                        <div className="flex flex-col items-start gap-1 rounded-lg bg-white px-3 py-2">
                          <DatoDelCliente etiqueta="Razón social" valor={facturaRazonSocial} />
                          <DatoDelCliente
                            etiqueta={etiquetaCortaTipoIdentificacion(facturaTipoIdentificacionElegido)}
                            valor={facturaNumeroIdentificacion.trim()}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setClienteFiscalEncontrado(false);
                              setClienteFiscalEsNuevo(true);
                            }}
                            className="text-[0.76rem] font-medium text-brand-texto underline"
                          >
                            ¿No es este cliente?
                          </button>
                        </div>
                      ) : buscandoClienteFiscal ? (
                        <p className="text-[0.74rem] text-tinta-suave">Buscando…</p>
                      ) : clienteFiscalEsNuevo ? (
                        facturaRazonSocial.trim() ? (
                          <div className="flex flex-col items-start gap-1 rounded-lg bg-white px-3 py-2">
                            <DatoDelCliente etiqueta="Razón social" valor={facturaRazonSocial} />
                            <DatoDelCliente
                              etiqueta={etiquetaCortaTipoIdentificacion(facturaTipoIdentificacionElegido)}
                              valor={facturaNumeroIdentificacion.trim()}
                            />
                            {facturaEmail && <DatoDelCliente etiqueta="Correo" valor={facturaEmail} />}
                            <button
                              type="button"
                              onClick={() => setMostrarModalClienteFiscal(true)}
                              className="text-[0.76rem] font-medium text-brand-texto underline"
                            >
                              Editar datos
                            </button>
                          </div>
                        ) : (
                          <>
                            <p className="text-[0.74rem] font-medium text-aviso">
                              No existe ningún cliente con ese número.
                            </p>
                            <Boton tono="navegar" tam="sm" onClick={() => setMostrarModalClienteFiscal(true)}>
                              Crear cliente
                            </Boton>
                          </>
                        )
                      ) : (
                        <p className="text-[0.74rem] text-tinta-suave">
                          Tocá la lupa (o Enter) para completar los datos si ya es cliente.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {bloqueadoSinFacturar && (
            <div className="flex flex-col gap-2 border-t border-linea pt-3.5">
              <p className="rounded-lg bg-peligro-luz px-3 py-2 text-[0.82rem] font-medium text-peligro">
                Este local exige facturar todas las ventas y esta estación no
                tiene un punto de expedición vigente asignado. No se puede
                cobrar hasta que el dueño le asigne uno en Configuración de
                facturas → Puntos de expedición.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2 border-t border-linea pt-3.5">
            <p className="text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
              Entrega
            </p>
            <Segmentado
              opciones={TIPOS_ENTREGA_POS}
              valor={tipoEntrega}
              onChange={setTipoEntrega}
              color="exito"
            />
          </div>

          <div className="flex flex-col gap-1.5 border-t border-linea pt-3">
            {descuentoMonto > 0 && (
              <>
                <div className="flex items-center justify-between text-[0.85rem] text-tinta-media">
                  <span>Subtotal</span>
                  <span className="cifra">{formatearGuarani(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-[0.85rem] font-medium text-exito">
                  <span>Descuento</span>
                  <span className="cifra">-{formatearGuarani(descuentoMonto)}</span>
                </div>
              </>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[0.85rem] text-tinta-media">Total ({cantidadTotal})</span>
              <span className="cifra text-[1.4rem] font-bold text-tinta">{formatearGuarani(total)}</span>
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-peligro-luz px-3 py-2 text-[0.82rem] font-medium text-peligro">
              {error}
            </p>
          )}

          <div className="hidden lg:block">
            <Boton
              onClick={() => setMostrarCobro(true)}
              disabled={carrito.length === 0 || bloqueadoSinFacturar || descuentoInvalido}
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
      {carrito.length > 0 && !bloqueadoSinFacturar && (
        <div
          className="fixed inset-x-0 bottom-0 z-30 border-t border-linea bg-papel/95 px-4 py-3 shadow-alta backdrop-blur-sm lg:hidden"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
        >
          <button
            type="button"
            onClick={() => setMostrarCobro(true)}
            disabled={descuentoInvalido}
            className="flex w-full items-center justify-between rounded-lg bg-brand px-4 py-3 text-white shadow-sm transition-transform active:scale-[0.98] disabled:opacity-50"
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
          permiteCredito={ventasACredito}
          onCerrar={() => setMostrarCobro(false)}
          onCobrar={confirmarCobro}
        />
      )}

      {mostrarModalClienteFiscal && (
        <ClienteFiscalModal
          numeroInicial={facturaNumeroIdentificacion}
          tipoInicial={facturaTipoIdentificacionElegido}
          onCerrar={() => setMostrarModalClienteFiscal(false)}
          onGuardar={(datos: DatosClienteFiscal) => {
            setFacturaNumeroIdentificacion(datos.numeroIdentificacion);
            setFacturaTipoIdentificacionElegido(datos.tipoIdentificacion);
            setFacturaRazonSocial(datos.razonSocial);
            setFacturaEmail(datos.email);
            setMostrarModalClienteFiscal(false);
          }}
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

/** Una línea "Etiqueta: dato" del cliente fiscal, con la etiqueta apagada y el dato resaltado. */
function DatoDelCliente({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <p className="text-[0.85rem] text-tinta">
      <span className="text-tinta-suave">{etiqueta}:</span> <span className="font-medium">{valor}</span>
    </p>
  );
}
