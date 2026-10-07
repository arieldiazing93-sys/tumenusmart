"use client";

import { useState } from "react";
import { Campo, Entrada, Selector } from "@/components/ui";
import { TIPOS_IDENTIFICACION_FISCAL, etiquetaTipoIdentificacion } from "@/lib/tipo-cliente";
import { limpiarTexto } from "@/lib/datos-fiscales";
import { buscarClienteFiscalPorNumero, type ClienteFiscalEncontrado } from "./actions";

/** La ficha fiscal de un cliente tal como se escribe en pantalla (todo texto). */
export type FichaFiscal = { tipo: string; numero: string; razon: string; email: string };

export function fichaVacia(): FichaFiscal {
  return { tipo: TIPOS_IDENTIFICACION_FISCAL[0].valor, numero: "", razon: "", email: "" };
}

/** Lo que dijo la lupa del número de documento: el cliente ya existe (uno o varios parecidos), no existe o falló. */
type Busqueda =
  | { estado: "existe" | "varios"; resultados: ClienteFiscalEncontrado[] }
  | { estado: "nuevo" }
  | { estado: "error"; mensaje: string }
  | null;

/**
 * Los campos de la ficha fiscal de un cliente: número de documento (con la lupa que busca si ya está en el sistema y trae sus datos),
 * tipo, razón social y correo. Lo usan el paso 1 de Nuevo pedido y el cobro del pedido, con la misma ficha en los dos lugares.
 */
