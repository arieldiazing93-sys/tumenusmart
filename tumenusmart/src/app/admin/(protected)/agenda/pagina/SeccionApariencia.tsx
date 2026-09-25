"use client";

import { useEffect, useState } from "react";
import { Entrada, Tarjeta } from "@/components/ui";
import { iniciales } from "@/lib/agenda";
import { derivarPaletaMarca, esHexValido } from "@/lib/color-marca";
import { COLORES_PAGINA, TEMAS_PAGINA, type TemaPagina } from "@/lib/pagina-reservas";
import type { PropsSeccion } from "./tipos";

/**
 * Personalización de apariencia: el color de la página y si el fondo es claro,
 * oscuro o automático (sigue al celular de quien mira).
 *
 * Los textos y los botones se ajustan solos al cambiar de tema: el texto pasa a
 * claro sobre fondo oscuro y viceversa, así nunca queda ilegible. Abajo hay una
 * vista previa que cambia en vivo.
 */
export function SeccionApariencia({ datos, cambiar }: PropsSeccion) {
  // Lo que se va escribiendo en el campo del código, aunque todavía no sea un color completo.
  const [hexEscrito, setHexEscrito] = useState(datos.colorPrimario);
  useEffect(() => {
    setHexEscrito(datos.colorPrimario);
  }, [datos.colorPrimario]);

  function alEscribirHex(valor: string) {
    const conNumeral = valor.startsWith("#") ? valor : `#${valor}`;
    setHexEscrito(conNumeral.slice(0, 7).toUpperCase());
    if (esHexValido(conNumeral) && conNumeral.length === 7) cambiar({ colorPrimario: conNumeral.toUpperCase() });
  }

  const paleta = derivarPaletaMarca(datos.colorPrimario);
  const variables = {
    "--brand": paleta.brand,
    "--brand-dark": paleta.brandDark,
    "--brand-light": paleta.brandLight,
    "--brand-tinte": paleta.brandTinte,
    "--brand-texto": paleta.brandTexto,
  } as React.CSSProperties;

  return (
    <Tarjeta className="flex flex-col gap-6">
      {/* ---------- color ---------- */}
      <section>
        <h3 className="text-[1rem] font-semibold tracking-titular text-tinta">Color de la página</h3>
        <p className="mt-0.5 text-[0.82rem] text-tinta-media">
          Se usa en los botones, los iconos y los detalles. Elegí uno o escribí el código.
        </p>

        <div className="mt-3 flex flex-wrap gap-2.5">
          {COLORES_PAGINA.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => cambiar({ colorPrimario: c })}
              aria-label={`Color ${c}`}
              aria-pressed={datos.colorPrimario === c}
              style={{ backgroundColor: c }}
              className={`h-9 w-9 rounded-full border-2 transition-transform duration-100 ${
                datos.colorPrimario === c ? "scale-110 border-tinta" : "border-transparent hover:scale-105"
              }`}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <input
            type="color"
            value={datos.colorPrimario}
            onChange={(e) => cambiar({ colorPrimario: e.target.value.toUpperCase() })}
            aria-label="Elegir otro color"
            className="h-10 w-12 cursor-pointer rounded-lg border border-linea bg-transparent p-1"
          />
          <div className="w-32">
            <Entrada
              value={hexEscrito}
              onChange={(e) => alEscribirHex(e.target.value)}
              maxLength={7}
              spellCheck={false}
              aria-label="Código del color"
              className="cifra uppercase"
            />
          </div>
          <span className="text-[0.78rem] text-tinta-suave">Color personalizado</span>
        </div>
      </section>

      {/* ---------- tema ---------- */}
      <section>
        <h3 className="text-[1rem] font-semibold tracking-titular text-tinta">Fondo de la página</h3>
        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3" role="radiogroup" aria-label="Tema de la página">
          {TEMAS_PAGINA.map((t) => {
            const elegido = datos.tema === t.valor;
            return (
              <button
                key={t.valor}
                type="button"
                role="radio"
                aria-checked={elegido}
                onClick={() => cambiar({ tema: t.valor })}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                  elegido ? "border-brand bg-brand-light" : "border-linea bg-superficie hover:border-brand"
                }`}
              >
                <MuestraTema tema={t.valor} />
                <span className="min-w-0">
                  <span className={`block text-[0.9rem] font-semibold ${elegido ? "text-brand-texto" : "text-tinta"}`}>
                    {t.etiqueta}
                  </span>
                  <span className="block text-[0.76rem] text-tinta-suave">{t.ayuda}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ---------- vista previa ---------- */}
      <section>
        <h3 className="text-[1rem] font-semibold tracking-titular text-tinta">Así se ve</h3>
        {/* data-tema reescribe los colores solo adentro de esta caja: es el mismo mecanismo de la página real. */}
        <div
          data-tema={datos.tema}
          style={variables}
          className="mt-3 max-w-sm overflow-hidden rounded-xl border border-linea bg-papel-suave text-tinta"
        >
          <div
            className="h-16"
            style={{ backgroundImage: "linear-gradient(135deg, rgb(var(--brand)), rgb(var(--brand-dark)))" }}
          />
          <div className="px-4 pb-4">
            <div className="-mt-7 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-4 border-papel bg-brand-light text-[0.9rem] font-semibold text-brand-texto">
              {datos.fotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={datos.fotoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                iniciales(datos.nombre || "?")
              )}
            </div>
            <p className="mt-1.5 text-[1rem] font-semibold text-tinta">{datos.nombre || "Tu negocio"}</p>
            <p className="text-[0.82rem] text-tinta-media">{datos.industria || "Tu rubro"}</p>
            <div className="mt-3 rounded-lg border border-linea bg-superficie p-3 text-[0.82rem] text-tinta-media">
              Así se leen los textos y las tarjetas de tu página, con el fondo que elegiste.
            </div>
            <div className="mt-3 flex h-10 items-center justify-center rounded-lg bg-brand text-[0.88rem] font-semibold text-white">
              Crear cita
            </div>
          </div>
        </div>
      </section>
    </Tarjeta>
  );
}

/** El cuadradito de cada opción de tema: blanco, negro, o mitad y mitad. */
function MuestraTema({ tema }: { tema: TemaPagina }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-10 w-10 flex-none overflow-hidden rounded-lg border border-linea"
      style={
        tema === "claro"
          ? { backgroundColor: "#FFFFFF" }
          : tema === "oscuro"
            ? { backgroundColor: "#131417" }
            : { backgroundImage: "linear-gradient(90deg, #FFFFFF 50%, #131417 50%)" }
      }
    />
  );
}
