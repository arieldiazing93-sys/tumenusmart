"use client";

import { useState } from "react";
import { Pastilla, Vacio, clasesBoton } from "@/components/ui";
import { PanelLateral } from "@/components/PanelLateral";
import { esFormaDePago, etiquetaDeFormaDePago, resumenDeDiasTrabajo } from "@/lib/ausencias";
import { formatearGuarani } from "@/lib/format";
import type { FilaLiquidacion } from "@/lib/liquidacion-asistencia";

/** "Mensual · Gs. 2.800.000" / "Jornal · Gs. 120.000" / "Sin definir". */
function textoDePago(f: FilaLiquidacion): string {
  return f.forma && f.monto > 0 ? `${etiquetaDeFormaDePago(f.forma)} · ${formatearGuarani(f.monto)}` : "Sin definir";
}

/** Una cifra chica con su rótulo (para el celular). */
function Dato({ rotulo, valor, color = "text-tinta" }: { rotulo: string; valor: string | number; color?: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[0.62rem] font-semibold uppercase tracking-wide text-tinta-suave">{rotulo}</dt>
      <dd className={`cifra mt-0.5 truncate text-[0.88rem] font-semibold ${color}`}>{valor}</dd>
    </div>
  );
}

/**
 * La liquidación del período, una fila por persona: los días que tenía que ir, los que fue, los justificados (se pagan o no) y las
 * faltas sin aviso, y lo que le corresponde. «Ver cuenta» abre el día por día y la cuenta explicada. Esto NO paga nada.
 */
