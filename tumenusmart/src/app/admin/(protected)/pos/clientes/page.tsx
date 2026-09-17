import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { Cabecera, Tabla, Th, Vacio } from "@/components/ui";
import { ClienteFila } from "./ClienteFila";

export const dynamic = "force-dynamic";

export default async function ClientesPosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  // Repaso del dueño, no algo que el cajero abre en el momento — mismo
  // criterio que "Cuentas del mostrador".
  await pantallaConPermiso("pos.verHistorico");

  const { q } = await searchParams;
  const busqueda = q?.trim() || "";

  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const clientes = await db.customer.findMany({
    where: busqueda
      ? {
          OR: [
            { nombre: { contains: busqueda, mode: "insensitive" } },
            { numeroIdentificacion: { contains: busqueda, mode: "insensitive" } },
            { telefono: { contains: busqueda } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    select: { id: true, nombre: true, telefono: true, tipoIdentificacion: true, numeroIdentificacion: true },
    take: 200,
  });

  return (
    <div>
      <Cabecera
        titulo="Clientes"
        bajada="Histórico de clientes del local: los que facturaron con registro fiscal y los que sumaron fidelización por teléfono. Se dan de alta solos al vender — acá solo se puede corregir el nombre."
      />

      <form method="get" action="/admin/pos/clientes" className="mb-4 flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={busqueda}
          placeholder="Buscar por nombre, teléfono o N° de identificación"
          className="w-full max-w-md rounded-lg border border-linea px-3 py-2 text-[0.86rem]"
        />
        <button
          type="submit"
          className="rounded-lg bg-noche-panel px-4 py-2 text-[0.85rem] font-medium text-white hover:bg-noche-panel"
        >
          Buscar
        </button>
      </form>

      {clientes.length === 0 ? (
        <Vacio
          titulo={busqueda ? "Ningún cliente coincide con esa búsqueda" : "Todavía no hay clientes cargados"}
          detalle="Los clientes se dan de alta solos: al facturar con registro fiscal, o al cargar el teléfono en una venta o pedido."
        />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Nombre / Razón social</Th>
              <Th>Teléfono</Th>
              <Th>Identificación fiscal</Th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => (
              <ClienteFila
                key={c.id}
                id={c.id}
                nombre={c.nombre}
                telefono={c.telefono}
                tipoIdentificacion={c.tipoIdentificacion}
                numeroIdentificacion={c.numeroIdentificacion}
              />
            ))}
          </tbody>
        </Tabla>
      )}
    </div>
  );
}
