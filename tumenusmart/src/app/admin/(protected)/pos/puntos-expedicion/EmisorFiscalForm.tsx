"use client";

import { useEffect, useState, useTransition } from "react";
import { Campo, Entrada, Selector, Tarjeta, clasesBoton } from "@/components/ui";
import type { OpcionGeografica } from "@/lib/sifen/geografia";
import {
  DEPARTAMENTOS,
  MAX_ACTIVIDADES,
  TIPOS_CONTRIBUYENTE,
  faltantesEmisor,
  type ActividadEconomica,
  type DatosEmisor,
} from "@/lib/emisor-fiscal";
import { guardarEmisorFiscal, listarCiudades, listarDistritos } from "./actions";

/** La tabla oficial de la DNIT trae los 17 departamentos y Capital; los códigos 19 y 20 del esquema no tienen distritos. */
const DEPARTAMENTOS_CON_DISTRITOS = 18;

/** Un campo de texto en el estado del formulario: siempre string, "" = sin cargar. */
type Estado = {
  tipoContribuyente: string;
  tipoRegimen: string;
  nombreFantasia: string;
  denominacionSucursal: string;
  telefono: string;
  email: string;
  direccion: string;
  numeroCasa: string;
  complemento: string;
  departamento: string;
  distritoCodigo: string;
  distrito: string;
  ciudadCodigo: string;
  ciudad: string;
  actividades: ActividadEconomica[];
};

function aEstado(d: DatosEmisor): Estado {
  return {
    tipoContribuyente: d.tipoContribuyente ?? "",
    tipoRegimen: d.tipoRegimen === null ? "" : String(d.tipoRegimen),
    nombreFantasia: d.nombreFantasia ?? "",
    denominacionSucursal: d.denominacionSucursal ?? "",
    telefono: d.telefono ?? "",
    email: d.email ?? "",
    direccion: d.direccion ?? "",
    numeroCasa: d.numeroCasa ?? "",
    complemento: d.complemento ?? "",
    departamento: d.departamento ?? "",
    distritoCodigo: d.distritoCodigo === null ? "" : String(d.distritoCodigo),
    distrito: d.distrito ?? "",
    ciudadCodigo: d.ciudadCodigo === null ? "" : String(d.ciudadCodigo),
    ciudad: d.ciudad ?? "",
    actividades: d.actividades.map((a) => ({ ...a })),
  };
}

/** Lo mismo que aEstado pero al revés, para medir qué falta mientras se escribe. */
function aDatos(e: Estado): DatosEmisor {
  const t = (v: string) => (v.trim() === "" ? null : v.trim());
  const n = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v));
  return {
    tipoContribuyente: (t(e.tipoContribuyente) as DatosEmisor["tipoContribuyente"]) ?? null,
    tipoRegimen: n(e.tipoRegimen),
    nombreFantasia: t(e.nombreFantasia),
    denominacionSucursal: t(e.denominacionSucursal),
    telefono: t(e.telefono),
    email: t(e.email),
    direccion: t(e.direccion),
    numeroCasa: t(e.numeroCasa),
    complemento: t(e.complemento),
    departamento: t(e.departamento),
    distritoCodigo: n(e.distritoCodigo),
    distrito: t(e.distrito),
    ciudadCodigo: n(e.ciudadCodigo),
    ciudad: t(e.ciudad),
    actividades: e.actividades.filter((a) => a.codigo.trim() && a.descripcion.trim()),
  };
}

/**
 * Los datos del emisor que pide la factura ELECTRÓNICA (SIFEN). Todo es
 * opcional: con timbrado autoimpresor no hace falta cargar nada, y se puede
 * guardar a medias. Mientras se escribe, muestra qué falta para poder emitir
 * electrónico.
 */
