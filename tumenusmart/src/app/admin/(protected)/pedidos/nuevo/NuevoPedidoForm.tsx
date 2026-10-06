"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Area, Boton, Campo, Entrada, Selector, Tarjeta } from "@/components/ui";
import { Segmentado } from "@/components/Segmentado";
import { formatearGuarani } from "@/lib/format";
import type { AgregadoVenta, CategoriaVenta, GrupoMitadVenta, ProductoMitadVenta, ProductoVenta } from "@/lib/catalogo-venta";
import { AgregadosPickerPos } from "../../pos/AgregadosPickerPos";
import { MitadYMitadPickerPos } from "../../pos/MitadYMitadPickerPos";
import { EntradaConLupa } from "../../pos/EntradaConLupa";
import { buscarClienteParaPedido, crearPedidoManual } from "./actions";
import { CamposFiscalesCliente, fichaVacia, type FichaFiscal } from "../CamposFiscalesCliente";
import { extraerUbicacion, primerEnlace, textoSinEnlaces } from "@/lib/ubicacion-mapa";

type Zona = { id: string; nombre: string; costoEnvio: number };
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
/** En la zona de envío: "todavía no se sabe". No es lo mismo que no haber elegido nada: eso no deja seguir. */
const COORDINAR = "__coordinar__";

const TIPOS_ENTREGA: { value: TipoEntrega; label: string }[] = [
  { value: "delivery", label: "🛵 Delivery" },
  { value: "retiro", label: "🏪 Retiro en el local" },
];

// Los mismos chips que el Punto de Venta.
const CHIP_ACTIVO = "border-brand bg-brand text-white";
const CHIP_INACTIVO = "border-linea text-tinta-media hover:border-brand hover:text-brand";
const TARJETA = "flex flex-col gap-3 !border-2 !border-azul/50";
/** El rótulo de cada sección del panel del pedido, igual que en el Punto de Venta. */
const ROTULO = "text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave";

