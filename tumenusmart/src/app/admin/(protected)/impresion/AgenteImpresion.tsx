"use client";

import { BotonEnlace, Pastilla, Tarjeta } from "@/components/ui";
import { useMotorImpresion } from "@/lib/motor-impresion";

/**
 * El estado de la impresión automática de comandas. El motor que imprime vive en `src/lib/motor-impresion.ts` y el
 * layout del panel lo mantiene andando en cualquier sección mientras esta computadora tenga el panel abierto; esta pantalla
 * solo lo muestra (y lo pone a andar también, para el caso de que el layout no lo haya hecho todavía). Acá además se pide
 * que la pantalla no se apague.
 */
export function AgenteImpresion({
  estacion,
  asignaciones,
}: {
  estacion: string | null;
  asignaciones: { area: string; impresora: string }[];
}) {
  const { qz, fallo, registro, impresas } = useMotorImpresion({ mantenerPantalla: true });

  const sinEstacion = estacion === null;
  const sinImpresoras = asignaciones.length === 0;
  const todoListo = qz === "ok" && !sinEstacion && !sinImpresoras && !fallo;

  return (
    <div className="flex flex-col gap-4">
      <Tarjeta className={`flex flex-col gap-3 !border-2 ${todoListo ? "!border-exito/60" : "!border-amarillo"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[1.05rem] font-semibold tracking-titular text-tinta">
            {todoListo ? "Imprimiendo las comandas" : "Falta algo para imprimir"}
          </h2>
          <Pastilla color={todoListo ? "exito" : "amarillo"} punto>
            {todoListo ? "Activo" : "No está imprimiendo"}
          </Pastilla>
        </div>

        <ul className="flex flex-col gap-1.5 text-[0.88rem]">
          <li className="flex items-center gap-2">
            <span aria-hidden="true">{qz === "ok" ? "✅" : qz === "conectando" ? "⏳" : "❌"}</span>
            <span className="text-tinta">
              {qz === "ok"
                ? "QZ Tray conectado"
                : qz === "conectando"
                  ? "Conectando con QZ Tray…"
                  : "No se conecta con QZ Tray: abrilo en esta computadora."}
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden="true">{sinEstacion ? "❌" : "✅"}</span>
            <span className="text-tinta">
              {sinEstacion
                ? "Esta computadora no está vinculada a una estación."
                : `Estación vinculada: ${estacion}`}
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden="true">{sinImpresoras ? "❌" : "✅"}</span>
            <span className="text-tinta">
              {sinImpresoras
                ? "Esta estación no tiene impresoras asignadas a ninguna área: no va a imprimir nada."
                : `${asignaciones.length} ${asignaciones.length === 1 ? "área con impresora" : "áreas con impresora"}`}
            </span>
          </li>
        </ul>

        {(sinEstacion || sinImpresoras) && (
          <div>
            <BotonEnlace href="/admin/pos/estaciones" tono="navegar" tam="md">
              Ir a Estaciones
            </BotonEnlace>
          </div>
        )}
        {fallo && <p className="text-[0.84rem] font-medium text-peligro">{fallo}</p>}

        {asignaciones.length > 0 && (
          <div className="border-t border-linea pt-2.5">
            <p className="mb-1 text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
              Qué sale en cada impresora
            </p>
            <ul className="flex flex-col gap-0.5 text-[0.84rem] text-tinta-media">
              {asignaciones.map((a) => (
                <li key={a.area}>
                  <strong className="font-semibold text-tinta">{a.area}</strong> → {a.impresora}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Tarjeta>

      <p className="rounded-lg bg-papel-suave px-3 py-2 text-[0.8rem] leading-snug text-tinta-media">
        No hace falta quedarse en esta pantalla: mientras esta computadora tenga el panel abierto <strong>en cualquier
        sección</strong> (Punto de venta, Pedidos…), las comandas salen solas. Dejan de salir si se cierra el navegador o
        se apaga la computadora; en ese caso quedan en espera y salen al volver. Desde que se abrió el panel imprimió{" "}
        <strong>{impresas}</strong> {impresas === 1 ? "comanda" : "comandas"}.
      </p>

      {registro.length > 0 && (
        <section className="rounded-xl border border-linea bg-superficie p-3.5">
          <p className="mb-2 text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">Últimos movimientos</p>
          <ul className="flex flex-col gap-1">
            {registro.map((r, i) => (
              <li key={`${r.hora}-${i}`} className={`text-[0.82rem] ${r.salio ? "text-tinta" : "text-peligro"}`}>
                <span className="cifra mr-2 text-tinta-suave">{r.hora}</span>
                {r.salio ? "🖨 " : "⚠ "}
                {r.texto}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
