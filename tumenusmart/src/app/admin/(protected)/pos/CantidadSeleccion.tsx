"use client";

import { useEffect, useState } from "react";
import { Entrada } from "@/components/ui";
import { Segmentado } from "@/components/Segmentado";
import { formatearGuarani } from "@/lib/format";
import { montoPorPeso, pesoDesdeEscrito, textoDePeso } from "@/lib/unidad-medida";

/** Lo más que se carga de un mismo producto en una línea (el servidor tiene el mismo tope: LIMITES_DE_CAJA). */
export const CANTIDAD_MAXIMA_EN_CAJA = 1000;

/** Cantidades que se usan seguido para un evento: un toque y queda cargada. */
const ATAJOS = [10, 20, 50, 100];

export type PorPeso = {
  /** "kilogramo" | "litro": en qué se vende el producto. */
  unidad: string;
  /** El precio de lista por kilogramo (o litro), ya con la promoción vigente. */
  precioLista: number;
  /** Lo que se pesó (0,35 = 350 g); undefined = todavía sin pesar (se vende 1 unidad entera al precio de lista). */
  peso?: number;
  /** Lo que suman los agregados de la línea (no se multiplica por el peso). */
  precioAgregados: number;
};

/**
 * El control mínimo de abajo de la lista de la cuenta: «Cantidad de la selección». Sirve para la línea elegida:
 *
 *  - Escribir la cantidad directo (50 empanadas para un evento) en vez de tocar «+» cincuenta veces, o tocar un atajo (10, 20, 50, 100).
 *  - Si el producto se vende por kilogramo o por litro: escribir lo que se pesó, en gramos o en kilos (mililitros o litros), y ver al
 *    instante cuánto le corresponde en el monto. El servidor hace la misma cuenta al cobrar.
 *
 * No guarda nada por su cuenta: avisa a la pantalla con `onCantidad` / `onPeso` y la cuenta se arma con eso.
 */
