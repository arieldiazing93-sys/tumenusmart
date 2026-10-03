"use server";

import { revalidatePath } from "next/cache";
import { exigirPermiso } from "@/lib/auth";
import { registrarBitacora } from "@/lib/bitacora";
import { idLocalActual } from "@/lib/local-actual";
import { prisma } from "@/lib/prisma";

export type ResultadoRegla = { ok: true } | { ok: false; error: string };

/** Las reglas de los mozos que el dueño puede prender o apagar, con lo que dice la bitácora al cambiarlas. */
type Regla = "mozosVenCuentasAjenas" | "mozoImprimeCuenta";

const DESCRIPCIONES: Record<Regla, { prendida: string; apagada: string }> = {
  mozosVenCuentasAjenas: {
    prendida: "Activó que los mozos vean y carguen las cuentas que abrió otro mozo.",
    apagada: "Desactivó que los mozos vean las cuentas de otros mozos: cada uno ve solo las suyas.",
  },
  mozoImprimeCuenta: {
    prendida: "Activó que el mozo pueda imprimir la cuenta de su mesa desde el celular.",
    apagada: "Desactivó que el mozo imprima la cuenta desde el celular: la imprime la caja.",
  },
};

/**
 * Prende o apaga una regla de los mozos. Se guarda en el propio local (Store no está entre los modelos filtrados por
 * local, por eso va con el cliente sin filtro y el id del local de la sesión). Solo el dueño (comedor.configurar).
 */
export async function guardarReglaDeMozos(regla: Regla, valor: boolean): Promise<ResultadoRegla> {
  const sesion = await exigirPermiso("comedor.configurar");
  const idLocal = await idLocalActual();

  if (regla !== "mozosVenCuentasAjenas" && regla !== "mozoImprimeCuenta") {
    return { ok: false, error: "Esa regla no existe." };
  }
  const nuevo = valor === true;

  await prisma.store.update({
    where: { id: idLocal },
    data: regla === "mozosVenCuentasAjenas" ? { mozosVenCuentasAjenas: nuevo } : { mozoImprimeCuenta: nuevo },
  });

  await registrarBitacora(idLocal, sesion, {
    modulo: "comedor",
    accion: nuevo ? "regla_activada" : "regla_desactivada",
    descripcion: nuevo ? DESCRIPCIONES[regla].prendida : DESCRIPCIONES[regla].apagada,
    entidad: "Store",
    entidadId: idLocal,
    detalle: { regla, valor: nuevo },
  });

  revalidatePath("/admin/comedor/reglas");
  return { ok: true };
}
