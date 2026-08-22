type Punto = { etiqueta: string; total: number };

// Gráfico de barras simple hecho a mano en SVG — no depende de ninguna
// librería de gráficos, así que no hace falta instalar nada nuevo.
// `sufijoTooltip` y `color` permiten reutilizarlo para cualquier serie
// diaria (ventas en Gs., cantidad de reservas, etc.) sin duplicar el SVG.
export function VentasPorDiaChart({
  datos,
  sufijoTooltip = "Gs.",
  color = "#e05d2f",
}: {
  datos: Punto[];
  sufijoTooltip?: string;
  color?: string;
}) {
  const alto = 160;
  const anchoBarra = 28;
  const espacio = 10;
  const margenIzq = 8;
  const margenSup = 12;
  const anchoTotal = margenIzq * 2 + datos.length * (anchoBarra + espacio);
  const maximo = Math.max(1, ...datos.map((d) => d.total));

  if (datos.length === 0) {
    return <p className="text-sm text-neutral-400">Sin datos en este período.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <svg
        width={anchoTotal}
        height={alto + 40}
        viewBox={`0 0 ${anchoTotal} ${alto + 40}`}
        className="min-w-full"
      >
        {datos.map((d, i) => {
          const alturaBarra = Math.max(2, (d.total / maximo) * alto);
          const x = margenIzq + i * (anchoBarra + espacio);
          const y = margenSup + (alto - alturaBarra);
          return (
            <g key={i}>
              <title>{`${d.etiqueta}: ${d.total.toLocaleString("es-PY")} ${sufijoTooltip}`}</title>
              <rect
                x={x}
                y={y}
                width={anchoBarra}
                height={alturaBarra}
                rx={4}
                fill={color}
                fillOpacity={0.85}
              />
              <text
                x={x + anchoBarra / 2}
                y={alto + margenSup + 16}
                textAnchor="middle"
                fontSize="10"
                fill="#737373"
              >
                {d.etiqueta}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