export function CantidadSeleccion({
  nombre,
  cantidad,
  porPeso,
  onCantidad,
  onPeso,
}: {
  nombre: string;
  cantidad: number;
  /** Solo si el producto se vende por kilogramo o por litro. */
  porPeso: PorPeso | null;
  onCantidad: (cantidad: number) => void;
  onPeso: (peso: number | undefined) => void;
}) {
  const litro = porPeso?.unidad === "litro";
  const [cantidadTexto, setCantidadTexto] = useState(String(cantidad));
  // La unidad chica (g / ml) es la que se usa para porciones; arranca en ella salvo que lo pesado ya sea de un kilo o más.
  const pesoActual = porPeso?.peso;
  const [enChico, setEnChico] = useState(pesoActual === undefined ? true : pesoActual < 1);
  const [pesoTexto, setPesoTexto] = useState(() => textoInicialDePeso(pesoActual, pesoActual === undefined ? true : pesoActual < 1));

  // Si la cantidad cambia desde afuera (con los botones «+» y «−» de la línea), el campo la sigue.
  useEffect(() => {
    setCantidadTexto((previo) => (Number(previo) === cantidad ? previo : String(cantidad)));
  }, [cantidad]);

  function cambiarCantidad(texto: string) {
    const soloDigitos = texto.replace(/\D/g, "").slice(0, 4);
    setCantidadTexto(soloDigitos);
    const n = Number(soloDigitos);
    if (soloDigitos === "" || n < 1) return;
    const dentro = Math.min(n, CANTIDAD_MAXIMA_EN_CAJA);
    if (dentro !== n) setCantidadTexto(String(dentro));
    onCantidad(dentro);
  }

  function aplicarAtajo(n: number) {
    setCantidadTexto(String(n));
    onCantidad(n);
  }

  function cambiarPeso(texto: string, chico: boolean) {
    setPesoTexto(texto);
    if (texto.trim() === "") {
      onPeso(undefined);
      return;
    }
    const peso = pesoDesdeEscrito(texto, chico);
    if (peso !== null) onPeso(peso);
  }

  const pesoEscrito = porPeso && pesoTexto.trim() !== "" ? pesoDesdeEscrito(pesoTexto, enChico) : null;
  const pesoInvalido = !!porPeso && pesoTexto.trim() !== "" && pesoEscrito === null;
  // Lo que vale UNA porción del peso escrito (la cuenta que hace el servidor: precio × peso al guaraní, más los agregados).
  const montoPorcion =
    porPeso && pesoEscrito !== null ? montoPorPeso(porPeso.precioLista, pesoEscrito) + porPeso.precioAgregados : null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-azul/30 bg-azul-luz/40 p-2.5">
      <p className="truncate text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
        Cantidad de la selección · <span className="normal-case tracking-normal text-tinta">{nombre}</span>
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        <Entrada
          value={cantidadTexto}
          onChange={(e) => cambiarCantidad(e.target.value)}
          onBlur={() => setCantidadTexto(String(cantidad))}
          inputMode="numeric"
          autoComplete="off"
          aria-label="Cantidad"
          className="!h-9 !w-20 !px-2 text-center font-semibold"
        />
        {ATAJOS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => aplicarAtajo(n)}
            aria-label={`Cargar ${n}`}
            className={`h-9 min-w-9 rounded-lg border px-2 text-[0.82rem] font-semibold transition-colors active:scale-95 ${
              cantidad === n ? "border-azul bg-azul text-white" : "border-azul/35 bg-white text-azul-oscuro hover:bg-azul-luz"
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      {porPeso && (
        <div className="flex flex-col gap-1.5 border-t border-azul/20 pt-2">
          <p className="text-[0.74rem] text-tinta-media">
            Se vende por {litro ? "litro" : "kilogramo"}: <span className="cifra font-medium text-tinta">{formatearGuarani(porPeso.precioLista)}</span>{" "}
            el {litro ? "litro" : "kilo"}. Escribí lo que {litro ? "se midió" : "se pesó"} y te calcula el monto.
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Entrada
              value={pesoTexto}
              onChange={(e) => cambiarPeso(e.target.value, enChico)}
              inputMode="decimal"
              autoComplete="off"
              placeholder={enChico ? (litro ? "ej. 250" : "ej. 350") : "ej. 1,5"}
              aria-label={litro ? "Cuánto se midió" : "Cuánto se pesó"}
              invalido={pesoInvalido}
              className="!h-9 !w-24 !px-2 text-center font-semibold"
            />
            <Segmentado
              opciones={[
                { value: "chico", label: litro ? "ml" : "g" },
                { value: "grande", label: litro ? "L" : "kg" },
              ]}
              valor={enChico ? "chico" : "grande"}
              onChange={(v) => {
                const chico = v === "chico";
                setEnChico(chico);
                // Al cambiar de unidad el texto se queda y se vuelve a calcular ("350" g → "350" kg).
                if (pesoTexto.trim() !== "") cambiarPeso(pesoTexto, chico);
              }}
              className="!gap-1"
            />
          </div>
          {pesoInvalido && (
            <p className="text-[0.76rem] font-medium text-peligro">
              No es un peso válido: de 1 {litro ? "ml" : "g"} a 999 {litro ? "L" : "kg"}.
            </p>
          )}
          {montoPorcion !== null && pesoEscrito !== null && (
            <p className="text-[0.84rem] text-tinta">
              {textoDePeso(pesoEscrito, porPeso.unidad)} ={" "}
              <strong className="cifra text-[0.95rem]">{formatearGuarani(montoPorcion)}</strong>
              {cantidad > 1 && (
                <span className="text-tinta-media">
                  {" "}
                  · ×{cantidad} = <span className="cifra font-medium text-tinta">{formatearGuarani(montoPorcion * cantidad)}</span>
                </span>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** El peso que ya tenía la línea, como se escribe: en gramos si es de menos de un kilo, en kilos si no. */
function textoInicialDePeso(peso: number | undefined, enChico: boolean): string {
  if (peso === undefined) return "";
  if (enChico) return String(Math.round(peso * 1000));
  return String(Math.round(peso * 1000) / 1000).replace(".", ",");
}
