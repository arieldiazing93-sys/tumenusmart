"use client";

import { useState } from "react";
import { Boton, Campo, Entrada, MensajeError, Selector } from "@/components/ui";
import { PanelLateral } from "@/components/PanelLateral";
import { claveDeMesa, normalizarMesa } from "@/lib/comedor";
import type { ContextoCaja } from "./ComedorCaja";
import { CargarProductosPanel } from "./CargarProductosPanel";

/** El último mozo que eligió esta computadora: para no tener que elegirlo de nuevo en cada mesa (solo una comodidad). */
const CLAVE_MOZO = "comedor_mozo_de_caja";
const TODAS = "__todas__";
const SIN_SECTOR = "__sin_sector__";
const CHIP_ACTIVO = "border-brand bg-brand text-white";
const CHIP_INACTIVO = "border-linea text-tinta-media hover:border-brand hover:text-brand";
const ROTULO = "text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave";

/**
 * La caja abre la cuenta de una mesa desde el panel, con el mismo recorrido que el mozo: (1) elige la mesa, (2) elige el mozo
 * a cargo —simbólico: si el mozo no está, la caja carga en su lugar— y (3) carga los productos con la misma carta de siempre.
 * La cuenta se abre cuando se envía el primer pedido; antes de eso no existe nada. Después sigue igual que cualquier cuenta:
 * se le agregan pedidos, se imprime y se cobra.
 */
