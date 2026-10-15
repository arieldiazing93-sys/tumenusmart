"use client";

import { useState } from "react";
import { Pastilla, Tabla, Td, Th, Tr, Vacio, clasesBoton } from "@/components/ui";
import { PanelLateral } from "@/components/PanelLateral";
import { etiquetaDeDeporte, textoDuracionCancha, type CanchaFila } from "@/lib/canchas";
import { formatearGuarani } from "@/lib/format";
import { etiquetaIva } from "@/lib/iva";
import { FormularioCancha } from "./FormularioCancha";

/** Qué muestra el panel lateral: nada, el alta o el formulario para editar una cancha. */
type PanelCancha = null | { modo: "nuevo" } | { modo: "editar"; id: string };

function Foto({ cancha, tam }: { cancha: CanchaFila; tam: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex flex-none items-center justify-center overflow-hidden rounded-lg bg-brand-light text-[1.2rem] ${tam}`}
    >
      {cancha.fotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cancha.fotoUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        "⚽"
      )}
    </span>
  );
}

function resumenDeDuraciones(c: CanchaFila): string {
  return c.duraciones.map((d) => textoDuracionCancha(d)).join(" · ");
}

/**
 * La lista de canchas: el botón para añadir y una fila por cancha. Tocar "Editar" abre el panel lateral con la ficha.
 * En pantalla ancha la lista es una tabla; en el celular son tarjetas.
 */
export function ListaCanchas({ canchas, grupos }: { canchas: CanchaFila[]; grupos: string[] }) {
  const [panel, setPanel] = useState<PanelCancha>(null);

  const cancha = panel && panel.modo === "editar" ? (canchas.find((c) => c.id === panel.id) ?? null) : null;
  const botonAnadir = (
    <button type="button" onClick={() => setPanel({ modo: "nuevo" })} className={clasesBoton("nuevo", "md")}>
      <span aria-hidden="true" className="text-[1.1rem] leading-none">
        +
      </span>
      Añadir cancha
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      {canchas.length > 0 && <div className="flex justify-end">{botonAnadir}</div>}

      {canchas.length === 0 ? (
        <Vacio
          titulo="Todavía no cargaste canchas"
          detalle="Sumá las canchas de tu complejo (fútbol, pádel, tenis…) con su precio por hora. Después tus clientes las reservan desde tu página."
          accion={botonAnadir}
        />
      ) : (
        <>
          {/* Pantalla ancha: tabla. */}
          <div className="hidden md:block">
            <Tabla>
              <thead>
                <tr>
                  <Th>Cancha</Th>
                  <Th>Grupo en el punto de venta</Th>
                  <Th className="text-right">Precio por hora</Th>
                  <Th>Duraciones</Th>
                  <Th className="text-right">Opciones</Th>
                </tr>
              </thead>
              <tbody>
                {canchas.map((c) => (
                  <Tr key={c.id} className={c.activa ? "" : "opacity-60"}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Foto cancha={c} tam="h-10 w-10" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-tinta">{c.nombre}</p>
                          <p className="truncate text-[0.78rem] text-tinta-suave">{c.superficie ?? "—"}</p>
                        </div>
                        {c.techada && <Pastilla color="azul">Techada</Pastilla>}
                        {!c.activa && <Pastilla>Inactiva</Pastilla>}
                      </div>
                    </Td>
                    <Td>
                      {c.categoria}
                      <span className="block text-[0.72rem] text-tinta-suave">
                        {etiquetaDeDeporte(c.deporte)} · {etiquetaIva(c.iva)}
                      </span>
                    </Td>
                    <Td className="cifra text-right">
                      {formatearGuarani(c.precioHora)}
                      {c.promos.length > 0 && (
                        <span className="block text-[0.72rem] text-azul-oscuro">
                          {c.promos.length === 1 ? "+ 1 promoción" : `+ ${c.promos.length} promociones`}
                        </span>
                      )}
                      {/* Una tarifa de noche de la versión anterior: se sigue cobrando hasta que se pase a promociones. */}
                      {c.precioNocturnoHora != null && (
                        <span className="block text-[0.72rem] text-amarillo-oscuro">
                          Noche {formatearGuarani(c.precioNocturnoHora)} desde las {c.nocheDesde}
                        </span>
                      )}
                    </Td>
                    <Td>{resumenDeDuraciones(c)}</Td>
                    <Td className="text-right">
                      <button
                        type="button"
                        onClick={() => setPanel({ modo: "editar", id: c.id })}
                        className={clasesBoton("navegar", "sm")}
                      >
                        Editar
                      </button>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Tabla>
          </div>

          {/* Celular y tablet vertical: una tarjeta por cancha. */}
          <ul className="flex flex-col gap-2 md:hidden">
            {canchas.map((c) => (
              <li
                key={c.id}
                className={`flex items-center gap-3 rounded-xl border border-linea bg-superficie p-3 ${c.activa ? "" : "opacity-60"}`}
              >
                <Foto cancha={c} tam="h-12 w-12" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.92rem] font-semibold text-tinta">{c.nombre}</p>
                  <p className="truncate text-[0.8rem] text-tinta-media">
                    {c.categoria} · {formatearGuarani(c.precioHora)} por hora
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {c.techada && <Pastilla color="azul">Techada</Pastilla>}
                    {c.promos.length > 0 && <Pastilla color="azul">Promociones</Pastilla>}
                    {!c.activa && <Pastilla>Inactiva</Pastilla>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPanel({ modo: "editar", id: c.id })}
                  className={`flex-none ${clasesBoton("navegar", "md")}`}
                >
                  Editar
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {panel && (panel.modo === "nuevo" || cancha) && (
        <PanelLateral titulo={panel.modo === "nuevo" ? "Añadir cancha" : "Editar cancha"} onCerrar={() => setPanel(null)}>
          <FormularioCancha
            key={panel.modo === "nuevo" ? "nueva" : `editar-${panel.id}`}
            cancha={cancha}
            grupos={grupos}
            onCerrar={() => setPanel(null)}
          />
        </PanelLateral>
      )}
    </div>
  );
}
