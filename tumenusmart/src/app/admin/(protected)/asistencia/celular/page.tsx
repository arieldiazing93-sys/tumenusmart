import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prisma } from "@/lib/prisma";
import { Aviso, BotonEnlace, Cabecera, Tarjeta } from "@/components/ui";
import { EnlaceCelularFijo } from "./EnlaceCelularFijo";
import { ReglasMarcacion } from "./ReglasMarcacion";

export const dynamic = "force-dynamic";

/**
 * El celular fijo del Registro de asistencia: la dirección que se abre en el celular que queda en la pared del
 * local, y cómo dejarlo andando. Ahí el personal toca "Registrar asistencia", pone su PIN (que lo identifica) y la
 * cámara le saca la selfie sola apenas ve su cara de frente: la marcación que toca (entrada, almuerzo o salida) se
 * registra sola.
 */
export default async function CelularFijoPage() {
  await pantallaConPermiso("asistencia.gestionar");
  const idLocal = await idLocalActual();

  // Store no está entre los modelos por local: se lee con el cliente global.
  const store = await prisma.store.findUnique({
    where: { id: idLocal },
    select: { tokenAsistencia: true, minutosEntreMarcas: true },
  });

  return (
    <div className="flex flex-col gap-4">
      <Cabecera
        titulo="Celular fijo"
        bajada="El celular que queda en la pared del local, donde tu personal marca entrada, almuerzo y salida."
        acciones={
          <BotonEnlace href="/admin/asistencia/prueba" tono="navegar" tam="md">
            Probar la cámara
          </BotonEnlace>
        }
      />

      <EnlaceCelularFijo token={store?.tokenAsistencia ?? null} />

      <ReglasMarcacion minutosEntreMarcas={store?.minutosEntreMarcas ?? 5} />

      <Tarjeta className="flex flex-col gap-3 !border-2 !border-azul/50">
        <h2 className="text-[1rem] font-semibold tracking-titular text-tinta">Cómo dejarlo andando</h2>
        <ol className="list-decimal space-y-1.5 pl-5 text-[0.86rem] leading-snug text-tinta-media">
          <li>
            Cargá a cada persona en <strong className="text-tinta">Colaboradores</strong>, con ella delante: sacale la
            selfie y elegile un PIN. El PIN es lo que la identifica, así que no puede repetirse.
          </li>
          <li>Abrí la dirección de arriba en el celular que va a quedar fijo y aceptá el permiso de la cámara.</li>
          <li>
            Dejalo enchufado, con la pantalla prendida y la cámara de frente, a la altura de la cara de quien marca.
          </li>
          <li>
            Elegí un lugar <strong className="text-tinta">bien iluminado</strong> y a la vista: la cámara ve mejor la cara
            con buena luz, y un lugar visible desalienta a quien quiera hacer trampa.
          </li>
        </ol>
      </Tarjeta>

      <Tarjeta className="flex flex-col gap-2 !border-2 !border-azul/50">
        <h2 className="text-[1rem] font-semibold tracking-titular text-tinta">Cómo marca el personal</h2>
        <ol className="list-decimal space-y-1 pl-5 text-[0.86rem] leading-snug text-tinta-media">
          <li>Toca <strong className="text-tinta">Registrar asistencia</strong>.</li>
          <li>Pone su PIN. El celular le dice su nombre y qué va a marcar.</li>
          <li>Mira a la cámara: la selfie sale sola y la marcación queda guardada.</li>
        </ol>
        <p className="text-[0.84rem] leading-snug text-tinta-media">
          Qué marca lo decide el sistema según lo último que marcó la persona: entrada → salida a almorzar → vuelta del
          almuerzo → salida. Quien no sale a almorzar se marca así en su ficha (después de la entrada toca la salida), y
          quien se va sin haber almorzado puede cambiarlo en el momento con el enlace de la pantalla.
        </p>
      </Tarjeta>

      <Aviso titulo="Cómo se evita que marquen por otro" color="azul">
        Cada marcación pide el PIN de la persona y la cámara tiene que ver una cara de frente. Después de 5 PIN incorrectos
        seguidos el celular se bloquea 3 minutos. Queda guardada la foto de cada marcación: en <strong>Marcaciones</strong>{" "}
        podés compararla con la selfie del alta. La cámara detecta que hay una cara, pero no reconoce de quién es: si
        alguien usa el PIN de otro, lo vas a ver en la foto. Si la cámara no llega a ver la cara, la persona puede marcar
        igual y esa marcación queda señalada para que la revises.
      </Aviso>
    </div>
  );
}
