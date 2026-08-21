import { prisma } from "@/lib/prisma";
import { formatearGuarani } from "@/lib/format";
import { actualizarStore, crearZona } from "./actions";
import { EliminarZonaBoton } from "./EliminarZonaBoton";

export const dynamic = "force-dynamic";

export default async function AdminConfiguracionPage() {
  const [store, zonas] = await Promise.all([
    prisma.store.findFirst(),
    prisma.deliveryZone.findMany({ orderBy: { nombre: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-10">
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
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              URL del logo (opcional)
            </label>
            <input
              name="logoUrl"
              defaultValue={store?.logoUrl ?? ""}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Saludo inicial del mensaje de WhatsApp (opcional)
            </label>
            <input
              name="mensajeSaludo"
              defaultValue={store?.mensajeSaludo ?? ""}
              placeholder="Ej: ¡Hola! Te paso mi pedido:"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2"
            />
          </div>
          <button
            type="submit"
            className="self-start rounded-lg bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark"
          >
            Guardar
          </button>
        </form>
      </div>

      <div>
        <h2 className="mb-4 text-xl font-bold text-neutral-900">Zonas de envío</h2>

        <form action={crearZona} className="mb-4 flex gap-2">
          <input
            name="nombre"
            required
            placeholder="Zona (ej: Centro)"
            className="flex-1 rounded-lg border border-neutral-300 px-3 py-2"
          />
          <input
            type="number"
            name="costoEnvio"
            required
            step="1"
            min="0"
            placeholder="Costo (Gs.)"
            className="w-40 rounded-lg border border-neutral-300 px-3 py-2"
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
              className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-2"
            >
              <span>{z.nombre}</span>
              <div className="flex items-center gap-4">
                <span className="text-sm text-neutral-500">
                  {formatearGuarani(Number(z.costoEnvio))}
                </span>
                <EliminarZonaBoton id={z.id} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
