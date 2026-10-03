import { notFound } from "next/navigation";
import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { totalDeLineas } from "@/lib/comedor";
import { Aviso, Pastilla } from "@/components/ui";
import { Volver } from "@/components/Volver";
import { RefrescarCada } from "@/components/RefrescarCada";

export const dynamic = "force-dynamic";

function hora(fecha: Date): string {
  return fecha.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: ZONA_NEGOCIO });
}

const ESTADO_TRABAJO: Record<string, { texto: string; color: "exito" | "amarillo" | "peligro" | "azul" }> = {
  impreso: { texto: "Impresa", color: "exito" },
  pendiente: { texto: "En espera", color: "amarillo" },
  imprimiendo: { texto: "Imprimiendo", color: "azul" },
  error: { texto: "Con error", color: "peligro" },
};

/**
 * El detalle de una cuenta de mesa: lo que cargó cada mozo, por pedidos (rondas), y cómo salió cada comanda. Por ahora es
 * para ver; las acciones de la caja (anular con motivo, descuento, cambiar de mozo, cobrar) vienen en la próxima etapa.
 */
export default async function CuentaMesaPage({ params }: { params: Promise<{ id: string }> }) {
  await pantallaConPermiso("comedor.ver");
  const db = prismaDelLocal(await idLocalActual());
  const { id } = await params;

  const cuenta = await db.cuentaMesa.findUnique({
    where: { id },
    include: {
      mozo: { select: { nombre: true, apellido: true } },
      items: {
        orderBy: [{ ronda: "asc" }, { linea: "asc" }],
        include: { mozo: { select: { nombre: true, apellido: true } } },
      },
      trabajos: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!cuenta) notFound();

  const nombre = (m: { nombre: string; apellido: string | null }) => [m.nombre, m.apellido].filter(Boolean).join(" ");

  const rondas = new Map<number, typeof cuenta.items>();
  for (const i of cuenta.items) rondas.set(i.ronda, [...(rondas.get(i.ronda) ?? []), i]);

  const activos = cuenta.items.filter((i) => i.estado === "activo");
  const total = totalDeLineas(activos.map((i) => ({ precioUnitario: Number(i.precioUnitario), cantidad: i.cantidad })));

  return (
    <div className="flex flex-col gap-4">
      <RefrescarCada segundos={15} />
      <div>
        <Volver href="/admin/comedor" texto="Volver a las mesas" />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[1.4rem] font-semibold tracking-titular text-tinta">Mesa {cuenta.mesa}</h1>
          <p className="text-sm text-tinta-media">
            Cuenta {formatearNumero(cuenta.numero)} · a cargo de {nombre(cuenta.mozo)} · abierta a las{" "}
            {hora(cuenta.abiertaEn)}
            {cuenta.comensales ? ` · ${cuenta.comensales} personas` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Pastilla color={cuenta.estado === "abierta" ? "exito" : "neutro"} punto>
            {cuenta.estado === "abierta" ? "Abierta" : cuenta.estado === "pagada" ? "Pagada" : "Anulada"}
          </Pastilla>
          <p className="cifra text-[1.5rem] font-bold text-tinta">{formatearGuarani(total)}</p>
        </div>
      </div>

      {[...rondas.entries()].map(([ronda, items]) => (
        <section key={ronda} className="rounded-xl border-2 border-azul/50 bg-superficie p-3.5">
          <p className="text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">
            Pedido {ronda} · {hora(items[0].enviadoEn)} · {nombre(items[0].mozo)}
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {items.map((i) => (
              <li
                key={i.id}
                className={`flex items-start justify-between gap-3 text-[0.9rem] ${
                  i.estado === "anulado" ? "text-tinta-suave line-through" : "text-tinta"
                }`}
              >
                <div className="min-w-0">
                  <p>
                    <span className="font-semibold">{i.cantidad} ×</span> {i.nombreProducto}
                    {i.estado === "anulado" && <span className="ml-1.5 text-[0.72rem] font-semibold text-peligro">ANULADO</span>}
                  </p>
                  {i.opcionesTexto && <p className="text-[0.8rem] text-tinta-media">+ {i.opcionesTexto}</p>}
                  {i.ingredientesQuitadosTexto && <p className="text-[0.8rem] text-peligro">{i.ingredientesQuitadosTexto}</p>}
                  {i.nota && <p className="text-[0.8rem] text-tinta-media">“{i.nota}”</p>}
                </div>
                <span className="cifra flex-none font-medium">{formatearGuarani(Number(i.precioUnitario) * i.cantidad)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {cuenta.trabajos.length > 0 && (
        <section className="rounded-xl border border-linea bg-superficie p-3.5">
          <p className="text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">Comandas de esta cuenta</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {cuenta.trabajos.map((t) => {
              const estado = ESTADO_TRABAJO[t.estado] ?? { texto: t.estado, color: "azul" as const };
              return (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 text-[0.85rem] text-tinta">
                  <span>
                    {t.titulo} · {hora(t.createdAt)}
                  </span>
                  <Pastilla color={estado.color}>{estado.texto}</Pastilla>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Aviso titulo="Esta pantalla es para ver" color="azul">
        Anular un producto (con motivo), dar un descuento, cambiar de mozo, imprimir el ticket de la cuenta y cobrar se suman
        en la próxima etapa.
      </Aviso>
    </div>
  );
}
