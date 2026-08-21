"use client";

import { useState } from "react";

export function IngredientesField({ initial }: { initial: string[] }) {
  const [ingredientes, setIngredientes] = useState<string[]>(initial);
  const [texto, setTexto] = useState("");

  function agregarDesdeTexto() {
    const nombre = texto.trim().replace(/,$/, "").trim();
    if (!nombre) return;
    if (!ingredientes.some((i) => i.toLowerCase() === nombre.toLowerCase())) {
      setIngredientes((actuales) => [...actuales, nombre]);
    }
    setTexto("");
  }

  function quitar(nombre: string) {
    setIngredientes((actuales) => actuales.filter((i) => i !== nombre));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      agregarDesdeTexto();
    }
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-neutral-700">
        Ingredientes (opcional)
      </label>
      <p className="mb-2 text-xs text-neutral-500">
        El cliente va a poder sacar los que no quiera al pedir. Escribí uno y apretá Enter o
        coma para agregarlo.
      </p>

      {ingredientes.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {ingredientes.map((ing) => (
            <span
              key={ing}
              className="flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-sm text-neutral-700"
            >
              {ing}
              <button
                type="button"
                onClick={() => quitar(ing)}
                className="text-neutral-400 hover:text-red-500"
                aria-label={`Quitar ${ing}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={agregarDesdeTexto}
        placeholder="cebolla, tomate, queso..."
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
      />

      <input type="hidden" name="ingredientes" value={JSON.stringify(ingredientes)} />
    </div>
  );
}
