"use client";

import { useEffect, useState } from "react";
import { BotonEnlace, Pastilla, Tarjeta } from "@/components/ui";
import { useMotorImpresion } from "@/lib/motor-impresion";

/** Pasado este tiempo sin que el servidor conteste, o con una impresión sin terminar, se avisa que algo la trabó. */
const SEGUNDOS_DE_ALERTA = 20;

/**
 * El estado de la impresión automática de comandas. El motor que imprime vive en `src/lib/motor-impresion.ts` y el
 * layout del panel lo mantiene andando en cualquier sección mientras esta computadora tenga el panel abierto; esta pantalla
 * solo lo muestra (y lo pone a andar también, para el caso de que el layout no lo haya hecho todavía). Acá además se pide
 * que la pantalla no se apague.
 */
export function AgenteImpresion({
  estacion,
  asignaciones,
  comandasSinImpresora,
}: {
  estacion: string | null;
  asignaciones: { area: string; impresora: string }[];
  /** Comandas que esperan un área a la que ESTA estación no le asignó ninguna impresora (y cuántas son). */
  comandasSinImpresora: { area: string; cantidad: number }[];
}) {
  const { qz, fallo, registro, impresas, ultimaConsultaEn, imprimiendoAhora } = useMotorImpresion({ mantenerPantalla: true });

  // Un reloj de un segundo, solo para que los "hace N segundos" avancen mientras se mira la pantalla.
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => {
    setAhora(Date.now());
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(reloj);
  }, []);
  const segundosDesde = (momento: number | null) =>
    momento != null && ahora != null ? Math.max(0, Math.round((ahora - momento) / 1000)) : null;
  const sinConsultar = segundosDesde(ultimaConsultaEn);
  const imprimiendoHace = imprimiendoAhora ? segundosDesde(imprimiendoAhora.desde) : null;
  const trabada = imprimiendoHace != null && imprimiendoHace >= SEGUNDOS_DE_ALERTA;
  const motorParado = qz === "ok" && !imprimiendoAhora && sinConsultar != null && sinConsultar >= SEGUNDOS_DE_ALERTA;

  const sinEstacion = estacion === null;
  const sinImpresoras = asignaciones.length === 0;
  const todoListo = qz === "ok" && !sinEstacion && !sinImpresoras && !fallo && !trabada && !motorParado;

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

        {/* Lo que está haciendo el motor ahora mismo: con esto se ve si está andando o si algo lo trabó. */}
        <div className="flex flex-col gap-1 border-t border-linea pt-2.5 text-[0.82rem] text-tinta-media">
          <p>
            Última consulta al servidor:{" "}
            <strong className="font-semibold text-tinta">
              {sinConsultar == null ? "todavía ninguna" : `hace ${sinConsultar} s`}
            </strong>
          </p>
          {imprimiendoAhora && (
            <p className={trabada ? "font-medium text-peligro" : ""}>
              Mandando a la impresora: <strong className="font-semibold">{imprimiendoAhora.titulo}</strong>
              {imprimiendoHace != null ? ` · hace ${imprimiendoHace} s` : ""}
            </p>
          )}
          {trabada && (
            <p className="font-medium text-peligro">
              Esta impresión no termina. Revisá que la impresora no esté en pausa, ni pidiendo guardar un archivo (las
              impresoras “PDF” abren una ventana para elegir dónde guardar). En unos segundos se da por fallada y sigue con
              las demás.
            </p>
          )}
          {motorParado && (
            <p className="font-medium text-peligro">
              El motor no está consultando al servidor. Si este aviso sigue, recargá la página (F5): el navegador puede
              haber frenado la pestaña.
            </p>
          )}
        </div>

        {comandasSinImpresora.length > 0 && (
          <div className="rounded-lg border border-amarillo bg-amarillo-luz px-3 py-2.5 text-[0.84rem] text-amarillo-oscuro">
            <p className="font-semibold">Hay comandas en espera que esta estación no puede imprimir</p>
            <ul className="mt-1 list-disc pl-5">
              {comandasSinImpresora.map((c) => (
                <li key={c.area}>
                  {c.cantidad} {c.cantidad === 1 ? "comanda" : "comandas"} del área <strong>{c.area}</strong>: esta estación no
                  tiene una impresora asignada a esa área.
                </li>
              ))}
            </ul>
            <p className="mt-1">En Estaciones asignale a esa área una impresora de esta estación, y salen solas.</p>
            <div className="mt-2">
              <BotonEnlace href="/admin/pos/estaciones" tono="navegar" tam="sm">
                Ir a Estaciones
              </BotonEnlace>
            </div>
          </div>
        )}

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
