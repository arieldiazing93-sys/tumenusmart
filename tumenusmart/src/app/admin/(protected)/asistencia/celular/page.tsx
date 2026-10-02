import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prisma } from "@/lib/prisma";
import { Aviso, BotonEnlace, Cabecera, Tarjeta } from "@/components/ui";
import { EnlaceCelularFijo } from "./EnlaceCelularFijo";

export const dynamic = "force-dynamic";

/**
 * El celular fijo del Registro de asistencia: la dirección que se abre en el celular que queda en la pared del
 * local, y cómo dejarlo andando. Ahí el personal elige su nombre, pone su PIN, hace uno o dos gestos delante de la
 * cámara (la prueba de que es una persona de verdad) y marca entrada, almuerzo o salida.
 */
export default async function CelularFijoPage() {
  await pantallaConPermiso("asistencia.gestionar");
  const idLocal = await idLocalActual();

  // Store no está entre los modelos por local: se lee con el cliente global.
  const store = await prisma.store.findUnique({ where: { id: idLocal }, select: { tokenAsistencia: true } });

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

      <Tarjeta className="flex flex-col gap-3 !border-2 !border-azul/50">
        <h2 className="text-[1rem] font-semibold tracking-titular text-tinta">Cómo dejarlo andando</h2>
        <ol className="list-decimal space-y-1.5 pl-5 text-[0.86rem] leading-snug text-tinta-media">
          <li>
            Cargá a cada persona en <strong className="text-tinta">Colaboradores</strong>, con ella delante: sacale la
            selfie y elegile un PIN.
          </li>
          <li>Abrí la dirección de arriba en el celular que va a quedar fijo y aceptá el permiso de la cámara.</li>
          <li>
            Dejalo enchufado, con la pantalla prendida y la cámara de frente, a la altura de la cara de quien marca.
          </li>
          <li>
            Elegí un lugar <strong className="text-tinta">bien iluminado</strong> y a la vista: la prueba de la cámara
            anda mejor con buena luz, y un lugar visible desalienta a quien quiera hacer trampa.
          </li>
        </ol>
      </Tarjeta>

      <Aviso titulo="Cómo se evita que marquen por otro" color="azul">
        Cada marcación pide el PIN y un par de gestos al azar (parpadear, abrir la boca, sonreír o girar la cabeza), que
        una foto o un video de otra persona no puede hacer a tiempo. Además queda guardada la foto de cada marcación:
        en <strong>Marcaciones</strong> podés compararla con la selfie del alta. Si alguien no logra pasar la prueba,
        puede marcar igual y esa marcación queda señalada para que la revises.
      </Aviso>
    </div>
  );
}
