import type { ComponentType, ReactNode } from "react";
import { Logo } from "@/components/Logo";
import {
  IconoAlerta,
  IconoAsistencia,
  IconoCaja,
  IconoCheck,
  IconoReporte,
  IconoStock,
  IconoTurnos,
} from "./Iconos";

/**
 * Las pantallas del sistema, dibujadas con CSS.
 *
 * Ni una sola imagen: pesan cero de transferencia, cargan al instante, se ven
 * nítidas en cualquier pantalla y heredan los colores de la marca. Los datos son
 * de ejemplo y las maquetas van marcadas como decorativas (aria-hidden) para que
 * un lector de pantalla no las recorra número por número.
 */

type Icono = ComponentType<{ className?: string; tam?: number }>;

// ---------------------------------------------------------------------------
//  Piezas comunes
// ---------------------------------------------------------------------------

/** El marco de una pantalla de navegador, clara u oscura. */
function Ventana({
  url,
  oscura = false,
  className = "",
  children,
}: {
  url: string;
  oscura?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const punto = `h-2.5 w-2.5 rounded-full ${oscura ? "bg-noche-linea" : "bg-linea"}`;
  return (
    <div
      className={`overflow-hidden rounded-2xl border shadow-alta ${
        oscura ? "border-noche-linea bg-noche-panel" : "border-linea bg-superficie"
      } ${className}`}
    >
      <div
        className={`flex h-9 items-center gap-1.5 border-b px-3.5 ${
          oscura ? "border-noche-linea bg-noche" : "border-linea-fina bg-papel-suave"
        }`}
      >
        <span className={punto} />
        <span className={punto} />
        <span className={punto} />
        <span
          className={`ml-3 truncate rounded-full px-3 py-0.5 font-mono text-[0.62rem] ${
            oscura ? "bg-noche-panel text-noche-suave" : "bg-superficie text-tinta-suave"
          }`}
        >
          {url}
        </span>
      </div>
      {children}
    </div>
  );
}

/** Una tarjeta chica que "flota" con un aviso del sistema. */
function Aviso({
  icono: Ico,
  tono,
  titulo,
  texto,
  className = "",
}: {
  icono: Icono;
  tono: string;
  titulo: string;
  texto: string;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border border-linea bg-superficie p-3 shadow-media ${className}`}
    >
      <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl ${tono}`}>
        <Ico tam={18} />
      </span>
      <span className="min-w-0">
        <span className="block text-[0.8rem] font-semibold leading-tight">{titulo}</span>
        <span className="block text-[0.72rem] leading-snug text-tinta-suave">{texto}</span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Portada: el panel del dueño
// ---------------------------------------------------------------------------

function Kpi({
  etiqueta,
  valor,
  prefijo,
  nota,
  tonoNota,
}: {
  etiqueta: string;
  valor: string;
  prefijo?: string;
  nota: string;
  tonoNota: string;
}) {
  return (
    <div className="rounded-xl bg-papel-suave p-3">
      <p className="text-[0.68rem] font-medium text-tinta-suave">{etiqueta}</p>
      <p className="cifra mt-1 text-[1.05rem] font-semibold leading-none">
        {prefijo ? <span className="mr-1 text-[0.7rem] font-medium text-tinta-suave">{prefijo}</span> : null}
        {valor}
      </p>
      <p className={`mt-1.5 text-[0.68rem] font-medium ${tonoNota}`}>{nota}</p>
    </div>
  );
}

const BARRAS_VENTAS = [28, 42, 35, 60, 78, 55, 70, 92, 64, 48, 83, 100];
const BARRAS_DESTACADAS = [7, 11];

const MENU_LATERAL: Icono[] = [IconoCaja, IconoStock, IconoAsistencia, IconoTurnos, IconoReporte];

function PanelHero() {
  return (
    <Ventana url="tumenusmart.com/admin">
      <div className="grid sm:grid-cols-[52px_1fr]">
        <div className="hidden flex-col items-center gap-4 border-r border-linea-fina bg-papel-suave py-4 sm:flex">
          <Logo tam={22} color="#D2501F" />
          {MENU_LATERAL.map((Ico, i) => (
            <span
              key={i}
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                i === 0 ? "bg-brand-light text-brand" : "text-tinta-suave"
              }`}
            >
              <Ico tam={17} />
            </span>
          ))}
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <p className="text-[0.95rem] font-semibold tracking-titular">Resumen de hoy</p>
            <span className="rounded-full bg-exito-luz px-2.5 py-1 text-[0.66rem] font-semibold text-exito">
              ● Turno abierto · 4 h 12 min
            </span>
          </div>

          <div className="mt-3.5 grid grid-cols-2 gap-2.5">
            <Kpi etiqueta="Ventas del día" prefijo="Gs." valor="4.820.000" nota="↑ 12 % que ayer" tonoNota="text-exito" />
            <Kpi etiqueta="Tickets" valor="63" nota="Promedio Gs. 76.500" tonoNota="text-tinta-suave" />
            <Kpi etiqueta="Stock" valor="3 insumos" nota="Por agotarse" tonoNota="text-aviso" />
            <Kpi etiqueta="Personal" valor="6 de 8" nota="Ya marcaron entrada" tonoNota="text-azul" />
          </div>

          <div className="mt-3 rounded-xl border border-linea-fina p-3">
            <p className="text-[0.68rem] font-medium text-tinta-suave">Ventas por hora</p>
            <div className="mt-2 flex h-[72px] items-end gap-1.5">
              {BARRAS_VENTAS.map((alto, i) => (
                <span
                  key={i}
                  style={{ height: `${alto}%` }}
                  className={`flex-1 rounded-t ${BARRAS_DESTACADAS.includes(i) ? "bg-brand" : "bg-brand/25"}`}
                />
              ))}
            </div>
            <div className="mt-1.5 flex justify-between font-mono text-[0.58rem] text-tinta-suave">
              <span>10 h</span>
              <span>14 h</span>
              <span>18 h</span>
              <span>22 h</span>
            </div>
          </div>
        </div>
      </div>
    </Ventana>
  );
}

/**
 * El panel con tres avisos alrededor: un turno reservado, un insumo que se acaba
 * y una marcación. En el celular los avisos pasan debajo, en fila; en pantalla
 * grande flotan sobre las esquinas.
 */
export function VisualHero() {
  const flota = "lg:absolute lg:w-[220px]";
  return (
    <div role="img" aria-label="Vista del panel con las ventas del día, el stock y el personal" className="relative lg:px-9 lg:pb-9 lg:pt-7">
      <div aria-hidden="true">
        <PanelHero />
        <div className="mt-3 grid gap-2.5 sm:grid-cols-3 lg:mt-0 lg:block">
          <Aviso
            icono={IconoTurnos}
            tono="bg-violeta-luz text-violeta"
            titulo="Turno reservado"
            texto="Ariel · Corte · 09:30"
            className={`${flota} lg:right-0 lg:top-0`}
          />
          <Aviso
            icono={IconoAlerta}
            tono="bg-aviso-luz text-aviso"
            titulo="Queda poco"
            texto="Muzzarella · 2,4 kg"
            className={`${flota} lg:bottom-0 lg:left-0`}
          />
          <Aviso
            icono={IconoCheck}
            tono="bg-exito-luz text-exito"
            titulo="Marcación registrada"
            texto="Juan Pérez · 08:02"
            className={`${flota} lg:bottom-0 lg:right-0`}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Punto de venta
// ---------------------------------------------------------------------------

const CATEGORIAS_POS = ["Todos", "Hamburguesas", "Pizzas", "Bebidas"];

/** `soloAncho`: en el celular se esconde, para que la lista no se alargue. */
const PRODUCTOS_POS = [
  { nombre: "Parrillita", precio: "100.000", cantidad: 1, soloAncho: false },
  { nombre: "Marineras", precio: "50.000", cantidad: 2, soloAncho: false },
  { nombre: "Milanesitas", precio: "60.000", cantidad: 0, soloAncho: false },
  { nombre: "Papas fritas grande", precio: "30.000", cantidad: 0, soloAncho: false },
  { nombre: "Cerveza 1 L", precio: "28.000", cantidad: 0, soloAncho: true },
  { nombre: "Gaseosa 500 ml", precio: "9.000", cantidad: 0, soloAncho: true },
  { nombre: "Hamburguesa clásica", precio: "32.000", cantidad: 0, soloAncho: true },
  { nombre: "Empanada de carne", precio: "10.000", cantidad: 0, soloAncho: true },
  { nombre: "Agua 500 ml", precio: "6.000", cantidad: 0, soloAncho: true },
];

const FORMAS_DE_PAGO = ["Efectivo", "Tarjeta", "Transferencia"];

export function MaquetaPos() {
  return (
    <div aria-hidden="true">
      <Ventana url="tumenusmart.com/admin/pos" oscura>
        <div className="flex items-center gap-3 border-b border-noche-linea px-4 py-2.5 text-[0.8rem]">
          <span className="flex items-center gap-1.5 font-semibold tracking-titular text-noche-tinta">
            <Logo tam={16} color="#FFFFFF" hueco="#1D1F24" />
            Punto de venta
          </span>
          <span className="ml-auto flex-none rounded-full bg-emerald-500/15 px-2.5 py-1 text-[0.68rem] font-medium text-emerald-300">
            ● Turno abierto
          </span>
        </div>

        <div className="grid gap-4 p-4 md:grid-cols-[1.25fr_1fr] md:gap-6 md:p-6">
          <div>
            <div className="flex gap-1.5 overflow-hidden pb-3 text-[0.7rem]">
              {CATEGORIAS_POS.map((c, i) => (
                <span
                  key={c}
                  className={`flex-none rounded-full px-3 py-1.5 font-medium ${
                    i === 1 ? "bg-brand text-white" : "border border-noche-linea text-noche-suave"
                  }`}
                >
                  {c}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
              {PRODUCTOS_POS.map((p) => (
                <div
                  key={p.nombre}
                  className={`relative rounded-xl border p-3 ${p.soloAncho ? "hidden md:block" : ""} ${
                    p.cantidad > 0 ? "border-brand bg-brand/10" : "border-noche-linea"
                  }`}
                >
                  {p.cantidad > 0 ? (
                    <span className="absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[0.62rem] font-bold text-white">
                      {p.cantidad}
                    </span>
                  ) : null}
                  <p className="pr-5 text-[0.8rem] font-medium leading-tight text-noche-tinta">{p.nombre}</p>
                  <p className="cifra mt-2 text-[0.76rem] font-semibold text-brand">Gs. {p.precio}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col rounded-xl border border-noche-linea bg-noche p-4">
            <p className="font-mono text-[0.62rem] font-medium uppercase tracking-[0.14em] text-noche-suave">
              Cuenta · 3 ítems
            </p>
            <div className="mt-3 flex flex-col gap-2 border-b border-noche-linea pb-3 text-[0.8rem]">
              <div className="flex justify-between">
                <span className="text-noche-tinta">1× Parrillita</span>
                <span className="cifra text-noche-suave">100.000</span>
              </div>
              <div className="flex justify-between">
                <span className="text-noche-tinta">2× Marineras</span>
                <span className="cifra text-noche-suave">100.000</span>
              </div>
              <div className="flex justify-between text-emerald-300">
                <span>Promoción 10 %</span>
                <span className="cifra">−20.000</span>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-[0.95rem] font-semibold">
              <span className="text-noche-tinta">Total</span>
              <span className="cifra text-noche-tinta">Gs. 180.000</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1.5 text-[0.62rem] font-medium">
              {FORMAS_DE_PAGO.map((f, i) => (
                <span
                  key={f}
                  className={`truncate rounded-lg px-1 py-1.5 text-center ${
                    i === 0 ? "bg-noche-tinta text-noche" : "border border-noche-linea text-noche-suave"
                  }`}
                >
                  {f}
                </span>
              ))}
            </div>
            <span className="mt-3 inline-flex items-center justify-center rounded-xl bg-brand px-3 py-2.5 text-[0.82rem] font-semibold text-white">
              Cobrar · Gs. 180.000
            </span>
            <p className="cifra mt-3 flex items-center gap-1.5 text-[0.66rem] text-emerald-300">
              <IconoCheck tam={12} /> Factura 001-002-0000048
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-noche-linea px-4 py-2.5 text-[0.72rem]">
          <span className="text-noche-suave">Arqueo de hoy</span>
          <span className="cifra font-semibold text-emerald-300">Gs. 1.240.000</span>
        </div>
      </Ventana>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Control de stock
// ---------------------------------------------------------------------------

type Insumo = { nombre: string; cantidad: string; nivel: number; estado: "bajo" | "medio" | "bien" };

const INSUMOS: Insumo[] = [
  { nombre: "Queso muzzarella", cantidad: "2,4 kg", nivel: 12, estado: "bajo" },
  { nombre: "Salsa de tomate", cantidad: "6 L", nivel: 32, estado: "medio" },
  { nombre: "Harina 000", cantidad: "38 kg", nivel: 76, estado: "bien" },
  { nombre: "Gaseosa 2 L", cantidad: "24 u", nivel: 60, estado: "bien" },
  { nombre: "Aceite", cantidad: "9 L", nivel: 45, estado: "bien" },
];

const ESTADO_INSUMO = {
  bajo: { barra: "bg-peligro", etiqueta: "Queda poco", chip: "bg-peligro-luz text-peligro" },
  medio: { barra: "bg-amarillo", etiqueta: "Reponer pronto", chip: "bg-aviso-luz text-aviso" },
  bien: { barra: "bg-exito", etiqueta: "Bien", chip: "bg-exito-luz text-exito" },
} as const;

export function MaquetaStock() {
  return (
    <div aria-hidden="true">
      <div className="overflow-hidden rounded-2xl border border-linea bg-superficie shadow-alta">
        <div className="flex items-center justify-between border-b border-linea-fina px-4 py-3">
          <p className="text-[0.9rem] font-semibold tracking-titular">Insumos</p>
          <span className="rounded-full bg-papel-hundido px-2.5 py-1 text-[0.66rem] font-medium text-tinta-media">
            Almacén principal
          </span>
        </div>
        <ul>
          {INSUMOS.map((ins) => {
            const e = ESTADO_INSUMO[ins.estado];
            return (
              <li
                key={ins.nombre}
                className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 border-b border-linea-fina px-4 py-3 last:border-b-0"
              >
                <span className="text-[0.84rem] font-medium">{ins.nombre}</span>
                <span className={`rounded-full px-2 py-0.5 text-[0.62rem] font-semibold ${e.chip}`}>{e.etiqueta}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-papel-hundido">
                  <span className={`block h-full rounded-full ${e.barra}`} style={{ width: `${ins.nivel}%` }} />
                </span>
                <span className="cifra text-right text-[0.74rem] text-tinta-media">{ins.cantidad}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="relative mt-3 rounded-2xl border border-linea bg-superficie p-4 shadow-media sm:-mt-5 sm:ml-auto sm:w-[74%]">
        <div className="flex items-center justify-between">
          <p className="text-[0.84rem] font-semibold">Pizza muzzarella</p>
          <span className="rounded-full bg-exito-luz px-2 py-0.5 text-[0.62rem] font-semibold text-exito">Margen 74 %</span>
        </div>
        <div className="mt-2.5 flex flex-col gap-1 text-[0.76rem] text-tinta-media">
          <p className="flex justify-between">
            <span>Costo de los insumos</span>
            <span className="cifra text-tinta">Gs. 14.200</span>
          </p>
          <p className="flex justify-between">
            <span>Precio de venta</span>
            <span className="cifra text-tinta">Gs. 55.000</span>
          </p>
        </div>
        <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-papel-hundido">
          <span className="block h-full w-[74%] rounded-full bg-exito" />
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Asistencia
// ---------------------------------------------------------------------------

const MARCACIONES = [
  { nombre: "Juan Pérez", iniciales: "JP", detalle: "Entrada 08:02", marco: true },
  { nombre: "María Gómez", iniciales: "MG", detalle: "Entrada 08:15", marco: true },
  { nombre: "Carlos Ríos", iniciales: "CR", detalle: "Entrada 08:30", marco: true },
  { nombre: "Ana Duarte", iniciales: "AD", detalle: "Todavía no marcó", marco: false },
];

export function MaquetaAsistencia() {
  return (
    <div aria-hidden="true" className="relative mx-auto flex max-w-[460px] flex-col items-center sm:mx-0 sm:max-w-none sm:items-start">
      <div className="w-[228px] flex-none rounded-[34px] border-[7px] border-noche bg-noche shadow-alta">
        <div className="overflow-hidden rounded-[26px] bg-noche-panel px-5 pb-6 pt-5 text-center">
          <p className="text-[0.7rem] font-medium uppercase tracking-rotulo text-noche-suave">Marcá tu asistencia</p>
          <div className="mx-auto mt-5 flex h-[132px] w-[132px] items-center justify-center rounded-full border-[3px] border-emerald-400/70 bg-noche text-noche-tinta">
            <IconoAsistencia tam={64} />
          </div>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-[0.8rem] font-semibold text-emerald-300">
            <IconoCheck tam={14} /> Cara reconocida
          </p>
          <div className="mt-4 rounded-xl bg-noche px-3 py-2.5">
            <p className="text-[0.9rem] font-semibold text-noche-tinta">Juan Pérez</p>
            <p className="cifra mt-0.5 text-[0.74rem] text-noche-suave">Entrada · 08:02</p>
          </div>
          <div className="mt-4 flex justify-center gap-2" role="presentation">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="h-2 w-2 rounded-full bg-noche-tinta/80" />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 w-full rounded-2xl border border-linea bg-superficie p-4 shadow-media sm:absolute sm:right-0 sm:top-12 sm:mt-0 sm:w-[290px]">
        <p className="text-[0.84rem] font-semibold">Marcaciones de hoy</p>
        <ul className="mt-2.5 flex flex-col gap-2.5">
          {MARCACIONES.map((m) => (
            <li key={m.nombre} className="flex items-center gap-2.5">
              <span
                className={`flex h-8 w-8 flex-none items-center justify-center rounded-full text-[0.7rem] font-bold ${
                  m.marco ? "bg-azul-luz text-azul" : "bg-papel-hundido text-tinta-suave"
                }`}
              >
                {m.iniciales}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.8rem] font-medium leading-tight">{m.nombre}</span>
                <span className="cifra block text-[0.68rem] text-tinta-suave">{m.detalle}</span>
              </span>
              {m.marco ? <IconoCheck tam={15} className="flex-none text-exito" /> : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Reserva de turnos
// ---------------------------------------------------------------------------

const HORA_PX = 34;
const HORA_INICIAL = 9;
const HORAS_VISIBLES = 5;
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DIA_DE_HOY = 3;

const TONO_TURNO = {
  amarillo: "border-amarillo bg-amarillo-luz text-amarillo-oscuro",
  azul: "border-azul bg-azul-luz text-azul-oscuro",
  violeta: "border-violeta bg-violeta-luz text-violeta-oscuro",
  exito: "border-exito bg-exito-luz text-exito",
} as const;

/** [día (0 = lunes), hora de inicio, horas de duración, cliente, color] */
const TURNOS_SEMANA: [number, number, number, string, keyof typeof TONO_TURNO][] = [
  [0, 9, 1, "Hugo", "amarillo"],
  [0, 11, 0.5, "Ana", "azul"],
  [1, 9.5, 1, "Ariel", "azul"],
  [2, 10, 1.5, "María", "violeta"],
  [4, 12, 1, "Nico", "exito"],
  [3, 9, 0.75, "Raúl", "exito"],
  [3, 11, 1, "Lía", "amarillo"],
  [4, 10.5, 1, "Beto", "azul"],
  [5, 9, 2, "Sol", "violeta"],
];

const LINEAS_DE_HORAS = `repeating-linear-gradient(to bottom, transparent 0, transparent ${HORA_PX - 1}px, rgb(var(--linea-fina)) ${HORA_PX - 1}px, rgb(var(--linea-fina)) ${HORA_PX}px)`;

export function MaquetaTurnos() {
  return (
    <div aria-hidden="true">
      <div className="overflow-hidden rounded-2xl border border-linea bg-superficie shadow-alta">
        <div className="flex items-center justify-between border-b border-linea-fina bg-papel-suave px-4 py-2.5">
          <p className="text-[0.84rem] font-semibold tracking-titular">Calendario</p>
          <span className="rounded-full bg-superficie px-2.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-wide text-tinta-suave ring-1 ring-linea">
            Semana
          </span>
        </div>

        <div className="grid grid-cols-[30px_repeat(6,1fr)]">
          <span />
          {DIAS.map((d, i) => (
            <span
              key={d}
              className={`py-2 text-center text-[0.66rem] font-semibold ${
                i === DIA_DE_HOY ? "text-azul" : "text-tinta-suave"
              }`}
            >
              {d}
              {i === DIA_DE_HOY ? <span className="mx-auto mt-0.5 block h-1 w-1 rounded-full bg-azul" /> : null}
            </span>
          ))}

          <div className="relative border-t border-linea-fina" style={{ height: HORA_PX * HORAS_VISIBLES }}>
            {Array.from({ length: HORAS_VISIBLES }, (_, i) => (
              <span
                key={i}
                className="cifra absolute right-1.5 text-[0.56rem] text-tinta-suave"
                style={{ top: i * HORA_PX + 3 }}
              >
                {String(HORA_INICIAL + i).padStart(2, "0")}
              </span>
            ))}
          </div>
          {DIAS.map((d, dia) => (
            <div
              key={d}
              className="relative border-l border-t border-linea-fina"
              style={{ height: HORA_PX * HORAS_VISIBLES, backgroundImage: LINEAS_DE_HORAS }}
            >
              {TURNOS_SEMANA.filter((t) => t[0] === dia).map(([, inicio, duracion, cliente, tono]) => (
                <span
                  key={cliente}
                  className={`absolute inset-x-0.5 block overflow-hidden rounded border-l-[3px] px-1 py-0.5 text-[0.58rem] font-semibold leading-tight ${TONO_TURNO[tono]}`}
                  style={{ top: (inicio - HORA_INICIAL) * HORA_PX + 1, height: duracion * HORA_PX - 2 }}
                >
                  {cliente}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="relative mt-3 w-full overflow-hidden rounded-2xl border border-linea bg-superficie shadow-media sm:-mt-5 sm:ml-auto sm:w-[78%]">
        <div className="flex items-center gap-1.5 bg-exito px-3 py-1.5 text-[0.68rem] font-semibold text-white">
          <IconoCheck tam={13} />
          Cobrada en caja
        </div>
        <div className="p-3 text-[0.74rem] leading-relaxed text-tinta-media">
          <p className="flex justify-between font-semibold text-tinta">
            <span>Ariel · Corte moderno</span>
            <span className="cifra">Gs. 40.000</span>
          </p>
          <p className="mt-1.5 flex justify-between border-t border-linea-fina pt-1.5">
            <span>Comisión del profesional (40 %)</span>
            <span className="cifra">Gs. 16.000</span>
          </p>
          <p className="cifra mt-1.5 border-t border-linea-fina pt-1.5 text-[0.68rem] text-exito">
            ✓ Factura N° 001-002-0000047
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Carta digital y pedido por WhatsApp
// ---------------------------------------------------------------------------

const TONOS: Record<string, string> = {
  a: "linear-gradient(135deg,#F0D9C8,#E3B79A)",
  b: "linear-gradient(135deg,#E9DCC4,#D6C08F)",
  c: "linear-gradient(135deg,#DCE4DA,#B9C9B4)",
};

function Plato({
  nombre,
  descripcion,
  precio,
  tono,
  ultimo,
}: {
  nombre: string;
  descripcion: string;
  precio: string;
  tono: string;
  ultimo?: boolean;
}) {
  return (
    <div className={`flex items-start gap-2 py-2.5 ${ultimo ? "" : "border-b border-linea-fina"}`}>
      <span className="h-[38px] w-[38px] flex-none rounded-lg" style={{ background: TONOS[tono] }} />
      <span className="min-w-0">
        <span className="block text-[0.74rem] font-medium leading-tight">{nombre}</span>
        <span className="block text-[0.62rem] leading-snug text-tinta-suave">{descripcion}</span>
      </span>
      <span className="cifra ml-auto whitespace-nowrap text-[0.68rem] font-medium">{precio}</span>
    </div>
  );
}

/** La carta en el celular del cliente y, debajo, el pedido tal como le llega al local por WhatsApp. */
export function MaquetaCarta({ nombreLocal }: { nombreLocal: string }) {
  const iniciales = nombreLocal
    .split(" ")
    .filter((p) => p.length > 2)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div aria-hidden="true" className="mx-auto flex max-w-[340px] flex-col sm:mx-0 sm:ml-auto">
      <div className="w-[min(272px,80vw)] self-start overflow-hidden rounded-[26px] border border-linea bg-superficie shadow-alta">
        <div className="flex h-[26px] items-center justify-center border-b border-linea-fina bg-papel-suave">
          <span className="font-mono text-[0.58rem] tracking-wide text-tinta-suave">tumenusmart.com</span>
        </div>
        <div className="px-3.5 pb-4 pt-3.5">
          <div className="flex items-center gap-2 border-b border-linea-fina pb-2.5">
            <span className="flex h-[32px] w-[32px] flex-none items-center justify-center rounded-full bg-brand-light text-[0.78rem] font-bold text-brand">
              {iniciales || "DM"}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[0.83rem] font-semibold tracking-titular">{nombreLocal}</span>
              <span className="block text-[0.62rem] font-medium text-exito">● Abierto ahora</span>
            </span>
          </div>
          <Plato nombre="Pizza muzzarella" descripcion="Salsa, muzzarella y orégano" precio="55.000" tono="a" />
          <Plato nombre="Pizza napolitana" descripcion="Tomate y ajo" precio="65.000" tono="b" />
          <Plato nombre="Empanada de carne" descripcion="Unidad" precio="10.000" tono="c" ultimo />
          <div className="mt-3 flex items-center justify-between rounded-xl bg-brand px-3 py-2.5 text-[0.7rem] font-semibold text-white">
            <span>Ver mi pedido · 3 ítems</span>
            <span className="cifra text-[0.72rem]">Gs. 130.000</span>
          </div>
        </div>
      </div>

      <div className="mr-[110px] h-[22px] w-px self-end bg-gradient-to-b from-transparent to-linea" />
      <p className="mb-1 mt-1 self-end font-mono text-[0.6rem] uppercase tracking-[0.12em] text-tinta-suave">
        Y al local le llega esto
      </p>

      <div className="w-[min(250px,76vw)] self-end overflow-hidden rounded-2xl border border-linea bg-superficie shadow-media">
        <div className="flex items-center gap-1.5 bg-exito px-3 py-1.5 text-[0.64rem] font-semibold text-white">
          WhatsApp · {nombreLocal}
        </div>
        <div className="bg-[#F2F0EA] p-2.5">
          <div className="rounded-lg bg-white p-2.5 text-[0.63rem] leading-relaxed text-tinta-media shadow-sm">
            <strong className="font-semibold text-tinta">Pedido #0042</strong>
            <br />
            Carlos B. · 0981 234 567
            <br />
            2× Pizza muzzarella
            <br />
            1× Empanada de carne
            <br />
            Envío: Zona 2
            <span className="mt-1.5 flex justify-between border-t border-linea-fina pt-1.5 font-semibold text-tinta">
              <span>Total</span>
              <span className="cifra">Gs. 130.000</span>
            </span>
            <span className="mt-1 block text-right text-[0.54rem] text-tinta-suave">21:04 ✓✓</span>
          </div>
        </div>
      </div>
    </div>
  );
}