/** Para buscar sin que importen las mayúsculas ni los acentos. */
function sinTildes(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * La pantalla para cargar un pedido que llegó por WhatsApp o por teléfono, en dos pasos.
 *
 * Paso 1: quién es el cliente y cómo se le entrega (y, si ya se sabe, su ficha para la factura). Paso 2: los productos y el pedido, con
 * el mismo aspecto y los mismos efectos que el Punto de Venta (chips de categoría, tarjetas de producto, panel del pedido a un costado).
 * En el celular el panel baja debajo de los productos y una barra fija abajo lleva hasta él.
 *
 * El pedido se crea ABIERTO, como la cuenta de una mesa: todavía no se cobra. Después, desde su detalle, se le pueden cargar más
 * productos, dar un descuento o cancelar algo, y al final se cobra (forma de pago y comprobante).
 *
 * Lo que se ve acá es para trabajar rápido: los precios que vale son los que recalcula el servidor al guardar.
 */
export function NuevoPedidoForm({
  categorias,
  gruposMitad,
  zonas,
}: {
  categorias: CategoriaVenta[];
  gruposMitad: GrupoMitadVenta[];
  zonas: Zona[];
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

  // La ficha fiscal del cliente (número, tipo, razón social y correo): queda en el pedido y se completa sola al cobrarlo.
  const [ficha, setFicha] = useState<FichaFiscal>(fichaVacia);
  /** Los datos de la ficha se completaron solos con los de la última factura de este cliente. */
  const [datosDeFacturaAnterior, setDatosDeFacturaAnterior] = useState(false);
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

  const totalProductos = categorias.reduce((s, c) => s + c.productos.length, 0);
  const subtotal = useMemo(() => carrito.reduce((s, i) => s + i.precio * i.cantidad, 0), [carrito]);
  const cantidadTotal = useMemo(() => carrito.reduce((s, i) => s + i.cantidad, 0), [carrito]);

  // El envío: lo que dice el campo (que arranca con el precio de la zona, pero se puede cambiar por lo que se
  // arregló con el cliente). Vacío es 0.
  const costoEnvioNumero = costoEnvioTexto.trim() === "" ? 0 : Number(costoEnvioTexto.replace(",", "."));
  const costoEnvioInvalido = tipoEntrega === "delivery" && (!Number.isFinite(costoEnvioNumero) || costoEnvioNumero < 0);
  const costoEnvio = tipoEntrega === "delivery" && !costoEnvioInvalido ? costoEnvioNumero : 0;
  const total = subtotal + costoEnvio;

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

  function limpiarCarrito() {
    setCarrito([]);
    setError(null);
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
    // Un cliente recurrente trae los datos de su última factura: se completan solos, solo si todavía no se escribió nada.
    const anterior = r.facturaAnterior;
    if (anterior && !ficha.numero.trim() && !ficha.razon.trim()) {
      setFicha({
        tipo: anterior.tipoIdentificacion,
        numero: anterior.numeroIdentificacion,
        razon: anterior.razonSocial,
        email: anterior.email ?? "",
      });
      setDatosDeFacturaAnterior(true);
    }
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
    // La ficha, si se empezó a cargar, tiene que estar completa: el número y la razón social van juntos.
    if ((ficha.numero.trim() || ficha.razon.trim()) && !(ficha.numero.trim() && ficha.razon.trim())) {
      setError("Los datos de factura del cliente están incompletos: hacen falta el número y la razón social (o dejalos vacíos).");
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
        // La ficha fiscal del cliente: queda creada o actualizada en el sistema y en el pedido, lista para completar la factura al cobrar.
        clienteFiscal:
          ficha.numero.trim() || ficha.razon.trim()
            ? {
                tipoIdentificacion: ficha.tipo,
                numeroIdentificacion: ficha.numero.trim(),
                razonSocial: ficha.razon.trim(),
                email: ficha.email.trim() || undefined,
              }
            : undefined,
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
    // Se queda en "guardando" hasta cambiar de pantalla, para que un segundo clic no cargue el pedido dos veces. Va al detalle del
    // pedido, que queda abierto: ahí se le cargan más productos, se le da un descuento o se cobra.
    router.push(`/admin/pedidos/${r.orderId}`);
  }

  const mensajeError = error ? (
    <p role="alert" className="rounded-lg bg-peligro-luz px-3 py-2 text-[0.82rem] font-medium text-peligro">
      {error}
    </p>
  ) : null;

  // La dirección puede ser el enlace de ubicación que el cliente mandó por WhatsApp (se pega tal cual).
  const ubicacionPegada = extraerUbicacion(direccion);
  const enlacePegado = primerEnlace(direccion);
  // Para los resumenes: lo escrito sin la URL larga (o "ubicacion del mapa" si solo se pego el enlace).
  const direccionParaMostrar = textoSinEnlaces(direccion) || (enlacePegado ? "ubicación del mapa" : "");

  // Para el resumen de la entrega en el panel del pedido.
  const zonaElegida = zonas.find((z) => z.id === zonaId);
  const textoZona = zonaId === COORDINAR ? "zona a coordinar" : (zonaElegida?.nombre ?? "");

  return (
    <div className="pb-28 lg:pb-0">
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
          Productos
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
              color="exito"
            />

            {tipoEntrega === "delivery" && (
              <div className="flex flex-col gap-3">
                <Campo
                  etiqueta="Dirección"
                  ayuda="Calle, número y referencia, o pegá tal cual el enlace de ubicación que el cliente mandó por WhatsApp: es lo que ve el repartidor."
                >
                  <Entrada
                    value={direccion}
                    onChange={(e) => setDireccion(e.target.value)}
                    placeholder="Ej: Av. Mcal. López 1234 casi Brasil, o https://www.google.com/maps?q=-25.3,-57.6"
                    maxLength={200}
                  />
                  {ubicacionPegada ? (
                    <p className="mt-1.5 rounded-lg border border-exito/40 bg-exito-luz px-2.5 py-1.5 text-[0.78rem] font-medium text-exito">
                      Ubicación del cliente reconocida: el repartidor la abre en el mapa con un toque desde su ruta.
                    </p>
                  ) : enlacePegado ? (
                    <p className="mt-1.5 rounded-lg border border-amarillo/60 bg-amarillo-luz px-2.5 py-1.5 text-[0.78rem] font-medium text-amarillo-oscuro">
                      Enlace guardado tal cual: el repartidor lo abre desde su ruta.
                    </p>
                  ) : null}
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
            <div className="flex flex-col gap-3 border-t border-linea pt-3.5">
              <div>
                <p className={ROTULO}>Datos de factura del cliente (opcional)</p>
                <p className="mt-0.5 text-[0.78rem] leading-snug text-tinta-suave">
                  Si el cliente pide factura, cargá acá su ficha: número de documento, tipo, razón social y correo. Si ya existe,
                  buscalo con la lupa; si no, se guarda como cliente nuevo. Estos datos se completan solos cuando cobrás el pedido.
                </p>
              </div>
              <CamposFiscalesCliente
                idBase="pedido-factura-numero-cliente"
                ficha={ficha}
                onCambiar={(f) => {
                  setFicha(f);
                  setDatosDeFacturaAnterior(false);
                }}
                avisoRecurrente={datosDeFacturaAnterior}
              />
            </div>
          </Tarjeta>

          {mensajeError}
          <div className="flex justify-end">
            <Boton onClick={continuar} tam="lg">
              Continuar a los productos →
            </Boton>
          </div>
        </div>
      )}

      {/* Paso 2: los productos y el pedido, como el Punto de Venta. En el paso 1 queda montado pero oculto, para no perder nada. */}
      <div className={paso === "productos" ? "grid grid-cols-1 gap-5 lg:grid-cols-[1fr_23rem] lg:items-start" : "hidden"}>
        <div className="min-w-0">
          <Entrada
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto"
            aria-label="Buscar producto"
            className="mb-3 sm:!w-72"
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
                  <span className={c.id === categoriaId ? "text-white/80" : "text-tinta-suave"}>
                    {c.productos.length}
                  </span>
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
                {textoBusqueda ? "Ningún producto coincide con la búsqueda." : "Esta categoría no tiene productos disponibles."}
              </p>
            )}
          </div>
        </div>

        {/* El panel del pedido: el mismo del Punto de Venta, fijo al costado en pantalla ancha. */}
        <div id="resumen-pedido" className="min-w-0 scroll-mt-4 lg:sticky lg:top-[4.5rem]">
          <Tarjeta className="flex flex-col gap-4 ring-2 ring-brand/60 lg:max-h-[calc(100vh-5.5rem)] lg:overflow-y-auto">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[0.7rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
                  {nombre.trim() || "Pedido"}
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
                      <p className="cifra text-[0.78rem] font-medium text-tinta">
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
                      <span className="cifra w-5 text-center text-[0.85rem] font-semibold text-tinta">{i.cantidad}</span>
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
              <div className="flex items-center justify-between gap-2">
                <p className={ROTULO}>Cliente y entrega</p>
                <Boton type="button" tono="navegar" tam="sm" onClick={volverAlCliente}>
                  Cambiar datos
                </Boton>
              </div>
              <p className="text-[0.88rem] font-semibold text-tinta">
                {nombre} · {telefono}
              </p>
              <p className="text-[0.8rem] leading-snug text-tinta-media">
                {tipoEntrega === "delivery"
                  ? `🛵 ${direccionParaMostrar}${textoZona ? ` · ${textoZona}` : ""} · envío ${formatearGuarani(costoEnvio)}`
                  : "🏪 Retiro en el local"}
              </p>
              {ficha.numero.trim() && ficha.razon.trim() && (
                <p className="text-[0.78rem] leading-snug text-tinta-suave">
                  Factura a nombre de {ficha.razon.trim()} ({ficha.numero.trim()}), si se cobra con factura.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t border-linea pt-3.5">
              <p className={ROTULO}>Notas (opcional)</p>
              <Area
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={2}
                maxLength={500}
                aria-label="Notas del pedido"
                placeholder="Ej: sin cebolla, tocar timbre, cambio de 100.000"
              />
            </div>

            <div className="flex flex-col gap-1.5 border-t border-linea pt-3">
              {tipoEntrega === "delivery" && (
                <>
                  <div className="flex items-center justify-between text-[0.85rem] text-tinta-media">
                    <span>Subtotal</span>
                    <span className="cifra">{formatearGuarani(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[0.85rem] text-tinta-media">
                    <span>Envío</span>
                    <span className="cifra">{formatearGuarani(costoEnvio)}</span>
                  </div>
                </>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[0.85rem] text-tinta-media">Total ({cantidadTotal})</span>
                <span className="cifra text-[1.4rem] font-bold text-tinta">{formatearGuarani(total)}</span>
              </div>
            </div>

            {mensajeError}

            {/* El pedido se crea abierto: el cobro (forma de pago y comprobante) es el último paso, desde su detalle. */}
            <Boton tono="nuevo" onClick={crear} disabled={guardando || carrito.length === 0} tam="lg" className="w-full">
              {guardando ? "Creando…" : "Crear pedido"}
            </Boton>
            <p className="-mt-2 text-[0.74rem] leading-snug text-tinta-suave">
              El pedido queda abierto y confirmado: después podés cargarle más productos, darle un descuento o cancelar algo. Al final
              lo cobrás (forma de pago y factura) desde su detalle.
            </p>
          </Tarjeta>
        </div>
      </div>

      {/* Barra fija en celular/tablet angosto (como la del Punto de Venta): el panel del pedido queda debajo de toda la
          grilla, así que sin esto habría que scrollear hasta el final cada vez. */}
      {paso === "productos" && carrito.length > 0 && (
        <div
          className="fixed inset-x-0 bottom-0 z-30 border-t border-linea bg-papel/95 px-4 py-3 shadow-alta backdrop-blur-sm lg:hidden"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
        >
          <a
            href="#resumen-pedido"
            className="flex w-full items-center justify-between rounded-lg bg-brand px-4 py-3 text-white shadow-sm transition-transform active:scale-[0.98]"
          >
            <span className="text-[0.85rem] font-semibold">
              {cantidadTotal} {cantidadTotal === 1 ? "item" : "items"} · Ver pedido
            </span>
            <span className="cifra text-[1.05rem] font-bold">{formatearGuarani(total)}</span>
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
