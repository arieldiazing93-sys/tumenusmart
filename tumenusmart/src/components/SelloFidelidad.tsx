function IconoCheckChico() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

function IconoRegaloChico() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <rect x="4" y="9" width="16" height="11" rx="1" />
      <path d="M4 9h16M12 9v11M8 9c-1.5 0-3-1-3-3s1.5-3 3-1c1 1 1.5 2.5 1.5 4M16 9c1.5 0 3-1 3-3s-1.5-3-3-1c-1 1-1.5 2.5-1.5 4" />
    </svg>
  );
}

/**
 * La tarjeta de sellos de fidelización: un circulito por pedido, hasta el
 * umbral. El último es el premio y se distingue siempre, esté cumplido o no
 * — es al que hay que llegar.
 *
 * Mismos colores que ya tienen ese significado en SeguimientoTracker: verde
 * para lo ya entregado, naranja reservado solo para el círculo del premio.
 *
 * El sello pendiente usa un fondo ámbar en vez de gris: esta tarjeta vive
 * DENTRO de un <Aviso> ya teñido (peach o verde), y gris sobre esos fondos
 * quedaba casi invisible. El ámbar es lo bastante distinto de ambos como
 * para notarse sin pisar el significado de "completado" (verde) ni el del
 * premio (naranja).
 */
export function SelloFidelidad({ progreso, umbral }: { progreso: number; umbral: number }) {
  const circulos = Array.from({ length: umbral }, (_, i) => i + 1);

  return (
    <div className="flex flex-wrap gap-2.5" aria-hidden="true">
      {circulos.map((n) => {
        const esPremio = n === umbral;
        const cumplido = n <= progreso;

        if (esPremio) {
          return (
            <div
              key={n}
              className={`flex h-8 w-8 flex-none items-center justify-center rounded-full ${
                cumplido
                  ? "bg-brand text-white"
                  : "border-2 border-dashed border-brand/50 text-brand"
              }`}
            >
              <IconoRegaloChico />
            </div>
          );
        }

        return (
          <div
            key={n}
            className={`flex h-8 w-8 flex-none items-center justify-center rounded-full ${
              cumplido ? "bg-exito text-white" : "bg-aviso-tinte text-aviso"
            }`}
          >
            {cumplido && <IconoCheckChico />}
          </div>
        );
      })}
    </div>
  );
}
