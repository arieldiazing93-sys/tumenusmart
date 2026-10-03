"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Area, Boton, Campo, Entrada, Selector, Tarjeta, clasesBoton } from "@/components/ui";
import { Segmentado } from "@/components/Segmentado";
import { formatearGuarani } from "@/lib/format";
import { SIN_REGISTRO_FISCAL, TIPOS_IDENTIFICACION_FISCAL } from "@/lib/tipo-cliente";
import type { AgregadoVenta, CategoriaVenta, GrupoMitadVenta, ProductoMitadVenta, ProductoVenta } from "@/lib/catalogo-venta";
import { AgregadosPickerPos } from "../../pos/AgregadosPickerPos";
import { MitadYMitadPickerPos } from "../../pos/MitadYMitadPickerPos";
import { EntradaConLupa } from "../../pos/EntradaConLupa";
import { buscarClienteParaPedido, crearPedidoManual } from "./actions";

type Zona = { id: string; nombre: string; costoEnvio: number };
type MetodoPago = { value: string; label: string };
type TipoEntrega = "delivery" | "retiro";

/**
 * Un producto (con o sin agregados elegidos) o un combo mitad y mitad ya armado, con su propia clave. Un mismo
 * producto con distintos agregados son líneas distintas — mismo criterio que el Punto de Venta y la carta pública.
 */
type ItemCarrito = { key: string; nombre: string; precio: number; cantidad: number; detalle?: string } & (
  | { tipo: "producto"; productId: string; agregadoIds: string[] }
  | { tipo: "combo"; productIdA: string; productIdB: string; agregadoIds: string[] }
);

const TODOS = "__todos__";
/** En la zona de envío: "todavía no se sabe". No es lo mismo que no haber elegido nada: eso no deja crear el pedido. */
const COORDINAR = "__coordinar__";

const TIPOS_ENTREGA: { value: TipoEntrega; label: string }[] = [
  { value: "delivery", label: "🛵 Delivery" },
  { value: "retiro", label: "🏪 Retiro en el local" },
];

const CHIP_ACTIVO = "border-brand bg-brand text-white";
const CHIP_INACTIVO = "border-linea bg-superficie text-tinta-media hover:border-brand hover:text-brand";
const TARJETA = "flex flex-col gap-3 !border-2 !border-azul/50";