export function CamposFiscalesCliente({
  idBase,
  ficha,
  onCambiar,
  avisoRecurrente,
}: {
  /** El id del campo de número (distinto en cada lugar donde se use, para que las etiquetas apunten bien). */
  idBase: string;
  ficha: FichaFiscal;
  onCambiar: (ficha: FichaFiscal) => void;
  /** Los datos se completaron solos con los de la última factura de este cliente: se avisa que los revise. */
  avisoRecurrente?: boolean;
}) {
  const [busqueda, setBusqueda] = useState<Busqueda>(null);
  const [buscando, setBuscando] = useState(false);
  /** La razón social y el correo los trajo la lupa (y nadie los tocó después): son de ESE número, no de otro que se escriba. */
  const [trajoDatos, setTrajoDatos] = useState(false);
  const datosAutocompletados = trajoDatos || !!avisoRecurrente;

  /** Trae a la ficha los datos de un cliente fiscal que ya estaba en el sistema. */
  function aplicar(c: ClienteFiscalEncontrado) {
    setTrajoDatos(true);
    onCambiar({
      tipo: TIPOS_IDENTIFICACION_FISCAL.some((t) => t.valor === c.tipoIdentificacion) ? c.tipoIdentificacion : "ruc",
      numero: c.numeroIdentificacion,
      razon: c.razonSocial,
      email: c.email ?? "",
    });
  }

  /** La lupa: ¿ya existe este número en el sistema? Si existe se cargan sus datos; si no, se crea al guardar. */
  function buscar() {
    const texto = limpiarTexto(ficha.numero);
    if (texto.length < 3 || buscando) return;
    setBusqueda(null);
    setBuscando(true);
    buscarClienteFiscalPorNumero(texto)
      .then((r) => {
        const exactos = r.filter((c) => c.numeroIdentificacion.toLowerCase() === texto.toLowerCase());
        if (r.length === 0) {
          setBusqueda({ estado: "nuevo" });
          // Si la razón social y el correo eran de la búsqueda anterior, no corresponden a este número: se sacan (se carga la nueva).
          if (datosAutocompletados) {
            onCambiar({ ...ficha, razon: "", email: "" });
            setTrajoDatos(false);
          }
        } else if (exactos.length === 1 || r.length === 1) {
          // Un solo candidato (aunque lo escrito sea una parte del número): se completa todo en el acto.
          const elegido = exactos.length === 1 ? exactos[0] : r[0];
          aplicar(elegido);
          setBusqueda({ estado: "existe", resultados: [elegido] });
        } else {
          setBusqueda({ estado: "varios", resultados: r });
        }
      })
      .catch(() => setBusqueda({ estado: "error", mensaje: "No se pudo buscar. Revisá la conexión y probá de nuevo." }))
      .finally(() => setBuscando(false));
  }

  return (
    <>
      {avisoRecurrente && !busqueda && (
        <p className="rounded-lg border border-exito/40 bg-exito-luz px-2.5 py-1.5 text-[0.78rem] font-medium text-exito">
          Cliente recurrente: se cargaron los datos de su última factura. Revisalos.
        </p>
      )}
      {/* Primero el número, con la lupa: si el cliente ya está en el sistema se traen sus datos; si no, se crea al guardar. */}
      <div>
        <label htmlFor={idBase} className="mb-1.5 block text-[0.82rem] font-semibold text-tinta">
          Número de documento
        </label>
        <span className="mb-1.5 block text-[0.78rem] text-tinta-suave">
          {ficha.tipo === "ruc" ? "Con su dígito verificador: 80012345-6" : "Tocá la lupa para ver si ya está en el sistema"}
        </span>
        <div className="flex items-center gap-2">
          <Entrada
            id={idBase}
            value={ficha.numero}
            onChange={(e) => {
              // Con otro número, la razón social y el correo que trajo una búsqueda anterior ya no son de este cliente: se sacan.
              onCambiar(datosAutocompletados ? { ...ficha, numero: e.target.value, razon: "", email: "" } : { ...ficha, numero: e.target.value });
              setTrajoDatos(false);
              setBusqueda(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                buscar();
              }
            }}
            placeholder="80012345-6"
            maxLength={30}
            autoComplete="off"
            className="min-w-0 flex-1"
          />
          <button
            type="button"
            onClick={buscar}
            disabled={buscando || limpiarTexto(ficha.numero).length < 3}
            aria-label="Buscar en el sistema si ya existe"
            title="Buscar en el sistema si ya existe"
            // Azul sólido, igual que la lupa del teléfono, y de la misma altura que el campo.
            className="flex flex-none items-center justify-center self-stretch rounded-lg bg-azul px-3 text-white transition-colors hover:bg-azul-oscuro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azul/40 disabled:pointer-events-none disabled:opacity-40"
          >
            {buscando ? (
              "…"
            ) : (
              <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            )}
          </button>
        </div>
        {busqueda?.estado === "existe" && (
          <p className="mt-1.5 rounded-lg border border-exito/40 bg-exito-luz px-2.5 py-1.5 text-[0.78rem] font-medium text-exito">
            Ya existe en el sistema: se cargaron su tipo de documento, razón social y correo. Revisalos.
          </p>
        )}
        {busqueda?.estado === "nuevo" && (
          <p className="mt-1.5 rounded-lg border border-amarillo/60 bg-amarillo-luz px-2.5 py-1.5 text-[0.78rem] font-medium text-amarillo-oscuro">
            No existe en el sistema: cargá la razón social y se guarda como cliente.
          </p>
        )}
        {busqueda?.estado === "varios" && (
          <div className="mt-1.5 flex flex-col gap-1.5">
            <p className="text-[0.78rem] font-medium text-tinta-media">Hay varios parecidos: elegí el que corresponde.</p>
            {busqueda.resultados.map((c) => (
              <button
                key={`${c.tipoIdentificacion}-${c.numeroIdentificacion}`}
                type="button"
                onClick={() => {
                  aplicar(c);
                  setBusqueda({ estado: "existe", resultados: [c] });
                }}
                className="rounded-lg border-2 border-azul/50 bg-azul-luz/40 px-2.5 py-1.5 text-left hover:bg-azul-luz"
              >
                <span className="cifra block text-[0.86rem] font-semibold text-tinta">{c.numeroIdentificacion}</span>
                <span className="block text-[0.8rem] text-tinta-media">
                  {c.razonSocial} · {etiquetaTipoIdentificacion(c.tipoIdentificacion)}
                </span>
              </button>
            ))}
          </div>
        )}
        {busqueda?.estado === "error" && <p className="mt-1.5 text-[0.78rem] font-medium text-peligro">{busqueda.mensaje}</p>}
      </div>
      <Campo etiqueta="Tipo de documento">
        <Selector value={ficha.tipo} onChange={(e) => onCambiar({ ...ficha, tipo: e.target.value })}>
          {TIPOS_IDENTIFICACION_FISCAL.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.etiqueta}
            </option>
          ))}
        </Selector>
      </Campo>
      <Campo etiqueta="Razón social">
        <Entrada
          value={ficha.razon}
          onChange={(e) => {
            onCambiar({ ...ficha, razon: e.target.value });
            setTrajoDatos(false);
          }}
          maxLength={120}
        />
      </Campo>
      <Campo etiqueta="Correo (opcional)">
        <Entrada
          type="email"
          value={ficha.email}
          onChange={(e) => {
            onCambiar({ ...ficha, email: e.target.value });
            setTrajoDatos(false);
          }}
          maxLength={120}
        />
      </Campo>
    </>
  );
}