export function EmisorFiscalForm({ inicial }: { inicial: DatosEmisor }) {
  const [estado, setEstado] = useState<Estado>(() => aEstado(inicial));
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  const faltan = faltantesEmisor(aDatos(estado));

  // Las listas de distritos y de ciudades salen de la tabla oficial de la DNIT y se piden al servidor a medida que se
  // elige: la tabla completa pesa demasiado para mandarla entera al celular.
  const [distritos, setDistritos] = useState<OpcionGeografica[]>([]);
  const [ciudades, setCiudades] = useState<OpcionGeografica[]>([]);
  const [cargandoDistritos, setCargandoDistritos] = useState(false);
  const [cargandoCiudades, setCargandoCiudades] = useState(false);

  useEffect(() => {
    let vigente = true;
    if (!estado.departamento) {
      setDistritos([]);
      return;
    }
    setCargandoDistritos(true);
    listarDistritos(estado.departamento)
      .then((lista) => {
        if (vigente) setDistritos(lista);
      })
      .catch(() => {
        if (vigente) setDistritos([]);
      })
      .finally(() => {
        if (vigente) setCargandoDistritos(false);
      });
    return () => {
      vigente = false;
    };
  }, [estado.departamento]);

  useEffect(() => {
    let vigente = true;
    if (!estado.distritoCodigo) {
      setCiudades([]);
      return;
    }
    setCargandoCiudades(true);
    listarCiudades(Number(estado.distritoCodigo))
      .then((lista) => {
        if (vigente) setCiudades(lista);
      })
      .catch(() => {
        if (vigente) setCiudades([]);
      })
      .finally(() => {
        if (vigente) setCargandoCiudades(false);
      });
    return () => {
      vigente = false;
    };
  }, [estado.distritoCodigo]);

  function cambiar<K extends keyof Estado>(campo: K, valor: Estado[K]) {
    setGuardado(false);
    setEstado((previo) => ({ ...previo, [campo]: valor }));
  }

  /** Al cambiar de departamento se borran el distrito y la ciudad: ya no corresponden. */
  function cambiarDepartamento(clave: string) {
    setGuardado(false);
    setEstado((previo) => ({ ...previo, departamento: clave, distritoCodigo: "", distrito: "", ciudadCodigo: "", ciudad: "" }));
  }

  function cambiarDistrito(codigo: string) {
    setGuardado(false);
    setEstado((previo) => ({ ...previo, distritoCodigo: codigo, distrito: "", ciudadCodigo: "", ciudad: "" }));
  }

  function cambiarActividad(indice: number, cambios: Partial<ActividadEconomica>) {
    cambiar(
      "actividades",
      estado.actividades.map((a, i) => (i === indice ? { ...a, ...cambios } : a))
    );
  }

  function guardar() {
    setError(null);
    iniciar(async () => {
      const resultado = await guardarEmisorFiscal({ ...estado });
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setGuardado(true);
    });
  }

  return (
    <Tarjeta className="mb-6 !border-2 !border-azul/50">
      <details className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
          <span className="block">
            <span className="rotulo block text-[0.8rem] font-bold">Factura electrónica: datos del emisor</span>
            <span className="mt-0.5 block text-[0.82rem] text-tinta-media">
              Opcional. Solo hace falta si vas a emitir factura electrónica (SIFEN); con timbrado autoimpresor no
              cargues nada.
            </span>
          </span>
          <span
            className={`rounded-full px-2.5 py-1 text-[0.74rem] font-semibold ${
              faltan.length === 0 ? "bg-exito-luz text-exito" : "bg-papel-hundido text-tinta-media"
            }`}
          >
            {faltan.length === 0 ? "Completo" : `Faltan ${faltan.length}`}
          </span>
        </summary>

        <div className="mt-4 flex flex-col gap-4">
          {faltan.length > 0 && (
            <div className="rounded-lg bg-papel-suave px-3 py-2 text-[0.8rem] text-tinta-media">
              <p className="font-medium text-tinta">Para poder emitir electrónico falta:</p>
              <ul className="mt-1 list-disc pl-5">
                {faltan.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Campo etiqueta="Tipo de contribuyente">
              <Selector value={estado.tipoContribuyente} onChange={(e) => cambiar("tipoContribuyente", e.target.value)}>
                <option value="">Sin definir</option>
                {TIPOS_CONTRIBUYENTE.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </Selector>
            </Campo>
            <Campo etiqueta="Nombre de fantasía" ayuda="Opcional">
              <Entrada value={estado.nombreFantasia} onChange={(e) => cambiar("nombreFantasia", e.target.value)} />
            </Campo>
            <Campo etiqueta="Nombre de la sucursal" ayuda="Opcional, hasta 30 caracteres">
              <Entrada
                value={estado.denominacionSucursal}
                maxLength={30}
                onChange={(e) => cambiar("denominacionSucursal", e.target.value)}
              />
            </Campo>
            <Campo etiqueta="Teléfono">
              <Entrada value={estado.telefono} onChange={(e) => cambiar("telefono", e.target.value)} placeholder="0981234567" />
            </Campo>
            <Campo etiqueta="Correo electrónico">
              <Entrada
                type="email"
                value={estado.email}
                onChange={(e) => cambiar("email", e.target.value)}
                placeholder="facturas@minegocio.com"
              />
            </Campo>
            <Campo etiqueta="Tipo de régimen" ayuda="Opcional, del 1 al 8">
              <Entrada
                inputMode="numeric"
                value={estado.tipoRegimen}
                onChange={(e) => cambiar("tipoRegimen", e.target.value)}
              />
            </Campo>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="sm:col-span-3">
              <Campo etiqueta="Dirección del establecimiento">
                <Entrada
                  value={estado.direccion}
                  onChange={(e) => cambiar("direccion", e.target.value)}
                  placeholder="Av. Mariscal López"
                />
              </Campo>
            </div>
            <Campo etiqueta="Número" ayuda="0 si no tiene">
              <Entrada inputMode="numeric" value={estado.numeroCasa} onChange={(e) => cambiar("numeroCasa", e.target.value)} />
            </Campo>
            <div className="sm:col-span-4">
              <Campo etiqueta="Complemento" ayuda="Opcional: entre calles, piso, local…">
                <Entrada value={estado.complemento} onChange={(e) => cambiar("complemento", e.target.value)} />
              </Campo>
            </div>
            <div className="sm:col-span-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Campo etiqueta="Departamento">
                <Selector value={estado.departamento} onChange={(e) => cambiarDepartamento(e.target.value)}>
                  <option value="">Elegí…</option>
                  {DEPARTAMENTOS.filter((d) => d.codigoSifen <= DEPARTAMENTOS_CON_DISTRITOS || d.clave === estado.departamento).map((d) => (
                    <option key={d.clave} value={d.clave}>
                      {d.etiqueta}
                    </option>
                  ))}
                </Selector>
              </Campo>
              <Campo etiqueta="Distrito" ayuda="Lista oficial de la DNIT">
                <Selector value={estado.distritoCodigo} disabled={!estado.departamento} onChange={(e) => cambiarDistrito(e.target.value)}>
                  <option value="">
                    {!estado.departamento ? "Primero el departamento" : cargandoDistritos ? "Cargando…" : "Elegí…"}
                  </option>
                  {distritos.map((d) => (
                    <option key={d.codigo} value={String(d.codigo)}>
                      {d.nombre}
                    </option>
                  ))}
                </Selector>
              </Campo>
              <Campo etiqueta="Ciudad o localidad" ayuda="Lista oficial de la DNIT">
                <Selector
                  value={estado.ciudadCodigo}
                  disabled={!estado.distritoCodigo}
                  onChange={(e) => cambiar("ciudadCodigo", e.target.value)}
                >
                  <option value="">
                    {!estado.distritoCodigo ? "Primero el distrito" : cargandoCiudades ? "Cargando…" : "Elegí…"}
                  </option>
                  {ciudades.map((c) => (
                    <option key={c.codigo} value={String(c.codigo)}>
                      {c.nombre}
                    </option>
                  ))}
                </Selector>
              </Campo>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[0.82rem] font-semibold text-tinta">Actividades económicas</p>
            <p className="mb-2 text-[0.78rem] text-tinta-suave">
              El código y la descripción como figuran en tu RUC (hasta {MAX_ACTIVIDADES}).
            </p>
            <div className="flex flex-col gap-2">
              {estado.actividades.map((a, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Entrada
                    className="w-28 flex-none"
                    value={a.codigo}
                    maxLength={8}
                    onChange={(e) => cambiarActividad(i, { codigo: e.target.value })}
                    placeholder="Código"
                    aria-label={`Código de la actividad ${i + 1}`}
                  />
                  <Entrada
                    value={a.descripcion}
                    maxLength={300}
                    onChange={(e) => cambiarActividad(i, { descripcion: e.target.value })}
                    placeholder="Descripción"
                    aria-label={`Descripción de la actividad ${i + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      cambiar(
                        "actividades",
                        estado.actividades.filter((_, idx) => idx !== i)
                      )
                    }
                    aria-label="Quitar esta actividad"
                    className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-tinta-suave transition-colors hover:bg-papel-suave hover:text-peligro"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            {estado.actividades.length < MAX_ACTIVIDADES && (
              <button
                type="button"
                onClick={() => cambiar("actividades", [...estado.actividades, { codigo: "", descripcion: "" }])}
                className={`${clasesBoton("navegar", "sm")} mt-2`}
              >
                + Agregar actividad
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={guardar} disabled={pendiente} className={clasesBoton("navegar")}>
              {pendiente ? "Guardando…" : "Guardar datos del emisor"}
            </button>
            {guardado && <span className="text-xs font-medium text-exito">✓ Guardado</span>}
            {error && <span className="text-xs font-medium text-peligro">{error}</span>}
          </div>
        </div>
      </details>
    </Tarjeta>
  );
}
