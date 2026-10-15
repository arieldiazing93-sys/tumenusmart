"use client";

import { Entrada } from "@/components/ui";
import { leerCantidadEscrita } from "@/lib/cantidad-escrita";

/**
 * La cantidad que se escribe ANTES de tocar el producto («35», o «0,250» para 250 g de un producto por kilo). Va arriba de los productos,
 * a la izquierda, en blanco: sin escribir nada, cada toque suma de a uno como siempre. Es opcional y es para las cantidades grandes.
 *
 * No hace nada por su cuenta: la pantalla lee el texto al tocar el producto (ver `cargaDeProducto`) y lo borra después de usarlo.
 * Solo deja escribir números, coma y punto: nunca borra el punto o la coma en silencio, porque «0.250» no es 250 unidades.
 */
export function CantidadPrevia({
  valor,
  onCambio,
  error,
}: {
  valor: string;
  onCambio: (texto: string) => void;
  /** Por qué no se pudo cargar con esa cantidad (se muestra en rojo al lado). */
  error: string | null;
}) {
  const escrita = leerCantidadEscrita(valor);
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <label htmlFor="pos-cantidad-previa" className="text-[0.78rem] font-bold uppercase tracking-rotulo text-tinta">
        Cantidad
      </label>
      <Entrada
        id="pos-cantidad-previa"
        value={valor}
        onChange={(e) => onCambio(e.target.value.replace(/[^\d.,]/g, "").slice(0, 8))}
        inputMode="decimal"
        autoComplete="off"
        // Blanco y vacío a propósito: nada preescrito, nada seleccionado, sin atajos.
        style={{ backgroundColor: "#ffffff" }}
        invalido={escrita.tipo === "invalida" || !!error}
        aria-describedby="pos-cantidad-ayuda"
        // Con borde bien marcado (el campo blanco sobre el fondo blanco no se veía); en rojo si la cantidad no sirve.
        className={`!h-10 !w-28 !border-2 text-center text-[1rem] font-semibold focus:!border-brand ${
          escrita.tipo === "invalida" || error ? "!border-peligro" : "!border-tinta/70"
        }`}
      />
      <span id="pos-cantidad-ayuda" className="min-w-0 text-[0.78rem] leading-snug text-tinta-suave">
        {escrita.tipo === "entera" ? (
          <span className="font-medium text-tinta">
            Ahora cada producto que toques suma <strong>{escrita.valor}</strong>.
          </span>
        ) : escrita.tipo === "decimal" ? (
          <span className="font-medium text-tinta">
            Con decimales ({String(escrita.valor).replace(".", ",")}): para productos por kilo, litro u hora (1,5 = una hora y media).
          </span>
        ) : (
          "Opcional: escribí la cantidad (35), el peso (0,250 = 250 g) o las horas de una cancha (1,5) y después tocá el producto."
        )}
      </span>
      {(error || escrita.tipo === "invalida") && (
        <p role="alert" className="basis-full text-[0.8rem] font-medium text-peligro">
          {error ?? (escrita.tipo === "invalida" ? escrita.error : "")}
        </p>
      )}
    </div>
  );
}
