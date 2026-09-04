import { pantallaConPermiso } from "@/lib/auth";
import { Suspense } from "react";
import Link from "next/link";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { formatearGuarani } from "@/lib/format";
import { actualizarStore, guardarFidelizacion, guardarEnvioUbicacion } from "./actions";
import { EliminarZonaBoton } from "./EliminarZonaBoton";
import { CrearZonaForm } from "./CrearZonaForm";
import { StoreLocationField } from "./StoreLocationField";
import { LogoField } from "./LogoField";
import { UrlPublicaField } from "./UrlPublicaField";
import { GuardadoToast } from "@/components/GuardadoToast";
import { PausaPedidosToggle } from "../PausaPedidosToggle";
import { NOMBRES_DIA, DIAS_ORDENADOS, resumenDia } from "@/lib/horario-atencion";
import { clasesBoton } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminConfiguracionPage() {
  await pantallaConPermiso("configuracion.editar");

  // Todas las consultas de acá abajo quedan atadas a este local.
  const prisma = prismaDelLocal(await idLocalActual());

  const [store, zonas, horarios] = await Promise.all([
    prisma.store.findUnique({ where: { id: await idLocalActual() } }),
    prisma.deliveryZone.findMany({ orderBy: { radioKm: "asc" } }),
    prisma.horarioAtencion.findMany({ orderBy: [{ diaSemana: "asc" }, { abre: "asc" }] }),
  ]);

  const envioModo = store?.envioModo === "coordinar" ? "coordinar" : "zonas";
  const estiloCarta = store?.estiloCarta === "tarjetas" ? "tarjetas" : "lista";

  return (
    <div className="flex flex-col gap-10">
      <Suspense fallback={null}>
        <GuardadoToast />
      </Suspense>

      <div>
        <h1 className="mb-4 text-[1.4rem] font-semibold tracking-titular text-tinta">Datos del negocio</h1>

        {store?.slug && (
          <div className="mb-4">
            <UrlPublicaField slug={store.slug} />
          </div>
        )}
        <form action={actualizarStore} className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-tinta-media">
              Nombre del negocio
            </label>
            <input
              name="nombre"
              required
              defaultValue={store?.nombre ?? ""}
              className="w-full rounded-lg border border-linea px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-tinta-media">
              Número de WhatsApp (formato internacional, sin +, ej: 595981234567)
            </label>
            <input
              name="whatsappNumero"
              required
              defaultValue={store?.whatsappNumero ?? ""}
              className="w-full rounded-lg border border-linea px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-tinta-media">
              Dirección (opcional)
            </label>
            <input
              name="direccion"
              defaultValue={store?.direccion ?? ""}
              className="w-full rounded-lg border border-linea px-3 py-2"
            />
          </div>
          <LogoField initialUrl={store?.logoUrl ?? null} />
          <div>
            <label className="mb-1 block text-sm font-medium text-tinta-media">
              Saludo del mensaje de WhatsApp — pedidos (opcional)
            </label>
            <input
              name="mensajeSaludo"
              defaultValue={store?.mensajeSaludo ?? ""}
              placeholder="Ej: ¡Hola! Te paso mi pedido:"
              className="w-full rounded-lg border border-linea px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-tinta-media">
              Saludo del mensaje de WhatsApp — reservas (opcional)
            </label>
            <input
              name="mensajeSaludoReserva"
              defaultValue={store?.mensajeSaludoReserva ?? ""}
              placeholder="Ej: ¡Hola! Te paso mi reserva:"
              className="w-full rounded-lg border border-linea px-3 py-2"
            />
          </div>

          <div className="mt-2 border-t border-linea pt-4">
            <label className="mb-1 block text-sm font-medium text-tinta-media">
              Cómo se ve tu carta
            </label>
            <p className="mb-2 text-xs text-tinta-media">
              Depende de tus fotos. Si son de celular, la lista las disimula. Si son
              profesionales, mostralas grandes: ahí la foto es la que vende.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-linea p-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-light">
                <input
                  type="radio"
                  name="estiloCarta"
                  value="lista"
                  defaultChecked={estiloCarta === "lista"}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">Lista compacta</span>
                  <br />
                  <span className="text-tinta-media">
                    Foto chica al costado. Entran muchos productos en una pantalla y se
                    recorre rápido. Es la opción segura.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-linea p-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-light">
                <input
                  type="radio"
                  name="estiloCarta"
                  value="tarjetas"
                  defaultChecked={estiloCarta === "tarjetas"}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">Tarjetas con foto grande</span>
                  <br />
                  <span className="text-tinta-media">
                    La foto ocupa todo el ancho. Elegila solo si TODOS tus productos
                    tienen buena foto: una mala se nota el triple.
                  </span>
                </span>
              </label>
            </div>
          </div>

          <button
            type="submit"
            className={`self-start ${clasesBoton("principal")}`}
          >
            Guardar
          </button>
        </form>
      </div>

      <div>
        <h1 className="mb-4 text-[1.4rem] font-semibold tracking-titular text-tinta">Disponibilidad</h1>
        <div className="flex flex-col gap-4">
          <PausaPedidosToggle
            pausado={store?.pedidosPausados ?? false}
            mensaje={store?.mensajePausa ?? null}
          />

          <div className="rounded-lg border border-linea bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[0.95rem] font-semibold tracking-titular text-tinta">Horario de atención</p>
              <Link
                href="/admin/configuracion/horarios"
                className={clasesBoton("navegar", "sm")}
              >
                Editar horarios
              </Link>
            </div>
            {/*
                Dos columnas con MUCHA separación entre ellas.

                Antes eran 4 píxeles, y con la hora alineada a la derecha de la
                primera columna pegada al nombre del día de la segunda, se leía
                "00:00 Martes" como si fuera una sola cosa. Ahora hay 2.5rem de
                aire y cada día lleva su línea, así que cada renglón se lee solo.
            */}
            {horarios.length === 0 ? (
              <p className="text-sm text-tinta-media">
                Sin horarios cargados — el menú acepta pedidos a cualquier hora.
              </p>
            ) : (
              <dl className="grid grid-cols-1 gap-x-10 text-[0.85rem] sm:grid-cols-2">
                {DIAS_ORDENADOS.map((dia) => {
                  const texto = resumenDia(horarios, dia);
                  const cerrado = texto === "Cerrado";
                  return (
                    <div
                      key={dia}
                      className="flex items-baseline justify-between gap-4 border-b border-linea-fina py-2 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0"
                    >
                      <dt className="flex-none text-tinta-media">{NOMBRES_DIA[dia]}</dt>
                      {/* Tabular: así los dígitos quedan en columna y se
                          comparan los días de un vistazo. */}
                      <dd
                        className={
                          cerrado
                            ? "cifra flex-none text-tinta-suave"
                            : "cifra flex-none font-semibold text-tinta"
                        }
                      >
                        {texto}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            )}
          </div>
        </div>
      </div>

      <div>
        <h1 className="mb-1 text-[1.4rem] font-semibold tracking-titular text-tinta">Fidelización</h1>
        <p className="mb-4 text-sm text-tinta-media">
          Cada N pedidos entregados de un mismo cliente le dan derecho a un premio.
          Solo cuenta pedidos hechos por acá — delivery o retiro.
        </p>
        <form action={guardarFidelizacion} className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm font-medium text-tinta-media">
            <input
              type="checkbox"
              name="fidelizacionActiva"
              defaultChecked={store?.fidelizacionActiva ?? false}
            />
            Activar programa de fidelización
          </label>
          <div>
            <label className="mb-1 block text-sm font-medium text-tinta-media">
              Pedidos entregados para ganar el premio
            </label>
            <input
              type="number"
              name="fidelizacionUmbral"
              min={1}
              max={50}
              defaultValue={store?.fidelizacionUmbral ?? 10}
              className="w-full rounded-lg border border-linea px-3 py-2 sm:w-40"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-tinta-media">
              Premio (lo que le vas a dar cuando llegue)
            </label>
            <input
              name="fidelizacionPremio"
              defaultValue={store?.fidelizacionPremio ?? ""}
              placeholder="Ej: 1 empanada gratis"
              className="w-full rounded-lg border border-linea px-3 py-2"
            />
          </div>
          <button
            type="submit"
            className={`self-start ${clasesBoton("principal")}`}
          >
            Guardar
          </button>
        </form>
      </div>

      <div>
        <h2 className="mb-1 text-[1.4rem] font-semibold tracking-titular text-tinta">Zonas de envío</h2>
        <p className="mb-4 text-sm text-tinta-media">
          Solo aplican si más abajo, en "Envío y ubicación", elegiste "Por zonas con precio
          automático". Cargalas de menor a mayor radio — cada una es "hasta X km desde el local".
        </p>

        <CrearZonaForm />

        <div className="flex flex-col gap-2">
          {zonas.map((z) => (
            <div
              key={z.id}
              className={`flex items-center justify-between rounded-lg border border-linea bg-white px-4 py-2 ${
                z.activo ? "" : "opacity-60"
              }`}
            >
              <span>
                {z.nombre} <span className="text-tinta-suave">— hasta {Number(z.radioKm)} km</span>
                {!z.activo && (
                  <span className="ml-2 text-xs font-normal text-tinta-suave">(inactiva)</span>
                )}
              </span>
              <div className="flex items-center gap-4">
                <span className="text-sm text-tinta-media">
                  {formatearGuarani(Number(z.costoEnvio))}
                </span>
                <EliminarZonaBoton id={z.id} activo={z.activo} />
              </div>
            </div>
          ))}
          {zonas.length === 0 && (
            <p className="text-sm text-tinta-suave">Todavía no cargaste ninguna zona.</p>
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-[1.4rem] font-semibold tracking-titular text-tinta">
          Envío y ubicación
        </h2>
        <form action={guardarEnvioUbicacion} className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-tinta-media">
              Costo de envío
            </label>
            <p className="mb-2 text-xs text-tinta-media">
              Elegí cómo querés manejar el precio del delivery en este negocio.
            </p>
            <div className="flex flex-col gap-2">
              <label className="flex items-start gap-2 rounded-lg border border-linea p-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-light">
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
                  <span className="text-tinta-media">
                    Definís radios de distancia desde tu local, cada uno con su precio. El
                    cliente lo ve calculado automáticamente al marcar su ubicación.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 rounded-lg border border-linea p-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-light">
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
                  <span className="text-tinta-media">
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
            className={`self-start ${clasesBoton("principal")}`}
          >
            Guardar
          </button>
        </form>
      </div>
    </div>
  );
}
