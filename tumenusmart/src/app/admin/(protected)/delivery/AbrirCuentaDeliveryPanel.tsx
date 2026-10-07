"use client";

import { useState } from "react";
import { Area, Boton, Campo, Entrada, MensajeError, Selector } from "@/components/ui";
import { PanelLateral } from "@/components/PanelLateral";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { leerCostoEnvio } from "@/lib/delivery";
import { extraerUbicacion, primerEnlace } from "@/lib/ubicacion-mapa";
import { CargarProductosPanel } from "../comedor/CargarProductosPanel";
import { EntradaConLupa } from "../pos/EntradaConLupa";
import { abrirCuentaDelivery, buscarClienteDelivery, cargarProductosDelivery, editarDatosDelivery, type DatosCuentaDelivery } from "./actions";
import { CamposFiscalesCliente, fichaVacia, type FichaFiscal } from "./CamposFiscalesCliente";
import type { ContextoDelivery, CuentaDeliveryFila } from "./tipos-delivery";

/** En la zona de envío: "todavía no se sabe". No es lo mismo que no haber elegido nada: eso no deja seguir. */
const COORDINAR = "__coordinar__";
/** El título de cada bloque del formulario: en negrita y más grande que el resto, para que se vea dónde empieza cada parte. */
const ROTULO = "text-[0.95rem] font-bold uppercase tracking-rotulo text-tinta";
const CAJA = "flex flex-col gap-3 rounded-xl border-2 border-azul/50 bg-superficie p-3.5";

/**
 * El formulario de la cuenta de delivery, en un panel a la derecha: el cliente (teléfono con lupa y nombre), sus datos de factura
 * (opcionales), la dirección (se puede pegar el enlace de Google Maps tal cual), la zona de envío con su costo y las notas. Al
 * crear la cuenta se abre enseguida la carta para cargarle los productos. Con `cuenta` (una cuenta abierta) sirve para corregir
 * sus datos.
 */
