import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal } from "@/lib/prisma-local";
import { Aviso, BotonEnlace, Cabecera } from "@/components/ui";
import { EnlacePublicoLocal } from "@/components/EnlacePublicoLocal";
import { apagarEnlaceMozos, generarEnlaceMozos } from "./actions";
import { ListaMozos } from "./ListaMozos";

export const dynamic = "force-dynamic";

/**
 * Los mozos del Servicio comedor: quiénes pueden entrar al enlace público con su PIN a cargar las mesas, y la llave de
 * ese enlace. Solo del dueño (comedor.configurar).
 */
export default async function MozosPage() {
  await pantallaConPermiso("comedor.configurar");
  const idLocal = await idLocalActual();
  const db = prismaDelLocal(idLocal);

  const [store, mozos] = await Promise.all([
    // Store no está entre los modelos por local: se lee con el cliente global.
    prisma.store.findUnique({ where: { id: idLocal }, select: { tokenMozos: true } }),
    db.mozo.findMany({
      orderBy: [{ activo: "desc" }, { nombre: "asc" }],
      select: { id: true, nombre: true, apellido: true, activo: true, pinClave: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <Cabecera
        titulo="Mozos"
        bajada="Quiénes cargan las mesas desde su celular o tablet. Cada mozo entra al enlace con su PIN."
        acciones={
          <BotonEnlace href="/admin/comedor" tono="navegar" tam="md">
            Cuentas abiertas
          </BotonEnlace>
        }
      />

      <EnlacePublicoLocal
        token={store?.tokenMozos ?? null}
        rutaBase="/mozo"
        generar={generarEnlaceMozos}
        apagar={apagarEnlaceMozos}
        textos={{
          tituloApagado: "El enlace de los mozos está apagado",
          descripcionApagado:
            "Activalo para tener la dirección que se abre en el celular o la tablet del mozo. Con su PIN carga las mesas y envía los pedidos.",
          botonActivar: "Activar el enlace de los mozos",
          tituloEncendido: "La dirección de los mozos",
          descripcionEncendido:
            "Abrila en el celular o la tablet del mozo. No lleva usuario ni contraseña: quien la tenga ve la pantalla del PIN, pero para entrar necesita el PIN de un mozo activo.",
          pieDelQr: "Escanealo con el celular del mozo",
          botonApagar: "Apagar el enlace",
          avisoNuevo: "El enlace actual va a dejar de funcionar y vas a tener que pasar el nuevo a los mozos.",
          avisoApagar: "Ningún mozo va a poder entrar hasta que lo vuelvas a activar.",
        }}
      />

      <ListaMozos
        mozos={mozos.map((m) => ({
          id: m.id,
          nombre: m.nombre,
          apellido: m.apellido,
          activo: m.activo,
          sinPin: m.pinClave === null,
        }))}
      />

      <Aviso titulo="Cómo llegan las comandas a la cocina" color="azul">
        La tablet del mozo no puede imprimir: lo que envía queda en una cola y la <strong>estación de caja</strong> lo
        imprime con sus impresoras (las que asignaste a cada área en <em>Estaciones</em>). Para eso, en la computadora de
        la caja tiene que estar abierta la pantalla <strong>Impresión automática</strong>.
        <div className="mt-3">
          <BotonEnlace href="/admin/impresion" tono="navegar" tam="md">
            Ir a Impresión automática
          </BotonEnlace>
        </div>
      </Aviso>
    </div>
  );
}
