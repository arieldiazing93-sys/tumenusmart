import { Tarjeta } from "@/components/ui";

/**
 * Se muestra cuando este navegador todavía no está vinculado a ninguna
 * estación — nunca se redirige a ciegas a abrir/vender sin saber a qué caja
 * pertenece la venta. Pasa si es la primera vez que se abre el panel en esta
 * computadora, o si se cambió de notebook o se borraron los datos del
 * navegador (ver src/lib/estacion-actual.ts).
 */
export function EstacionNoVinculada() {
  return (
    <div className="mx-auto max-w-md">
      <Tarjeta className="text-center shadow-sm">
        <span aria-hidden="true" className="mb-3 block text-4xl">
          🖥️
        </span>
        <h1 className="text-[1.15rem] font-semibold tracking-titular text-tinta">
          Esta computadora no está vinculada a ninguna estación
        </h1>
        <p className="mt-2 text-[0.88rem] text-tinta-media">
          Pedile al dueño que la configure en{" "}
          <span className="font-medium text-tinta">
            Cómo va el negocio → Estaciones
          </span>{" "}
          — es un paso único por computadora.
        </p>
      </Tarjeta>
    </div>
  );
}
