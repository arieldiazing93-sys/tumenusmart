"use client";

import { useState } from "react";

/**
 * Paleta curada para elegir rápido, más el selector nativo del navegador y
 * un campo de hex para cualquier color puntual. Se manda como un solo
 * input hidden — el resto del formulario (`actualizarStore`) no cambia:
 * ya validaba cualquier hex que llegara.
 */
const PALETA = [
  "#5B8DEF",
  "#1668C4",
  "#12539C",
  "#2DD4BF",
  "#16794F",
  "#3CA66B",
  "#A6CE39",
  "#F4D35E",
  "#F5A623",
  "#E8702A",
  "#D2501F",
  "#C1440E",
  "#E63946",
  "#A32F2C",
  "#C81D4E",
  "#E0777A",
  "#F797B7",
  "#D98CC7",
  "#9B6FB0",
  "#6D4AA8",
];

export function PaletaColorPicker({ colorInicial }: { colorInicial: string }) {
  const [color, setColor] = useState(colorInicial);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-2">
        {PALETA.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            aria-label={`Elegir color ${c}`}
            aria-pressed={color.toLowerCase() === c.toLowerCase()}
            className={`h-8 w-8 flex-none rounded-full border-2 transition-transform ${
              color.toLowerCase() === c.toLowerCase()
                ? "scale-110 border-azul"
                : "border-transparent hover:scale-105"
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-tinta-suave">Color personalizado</span>
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          aria-label="Elegir un color personalizado"
          className="h-9 w-9 flex-none cursor-pointer rounded-lg border border-linea p-0.5"
        />
        <input
          type="text"
          value={color}
          onChange={(e) => {
            const v = e.target.value.trim();
            setColor(v.startsWith("#") || v === "" ? v : `#${v}`);
          }}
          maxLength={7}
          placeholder="#D2501F"
          className="w-24 rounded-lg border border-linea px-2 py-1.5 text-sm uppercase"
        />
      </div>

      <input type="hidden" name="colorPrimario" value={color} />
    </div>
  );
}
