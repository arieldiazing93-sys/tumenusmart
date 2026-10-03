import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prisma } from "@/lib/prisma";
import { BotonEnlace, Cabecera } from "@/components/ui";
import { PestanasConfigComedor } from "../PestanasConfigComedor";
import { ReglasMozos } from "./ReglasMozos";

export const dynamic = "force-dynamic";

/**
 * Las reglas que el dueño le pone a los mozos (Ajustes → Configuración servicio comedor → Reglas del mozo): si pueden
 * entrar a las cuentas de otros mozos y si pueden imprimir la cuenta de su mesa. Solo del dueño (comedor.configurar).
 */
export default async function ReglasComedorPage() {
  await pantallaConPermiso("comedor.configurar");
  const idLocal = await idLocalActual();

  // Store no está entre los modelos por local: se lee con el cliente global.
  const store = await prisma.store.findUnique({
    where: { id: idLocal },
    select: { mozosVenCuentasAjenas: true, mozoImprimeCuenta: true },
  });

  return (
    <div className="flex flex-col gap-4">
      <Cabecera
        titulo="Reglas del mozo"
        bajada="Qué puede hacer el mozo desde su celular o tablet. Cada interruptor se guarda al instante."
        acciones={
          <BotonEnlace href="/admin/comedor" tono="navegar" tam="md">
            Cuentas abiertas
          </BotonEnlace>
        }
      />
      <PestanasConfigComedor activa="reglas" />
      <ReglasMozos
        mozosVenCuentasAjenas={store?.mozosVenCuentasAjenas ?? true}
        mozoImprimeCuenta={store?.mozoImprimeCuenta ?? false}
      />
    </div>
  );
}