export function TablaLiquidacion({ filas }: { filas: FilaLiquidacion[] }) {
  const [abierta, setAbierta] = useState<FilaLiquidacion | null>(null);

  if (filas.length === 0) {
    return (
      <Vacio
        titulo="No hay personal para liquidar en este período"
        detalle="Cargá a las personas en Colaboradores, con sus días de trabajo y cómo se les paga."
      />
    );
  }

  return (
    <>
      {/* Pantalla ancha: tabla. */}
      <div className="hidden overflow-x-auto rounded-xl border-2 border-azul/50 bg-superficie md:block">
        <table className="w-full min-w-[56rem] border-collapse text-left text-[0.8rem]">
          <thead className="bg-papel-suave text-[0.68rem] uppercase tracking-wide text-tinta-suave">
            <tr>
              <th className="px-2.5 py-1.5 font-semibold">Colaborador</th>
              <th className="px-2.5 py-1.5 font-semibold">Pago</th>
              <th className="px-2.5 py-1.5 text-right font-semibold">Tenía que ir</th>
              <th className="px-2.5 py-1.5 text-right font-semibold">Fue</th>
              <th className="px-2.5 py-1.5 text-right font-semibold">Justificados</th>
              <th className="px-2.5 py-1.5 text-right font-semibold">Faltas</th>
              <th className="px-2.5 py-1.5 text-right font-semibold">Tarde</th>
              <th className="px-2.5 py-1.5 text-right font-semibold">Bruto</th>
              <th className="px-2.5 py-1.5 text-right font-semibold">Descuento</th>
              <th className="px-2.5 py-1.5 text-right font-semibold">A pagar</th>
              <th className="px-2.5 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className={`border-t border-linea-fina hover:bg-papel-suave ${f.activo ? "" : "opacity-70"}`}>
                <td className="px-2.5 py-1.5">
                  <span className="block max-w-[14rem] truncate font-semibold text-tinta">{f.nombre}</span>
                  <span className="block text-[0.7rem] text-tinta-suave">{resumenDeDiasTrabajo(f.diasTrabajo)}</span>
                </td>
                <td className="px-2.5 py-1.5">
                  {f.sinFormaDePago ? <Pastilla color="amarillo">Sin definir</Pastilla> : <span className="text-tinta-media">{textoDePago(f)}</span>}
                </td>
                <td className="cifra px-2.5 py-1.5 text-right text-tinta-media">{f.resumen.esperados}</td>
                <td className="cifra px-2.5 py-1.5 text-right text-tinta">
                  {f.resumen.trabajados}
                  {f.resumen.extra > 0 && <span className="text-tinta-suave"> (+{f.resumen.extra})</span>}
                </td>
                <td className="cifra px-2.5 py-1.5 text-right text-tinta-media" title="Se pagan / sin goce">
                  {f.resumen.justificadosPagados} / {f.resumen.justificadosSinGoce}
                </td>
                <td className={`cifra px-2.5 py-1.5 text-right ${f.resumen.faltas > 0 ? "font-semibold text-peligro" : "text-tinta-media"}`}>
                  {f.resumen.faltas}
                </td>
                <td className={`cifra px-2.5 py-1.5 text-right ${f.tardanzas > 0 ? "text-aviso" : "text-tinta-media"}`}>{f.tardanzas}</td>
                <td className="cifra px-2.5 py-1.5 text-right text-tinta-media">
                  {f.sinFormaDePago ? "—" : formatearGuarani(f.liquidacion.bruto)}
                </td>
                <td className={`cifra px-2.5 py-1.5 text-right ${f.liquidacion.descuento > 0 ? "text-peligro" : "text-tinta-media"}`}>
                  {f.sinFormaDePago ? "—" : f.liquidacion.descuento > 0 ? `− ${formatearGuarani(f.liquidacion.descuento)}` : formatearGuarani(0)}
                </td>
                <td className="cifra px-2.5 py-1.5 text-right font-semibold text-tinta">
                  {f.sinFormaDePago ? "—" : formatearGuarani(f.liquidacion.neto)}
                </td>
                <td className="px-2.5 py-1.5 text-right">
                  <button type="button" onClick={() => setAbierta(f)} className={clasesBoton("suave", "sm")}>
                    Ver cuenta
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Celular y tablet vertical: una tarjeta por persona. */}
      <ul className="flex flex-col gap-2 md:hidden">
        {filas.map((f) => (
          <li key={f.id} className={`rounded-xl border-2 border-azul/50 bg-superficie p-3 ${f.activo ? "" : "opacity-70"}`}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.92rem] font-semibold text-tinta">{f.nombre}</p>
                <p className="text-[0.74rem] text-tinta-suave">
                  {resumenDeDiasTrabajo(f.diasTrabajo)} · {f.sinFormaDePago ? "Sin forma de pago" : textoDePago(f)}
                </p>
              </div>
              <p className="cifra flex-none text-[1rem] font-semibold text-tinta">
                {f.sinFormaDePago ? "—" : formatearGuarani(f.liquidacion.neto)}
              </p>
            </div>
            <dl className="mt-2 grid grid-cols-4 gap-2">
              <Dato rotulo="Tenía que ir" valor={f.resumen.esperados} />
              <Dato rotulo="Fue" valor={f.resumen.trabajados} />
              <Dato rotulo="Justif." valor={f.resumen.justificadosPagados + f.resumen.justificadosSinGoce} />
              <Dato rotulo="Faltas" valor={f.resumen.faltas} color={f.resumen.faltas > 0 ? "text-peligro" : "text-tinta"} />
            </dl>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[0.74rem] text-tinta-media">
                {f.liquidacion.descuento > 0 ? `Descuento ${formatearGuarani(f.liquidacion.descuento)}` : f.tardanzas > 0 ? `${f.tardanzas} llegadas tarde` : ""}
              </p>
              <button type="button" onClick={() => setAbierta(f)} className={clasesBoton("suave", "sm")}>
                Ver cuenta
              </button>
            </div>
          </li>
        ))}
      </ul>

      {abierta && (
        <PanelLateral titulo={`Cuenta de ${abierta.nombre}`} ancho="ancho" onCerrar={() => setAbierta(null)}>
          <Cuenta fila={abierta} />
        </PanelLateral>
      )}
    </>
  );
}

