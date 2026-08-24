import { Suspense } from "react";
import Link from "next/link";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { formatearGuarani } from "@/lib/format";
import { actualizarStore, crearZona } from "./actions";
import { EliminarZonaBoton } from "./EliminarZonaBoton";
import { StoreLocationField } from "./StoreLocationField";
import { LogoField } from "./LogoField";
import { GuardadoToast } from "@/components/GuardadoToast";
import { PausaPedidosToggle } from "../PausaPedidosToggle";
import { NOMBRES_DIA, DIAS_ORDENADOS, resumenDia } from "@/lib/horario-atencion";

export const dynamic = "force-dynamic";

export default async function AdminConfiguracionPage() {
  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  const [store, zonas, horarios] = await Promise.all([
    prisma.store.findUnique({ where: { id: await idLocalActual() } }),
    prisma.deliveryZone.findMany({ orderBy: { radioKm: "asc" } }),
    prisma.horarioAtencion.findMany({ orderBy: [{ diaSemana: "asc" }, { abre: "asc" }] }),
  ]);

  const envioModo = store?.envioModo === "coordinar" ? "coordinar" : "zonas";

  return (
    <div className="flex flex-col gap-10">
      <Suspense fallback={null}>
        <GuardadoToast />
      </Suspense>

      <div>
        <h1 className="mb-4 text-xl font-bold text-neutral-900">Disponibilidad</h1>
        <div className="flex flex-col gap-4">
          <PausaPedidosToggle
            pausado={store?.pedidosPausados ?? false}
            mensaje={store?.mensajePausa ?? null}
          />

          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-neutral-900">Horario de atención</p>
              <Link
                href="/admin/configuracion/horarios"
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-600 hover:border-brand hover:text-brand"
              >
                Editar horarios
              </Link>
            </div>
            {horarios.length === 0 ? (
              <p className="text-sm text-neutral-500">
                Sin horarios cargados — el menú acepta pedidos a cualquier hora.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                {DIAS_ORDENADOS.map((dia) => {
                  const texto = resumenDia(horarios, dia);
                  return (
                    <div key={dia} className="flex justify-between gap-3 py-0.5">
                      <span className="text-neutral-600">{NOMBRES_DIA[dia]}</span>
                      <span
                        className={
                          texto === "Cerrado"
                            ? "text-neutral-400"
                            : "font-medium text-neutral-900"
                        }
                      >
                        {texto}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div>
        <h1 className="mb-4 text-xl font-bold text-neutral-900">Datos del negocio</h1>
        <form action={actualizarStore} className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Nombre del negocio
            </label>
            <input
              name="nombre"
              required
              defaultValue={store?.nombre ?? ""}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Número de WhatsApp (formato internacional, sin +, ej: 595981234567)
            </label>
            <input
              name="whatsappNumero"
              required
              defaultValue={store?.whatsappNumero ?? ""}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Dirección (opcional)
            </label>
            <input
              name="direccion"
              defaultValue={store?.direccion ?? ""}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2"
            />
          </div>
          <LogoField initialUrl={store?.logoUrl ?? null} />
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Saludo del mensaje de WhatsApp — pedidos (opcional)
            </label>
            <input
              name="mensajeSaludo"
              defaultValue={store?.mensajeSaludo ?? ""}
              placeholder="Ej: ¡Hola! Te paso mi pedido:"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Saludo del mensaje de WhatsApp — reservas (opcional)
            </label>
            <input
              name="mensajeSaludoReserva"
              defaultValue={store?.mensajeSaludoReserva ?? ""}
              placeholder="Ej: ¡Hola! Te paso mi reserva:"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2"
            />
          </div>

          <div className="mt-2 border-t border-neutral-200 pt-4">
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Costo de envío
            </label>
            <p className="mb-2 text-xs text-neutral-500">
              Elegí cómo querés manejar el precio del delivery en este negocio.
            </p>
            <div className="flex flex-col gap-2">
              <label className="flex items-start gap-2 rounded-lg border border-neutral-300 p-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-light">
                <input
                  type="radio"
                  name="envioModo"
                  value="zonas"
                  defaultChecked={envioModo === "zonas"}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">Por zonas con precio automático</span>
                  <br />
                  <span className="text-neutral-500">
                    Definís radios de distancia desde tu local, cada uno con su precio. El
                    cliente lo ve calculado automáticamente al marcar su ubicación.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 rounded-lg border border-neutral-300 p-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-light">
                <input
                  type="radio"
                  name="envioModo"
                  value="coordinar"
                  defaultChecked={envioModo === "coordinar"}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">Lo coordino yo directamente</span>
                  <br />
                  <span className="text-neutral-500">
                    El cliente marca su ubicación en el mapa, pero el precio del envío lo
                    definís vos por WhatsApp, caso por caso.
                  </span>
                </span>
              </label>
            </div>
          </div>

          <StoreLocationField
            initialLat={store?.lat ?? null}
            initialLng={store?.lng ?? null}
            zonas={zonas.map((z) => ({
              id: z.id,
              radioKm: Number(z.radioKm),
              costoEnvio: Number(z.costoEnvio),
            }))}
          />

          <button
            type="submit"
            className="self-start rounded-lg bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark"
          >
            Guardar
          </button>
        </form>
      </div>

      <div>
        <h2 className="mb-1 text-xl font-bold text-neutral-900">Zonas de envío</h2>
        <p className="mb-4 text-sm text-neutral-500">
          Solo aplican si arriba elegiste "Por zonas con precio automático". Cargalas de
          menor a mayor radio — cada una es "hasta X km desde el local".
        </p>

        <form action={crearZona} className="mb-4 flex flex-wrap gap-2">
          <input
            name="nombre"
            required
            placeholder="Nombre (ej: Zona 1)"
            className="min-w-[140px] flex-1 rounded-lg border border-neutral-300 px-3 py-2"
          />
          <input
            type="number"
            name="radioKm"
            required
            step="0.1"
            min="0.1"
            placeholder="Radio (km)"
            className="w-32 rounded-lg border border-neutral-300 px-3 py-2"
          />
          <input
            type="number"
            name="costoEnvio"
            required
            step="1"
            min="0"
            placeholder="Costo (Gs.)"
            className="w-36 rounded-lg border border-neutral-300 px-3 py-2"
          />
          <button
            type="submit"
            className="rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Agregar
          </button>
        </form>

        <div className="flex flex-col gap-2">
          {zonas.map((z) => (
            <div
              key={z.id}
              className={`flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-2 ${
                z.activo ? "" : "opacity-60"
              }`}
            >
              <span>
                {z.nombre} <span className="text-neutral-400">— hasta {Number(z.radioKm)} km</span>
                {!z.activo && (
                  <span className="ml-2 text-xs font-normal text-neutral-400">(inactiva)</span>
                )}
              </span>
              <div className="flex items-center gap-4">
                <span className="text-sm text-neutral-500">
                  {formatearGuarani(Number(z.costoEnvio))}
                </span>
                <EliminarZonaBoton id={z.id} activo={z.activo} />
              </div>
            </div>
          ))}
          {zonas.length === 0 && (
            <p className="text-sm text-neutral-400">Todavía no cargaste ninguna zona.</p>
          )}
        </div>
      </div>
    </div>
  );
}