export function AbrirCuentaDeliveryPanel({
  contexto,
  cuenta,
  onCerrar,
  onAbierta,
  onEditada,
}: {
  contexto: ContextoDelivery;
  /** Si viene, el panel corrige los datos de esa cuenta en vez de abrir una nueva. */
  cuenta?: CuentaDeliveryFila;
  onCerrar: () => void;
  /** Con el número de la cuenta nueva, las áreas a las que salió una comanda y si se llegó a cargar algún producto. */
  onAbierta?: (numero: number, areas: string[], conProductos: boolean) => void;
  onEditada?: () => void;
}) {
  const edita = !!cuenta;
  const { zonas } = contexto;

  const [telefono, setTelefono] = useState(cuenta?.clienteTelefono ?? "");
  const [nombre, setNombre] = useState(cuenta?.clienteNombre ?? "");
  const [estadoCliente, setEstadoCliente] = useState<"" | "conocido" | "nuevo">("");
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  /** El nombre lo completó una búsqueda (y nadie lo tocó después): la próxima búsqueda lo puede reemplazar o limpiar. */
  const [nombreAutocompletado, setNombreAutocompletado] = useState(false);

  const [ficha, setFicha] = useState<FichaFiscal>(cuenta?.ficha ?? fichaVacia());
  /** Los datos de la ficha se completaron solos con los de la última factura de este cliente (y nadie los tocó después). */
  const [datosDeFacturaAnterior, setDatosDeFacturaAnterior] = useState(false);

  const [direccion, setDireccion] = useState(cuenta?.direccion ?? "");
  const [zonaId, setZonaId] = useState(cuenta ? (cuenta.zonaId ?? COORDINAR) : "");
  const [costoEnvioTexto, setCostoEnvioTexto] = useState(cuenta ? String(cuenta.costoEnvio) : "");
  const [notas, setNotas] = useState(cuenta?.notas ?? "");

  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  // Después de crear la cuenta se abre la carta para cargarle los productos.
  const [creada, setCreada] = useState<{ id: string; numero: number } | null>(null);

  const costoEnvio = leerCostoEnvio(costoEnvioTexto);
  const ubicacionPegada = extraerUbicacion(direccion);
  const enlacePegado = primerEnlace(direccion);

  /** Elegir la zona de envío: el campo del costo arranca con el precio de esa zona (a coordinar: vacío = 0). */
  function elegirZona(id: string) {
    setZonaId(id);
    const zona = zonas.find((z) => z.id === id);
    setCostoEnvioTexto(zona ? String(zona.costoEnvio) : "");
  }

  /** Saca el nombre y los datos de factura que completó una búsqueda anterior (lo que escribió la persona a mano no se toca). */
  function limpiarAutocompletado() {
    if (nombreAutocompletado) {
      setNombre("");
      setNombreAutocompletado(false);
    }
    if (datosDeFacturaAnterior) {
      setFicha(fichaVacia());
      setDatosDeFacturaAnterior(false);
    }
  }

  // Al tocar la lupa, apretar Enter o salir del teléfono se busca a ese cliente, CADA VEZ (también si ya se había buscado otro): si ya
  // es cliente del local, completa su nombre y los datos de su última factura; si no existe, saca lo que había completado la búsqueda
  // anterior. Lo que la persona escribió a mano no se pisa. La dirección NO: un mismo cliente pide desde varios lugares, así que la
  // dirección (el enlace de Google Maps que manda) se carga siempre de nuevo, en cada cuenta.
  async function buscarCliente() {
    const numero = telefono.trim();
    if (!numero || buscandoCliente) return;
    setBuscandoCliente(true);
    let r: Awaited<ReturnType<typeof buscarClienteDelivery>>;
    try {
      r = await buscarClienteDelivery(numero);
    } catch {
      setBuscandoCliente(false);
      return;
    }
    setBuscandoCliente(false);
    if (!r.ok) {
      setEstadoCliente("nuevo");
      limpiarAutocompletado();
      return;
    }
    setEstadoCliente("conocido");
    if (!nombre.trim() || nombreAutocompletado) {
      setNombre(r.nombre);
      setNombreAutocompletado(true);
    }
    // Un cliente recurrente trae los datos de su última factura: se completan solos si todavía no se escribió nada (o si los había
    // completado una búsqueda anterior); si este cliente no tiene, se saca lo del anterior.
    const anterior = r.facturaAnterior;
    const fichaLibre = (!ficha.numero.trim() && !ficha.razon.trim()) || datosDeFacturaAnterior;
    if (fichaLibre) {
      if (anterior) {
        setFicha({ tipo: anterior.tipoIdentificacion, numero: anterior.numeroIdentificacion, razon: anterior.razonSocial, email: anterior.email ?? "" });
        setDatosDeFacturaAnterior(true);
      } else if (datosDeFacturaAnterior) {
        setFicha(fichaVacia());
        setDatosDeFacturaAnterior(false);
      }
    }
  }

  function armarDatos(): DatosCuentaDelivery | string {
    if (!telefono.trim() || !nombre.trim()) return "Cargá el teléfono y el nombre del cliente.";
    // La ficha, si se empezó a cargar, tiene que estar completa: el número y la razón social van juntos.
    if ((ficha.numero.trim() || ficha.razon.trim()) && !(ficha.numero.trim() && ficha.razon.trim())) {
      return "Los datos de factura del cliente están incompletos: hacen falta el número y la razón social (o dejalos vacíos).";
    }
    if (!direccion.trim()) return "Cargá la dirección: es lo que ve el repartidor. Podés pegar el enlace de Google Maps.";
    // Sin una zona elegida (o "A coordinar" a propósito) no se sigue: así el envío nunca queda en 0 por olvido.
    if (!zonaId) return "Elegí la zona de envío. Si todavía no se sabe, elegí “A coordinar”.";
    if (costoEnvio === null) return "El costo de envío no es un número válido.";
    return {
      clienteNombre: nombre,
      clienteTelefono: telefono,
      clienteFiscal:
        ficha.numero.trim() || ficha.razon.trim()
          ? {
              tipoIdentificacion: ficha.tipo,
              numeroIdentificacion: ficha.numero.trim(),
              razonSocial: ficha.razon.trim(),
              email: ficha.email.trim() || undefined,
            }
          : undefined,
      direccion,
      deliveryZoneId: zonaId !== COORDINAR ? zonaId : undefined,
      aCoordinar: zonaId === COORDINAR,
      costoEnvio,
      notas: notas.trim() || undefined,
    };
  }

  async function guardar() {
    if (guardando) return;
    setError(null);
    const datos = armarDatos();
    if (typeof datos === "string") {
      setError(datos);
      return;
    }
    setGuardando(true);
    try {
      if (cuenta) {
        const r = await editarDatosDelivery(cuenta.id, datos);
        if (!r.ok) {
          setGuardando(false);
          setError(r.error);
          return;
        }
        setGuardando(false);
        onEditada?.();
        return;
      }
      const r = await abrirCuentaDelivery(datos);
      setGuardando(false);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setCreada({ id: r.cuentaId, numero: r.cuentaNumero });
    } catch {
      setGuardando(false);
      setError(
        edita
          ? "No se pudieron guardar los datos. Revisá la conexión y probá de nuevo."
          : "No se pudo abrir la cuenta. Antes de volver a intentar, fijate en la lista si quedó abierta."
      );
    }
  }

  // ------------------------------------------------------------------ la cuenta ya está abierta: cargar los productos
  if (creada) {
    return (
      <CargarProductosPanel
        categorias={contexto.categorias}
        gruposMitad={contexto.gruposMitad}
        titulo={`Cargar productos · Delivery ${formatearNumero(creada.numero)} · ${nombre.trim()}`}
        textoEnviar="Enviar a cocina"
        enviarItems={(items, envioId) => cargarProductosDelivery(creada.id, { envioId, items })}
        // Cerrar sin enviar nada deja la cuenta abierta y vacía: se le cargan los productos después desde su detalle.
        onCerrar={() => onAbierta?.(creada.numero, [], false)}
        onEnviado={(areas) => onAbierta?.(creada.numero, areas, true)}
      />
    );
  }

  // ------------------------------------------------------------------ el formulario
  return (
    <PanelLateral
      titulo={cuenta ? `Datos del delivery ${formatearNumero(cuenta.numero)}` : "Abrir una cuenta de delivery"}
      onCerrar={() => {
        if (!guardando) onCerrar();
      }}
      ancho="ancho"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {/* El fondo del panel es blanco y los campos donde se escribe llevan un gris muy claro (se distinguen del blanco): vale para
            todos los de este panel, también los de los datos de factura. */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto bg-superficie px-4 py-4 [&_input]:!bg-papel-suave [&_select]:!bg-papel-suave [&_textarea]:!bg-papel-suave">
          {/* ---------------------------------------------------------------- 1 · el cliente */}
          <section className={CAJA}>
            <p className={ROTULO}>1 · El cliente</p>
            <div className="grid items-start gap-3 sm:grid-cols-2">
              <Campo etiqueta="Teléfono">
                <EntradaConLupa
                  type="tel"
                  inputMode="tel"
                  value={telefono}
                  onChange={(e) => {
                    setTelefono(e.target.value);
                    setEstadoCliente("");
                    // Si se borra el teléfono, se va también lo que había completado la búsqueda.
                    if (!e.target.value.trim()) limpiarAutocompletado();
                  }}
                  onBlur={buscarCliente}
                  onBuscar={buscarCliente}
                  buscando={buscandoCliente}
                  etiquetaBoton="Buscar cliente por teléfono"
                  placeholder="0981 123 456"
                  maxLength={30}
                  autoFocus={!edita}
                />
                {buscandoCliente && <span className="mt-1.5 block text-[0.78rem] text-tinta-suave">Buscando…</span>}
                {estadoCliente === "conocido" && (
                  <span className="mt-1.5 block text-[0.78rem] font-medium text-exito">Cliente conocido: ya pidió antes.</span>
                )}
                {estadoCliente === "nuevo" && (
                  <span className="mt-1.5 block text-[0.8rem] font-semibold text-azul">Este cliente no existe: cargá sus datos.</span>
                )}
              </Campo>
              <Campo etiqueta="Nombre">
                <Entrada
                  value={nombre}
                  onChange={(e) => {
                    setNombre(e.target.value);
                    // Lo que se escribe a mano ya no se reemplaza ni se limpia con la búsqueda.
                    setNombreAutocompletado(false);
                  }}
                  placeholder="Nombre del cliente"
                  maxLength={80}
                />
              </Campo>
            </div>
          </section>

          {/* ---------------------------------------------------------------- datos de factura, por debajo del cliente */}
          <section className={CAJA}>
            <div>
              <p className={ROTULO}>Datos de factura (opcional)</p>
              <p className="mt-0.5 text-[0.78rem] leading-snug text-tinta-suave">
                Si el cliente pide factura, cargá acá su ficha: número de documento, tipo, razón social y correo. Si ya existe,
                buscalo con la lupa; si no, se guarda como cliente nuevo. Se completan solos cuando cobrás la cuenta.
              </p>
            </div>
            <CamposFiscalesCliente
              idBase="delivery-factura-numero"
              ficha={ficha}
              onCambiar={(f) => {
                setFicha(f);
                setDatosDeFacturaAnterior(false);
              }}
              avisoRecurrente={datosDeFacturaAnterior}
            />
          </section>

          {/* ---------------------------------------------------------------- 2 · la dirección */}
          <section className={CAJA}>
            <p className={ROTULO}>2 · La dirección</p>
            <Campo etiqueta="Dirección">
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
          </section>

          {/* ---------------------------------------------------------------- 3 · el costo de envío de la zona */}
          <section className={CAJA}>
            <p className={ROTULO}>3 · El envío</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Zona de envío">
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
              <Campo etiqueta="Costo de envío (Gs.)">
                <Entrada
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={500}
                  value={costoEnvioTexto}
                  onChange={(e) => setCostoEnvioTexto(e.target.value)}
                  placeholder="0"
                  invalido={costoEnvio === null}
                />
              </Campo>
            </div>
            <Campo etiqueta="Notas (opcional)">
              <Area
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={2}
                maxLength={500}
                aria-label="Notas de la cuenta"
                placeholder="Ej: tocar timbre, cambio de 100.000"
              />
            </Campo>
          </section>

        </div>

        <div className="flex flex-none flex-col gap-2 border-t border-linea bg-superficie px-4 py-3">
          {error && <MensajeError>{error}</MensajeError>}
          <div className="flex items-center justify-end gap-2">
            <Boton tono="peligro" tam="md" disabled={guardando} onClick={onCerrar}>
              Cancelar
            </Boton>
            <Boton tono={edita ? "navegar" : "nuevo"} tam="md" disabled={guardando} onClick={() => void guardar()}>
              {guardando ? "Guardando…" : edita ? "Guardar cambios" : "Crear cuenta y cargar productos"}
            </Boton>
          </div>
        </div>
      </div>
    </PanelLateral>
  );
}