/** La cuenta de una persona explicada: de qué sale el monto y qué pasó cada día. */
function Cuenta({ fila: f }: { fila: FilaLiquidacion }) {
  const { liquidacion: l, resumen: r } = f;
  const mensual = f.forma === "mensual";
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
      <div>
        <p className="text-[0.82rem] font-semibold text-tinta">{f.cargo ?? "Colaborador"}</p>
        <p className="text-[0.8rem] text-tinta-media">
          Trabaja {resumenDeDiasTrabajo(f.diasTrabajo).toLowerCase()} · {f.sinFormaDePago ? "sin forma de pago definida" : textoDePago(f)}
        </p>
      </div>

      {f.sinFormaDePago ? (
        <p className="rounded-lg border border-aviso/25 bg-aviso-luz px-3 py-2 text-[0.82rem] leading-snug text-aviso">
          Todavía no se definió cómo se le paga. Entrá a Colaboradores, tocá «Editar» y elegí mensual o jornal con su monto: los días
          de abajo ya están contados.
        </p>
      ) : (
        <dl className="grid grid-cols-1 gap-2 rounded-xl border border-linea p-3 text-[0.84rem]">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-tinta-media">
              {mensual ? "Salario del período" : `${r.trabajados + r.justificadosPagados} días × ${formatearGuarani(l.valorDia)}`}
            </dt>
            <dd className="cifra font-semibold text-tinta">{formatearGuarani(l.bruto)}</dd>
          </div>
          {mensual && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-tinta-media">
                Descuento: {l.diasLiquidados} {l.diasLiquidados === 1 ? "día" : "días"} × {formatearGuarani(l.valorDia)}
              </dt>
              <dd className={`cifra font-semibold ${l.descuento > 0 ? "text-peligro" : "text-tinta"}`}>
                {l.descuento > 0 ? `− ${formatearGuarani(l.descuento)}` : formatearGuarani(0)}
              </dd>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-3 border-t border-linea pt-2">
            <dt className="font-semibold text-tinta">A pagar</dt>
            <dd className="cifra text-[1.05rem] font-semibold text-tinta">{formatearGuarani(l.neto)}</dd>
          </div>
        </dl>
      )}

      {mensual && !f.sinFormaDePago && (
        <p className="text-[0.76rem] leading-snug text-tinta-suave">
          Un día vale el salario ÷ 30. Se descuenta uno por cada falta sin aviso y por cada día justificado sin goce.
        </p>
      )}
      {f.tardanzas > 0 && (
        <p className="text-[0.78rem] text-aviso">
          Llegó tarde {f.tardanzas} {f.tardanzas === 1 ? "vez" : "veces"} ({f.minutosTarde} min en total). Es informativo: no se
          descuenta.
        </p>
      )}

      <div>
        <p className="mb-1.5 text-[0.78rem] font-semibold uppercase tracking-wide text-tinta-suave">Día por día</p>
        {f.detalle.length === 0 ? (
          <p className="text-[0.82rem] text-tinta-suave">No hay días con movimiento en este período.</p>
        ) : (
          <ul className="divide-y divide-linea-fina rounded-xl border border-linea">
            {f.detalle.map((d) => (
              <li key={d.dia} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <span className="w-[7.5rem] flex-none text-[0.8rem] font-medium text-tinta">{d.diaTexto}</span>
                <span className="min-w-0 flex-1 text-[0.8rem] text-tinta-media">
                  {d.etiqueta}
                  {d.tardanzaMin !== null && <span className="text-aviso"> · {d.tardanzaMin} min tarde</span>}
                  {d.nota && <span className="block text-[0.74rem] text-tinta-suave">{d.nota}</span>}
                </span>
                <Pastilla color={d.efecto === "paga" ? "exito" : d.efecto === "descuenta" ? "peligro" : "neutro"}>
                  {d.efecto === "paga" ? "Cuenta" : d.efecto === "descuenta" ? "Descuenta" : "Pendiente"}
                </Pastilla>
              </li>
            ))}
          </ul>
        )}
      </div>

      {esFormaDePago(f.forma) && r.futuros > 0 && (
        <p className="text-[0.76rem] text-tinta-suave">
          Quedan {r.futuros} {r.futuros === 1 ? "día" : "días"} por venir en este período: todavía no cuentan como falta.
        </p>
      )}
    </div>
  );
}