export function AbrirCuentaPanel({
  contexto,
  onCerrar,
  onAbierta,
}: {
  contexto: ContextoCaja;
  onCerrar: () => void;
  /** Con la mesa y las áreas a las que salió una comanda. */
  onAbierta: (mesa: string, areas: string[]) => void;
}) {
  const { mozos, mesas, sectores, mesasOcupadas } = contexto.apertura;
  const usaMesas = mesas.length > 0;

  const [paso, setPaso] = useState<"datos" | "productos">("datos");
  const [mesaElegida, setMesaElegida] = useState("");
  const [mesaTexto, setMesaTexto] = useState("");
  const [sectorElegido, setSectorElegido] = useState<string | null>(null);
  const [mozoId, setMozoId] = useState(() => {
    try {
      const guardado = localStorage.getItem(CLAVE_MOZO);
      return guardado && mozos.some((m) => m.id === guardado) ? guardado : "";
    } catch {
      return "";
    }
  });
  const [personas, setPersonas] = useState("");
  const [error, setError] = useState<string | null>(null);

  // ------------------------------------------------------------------ los sectores (si el local los cargó)
  const sectoresConMesas = sectores.filter((s) => mesas.some((m) => m.sectorId === s.id));
  const conSectores = sectoresConMesas.length > 0;
  const hayMesasSinSector = mesas.some((m) => !m.sectorId);
  const opcionesDeSector = [
    ...sectoresConMesas.map((s) => ({ id: s.id, nombre: s.nombre })),
    ...(hayMesasSinSector ? [{ id: SIN_SECTOR, nombre: "Otras mesas" }] : []),
    { id: TODAS, nombre: "Todas" },
  ];
  // Sin haber elegido (o si el elegido ya no existe) se muestra el primer sector.
  const sectorActivo = opcionesDeSector.some((o) => o.id === sectorElegido)
    ? (sectorElegido ?? TODAS)
    : opcionesDeSector[0].id;
  const mesasDelSector = !conSectores
    ? mesas
    : sectorActivo === TODAS
      ? mesas
      : sectorActivo === SIN_SECTOR
        ? mesas.filter((m) => !m.sectorId)
        : mesas.filter((m) => m.sectorId === sectorActivo);

  const mesa = usaMesas ? mesaElegida : (normalizarMesa(mesaTexto) ?? "");
  const mozoNombre = mozos.find((m) => m.id === mozoId)?.nombre ?? "";
  const comensales = (() => {
    const n = Number(personas);
    return Number.isInteger(n) && n >= 1 && n <= 99 ? n : null;
  })();

  function continuar() {
    if (!mesa) {
      setError(usaMesas ? "Elegí la mesa." : "Escribí el número o nombre de la mesa (hasta 20 letras).");
      return;
    }
    if (mesasOcupadas.some((o) => claveDeMesa(o) === claveDeMesa(mesa))) {
      setError(`La mesa ${mesa} ya tiene una cuenta abierta: no se abre otra. Buscala en la lista y cargale el pedido desde ahí.`);
      return;
    }
    if (!mozoId) {
      setError("Elegí el mozo a cargo de la cuenta.");
      return;
    }
    try {
      localStorage.setItem(CLAVE_MOZO, mozoId);
    } catch {
      // Sin almacenamiento del navegador solo se pierde la comodidad de recordar el mozo.
    }
    setError(null);
    setPaso("productos");
  }

  // ------------------------------------------------------------------ paso 3: cargar los productos
  if (paso === "productos") {
    return (
      <CargarProductosPanel
        nuevaCuenta={{ mesa, mozoId, mozoNombre, comensales }}
        mesa={mesa}
        categorias={contexto.categorias}
        gruposMitad={contexto.gruposMitad}
        // Volver sin enviar no abre nada: se regresa a los datos de la cuenta.
        onCerrar={() => setPaso("datos")}
        onEnviado={(areas) => onAbierta(mesa, areas)}
      />
    );
  }

  // ------------------------------------------------------------------ pasos 1 y 2: la mesa y el mozo
  return (
    <PanelLateral titulo="Abrir una cuenta" onCerrar={onCerrar}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
          <section>
            <p className={ROTULO}>1 · La mesa</p>
            {usaMesas ? (
              <>
                {conSectores && (
                  <div role="tablist" aria-label="Sectores del restaurante" className="-mx-0.5 mt-2 flex gap-2 overflow-x-auto px-0.5 pb-1">
                    {opcionesDeSector.map((o) => {
                      const activo = o.id === sectorActivo;
                      return (
                        <button
                          key={o.id}
                          type="button"
                          role="tab"
                          aria-selected={activo}
                          onClick={() => setSectorElegido(o.id)}
                          className={`flex-none rounded-full border px-3.5 py-1.5 text-[0.85rem] font-medium transition-colors ${
                            activo ? CHIP_ACTIVO : CHIP_INACTIVO
                          }`}
                        >
                          {o.nombre}
                        </button>
                      );
                    })}
                  </div>
                )}
                {mesasDelSector.length === 0 ? (
                  <p className="mt-2 text-[0.82rem] text-tinta-suave">Este sector no tiene mesas.</p>
                ) : (
                  <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {mesasDelSector.map((m) => {
                      const elegida = mesaElegida === m.nombre;
                      return (
                        <li key={m.nombre}>
                          <button
                            type="button"
                            disabled={m.ocupada}
                            onClick={() => {
                              setMesaElegida(m.nombre);
                              setError(null);
                            }}
                            className={`flex h-full w-full flex-col items-center justify-center rounded-xl border-2 px-1.5 py-2.5 text-center transition-all active:scale-[0.96] ${
                              m.ocupada
                                ? "cursor-not-allowed border-linea bg-papel-suave text-tinta-suave opacity-70"
                                : elegida
                                  ? "border-brand bg-brand text-white"
                                  : "border-azul/50 bg-white text-tinta hover:border-azul hover:bg-azul-luz"
                            }`}
                          >
                            <span className="max-w-full truncate text-[1.05rem] font-bold leading-tight">{m.nombre}</span>
                            <span className="text-[0.68rem] font-medium leading-tight opacity-80">
                              {m.ocupada ? "Ocupada" : elegida ? "Elegida" : "Libre"}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            ) : (
              <div className="mt-2">
                <Entrada
                  value={mesaTexto}
                  onChange={(e) => {
                    setMesaTexto(e.target.value);
                    setError(null);
                  }}
                  maxLength={20}
                  placeholder="Mesa (ej: 5 o Terraza 2)"
                  aria-label="Número o nombre de la mesa"
                  autoFocus
                />
                <p className="mt-1 text-[0.76rem] text-tinta-suave">
                  El local todavía no cargó sus mesas: escribila. (Se cargan en Ajustes → Configuración servicio comedor.)
                </p>
              </div>
            )}
          </section>

          <section>
            <p className={ROTULO}>2 · El mozo a cargo</p>
            {mozos.length === 0 ? (
              <div className="mt-2 rounded-lg border border-amarillo/60 bg-amarillo-luz p-3 text-[0.82rem] text-amarillo-oscuro">
                <p>
                  No hay mozos activos. Para abrir una cuenta hace falta al menos uno: pedile al encargado que lo cree en
                  Ajustes → Configuración servicio comedor → Mozos.
                </p>
              </div>
            ) : (
              <div className="mt-2 flex flex-col gap-1.5">
                <Selector
                  value={mozoId}
                  onChange={(e) => {
                    setMozoId(e.target.value);
                    setError(null);
                  }}
                  aria-label="Mozo a cargo de la cuenta"
                >
                  <option value="">Elegí el mozo…</option>
                  {mozos.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </Selector>
                <p className="text-[0.76rem] leading-snug text-tinta-suave">
                  Es el que figura en la cuenta y en los reportes. Si el mozo no está, elegí el que corresponda: lo que se
                  cargue desde acá queda marcado como “cargado en la caja” con tu nombre.
                </p>
              </div>
            )}
          </section>

          <section>
            <Campo etiqueta="Personas (opcional)">
              <Entrada
                type="number"
                inputMode="numeric"
                min={1}
                max={99}
                value={personas}
                onChange={(e) => setPersonas(e.target.value)}
                placeholder="Ej: 4"
                className="w-28"
              />
            </Campo>
          </section>

          <p className="rounded-lg bg-papel-suave px-3 py-2 text-[0.78rem] leading-snug text-tinta-media">
            La cuenta se abre cuando enviás el primer pedido: recién ahí la mesa pasa a ocupada y sale la comanda a cocina.
          </p>
        </div>

        <div className="flex flex-none flex-col gap-2 border-t border-linea bg-superficie px-4 py-3">
          {error && <MensajeError>{error}</MensajeError>}
          <div className="flex items-center justify-end gap-2">
            <Boton tono="peligro" tam="md" onClick={onCerrar}>
              Cancelar
            </Boton>
            <Boton tono="principal" tam="md" disabled={mozos.length === 0} onClick={continuar}>
              Continuar y cargar productos
            </Boton>
          </div>
        </div>
      </div>
    </PanelLateral>
  );
}