/** Para buscar sin que importen las mayúsculas ni los acentos. */
function sinTildes(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * La pantalla para cargar un pedido que llegó por teléfono.
 *
 * Izquierda: quién es el cliente, cómo se le entrega y los productos. Derecha: el resumen con el pago, el
 * comprobante y el botón de crear. En el celular todo va en una columna y una barra fija abajo lleva al resumen.
 *
 * Lo que se ve acá es para trabajar rápido: los precios que vale son los que recalcula el servidor al guardar.
 */
export function NuevoPedidoForm({
  categorias,
  gruposMitad,
  zonas,
  metodosPago,
  facturaObligatoria,
}: {
  categorias: CategoriaVenta[];
  gruposMitad: GrupoMitadVenta[];
  zonas: Zona[];
  metodosPago: MetodoPago[];
  /** Si el local factura TODA venta: un "Ticket" sale igual como factura a Consumidor Final. */
  facturaObligatoria: boolean;
}) {
  const router = useRouter();

  const [categoriaId, setCategoriaId] = useState<string>(categorias[0]?.id ?? TODOS);
  const [busqueda, setBusqueda] = useState("");
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [productoEligiendo, setProductoEligiendo] = useState<ProductoVenta | null>(null);

  const [telefono, setTelefono] = useState("");
  const [nombre, setNombre] = useState("");
  const [estadoCliente, setEstadoCliente] = useState<"" | "conocido" | "nuevo">("");
  // Direcciones de pedidos anteriores del cliente: son opciones para elegir, nunca se completan solas.
  const [direccionesAnteriores, setDireccionesAnteriores] = useState<string[]>([]);
  const [buscandoCliente, setBuscandoCliente] = useState(false);

  const [tipoEntrega, setTipoEntrega] = useState<TipoEntrega>("delivery");
  const [direccion, setDireccion] = useState("");
  const [zonaId, setZonaId] = useState("");
  const [costoEnvioTexto, setCostoEnvioTexto] = useState("");

  const [metodoPago, setMetodoPago] = useState<string>(metodosPago[0]?.value ?? "efectivo");
  const [comprobanteTipo, setComprobanteTipo] = useState<"ticket" | "factura">("ticket");
  const [registroFiscal, setRegistroFiscal] = useState<"con" | "sin">("con");
  const [facturaTipo, setFacturaTipo] = useState<string>(TIPOS_IDENTIFICACION_FISCAL[0].valor);
  const [facturaNumero, setFacturaNumero] = useState("");
  const [facturaRazon, setFacturaRazon] = useState("");
  const [facturaEmail, setFacturaEmail] = useState("");
  const [notas, setNotas] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  // Primero el cliente y la entrega; recién después los productos, con la pantalla limpia como en el Punto de Venta.
  const [paso, setPaso] = useState<"cliente" | "productos">("cliente");

  // Suma, no pisa: un mismo producto puede estar varias veces con distintos agregados, y el número sobre la tarjeta
  // tiene que mostrar el total.
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

  const subtotal = useMemo(() => carrito.reduce((s, i) => s + i.precio * i.cantidad, 0), [carrito]);
  const cantidadTotal = useMemo(() => carrito.reduce((s, i) => s + i.cantidad, 0), [carrito]);

  // El envío: lo que dice el campo (que arranca con el precio de la zona, pero se puede cambiar por lo que se
  // arregló con el cliente). Vacío es 0.
  const costoEnvioNumero = costoEnvioTexto.trim() === "" ? 0 : Number(costoEnvioTexto.replace(",", "."));
  const costoEnvioInvalido = tipoEntrega === "delivery" && (!Number.isFinite(costoEnvioNumero) || costoEnvioNumero < 0);
  const costoEnvio = tipoEntrega === "delivery" && !costoEnvioInvalido ? costoEnvioNumero : 0;
  const total = subtotal + costoEnvio;

  const conRegistroFiscal = comprobanteTipo === "factura" && registroFiscal === "con";

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
          nombre: nombreCombo,
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

  /** Elegir la zona de envío: el campo del costo arranca con el precio de esa zona (sin zona, vacío = a coordinar). */
  function elegirZona(id: string) {
    setZonaId(id);
    const zona = zonas.find((z) => z.id === id);
    setCostoEnvioTexto(zona ? String(zona.costoEnvio) : "");
  }

  // Al tocar la lupa, apretar Enter o salir del teléfono: si ya es cliente del local, completa el nombre (sin pisar
  // lo que ya se escribió) y ofrece sus direcciones anteriores.
  async function buscarCliente() {
    const numero = telefono.trim();
    if (!numero || buscandoCliente) return;
    setBuscandoCliente(true);
    setDireccionesAnteriores([]);
    let r: Awaited<ReturnType<typeof buscarClienteParaPedido>>;
    try {
      r = await buscarClienteParaPedido(numero);
    } catch {
      setBuscandoCliente(false);
      return;
    }
    setBuscandoCliente(false);
    if (!r.ok) {
      setEstadoCliente("nuevo");
      return;
    }
    setEstadoCliente("conocido");
    const nombreEncontrado = r.nombre;
    setNombre((actual) => (actual.trim() ? actual : nombreEncontrado));
    // La dirección NO se completa sola: el cliente puede estar pidiendo desde otro lugar. Se ofrecen como opciones,
    // y la zona y el envío se eligen siempre a mano, según de dónde pide hoy.
    setDireccionesAnteriores(r.direcciones);
  }

  // Pasa a los productos solo con los datos del cliente y de la entrega bien cargados.
  function continuar() {
    setError(null);
    if (!telefono.trim() || !nombre.trim()) {
      setError("Cargá el teléfono y el nombre del cliente.");
      return;
    }
    if (tipoEntrega === "delivery") {
      if (!direccion.trim()) {
        setError("Para delivery hace falta la dirección: es lo que ve el repartidor.");
        return;
      }
      // Sin una zona elegida (o "A coordinar" a propósito) no se sigue: así el envío nunca queda en 0 por olvido.
      if (!zonaId) {
        setError("Elegí la zona de envío. Si todavía no se sabe, elegí “A coordinar”.");
        return;
      }
      if (costoEnvioInvalido) {
        setError("El costo de envío no es un número válido.");
        return;
      }
    }
    setPaso("productos");
    window.scrollTo({ top: 0 });
  }

  function volverAlCliente() {
    setError(null);
    setPaso("cliente");
    window.scrollTo({ top: 0 });
  }

  async function crear() {
    if (guardando) return;
    setError(null);

    if (!telefono.trim() || !nombre.trim()) {
      setError("Cargá el teléfono y el nombre del cliente.");
      return;
    }
    if (carrito.length === 0) {
      setError("Agregá al menos un producto al pedido.");
      return;
    }
    if (tipoEntrega === "delivery" && !direccion.trim()) {
      setError("Para delivery hace falta la dirección: es lo que ve el repartidor.");
      return;
    }
    // Sin una zona elegida (o "A coordinar" a propósito) no se crea: así el envío nunca queda en 0 por olvido.
    if (tipoEntrega === "delivery" && !zonaId) {
      setError("Elegí la zona de envío. Si todavía no se sabe, elegí “A coordinar”.");
      return;
    }
    if (costoEnvioInvalido) {
      setError("El costo de envío no es un número válido.");
      return;
    }
    if (conRegistroFiscal && (!facturaNumero.trim() || !facturaRazon.trim())) {
      setError("Para factura con datos hacen falta el número de documento y la razón social.");
      return;
    }

    setGuardando(true);
    let r: Awaited<ReturnType<typeof crearPedidoManual>>;
    try {
      r = await crearPedidoManual({
        clienteNombre: nombre,
        clienteTelefono: telefono,
        tipoEntrega,
        direccion: tipoEntrega === "delivery" ? direccion : undefined,
        deliveryZoneId: tipoEntrega === "delivery" && zonaId && zonaId !== COORDINAR ? zonaId : undefined,
        costoEnvio: tipoEntrega === "delivery" ? costoEnvioNumero : undefined,
        metodoPago,
        comprobanteTipo,
        facturaTipoIdentificacion:
          comprobanteTipo === "factura" ? (registroFiscal === "sin" ? SIN_REGISTRO_FISCAL.tipo : facturaTipo) : undefined,
        facturaRuc: conRegistroFiscal ? facturaNumero.trim() : undefined,
        facturaRazonSocial: conRegistroFiscal ? facturaRazon.trim() : undefined,
        facturaEmail: conRegistroFiscal ? facturaEmail.trim() || undefined : undefined,
        notas: notas.trim() || undefined,
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
      setGuardando(false);
      setError("No se pudo guardar el pedido. Antes de volver a intentar, fijate en Pedidos si quedó cargado.");
      return;
    }
    if (!r.ok) {
      setGuardando(false);
      setError(r.error);
      return;
    }
    // Se queda en "guardando" hasta cambiar de pantalla, para que un segundo clic no cargue el pedido dos veces.
    router.push(`/admin/pedidos/${r.orderId}`);
  }

  const mensajeError = error ? (
    <p
      role="alert"
      className="rounded-xl border-2 border-peligro/40 bg-peligro-luz px-3.5 py-2.5 text-[0.85rem] font-medium text-peligro"
    >
      {error}
    </p>
  ) : null;

  // Para el resumen del cliente en el segundo paso.
  const zonaElegida = zonas.find((z) => z.id === zonaId);
  const textoZona = zonaId === COORDINAR ? "zona a coordinar" : (zonaElegida?.nombre ?? "");

  return (
    <div className="pb-24 lg:pb-0">
      <ol className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.82rem] font-semibold">
        <li className={`flex items-center gap-2 ${paso === "cliente" ? "text-brand-texto" : "text-tinta-media"}`}>
          <span
            className={`cifra flex h-6 w-6 items-center justify-center rounded-full text-[0.75rem] text-white ${
              paso === "cliente" ? "bg-brand" : "bg-exito"
            }`}
          >
            {paso === "cliente" ? "1" : "✓"}
          </span>
          Cliente y entrega
        </li>
        <li aria-hidden="true" className="h-px w-6 bg-linea" />
        <li className={`flex items-center gap-2 ${paso === "productos" ? "text-brand-texto" : "text-tinta-suave"}`}>
          <span
            className={`cifra flex h-6 w-6 items-center justify-center rounded-full text-[0.75rem] ${
              paso === "productos" ? "bg-brand text-white" : "bg-papel-hundido text-tinta-suave"
            }`}
          >
            2
          </span>
          Productos y pago
        </li>
      </ol>

      {/* Paso 1: quién es el cliente y cómo se le entrega. */}
      {paso === "cliente" && (
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          <Tarjeta className={TARJETA}>
            <h2 className="text-[1rem] font-semibold tracking-titular text-tinta">Cliente y entrega</h2>

            <div className="grid gap-3 sm:grid-cols-2">
              <Campo
                etiqueta="Teléfono"
                ayuda={buscandoCliente ? "Buscando…" : "Tocá la lupa para ver si ya es cliente."}
              >
                <EntradaConLupa
                  type="tel"
                  inputMode="tel"
                  value={telefono}
                  onChange={(e) => {
                    setTelefono(e.target.value);
                    setEstadoCliente("");
                    setDireccionesAnteriores([]);
                  }}
                  onBlur={buscarCliente}
                  onBuscar={buscarCliente}
                  buscando={buscandoCliente}
                  etiquetaBoton="Buscar cliente por teléfono"
                  placeholder="0981 123 456"
                  maxLength={30}
                  autoFocus
                />
                {estadoCliente === "conocido" && (
                  <span className="mt-1.5 block text-[0.78rem] font-medium text-exito">
                    Cliente conocido: ya pidió antes.
                  </span>
                )}
                {estadoCliente === "nuevo" && (
                  <span className="mt-1.5 block text-[0.78rem] text-tinta-suave">
                    Cliente nuevo: se guarda al crear el pedido.
                  </span>
                )}
              </Campo>
              <Campo etiqueta="Nombre">
                <Entrada
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Nombre del cliente"
                  maxLength={80}
                />
              </Campo>
            </div>

            <Segmentado<TipoEntrega>
              opciones={TIPOS_ENTREGA}
              valor={tipoEntrega}
              onChange={(v) => {
                setTipoEntrega(v);
                setError(null);
              }}
            />

            {tipoEntrega === "delivery" && (
              <div className="flex flex-col gap-3">
                <Campo etiqueta="Dirección" ayuda="Calle, número y referencia: es lo que ve el repartidor.">
                  <Entrada
                    value={direccion}
                    onChange={(e) => setDireccion(e.target.value)}
                    placeholder="Ej: Av. Mcal. López 1234 casi Brasil, portón negro"
                    maxLength={200}
                  />
                </Campo>

                {direccionesAnteriores.length > 0 && (
                  <div className="rounded-lg border-2 border-azul/50 bg-papel-suave p-2.5">
                    <p className="mb-1.5 text-[0.78rem] font-semibold text-tinta">Direcciones anteriores de este cliente</p>
                    <div className="flex flex-wrap gap-1.5">
                      {direccionesAnteriores.map((d) => (
                        <button
                          key={d}
                          type="button"
                          title="Usar esta dirección"
                          onClick={() => setDireccion(d)}
                          className={`max-w-full rounded-lg border px-2.5 py-1.5 text-left text-[0.8rem] leading-snug transition-colors ${
                            direccion === d ? CHIP_ACTIVO : CHIP_INACTIVO
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[0.76rem] leading-snug text-tinta-suave">
                      Preguntale desde dónde pide hoy: puede ser otro lugar. La zona y el envío se eligen a mano.
                    </p>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo etiqueta="Zona de envío" ayuda="Según dónde está hoy el cliente.">
                    <Selector value={zonaId} onChange={(e) => elegirZona(e.target.value)}>
                      <option value="">Elegí la zona…</option>
                      <option value={COORDINAR}>A coordinar (sin zona)</option>
                      {zonas.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.nombre} · {formatearGuarani(z.costoEnvio)}
                        </option>
                      ))}
                    </Selector>
                  </Campo>
                  <Campo etiqueta="Costo de envío (Gs.)" ayuda="Se puede cambiar por lo que arreglaste con el cliente.">
                    <Entrada
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={500}
                      value={costoEnvioTexto}
                      onChange={(e) => setCostoEnvioTexto(e.target.value)}
                      placeholder="0"
                      invalido={costoEnvioInvalido}
                    />
                  </Campo>
                </div>
              </div>
            )}
          </Tarjeta>

          {mensajeError}
          <div className="flex justify-end">
            <Boton onClick={continuar} tam="lg">
              Continuar a los productos →
            </Boton>
          </div>
        </div>
      )}

      {/* Paso 2: los productos, el pedido y el pago. En el paso 1 queda montado pero oculto, para no perder nada. */}
      <div
        className={
          paso === "productos"
            ? "grid gap-4 lg:grid-cols-[minmax(0,1fr)_23rem] xl:grid-cols-[minmax(0,1fr)_26rem]"
            : "hidden"
        }
      >
        <div className="flex min-w-0 flex-col gap-4">
          <Tarjeta
            padding={false}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3.5 py-2.5 !border-2 !border-azul/50"
          >
            <div className="min-w-0">
              <p className="truncate text-[0.9rem] font-semibold text-tinta">
                {nombre} · {telefono}
              </p>
              <p className="text-[0.8rem] leading-snug text-tinta-media">
                {tipoEntrega === "delivery"
                  ? `🛵 ${direccion}${textoZona ? ` · ${textoZona}` : ""} · envío ${formatearGuarani(costoEnvio)}`
                  : "🏪 Retiro en el local"}
              </p>
            </div>
            <Boton type="button" tono="navegar" tam="sm" onClick={volverAlCliente}>
              Cambiar datos
            </Boton>
          </Tarjeta>

          <Tarjeta className={TARJETA}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[1rem] font-semibold tracking-titular text-tinta">Productos</h2>
              <Entrada
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar producto"
                aria-label="Buscar producto"
                className="!w-full sm:!w-56"
              />
            </div>

            {!textoBusqueda && (
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setCategoriaId(TODOS)}
                  className={`rounded-full border px-3 py-1.5 text-[0.8rem] font-semibold transition-colors ${
                    categoriaId === TODOS ? CHIP_ACTIVO : CHIP_INACTIVO
                  }`}
                >
                  Todos
                </button>
                {categorias.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategoriaId(c.id)}
                    className={`rounded-full border px-3 py-1.5 text-[0.8rem] font-semibold transition-colors ${
                      categoriaId === c.id ? CHIP_ACTIVO : CHIP_INACTIVO
                    }`}
                  >
                    {c.nombre}
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

            {productosVisibles.length === 0 ? (
              <p className="py-4 text-center text-[0.85rem] text-tinta-suave">
                {textoBusqueda ? "Ningún producto coincide con la búsqueda." : "No hay productos en esta categoría."}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {productosVisibles.map((p) => {
                  const enPedido = cantidadesPorProducto.get(p.id) ?? 0;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => agregarProducto(p)}
                      className="relative flex min-h-[4.5rem] flex-col justify-between rounded-xl border-2 border-azul/50 bg-superficie p-2.5 text-left transition-colors hover:border-brand active:scale-[0.98]"
                    >
                      <span className="pr-6 text-[0.86rem] font-semibold leading-snug text-tinta">{p.nombre}</span>
                      <span className="cifra mt-1 text-[0.82rem] text-tinta-media">{formatearGuarani(p.precio)}</span>
                      {enPedido > 0 && (
                        <span className="cifra absolute right-1.5 top-1.5 rounded-full bg-brand px-2 py-0.5 text-[0.7rem] font-semibold text-white">
                          {enPedido}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </Tarjeta>
        </div>

        {/* ------------------------------------------------------- derecha */}
        <div id="resumen-pedido" className="flex min-w-0 scroll-mt-4 flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
          <Tarjeta className={TARJETA}>
            <h2 className="text-[1rem] font-semibold tracking-titular text-tinta">Pedido</h2>

            {carrito.length === 0 ? (
              <p className="py-3 text-center text-[0.85rem] text-tinta-suave">Todavía no agregaste productos.</p>
            ) : (
              <ul className="flex flex-col">
                {carrito.map((i) => (
                  <li key={i.key} className="flex items-start gap-2 border-b border-linea-fina py-2 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.86rem] font-medium leading-snug text-tinta">{i.nombre}</p>
                      {i.detalle && <p className="text-[0.76rem] leading-snug text-tinta-suave">+ {i.detalle}</p>}
                      <p className="cifra text-[0.78rem] text-tinta-media">{formatearGuarani(i.precio)} c/u</p>
                    </div>
                    <div className="flex flex-none flex-col items-end gap-1">
                      <div className="flex items-center rounded-full border border-linea">
                        <button
                          type="button"
                          onClick={() => cambiarCantidad(i.key, -1)}
                          aria-label={`Restar uno a ${i.nombre}`}
                          className="flex h-7 w-7 items-center justify-center text-tinta-media transition-colors hover:text-brand"
                        >
                          −
                        </button>
                        <span className="cifra w-6 text-center text-[0.82rem] font-semibold text-tinta">{i.cantidad}</span>
                        <button
                          type="button"
                          onClick={() => cambiarCantidad(i.key, 1)}
                          aria-label={`Sumar uno a ${i.nombre}`}
                          className="flex h-7 w-7 items-center justify-center text-tinta-media transition-colors hover:text-brand"
                        >
                          +
                        </button>
                      </div>
                      <span className="cifra text-[0.82rem] font-semibold text-tinta">
                        {formatearGuarani(i.precio * i.cantidad)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => quitarProducto(i.key)}
                      aria-label={`Quitar ${i.nombre}`}
                      className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-tinta-suave transition-colors hover:bg-peligro-luz hover:text-peligro"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-col gap-1 border-t border-linea pt-2.5 text-[0.86rem]">
              <div className="flex justify-between text-tinta-media">
                <span>Subtotal</span>
                <span className="cifra">{formatearGuarani(subtotal)}</span>
              </div>
              {tipoEntrega === "delivery" && (
                <div className="flex justify-between text-tinta-media">
                  <span>Envío</span>
                  <span className="cifra">{formatearGuarani(costoEnvio)}</span>
                </div>
              )}
              <div className="flex justify-between text-[1.05rem] font-semibold text-tinta">
                <span>Total</span>
                <span className="cifra">{formatearGuarani(total)}</span>
              </div>
            </div>
          </Tarjeta>

          <Tarjeta className={TARJETA}>
            <h2 className="text-[1rem] font-semibold tracking-titular text-tinta">Pago y comprobante</h2>

            <Campo etiqueta="Cómo va a pagar">
              <Selector value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
                {metodosPago.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Selector>
            </Campo>

            <div>
              <p className="mb-1.5 text-[0.82rem] font-semibold text-tinta">Comprobante</p>
              <Segmentado<"ticket" | "factura">
                opciones={[
                  { value: "ticket", label: "Ticket" },
                  { value: "factura", label: "Factura" },
                ]}
                valor={comprobanteTipo}
                onChange={setComprobanteTipo}
              />
              {facturaObligatoria && (
                <p className="mt-1.5 text-[0.76rem] leading-snug text-tinta-suave">
                  Este local factura todas las ventas: con &ldquo;Ticket&rdquo; sale una factura a Consumidor Final.
                </p>
              )}
            </div>

            {comprobanteTipo === "factura" && (
              <div className="flex flex-col gap-3">
                <Segmentado<"con" | "sin">
                  opciones={[
                    { value: "con", label: "Con datos" },
                    { value: "sin", label: "Consumidor final" },
                  ]}
                  valor={registroFiscal}
                  onChange={setRegistroFiscal}
                  color="tinta"
                />
                {conRegistroFiscal && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                      <Campo etiqueta="Tipo de documento">
                        <Selector value={facturaTipo} onChange={(e) => setFacturaTipo(e.target.value)}>
                          {TIPOS_IDENTIFICACION_FISCAL.map((t) => (
                            <option key={t.valor} value={t.valor}>
                              {t.etiqueta}
                            </option>
                          ))}
                        </Selector>
                      </Campo>
                      <Campo etiqueta="Número">
                        <Entrada
                          value={facturaNumero}
                          onChange={(e) => setFacturaNumero(e.target.value)}
                          placeholder="80012345-6"
                          maxLength={30}
                        />
                      </Campo>
                    </div>
                    <Campo etiqueta="Razón social">
                      <Entrada value={facturaRazon} onChange={(e) => setFacturaRazon(e.target.value)} maxLength={120} />
                    </Campo>
                    <Campo etiqueta="Correo (opcional)">
                      <Entrada
                        type="email"
                        value={facturaEmail}
                        onChange={(e) => setFacturaEmail(e.target.value)}
                        maxLength={120}
                      />
                    </Campo>
                  </>
                )}
              </div>
            )}

            <Campo etiqueta="Notas (opcional)">
              <Area
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Ej: sin cebolla, tocar timbre, cambio de 100.000"
              />
            </Campo>
          </Tarjeta>

          {mensajeError}

          <Boton onClick={crear} disabled={guardando || carrito.length === 0} tam="lg" className="w-full">
            {guardando ? "Guardando…" : `Crear pedido · ${formatearGuarani(total)}`}
          </Boton>
          <p className="-mt-2 text-[0.76rem] leading-snug text-tinta-suave">
            Nace confirmado. Después lo pasás a &ldquo;En preparación&rdquo; desde su detalle y sigue el circuito de
            siempre: comanda, repartidor, despacho y entrega.
          </p>
        </div>
      </div>

      {/* Celular y tablet vertical (solo en el paso de los productos): el total siempre a la vista y un botón que baja al resumen. */}
      {paso === "productos" && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t-2 border-azul/50 bg-superficie px-4 py-2.5 lg:hidden">
          <div className="min-w-0">
            <p className="text-[0.74rem] text-tinta-suave">
              {cantidadTotal} {cantidadTotal === 1 ? "producto" : "productos"}
            </p>
            <p className="cifra text-[1rem] font-semibold text-tinta">{formatearGuarani(total)}</p>
          </div>
          <a href="#resumen-pedido" className={clasesBoton("principal", "md")}>
            Ver pedido
          </a>
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
